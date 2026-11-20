// Tác vụ 2: mã mời, đăng ký email/điện thoại, OTP, mật khẩu, nick, khôi phục. Thiết kế §3.1.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { makeTestApp, resetDb, api, registerUser, type TestApp } from "./helpers.ts";
import { createInvite, revokeInvite } from "../src/modules/invites.ts";
import { DAY } from "../src/clock.ts";

let t: TestApp;
beforeEach(async () => { await resetDb(); t = await makeTestApp(); });
afterEach(async () => { await t.close(); });

async function startReg(code: string, address = "a@example.test", channel = "email") {
  return api(t, "POST", "/v1/registration/start", { inviteCode: code, channel, address });
}
async function verifiedToken(code: string, address: string, channel = "email") {
  const s = await startReg(code, address, channel);
  const v = await api(t, "POST", "/v1/registration/verify", { registrationId: s.body.registrationId, otp: t.otp.lastOtp(address) });
  return v.body.verificationToken as string;
}

describe("mã mời", () => {
  it("mã hết hạn, đã thu hồi, đã dùng hết đều bị từ chối với cùng một mã lỗi", async () => {
    const expired = await createInvite(t.deps.db, t.clock, { maxUses: 1, days: 7 });
    t.clock.advance(7 * DAY + 1000);
    expect((await startReg(expired.code)).body.error.code).toBe("INVITE_INVALID");

    const revoked = await createInvite(t.deps.db, t.clock, { maxUses: 1, days: 7 });
    await revokeInvite(t.deps.db, t.clock, revoked.id);
    expect((await startReg(revoked.code)).body.error.code).toBe("INVITE_INVALID");

    const used = await createInvite(t.deps.db, t.clock, { maxUses: 1, days: 7 });
    const tok = await verifiedToken(used.code, "first@example.test");
    expect((await api(t, "POST", "/v1/registration/complete", { verificationToken: tok, password: "Mat-khau-du-dai-1", nick: "first_one" })).status).toBe(201);
    expect((await startReg(used.code, "second@example.test")).body.error.code).toBe("INVITE_INVALID");
    expect((await startReg("KHÔNG-CÓ-MÃ")).body.error.code).toBe("INVITE_INVALID");
  });

  it("xác minh thất bại không tiêu thụ lượt; hai hoàn tất đồng thời chỉ dùng đúng số lượt còn lại", async () => {
    const inv = await createInvite(t.deps.db, t.clock, { maxUses: 1, days: 7 });
    const s = await startReg(inv.code, "x@example.test");
    expect((await api(t, "POST", "/v1/registration/verify", { registrationId: s.body.registrationId, otp: "000000" === t.otp.lastOtp("x@example.test") ? "111111" : "000000" })).status).toBe(400);
    const tok1 = await verifiedToken(inv.code, "p1@example.test");
    const tok2 = await verifiedToken(inv.code, "p2@example.test");
    const [r1, r2] = await Promise.all([
      api(t, "POST", "/v1/registration/complete", { verificationToken: tok1, password: "Mat-khau-du-dai-1", nick: "race_one" }),
      api(t, "POST", "/v1/registration/complete", { verificationToken: tok2, password: "Mat-khau-du-dai-1", nick: "race_two" }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([201, 400]);
    expect([r1, r2].find((r) => r.status === 400)!.body.error.code).toBe("INVITE_INVALID");
  });
});

describe("đăng ký và OTP", () => {
  it("đăng ký được bằng email và bằng số điện thoại", async () => {
    const e = await registerUser(t, "by_email", "email");
    const p = await registerUser(t, "by_phone", "phone");
    expect(e.userId).not.toBe(p.userId);
    expect(t.otp.sent.some((s) => s.channel === "phone")).toBe(true);
    expect((await api(t, "GET", "/v1/me", undefined, p.token)).body.nick).toBe("by_phone");
  });

  it("chuẩn hóa số điện thoại Việt Nam 0xxx → +84xxx", async () => {
    const inv = await createInvite(t.deps.db, t.clock, { maxUses: 1, days: 7 });
    await startReg(inv.code, "0912 345 678", "phone");
    expect(t.otp.sent.at(-1)!.to).toBe("+84912345678");
  });

  it("OTP sai bị từ chối, quá 5 lần thì mã đúng cũng bị từ chối; OTP hết hạn bị từ chối", async () => {
    const inv = await createInvite(t.deps.db, t.clock, { maxUses: 2, days: 7 });
    const s = await startReg(inv.code, "otp@example.test");
    const good = t.otp.lastOtp("otp@example.test")!;
    const bad = good === "123456" ? "654321" : "123456";
    for (let i = 0; i < 5; i++) {
      expect((await api(t, "POST", "/v1/registration/verify", { registrationId: s.body.registrationId, otp: bad })).body.error.code).toBe("VERIFICATION_FAILED");
    }
    expect((await api(t, "POST", "/v1/registration/verify", { registrationId: s.body.registrationId, otp: good })).body.error.code).toBe("VERIFICATION_FAILED");

    const s2 = await startReg(inv.code, "otp2@example.test");
    t.clock.advance(11 * 60_000);
    expect((await api(t, "POST", "/v1/registration/verify", { registrationId: s2.body.registrationId, otp: t.otp.lastOtp("otp2@example.test") })).body.error.code).toBe("VERIFICATION_FAILED");
  });

  it("giới hạn gửi OTP mỗi giờ cho một địa chỉ", async () => {
    const inv = await createInvite(t.deps.db, t.clock, { maxUses: 1, days: 7 });
    for (let i = 0; i < 5; i++) expect((await startReg(inv.code, "spam@example.test")).status).toBe(202);
    const r = await startReg(inv.code, "spam@example.test");
    expect(r.status).toBe(429);
    expect(r.body.error.code).toBe("RATE_LIMITED");
  });

  it("địa chỉ đã có tài khoản: phản hồi giống hệt, không gửi OTP, không xác minh được", async () => {
    const u = await registerUser(t, "existing");
    const inv = await createInvite(t.deps.db, t.clock, { maxUses: 1, days: 7 });
    const before = t.otp.sent.length;
    const s = await startReg(inv.code, u.address);
    expect(s.status).toBe(202);
    expect(Object.keys(s.body)).toEqual(["registrationId"]);
    expect(t.otp.sent.length).toBe(before + 1);
    expect(t.otp.lastOtp(u.address)).toBeUndefined();
  });

  it("mật khẩu quá ngắn bị từ chối", async () => {
    const inv = await createInvite(t.deps.db, t.clock, { maxUses: 1, days: 7 });
    const tok = await verifiedToken(inv.code, "short@example.test");
    expect((await api(t, "POST", "/v1/registration/complete", { verificationToken: tok, password: "123", nick: "shorty" })).body.error.code).toBe("INVALID_INPUT");
  });

  it("log không chứa mật khẩu, OTP hay token", async () => {
    const u = await registerUser(t, "logcheck");
    await api(t, "POST", "/v1/auth/login", { identifier: u.address, password: "Mat-khau-du-dai-1" });
    const all = t.logs.join("\n");
    expect(all.length).toBeGreaterThan(0);
    expect(all).not.toContain("Mat-khau-du-dai-1");
    expect(all).not.toContain(u.token);
    for (const s of t.otp.sent) { const otp = s.text.match(/\b(\d{6})\b/)?.[1]; if (otp) expect(all).not.toContain(otp); }
  });
});

describe("đăng nhập và khôi phục", () => {
  it("đăng nhập bằng email/nick; sai mật khẩu và tài khoản không tồn tại trả cùng phản hồi", async () => {
    const u = await registerUser(t, "loginme");
    expect((await api(t, "POST", "/v1/auth/login", { identifier: "LoginMe", password: "Mat-khau-du-dai-1" })).status).toBe(200);
    expect((await api(t, "POST", "/v1/auth/login", { identifier: u.address, password: "Mat-khau-du-dai-1" })).status).toBe(200);
    const wrong = await api(t, "POST", "/v1/auth/login", { identifier: u.address, password: "sai-mat-khau-roi" });
    const ghost = await api(t, "POST", "/v1/auth/login", { identifier: "ghost@example.test", password: "sai-mat-khau-roi" });
    expect(wrong).toEqual(ghost);
    expect(wrong.status).toBe(401);
  });

  it("đăng nhập sai quá nhiều lần bị giới hạn", async () => {
    const u = await registerUser(t, "bruteme");
    for (let i = 0; i < 10; i++) await api(t, "POST", "/v1/auth/login", { identifier: u.nick, password: "sai-sai-sai-sai" });
    expect((await api(t, "POST", "/v1/auth/login", { identifier: u.nick, password: "Mat-khau-du-dai-1" })).status).toBe(429);
    t.clock.advance(16 * 60_000);
    expect((await api(t, "POST", "/v1/auth/login", { identifier: u.nick, password: "Mat-khau-du-dai-1" })).status).toBe(200);
  });

  it("đăng nhập sai từ cùng một IP trên nhiều tài khoản khác nhau bị giới hạn theo IP", async () => {
    const u = await registerUser(t, "victim");
    for (let i = 0; i < 30; i++) await api(t, "POST", "/v1/auth/login", { identifier: `spray${i}@example.test`, password: "Mat-khau-pho-bien" });
    const r = await api(t, "POST", "/v1/auth/login", { identifier: u.nick, password: "Mat-khau-du-dai-1" });
    expect(r.status).toBe(429);
    t.clock.advance(16 * 60_000);
    expect((await api(t, "POST", "/v1/auth/login", { identifier: u.nick, password: "Mat-khau-du-dai-1" })).status).toBe(200);
  });

  it("khôi phục mật khẩu: phản hồi không lộ tài khoản; xong thì mọi phiên cũ bị thu hồi và XMPP bị ngắt", async () => {
    const u = await registerUser(t, "recoverme");
    const ghost = await api(t, "POST", "/v1/auth/recovery/start", { address: "nobody@example.test" });
    const real = await api(t, "POST", "/v1/auth/recovery/start", { address: u.address });
    expect(ghost.status).toBe(202); expect(real.status).toBe(202);
    expect(Object.keys(ghost.body)).toEqual(Object.keys(real.body));
    const otp = t.otp.lastOtp(u.address)!;
    expect((await api(t, "POST", "/v1/auth/recovery/complete", { recoveryId: real.body.recoveryId, otp, newPassword: "Mat-khau-moi-rat-dai" })).status).toBe(204);
    expect((await api(t, "GET", "/v1/me", undefined, u.token)).status).toBe(401);
    expect((await api(t, "POST", "/v1/auth/login", { identifier: u.nick, password: "Mat-khau-moi-rat-dai" })).status).toBe(200);
    expect(t.xmpp.calls.some((c) => c.action === "disconnect")).toBe(true);
  });

  it("cấp token XMPP ngắn hạn cho phiên hợp lệ", async () => {
    const u = await registerUser(t, "xmppuser");
    const r = await api(t, "POST", "/v1/xmpp/token", {}, u.token);
    expect(r.status).toBe(200);
    expect(r.body.jid).toMatch(/^u[0-9a-f]{32}@/);
    expect(r.body.token).toMatch(/^\d+\.[0-9a-f]{64}$/);
  });
});

describe("nick", () => {
  it("quy tắc: 3–32 ký tự ASCII, không phân biệt hoa/thường, từ chối nick dành riêng", async () => {
    await registerUser(t, "TakenNick");
    const inv = await createInvite(t.deps.db, t.clock, { maxUses: 5, days: 7 });
    for (const [nick, code] of [["ab", "NICK_INVALID"], ["tên_việt", "NICK_INVALID"], ["takennick", "NICK_UNAVAILABLE"], ["Admin", "NICK_UNAVAILABLE"]]) {
      const tok = await verifiedToken(inv.code, `${Math.random()}@example.test`);
      const r = await api(t, "POST", "/v1/registration/complete", { verificationToken: tok, password: "Mat-khau-du-dai-1", nick });
      expect(r.body.error.code, nick).toBe(code);
    }
  });

  it("đổi nick giữ nguyên ID; nick cũ bị giữ 30 ngày với người khác, chủ cũ lấy lại được", async () => {
    const a = await registerUser(t, "oldname");
    const b = await registerUser(t, "someone");
    expect((await api(t, "PUT", "/v1/me/nick", { nick: "NewName" }, a.token)).status).toBe(200);
    const me = await api(t, "GET", "/v1/me", undefined, a.token);
    expect(me.body).toMatchObject({ userId: a.userId, nick: "NewName" });
    expect((await api(t, "PUT", "/v1/me/nick", { nick: "oldname" }, b.token)).body.error.code).toBe("NICK_UNAVAILABLE");
    expect((await api(t, "GET", "/v1/users/lookup?nick=oldname", undefined, b.token)).status).toBe(404);
    t.clock.advance(30 * DAY + 1000);
    // Phiên cũng hết hạn sau 30 ngày (SESSION_TTL_DAYS) → đăng nhập lại.
    expect((await api(t, "GET", "/v1/me", undefined, b.token)).status).toBe(401);
    const relog = await api(t, "POST", "/v1/auth/login", { identifier: "someone", password: "Mat-khau-du-dai-1" });
    expect((await api(t, "PUT", "/v1/me/nick", { nick: "oldname" }, relog.body.token)).status).toBe(200);

    const c = await registerUser(t, "flipper");
    await api(t, "PUT", "/v1/me/nick", { nick: "flopper" }, c.token);
    expect((await api(t, "PUT", "/v1/me/nick", { nick: "FLIPPER" }, c.token)).status).toBe(200);
  });

  it("hai người đổi sang cùng một nick đồng thời: đúng một người thành công", async () => {
    const users = await Promise.all([registerUser(t, "racer_a"), registerUser(t, "racer_b"), registerUser(t, "racer_c")]);
    const rs = await Promise.all(users.map((u) => api(t, "PUT", "/v1/me/nick", { nick: "Champion" }, u.token)));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 409)).toHaveLength(2);
  });

  it("hồi quy deadlock: 100 đăng ký đồng thời qua 2 instance API trên cùng mã mời nhiều lượt đều thành công", async () => {
    const t2 = await makeTestApp({ clock: t.clock, otp: t.otp });
    try {
      const inv = await createInvite(t.deps.db, t.clock, { maxUses: 100, days: 7 });
      const rs = await Promise.all(Array.from({ length: 100 }, async (_, i) => {
        const inst = i % 2 ? t2 : t;
        const addr = `bulk${i}@example.test`;
        const s = await api(inst, "POST", "/v1/registration/start", { inviteCode: inv.code, channel: "email", address: addr });
        const v = await api(inst, "POST", "/v1/registration/verify", { registrationId: s.body.registrationId, otp: t.otp.lastOtp(addr) });
        return api(inst === t ? t2 : t, "POST", "/v1/registration/complete", { verificationToken: v.body.verificationToken, password: "Mat-khau-du-dai-1", nick: `bulk_${i}` });
      }));
      expect(rs.filter((r) => r.status !== 201).map((r) => `${r.status} ${JSON.stringify(r.body)}`)).toEqual([]);
      expect((await t.deps.db.query("SELECT uses FROM app.invites WHERE id=$1", [inv.id])).rows[0].uses).toBe(100);
    } finally { await t2.close(); }
  }, 120000);

  it("hai đăng ký đồng thời cùng nick: đúng một tài khoản", async () => {
    const inv = await createInvite(t.deps.db, t.clock, { maxUses: 2, days: 7 });
    const [t1, t2] = [await verifiedToken(inv.code, "n1@example.test"), await verifiedToken(inv.code, "n2@example.test")];
    const rs = await Promise.all([t1, t2].map((tok) => api(t, "POST", "/v1/registration/complete", { verificationToken: tok, password: "Mat-khau-du-dai-1", nick: "SameNick" })));
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
    const { rows } = await t.deps.db.query("SELECT uses FROM app.invites WHERE id=$1", [inv.id]);
    expect(rows[0].uses).toBe(1);
  });
});
