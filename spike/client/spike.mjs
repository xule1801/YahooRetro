// Spike Cổng 1 — kiểm 6 tiêu chí ADR 001 §5 với Prosody cục bộ. Chỉ tài khoản giả.
import { client, xml } from "@xmpp/client";
import { createHmac, randomUUID } from "node:crypto";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // chỉ localhost, cert tự ký của container
const SECRET = "spike-only-not-a-real-secret";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = Date.now().toString(36); // tên user mới mỗi lần chạy để tránh dữ liệu cũ
const U = (n) => `${n}${run}`;

function token(user, ttlSec = 300) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  return `${exp}.${createHmac("sha256", SECRET).update(`${user}.${exp}`).digest("hex")}`;
}

async function connect(user, { presence = true, password } = {}) {
  const x = client({ service: "xmpp://localhost:5222", domain: "localhost", username: user, password: password ?? token(user), resource: "spike" });
  x.inbox = [];
  x.on("stanza", (s) => x.inbox.push(s));
  x.on("error", () => {});
  await x.start();
  if (presence) await x.send(xml("presence"));
  await sleep(500);
  return x;
}
const stop = async (x) => { try { await x.stop(); } catch {} };
const bodyOf = (s) => s.getChildText("body");

async function mam(x) {
  const qid = randomUUID();
  x.inbox.length = 0;
  await x.iqCaller.request(xml("iq", { type: "set" }, xml("query", { xmlns: "urn:xmpp:mam:2", queryid: qid })));
  return x.inbox
    .map((s) => s.getChild("result", "urn:xmpp:mam:2"))
    .filter((r) => r && r.attrs.queryid === qid)
    .map((r) => r.getChild("forwarded", "urn:xmpp:forward:0").getChild("message"));
}

const results = [];
function record(id, name, pass, detail) {
  results.push({ id, name, pass, detail });
  console.log(`${pass ? "ĐẠT     " : "KHÔNG ĐẠT"} [${id}] ${name} — ${detail}`);
}
const errorCond = (s) => s?.attrs.type === "error" ? s.getChild("error")?.children.find((c) => c.name !== "text")?.name : null;
async function sendExpectError(x, stanza) {
  x.inbox.length = 0;
  await x.send(stanza);
  await sleep(700);
  return x.inbox.map(errorCond).find(Boolean) ?? null;
}

const alice = U("alice"), bob = U("bob"), carol = U("carol"), app = "appsvc";

// --- Tiêu chí 6: xác thực token ---
{
  let badOk = false, expOk = false;
  try { const x = await connect(alice, { password: "123.deadbeef" }); badOk = true; await stop(x); } catch {}
  try { const x = await connect(alice, { password: token(alice, -10) }); expOk = true; await stop(x); } catch {}
  let goodOk = false;
  try { const x = await connect(alice); goodOk = true; await stop(x); } catch (e) { console.error(e.message); }
  record(6, "Token ngắn hạn do dịch vụ ký", goodOk && !badOk && !expOk, `đúng=${goodOk}, sai=${badOk ? "ĐƯỢC VÀO" : "bị từ chối"}, hết hạn=${expOk ? "ĐƯỢC VÀO" : "bị từ chối"}`);
}

const appX = await connect(app);
// tạo bạn bè alice<->bob qua appsvc
await appX.send(xml("message", { to: "localhost" }, xml("friend", { xmlns: "urn:spike:friend", a: alice, b: bob, group: "Bạn học" })));
await sleep(700);

// --- Tiêu chí 5: chặn client đi vòng ---
{
  const a = await connect(alice);
  const sub = await sendExpectError(a, xml("presence", { to: `${carol}@localhost`, type: "subscribe" }));
  const att = await sendExpectError(a, xml("message", { to: `${bob}@localhost`, type: "headline" }, xml("attention", { xmlns: "urn:xmpp:attention:0" })));
  let rosterErr = null;
  try { await a.iqCaller.request(xml("iq", { type: "set" }, xml("query", { xmlns: "jabber:iq:roster" }, xml("item", { jid: `${carol}@localhost` })))); }
  catch (e) { rosterErr = e.condition ?? e.name; }
  const roster = await a.iqCaller.request(xml("iq", { type: "get" }, xml("query", { xmlns: "jabber:iq:roster" })));
  const item = roster.getChild("query").getChildren("item").find((i) => i.attrs.jid === `${bob}@localhost`);
  record(5, "Chặn subscribe/Attention/roster-set từ client; appsvc tạo bạn được",
    sub === "not-allowed" && att === "not-allowed" && rosterErr === "not-allowed" && item?.attrs.subscription === "both",
    `subscribe=${sub}, attention=${att}, roster-set=${rosterErr}, roster bob=${item?.attrs.subscription}/${item?.getChildText("group")}`);
  await stop(a);
}

