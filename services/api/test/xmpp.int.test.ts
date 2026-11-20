// Tích hợp thật: API + Prosody (mod_yc_policy) + PostgreSQL. Tác vụ 3, 4, 5 và rủi ro bắt buộc 2, 3, 4.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { client, xml } from "@xmpp/client";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { Xmlns } from "@yc/contracts";
import { makeTestApp, resetDb, api, registerUser, ownerUrl, type TestApp } from "./helpers.ts";
import { AppsvcXmpp } from "../src/xmpp-appsvc.ts";
import { runPurge } from "../src/jobs/purge.ts";
import { systemClock, DAY } from "../src/clock.ts";
import { loadConfig } from "../src/config.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type XClient = ReturnType<typeof client> & { inbox: any[]; bare: string };
let t: TestApp;
let appsvc: AppsvcXmpp;
const open: XClient[] = [];

beforeAll(() => {
  const c = loadConfig();
  appsvc = new AppsvcXmpp({ service: c.xmppService, domain: c.domain, secret: c.xmppTokenSecret, insecureTls: true });
});
afterAll(async () => { await appsvc.stop(); });
beforeEach(async () => { await resetDb(); t = await makeTestApp({ xmpp: appsvc, clock: systemClock }); });
afterEach(async () => {
  for (const x of open.splice(0)) { try { await x.stop(); } catch { /* */ } }
  await t.close();
});

async function connect(u: { token: string }, presence: false | { show?: string; status?: string } = {}) {
  const tok = (await api(t, "POST", "/v1/xmpp/token", {}, u.token)).body;
  const x = client({ service: tok.service, domain: tok.domain, username: tok.username, password: tok.token, resource: randomUUID().slice(0, 8) }) as XClient;
  x.inbox = [];
  x.bare = tok.jid;
  x.on("stanza", (s: any) => x.inbox.push(s));
  x.on("error", () => {});
  await x.start();
  if (presence) {
    const kids = [];
    if (presence.show) kids.push(xml("show", {}, presence.show));
    if (presence.status) kids.push(xml("status", {}, presence.status));
    await x.send(xml("presence", {}, ...kids));
  }
  open.push(x);
  await sleep(300);
  return x;
}
const presFrom = (x: XClient, jid: string) => x.inbox.filter((s) => s.is("presence") && s.attrs.from?.startsWith(jid));
const lastPres = (x: XClient, jid: string) => presFrom(x, jid).at(-1);
const msgBodies = (x: XClient) => x.inbox.filter((s) => s.is("message") && s.getChildText("body")).map((s) => s.getChildText("body"));
const chat = (to: string, body: string, oid = randomUUID()) =>
  xml("message", { to, type: "chat" }, xml("body", {}, body), xml("origin-id", { xmlns: Xmlns.SID, id: oid }));
const errOf = (x: XClient) => x.inbox.filter((s) => s.attrs.type === "error").map((s) => s.getChild("error"));
async function befriend(a: { token: string }, b: { userId: string; token: string }) {
  const r = await api(t, "POST", "/v1/friend-requests", { toUserId: b.userId }, a.token);
  await api(t, "POST", `/v1/friend-requests/${r.body.requestId}/accept`, {}, b.token);
  await sleep(300);
}
async function mam(x: XClient) {
  const qid = randomUUID();
  x.inbox.length = 0;
  await x.iqCaller.request(xml("iq", { type: "set" }, xml("query", { xmlns: Xmlns.MAM, queryid: qid })));
  return x.inbox.map((s) => s.getChild("result", Xmlns.MAM)).filter((r) => r?.attrs.queryid === qid)
    .map((r) => r.getChild("forwarded", "urn:xmpp:forward:0").getChild("message"));
}

