// Thử tải mục tiêu đề xuất: 100 tài khoản, 30 kết nối XMPP đồng thời, 2 bản API chạy song song.
// Đo: thời gian đăng ký, kết nối, độ trễ tin end-to-end (p50/p95/p99), tỷ lệ mất/trùng, Buzz rate-limit liên bản API.
// Chạy: npm run infra:up && npm run load   (môi trường LOCAL, dữ liệu giả; không chạy với hệ thống thật)
import { spawn, execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import os from "node:os";
import pg from "pg";
import { ChatCore } from "../../apps/windows/core/chat-core.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
// Thử tải tạo 100 tài khoản → chạy trên BỘ MÁY CHỦ TEST, không làm bẩn môi trường dùng thử.
process.loadEnvFile(resolve(ROOT, "infra/.env.test"));
if (process.env.YC_TEST_STACK !== "1") throw new Error("Từ chối chạy thử tải: không phải bộ máy chủ test");
const N_USERS = Number(process.env.LOAD_USERS ?? 100);
const N_CONN = Number(process.env.LOAD_CONNECTIONS ?? 30);
const MSGS_PER_CONN = Number(process.env.LOAD_MSGS ?? 20);
const GAP_MS = Number(process.env.LOAD_GAP_MS ?? 100); // khoảng nghỉ trung bình giữa 2 tin của MỘT người (100 = stress ~200 tin/giây)
const LABEL = process.env.LOAD_LABEL ?? "stress";
const PORTS = [18090, 18091];
const PW = "Mat-khau-thu-tai-1";
const run = Date.now().toString(36).slice(-5);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : null; };
const stats = (arr) => ({ n: arr.length, p50: pct(arr, 50), p95: pct(arr, 95), p99: pct(arr, 99), max: arr.length ? Math.max(...arr) : null });
async function pool(items, limit, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: limit }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}

const owner = new pg.Client({ connectionString: `postgres://yc_owner:${encodeURIComponent(process.env.YC_PG_OWNER_PASSWORD)}@127.0.0.1:${process.env.YC_PG_PORT ?? 5433}/yahoochat` });
await owner.connect();

// ---- 2 bản API dùng chung DB/Prosody ----
const apis = PORTS.map((port) => spawn(process.execPath, ["--env-file=../../infra/.env.test", "src/server.ts"], {
  cwd: resolve(ROOT, "services/api"), env: { ...process.env, YC_API_PORT: String(port), YC_LOG_LEVEL: "warn" }, stdio: ["ignore", "ignore", "inherit"],
}));
const bases = PORTS.map((p) => `http://127.0.0.1:${p}`);
for (const b of bases) { for (let i = 0; i < 100; i++) { try { if ((await fetch(b + "/healthz")).ok) break; } catch { /* */ } await sleep(200); } }
const report = { startedAt: new Date().toISOString(), env: { node: process.version, cpus: os.cpus().length, cpuModel: os.cpus()[0]?.model, memGB: Math.round(os.totalmem() / 2 ** 30), platform: `${os.platform()} ${os.release()}` },
  config: { label: LABEL, users: N_USERS, connections: N_CONN, msgsPerConnection: MSGS_PER_CONN, avgGapMsPerSender: GAP_MS, apiInstances: PORTS.length } };
const errors = [];