// --- Tiêu chí 1: tin offline ---
{
  const a = await connect(alice);
  await a.send(xml("message", { to: `${bob}@localhost`, type: "chat" }, xml("body", {}, "offline-1"), xml("origin-id", { xmlns: "urn:xmpp:sid:0", id: randomUUID() })));
  await sleep(700);
  const bounced = errorCond(a.inbox.find((s) => s.is("message") && s.attrs.type === "error"));
  await stop(a);
  const b = await connect(bob);
  await sleep(800);
  const pushed = b.inbox.some((s) => s.is("message") && bodyOf(s) === "offline-1");
  const viaMam = (await mam(b)).some((m) => bodyOf(m) === "offline-1");
  record(1, "Tin gửi khi người nhận offline được giao khi online (đồng bộ MAM)", (pushed || viaMam) && !bounced,
    `đẩy trực tiếp=${pushed}, qua MAM=${viaMam}, lỗi trả về người gửi=${bounced ?? "không"}`);
  await stop(b);
}

// --- Tiêu chí 3: Buzz (Attention headline) không lưu/không phát lại ---
{
  await appX.send(xml("message", { to: `${bob}@localhost`, type: "headline" }, xml("attention", { xmlns: "urn:xmpp:attention:0" }), xml("body", {}, "buzz-offline")));
  await sleep(700);
  const b = await connect(bob);
  await sleep(800);
  const replayed = b.inbox.some((s) => s.getChild("attention", "urn:xmpp:attention:0"));
  const inMam = (await mam(b)).some((m) => m.getChild("attention", "urn:xmpp:attention:0"));
  // Buzz khi online: phải tới
  b.inbox.length = 0;
  await appX.send(xml("message", { to: `${bob}@localhost`, type: "headline" }, xml("attention", { xmlns: "urn:xmpp:attention:0" })));
  await sleep(700);
  const liveOk = b.inbox.some((s) => s.getChild("attention", "urn:xmpp:attention:0"));
  record(3, "Buzz offline không phát lại, không vào MAM; Buzz online tới", !replayed && !inMam && liveOk, `phát lại=${replayed}, trong MAM=${inMam}, online nhận=${liveOk}`);
  await stop(b);
}

// --- Tiêu chí 4: Ẩn ---
{
  const a = await connect(alice);
  a.inbox.length = 0;
  const b = await connect(bob, { presence: false });
  await sleep(1000);
  const leakedOnConnect = a.inbox.some((s) => s.is("presence") && s.attrs.from?.startsWith(bob) && s.attrs.type !== "unavailable");
  a.inbox.length = 0;
  await a.send(xml("presence", { to: `${bob}@localhost`, type: "probe" }));
  await sleep(700);
  const leakedProbe = a.inbox.some((s) => s.is("presence") && s.attrs.from?.startsWith(bob) && s.attrs.type !== "unavailable");
  await a.send(xml("message", { to: `${bob}@localhost`, type: "chat" }, xml("body", {}, "to-invisible")));
  await sleep(700);
  const live = b.inbox.some((s) => s.is("message") && bodyOf(s) === "to-invisible");
  const viaMam = (await mam(b)).some((m) => bodyOf(m) === "to-invisible");
  record(4, "Ẩn: bạn thấy offline, vẫn nhận tin", !leakedOnConnect && !leakedProbe && (live || viaMam),
    `lộ khi kết nối=${leakedOnConnect}, lộ qua probe=${leakedProbe}, nhận trực tiếp=${live}, nhận qua MAM=${viaMam}`);
  await stop(a); await stop(b);
}

// --- Tiêu chí 2: hết hạn (cấu hình 60s mô phỏng 30 ngày) trước khi job dọn chạy ---
{
  const a = await connect(alice);
  await a.send(xml("message", { to: `${bob}@localhost`, type: "chat" }, xml("body", {}, "expire-me")));
  await sleep(500);
  const before = (await mam(a)).some((m) => bodyOf(m) === "expire-me");
  console.log("… chờ 65 giây để tin vượt hạn 60s");
  await sleep(65000);
  const after = (await mam(a)).some((m) => bodyOf(m) === "expire-me");
  record(2, "Tin quá hạn không trả qua MAM dù job dọn (daily) chưa chạy", before && !after, `trước hạn có=${before}, sau hạn còn trả=${after}`);
  await stop(a);
}

await stop(appX);
console.log(`\nTổng: ${results.filter((r) => r.pass).length}/${results.length} đạt`);
console.log(JSON.stringify(results));
process.exit(0);