describe("hiện diện và kết bạn (Prosody thật)", () => {
  it("chưa kết bạn không thấy hiện diện; chấp nhận xong thấy ngay; xóa bạn thì thấy offline và không chat được", async () => {
    const a = await registerUser(t, "alice"), b = await registerUser(t, "bob");
    const xa = await connect(a), xb = await connect(b, { show: "dnd", status: "Đang họp" });
    expect(presFrom(xa, xb.bare)).toHaveLength(0);
    await xa.send(chat(xb.bare, "chưa là bạn"));
    await sleep(400);
    expect(errOf(xa).some((e) => e.getChildText("text", "urn:ietf:params:xml:ns:xmpp-stanzas") === "NOT_FRIENDS")).toBe(true);
    expect(msgBodies(xb)).not.toContain("chưa là bạn");

    await befriend(a, b);
    const p = lastPres(xa, xb.bare);
    expect(p.attrs.type).toBeUndefined();
    expect(p.getChildText("show")).toBe("dnd");
    expect(p.getChildText("status")).toBe("Đang họp");

    await api(t, "DELETE", `/v1/friends/${b.userId}`, undefined, a.token);
    await sleep(400);
    expect(lastPres(xa, xb.bare).attrs.type).toBe("unavailable");
    xa.inbox.length = 0;
    await xa.send(chat(xb.bare, "sau khi xóa"));
    await sleep(400);
    expect(msgBodies(xb)).not.toContain("sau khi xóa");
  });

  it("client không tự subscribe, gửi directed presence/probe, roster-set hay IQ tới người khác", async () => {
    const a = await registerUser(t, "alice"), b = await registerUser(t, "bob");
    await befriend(a, b);
    const xa = await connect(a), xb = await connect(b);
    for (const st of [
      xml("presence", { to: xb.bare, type: "subscribe" }),
      xml("presence", { to: xb.bare, type: "probe" }),
      xml("presence", { to: xb.bare }),
      xml("message", { to: xb.bare, type: "headline" }, xml("attention", { xmlns: Xmlns.ATTENTION })),
      xml("message", { to: xb.bare, type: "normal" }, xml("body", {}, "normal")),
    ]) await xa.send(st);
    await sleep(500);
    expect(errOf(xa).filter((e) => e.getChild("not-allowed", "urn:ietf:params:xml:ns:xmpp-stanzas"))).toHaveLength(5);
    expect(xb.inbox.some((s) => s.getChild("attention", Xmlns.ATTENTION) || s.attrs.type === "subscribe")).toBe(false);
    await expect(xa.iqCaller.request(xml("iq", { type: "set" }, xml("query", { xmlns: "jabber:iq:roster" }, xml("item", { jid: "x@localhost" }))))).rejects.toThrow();
    await expect(xa.iqCaller.request(xml("iq", { type: "get", to: (xb as any).jid.toString() }, xml("ping", { xmlns: "urn:xmpp:ping" })))).rejects.toThrow();
    await expect(xa.iqCaller.request(xml("iq", { type: "get", to: xb.bare }, xml("query", { xmlns: "jabber:iq:version" })))).rejects.toThrow();
  });

  it("dòng trạng thái bị cắt ở 140 ký tự phía server", async () => {
    const a = await registerUser(t, "alice"), b = await registerUser(t, "bob");
    await befriend(a, b);
    const xa = await connect(a);
    await connect(b, { status: "ă".repeat(200) });
    await sleep(300);
    const p = lastPres(xa, (await api(t, "GET", "/v1/me", undefined, b.token)).body.jid);
    expect([...p.getChildText("status")]).toHaveLength(140);
  });
});