try {
  // ---- 1. Đăng ký 100 tài khoản (SMS giả lập) ----
  const inv = JSON.parse(execFileSync(process.execPath, ["--env-file=../../infra/.env.test", "src/cli.ts", "invite", "create", "--uses", String(N_USERS), "--days", "1", "--note", "load test"], { cwd: resolve(ROOT, "services/api"), encoding: "utf8" }).replace(/^[^{]*/, ""));
  const regLat = [];
  const cores = await pool([...Array(N_USERS).keys()], 10, async (i) => {
    const c = new ChatCore({ apiBase: bases[i % bases.length], insecureTls: true });
    const phone = `+8490${run.replace(/\D/g, "").padEnd(3, "0").slice(0, 3)}${String(i).padStart(4, "0")}`;
    const t0 = performance.now();
    const r = await c.registerStart(inv.code, "phone", phone);
    const otp = (await owner.query("SELECT body FROM app.fake_sms_outbox WHERE phone=$1 ORDER BY id DESC LIMIT 1", [phone])).rows[0].body.match(/\b(\d{6})\b/)[1];
    const v = await c.registerVerify(r.registrationId, otp);
    await c.registerComplete(v.verificationToken, PW, `load${run}_${i}`);
    regLat.push(performance.now() - t0);
    return c;
  });
  report.registrationMs = stats(regLat);

  // ---- 2. Kết bạn: mỗi người với 3 người kế tiếp (vòng) ----
  const pairs = [];
  for (let i = 0; i < N_USERS; i++) for (let k = 1; k <= 3; k++) pairs.push([i, (i + k) % N_USERS]);
  const frLat = [];
  await pool(pairs, 10, async ([a, b]) => {
    const t0 = performance.now();
    const r = await cores[a].sendFriendRequest(cores[b].me.userId);
    if (r.status !== "accepted") await cores[b].api("POST", `/v1/friend-requests/${r.requestId}/accept`, {});
    frLat.push(performance.now() - t0);
  });
  report.friendshipMs = stats(frLat);

  // ---- 3. 30 kết nối XMPP đồng thời ----
  const active = cores.slice(0, N_CONN);
  const connLat = [];
  await Promise.all(active.map(async (c) => { const t0 = performance.now(); await c.connect(); connLat.push(performance.now() - t0); }));
  await sleep(1500);
  report.connectMs = stats(connLat);

  // ---- 4. Nhắn tin: mỗi kết nối gửi MSGS_PER_CONN tin tới bạn đang online ----
  const sentAt = new Map(); const e2e = []; let dup = 0;
  const seen = new Set();
  for (const c of active) {
    c.on("message", (m) => {
      if (m.dir !== "in") return;
      if (seen.has(m.originId)) { dup++; return; }
      seen.add(m.originId);
      const t = sentAt.get(m.body); if (t) e2e.push(performance.now() - t);
    });
  }
  const activeIdx = new Set(active.map((_, i) => i));
  const t0 = performance.now();
  await Promise.all(active.map(async (c, i) => {
    const friends = [1, 2, 3, N_USERS - 1, N_USERS - 2, N_USERS - 3].map((k) => (i + k) % N_USERS).filter((j) => activeIdx.has(j));
    if (!friends.length) return; // không có bạn nào đang online trong nhóm kết nối
    for (let n = 0; n < MSGS_PER_CONN; n++) {
      const to = cores[friends[n % friends.length]];
      const body = `tải ${i}-${n} ${Math.random().toString(36).slice(2, 8)}`;
      const t = performance.now();
      try { await c.sendMessage(to.me.userId, body); sentAt.set(body, t); } catch (e) { errors.push("send: " + e.message); }
      await sleep(GAP_MS * (0.5 + Math.random()));
    }
  }));
  const expected = sentAt.size;
  for (let i = 0; i < 100 && seen.size < expected; i++) await sleep(100);
  const elapsed = (performance.now() - t0) / 1000;
  const acked = active.flatMap((c) => [...c.messages.byPeer.values()].flat()).filter((m) => m.dir === "out" && (m.status === "stored" || m.status === "delivered")).length;
  report.messaging = { sent: expected, received: seen.size, lost: expected - seen.size, duplicates: dup, serverAcked: acked, throughputMsgPerSec: +(expected / elapsed).toFixed(1), e2eLatencyMs: stats(e2e) };

  // ---- 5. Buzz: cùng một cặp bắn đồng thời vào CẢ HAI bản API → đúng 1 được nhận ----
  const [x, y] = [active[0], active[1]];
  const burst = await Promise.all(bases.flatMap((b) => [0, 1, 2].map(() =>
    fetch(b + "/v1/buzz", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${x.token}` }, body: JSON.stringify({ toUserId: y.me.userId }) }).then((r) => r.status))));
  report.buzzCrossInstance = { statuses: burst, accepted: burst.filter((s) => s === 202).length, expectedAccepted: 1 };
  const bzLat = [];
  await Promise.all(active.map(async (c, i) => {
    if (i === 0 || i === active.length - 1) return; // 0→1 vừa dùng; người cuối không là bạn của người đầu
    const to = active[i + 1];
    const t = performance.now(); const r = await c.buzz(to.me.userId); if (r.ok) bzLat.push(performance.now() - t); else errors.push("buzz: " + r.code);
  }));
  report.buzzMs = stats(bzLat);

  // ---- 6. Tài nguyên DB ----
  report.db = (await owner.query(`SELECT (SELECT count(*) FROM public.prosodyarchive)::int AS archive_rows, pg_size_pretty(pg_database_size('yahoochat')) AS db_size,
    (SELECT count(*) FROM pg_stat_activity WHERE datname='yahoochat')::int AS connections`)).rows[0];
  for (const c of active) await c.disconnect();
} catch (e) {
  errors.push("FATAL: " + (e.stack ?? e));
} finally {
  apis.forEach((p) => p.kill());
  await owner.end();
}
report.errors = errors.slice(0, 50);
report.errorCount = errors.length;
report.finishedAt = new Date().toISOString();
const ok = !errors.length && report.messaging?.lost === 0 && report.messaging?.duplicates === 0 && report.buzzCrossInstance?.accepted === 1;
report.verdict = ok ? "PASS (theo tiêu chí: không mất/trùng tin, rate-limit Buzz đúng qua nhiều bản API, không lỗi)" : "FAIL";
mkdirSync(resolve(ROOT, "docs/test-results"), { recursive: true });
const out = resolve(ROOT, `docs/test-results/load-${LABEL}-${report.startedAt.slice(0, 10)}.json`);
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log("→", out);
process.exit(ok ? 0 : 1);
