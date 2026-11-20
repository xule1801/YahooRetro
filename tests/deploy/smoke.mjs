// Kiểm tra nhanh một máy chủ Zahu!Messenger đã triển khai (bộ infra/prod): 2 tài khoản đăng ký bằng mã mời →
// kết bạn → trạng thái → nhắn tin (có xác nhận đã chuyển) → Buzz. Dữ liệu thử có tiền tố "smoke".
//   node tests/deploy/smoke.mjs <apiBase> <mailpitUrl> <inviteCode1> <inviteCode2>
// Chỉ dùng khi máy chủ còn đang dùng Mailpit (chưa có email thật). Với máy chủ local dùng CA nội bộ: đặt YC_DEV_INSECURE_TLS=1.
import { ChatCore } from "../../apps/windows/core/chat-core.js";

const [apiBase, mailpit, inv1, inv2] = process.argv.slice(2);
if (!inv2) { console.error("Cách dùng: node tests/deploy/smoke.mjs <apiBase> <mailpitUrl> <invite1> <invite2>"); process.exit(2); }
const insecure = process.env.YC_DEV_INSECURE_TLS === "1";
if (insecure) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const run = Date.now().toString(36).slice(-5);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms, what) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return; await sleep(100); } throw new Error("Hết thời gian chờ: " + what); };
const step = (s) => console.log("✓", s);

async function otpFor(addr) {
  for (let i = 0; i < 60; i++) {
    const r = await (await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${addr}"`)}`)).json();
    const id = r.messages?.[0]?.ID;
    if (id) { const m = await (await fetch(`${mailpit}/api/v1/message/${id}`)).json(); const o = m.Text?.match(/\b(\d{6})\b/)?.[1]; if (o) return o; }
    await sleep(250);
  }
  throw new Error("Không thấy OTP cho " + addr);
}
async function register(core, invite, nick) {
  const email = `${nick.toLowerCase()}@example.test`;
  const s = await core.registerStart(invite, "email", email);
  const v = await core.registerVerify(s.registrationId, await otpFor(email));
  await core.registerComplete(v.verificationToken, "Mat-khau-smoke-test-1", nick);
}

const A = new ChatCore({ apiBase, insecureTls: insecure });
const B = new ChatCore({ apiBase, insecureTls: insecure });
try {
  await register(A, inv1, `smokeA_${run}`); await register(B, inv2, `smokeB_${run}`);
  step("đăng ký 2 tài khoản bằng mã mời + OTP email");
  await A.sendFriendRequest((await A.lookup(B.me.nick)).userId);
  await B.decideRequest((await B.listRequests()).incoming[0].requestId, "accept");
  step("kết bạn");
  await A.connect(); await B.connect();
  await waitFor(() => A.presence.get(B.me.userId)?.mode === "online", 8000, "thấy B online");
  step("kết nối chat qua TLS trực tiếp (xmpps) và thấy trạng thái Online");
  const m = await A.sendMessage(B.me.userId, "Xin chào từ máy chủ :)");
  await waitFor(() => B.conversation(A.me.userId).some((x) => x.originId === m.originId), 8000, "B nhận tin");
  await waitFor(() => A.conversation(B.me.userId).find((x) => x.originId === m.originId)?.status === "delivered", 8000, "xác nhận đã chuyển");
  step("nhắn tin + xác nhận đã chuyển");
  const got = []; B.on("buzz", (b) => got.push(b));
  const r = await A.buzz(B.me.userId);
  if (!r.ok) throw new Error("Buzz lỗi: " + r.code);
  await waitFor(() => got.length === 1, 5000, "B nhận Buzz");
  step("Buzz");
  console.log(`SMOKE OK — ${apiBase}`);
} catch (e) {
  console.error("SMOKE FAIL:", e.message);
  process.exitCode = 1;
} finally {
  await A.disconnect(); await B.disconnect();
}