describe("Ẩn", () => {
  it("bạn thấy offline; vẫn nhận tin realtime; Buzz tới người Ẩn và người offline trả phản hồi giống hệt", async () => {
    const a = await registerUser(t, "alice"), b = await registerUser(t, "bob"), c = await registerUser(t, "carol");
    await befriend(a, b); await befriend(a, c);
    const xa = await connect(a);
    const xb = await connect(b, false); // Ẩn
    await sleep(300);
    expect(presFrom(xa, xb.bare).filter((p) => p.attrs.type !== "unavailable")).toHaveLength(0);
    await xa.send(chat(xb.bare, "gửi người đang Ẩn"));
    await sleep(500);
    expect(msgBodies(xb)).toContain("gửi người đang Ẩn");
    expect(xb.inbox.filter((s) => s.getChildText("body") === "gửi người đang Ẩn")).toHaveLength(1);

    const toInvisible = await api(t, "POST", "/v1/buzz", { toUserId: b.userId }, a.token);
    const toOffline = await api(t, "POST", "/v1/buzz", { toUserId: c.userId }, a.token);
    expect(toInvisible.status).toBe(409);
    expect(toInvisible).toEqual(toOffline);
    expect(xb.inbox.some((s) => s.getChild("attention", Xmlns.ATTENTION))).toBe(false);
  });

  it("chuyển sang Ẩn rồi Buzz: không nhận Buzz; bạn thấy unavailable", async () => {
    const a = await registerUser(t, "alice"), b = await registerUser(t, "bob");
    await befriend(a, b);
    const xa = await connect(a), xb = await connect(b);
    expect(lastPres(xa, xb.bare).attrs.type).toBeUndefined();
    await xb.send(xml("presence", { type: "unavailable" }));
    const r = await api(t, "POST", "/v1/buzz", { toUserId: b.userId }, a.token); // ngay sau khi đổi Ẩn
    await sleep(400);
    expect(r.body.error.code).toBe("RECIPIENT_UNAVAILABLE");
    expect(xb.inbox.some((s) => s.getChild("attention", Xmlns.ATTENTION))).toBe(false);
    expect(lastPres(xa, xb.bare).attrs.type).toBe("unavailable");
  });
});

describe("Buzz (Prosody thật)", () => {
  it("online nhận đúng một Buzz có id và hạn; đăng nhập lại không phát lại", async () => {
    const a = await registerUser(t, "alice"), b = await registerUser(t, "bob");
    await befriend(a, b);
    const xb = await connect(b);
    const r = await api(t, "POST", "/v1/buzz", { toUserId: b.userId }, a.token);
    expect(r.status).toBe(202);
    await sleep(300);
    const buzzes = xb.inbox.filter((s) => s.getChild("attention", Xmlns.ATTENTION));
    expect(buzzes).toHaveLength(1);
    expect(buzzes[0].getChild("buzz", Xmlns.BUZZ).attrs).toMatchObject({ id: r.body.buzzId });
    await xb.stop();
    const xb2 = await connect(b);
    await sleep(400);
    expect(xb2.inbox.some((s) => s.getChild("attention", Xmlns.ATTENTION))).toBe(false);
    expect((await mam(xb2)).some((m) => m.getChild("attention", Xmlns.ATTENTION))).toBe(false);
  });
});

describe("tin nhắn, chống trùng, hết hạn", () => {
  it("tin offline lưu và đồng bộ qua MAM; người gửi nhận ack stored có id và giờ server", async () => {
    const a = await registerUser(t, "alice"), b = await registerUser(t, "bob");
    await befriend(a, b);
    const xa = await connect(a);
    const bJid = (await api(t, "GET", "/v1/me", undefined, b.token)).body.jid;
    const oid = randomUUID();
    await xa.send(chat(bJid, "khi bob offline", oid));
    await sleep(400);
    const ack = xa.inbox.map((s) => s.getChild("stored", Xmlns.ACK)).find(Boolean);
    expect(ack.attrs["origin-id"]).toBe(oid);
    expect(ack.attrs.id).toBeTruthy();
    expect(Math.abs(Date.parse(ack.attrs.ts) - Date.now())).toBeLessThan(5000);
    const xb = await connect(b);
    expect((await mam(xb)).map((m) => m.getChildText("body"))).toContain("khi bob offline");
  });

  it("gửi lại cùng origin-id (mất kết nối trước khi nhận ack) không tạo bản sao, ack trả cùng id", async () => {
    const a = await registerUser(t, "alice"), b = await registerUser(t, "bob");
    await befriend(a, b);
    const xb = await connect(b);
    const xa = await connect(a);
    const oid = randomUUID();
    await xa.send(chat(xb.bare, "chỉ một lần", oid));
    await sleep(300);
    await xa.stop();
    const xa2 = await connect(a);
    await xa2.send(chat(xb.bare, "chỉ một lần", oid));
    await sleep(400);
    expect(msgBodies(xb).filter((m) => m === "chỉ một lần")).toHaveLength(1);
    const ack1 = xa.inbox.map((s) => s.getChild("stored", Xmlns.ACK)).find(Boolean);
    const ack2 = xa2.inbox.map((s) => s.getChild("stored", Xmlns.ACK)).find(Boolean);
    expect(ack2.attrs.id).toBe(ack1.attrs.id);
    expect((await mam(xb)).filter((m) => m.getChildText("body") === "chỉ một lần")).toHaveLength(1);
  });

  it("tin 29 ngày còn đọc được; tin quá 30 ngày (kể cả chưa nhận) không trả qua MAM dù job xóa chưa chạy; job xóa vật lý và ghi kết quả", async () => {
    const a = await registerUser(t, "alice"), b = await registerUser(t, "bob");
    await befriend(a, b);
    const xa = await connect(a);
    const bJid = (await api(t, "GET", "/v1/me", undefined, b.token)).body.jid;
    await xa.send(chat(bJid, "tin 29 ngày"));
    await xa.send(chat(bJid, "tin 31 ngày chưa nhận"));
    await xa.send(chat(bJid, "tin đúng 30 ngày"));
    await sleep(500);
    const owner = new pg.Client({ connectionString: ownerUrl() });
    await owner.connect();
    const ago = (d: number) => Math.floor((Date.now() - d * DAY) / 1000);
    await owner.query(`UPDATE public.prosodyarchive SET "when"=$1 WHERE value LIKE '%tin 29 ngày%'`, [ago(29)]);
    await owner.query(`UPDATE public.prosodyarchive SET "when"=$1 WHERE value LIKE '%tin 31 ngày%'`, [ago(31)]);
    await owner.query(`UPDATE public.prosodyarchive SET "when"=$1 WHERE value LIKE '%tin đúng 30 ngày%'`, [ago(30) - 1]);
    const xb = await connect(b); // bob chưa từng nhận
    const bodies = (await mam(xb)).map((m) => m.getChildText("body"));
    expect(bodies).toContain("tin 29 ngày");
    expect(bodies).not.toContain("tin 31 ngày chưa nhận");
    expect(bodies).not.toContain("tin đúng 30 ngày");
    expect((await mam(xa)).map((m) => m.getChildText("body"))).not.toContain("tin 31 ngày chưa nhận");

    const before = (await owner.query(`SELECT count(*)::int n FROM public.prosodyarchive`)).rows[0].n;
    const res = await runPurge(t.deps.db, systemClock, 30);
    const after = (await owner.query(`SELECT count(*)::int n FROM public.prosodyarchive`)).rows[0].n;
    expect(res.ok).toBe(true);
    expect(res.deleted).toBe(4); // 2 tin quá hạn × (bản người gửi + bản người nhận)
    expect(before - after).toBe(4);
    const last = (await api(t, "GET", "/healthz")).body.lastPurge;
    expect(last.ok).toBe(true);
    await owner.end();
  });

  it("khôi phục mật khẩu ngắt mọi phiên XMPP đang mở", async () => {
    const a = await registerUser(t, "alice");
    const xa = await connect(a);
    let closed = false;
    xa.on("offline", () => { closed = true; });
    xa.on("disconnect", () => { closed = true; });
    const s = await api(t, "POST", "/v1/auth/recovery/start", { address: a.address });
    await api(t, "POST", "/v1/auth/recovery/complete", { recoveryId: s.body.recoveryId, otp: t.otp.lastOtp(a.address), newPassword: "Mat-khau-moi-rat-dai" });
    await sleep(800);
    expect(closed).toBe(true);
  });
});
