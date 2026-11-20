// E2E hai client (ChatCore — đúng logic chạy trong ứng dụng Windows) với API + Prosody + PostgreSQL + Mailpit thật.
// Kế hoạch Tác vụ 6: đăng ký bằng mời → kết bạn → nhóm → trạng thái → chat offline → Buzz online → Ẩn → đổi nick → lịch sử.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { ChatCore } from "../core/chat-core.js";
import { startApi, createInvite, emailOtp, smsOtp, waitFor, sleep } from "./stack.js";

const run = Date.now().toString(36).slice(-5);
const PW = "Mat-khau-du-dai-e2e";
let api, A, B;

before(async () => {
  api = await startApi();
  A = new ChatCore({ apiBase: api.base, insecureTls: true });
  B = new ChatCore({ apiBase: api.base, insecureTls: true });
});
after(async () => { await A?.disconnect(); await B?.disconnect(); api?.stop(); });

test("luồng đầy đủ hai tài khoản", async (t) => {
  const aNick = `An_${run}`, bNick = `Binh_${run}`;
  const aEmail = `an.${run}@example.test`, bPhone = `09${String(Date.now()).slice(-8)}`;

  await t.test("đăng ký bằng mã mời: A qua email (Mailpit), B qua SMS giả lập", async () => {
    const ra = await A.registerStart(createInvite(), "email", aEmail);
    const va = await A.registerVerify(ra.registrationId, await emailOtp(aEmail));
    await A.registerComplete(va.verificationToken, PW, aNick);
    const rb = await B.registerStart(createInvite(), "phone", bPhone);
    const vb = await B.registerVerify(rb.registrationId, smsOtp("+84" + bPhone.slice(1)));
    await B.registerComplete(vb.verificationToken, PW, bNick);
    assert.equal(A.me.nick, aNick);
    assert.equal(B.me.nick, bNick);
  });

  await t.test("kết bạn: tìm nick → mời → B chấp nhận", async () => {
    const found = await A.lookup(bNick.toUpperCase());
    assert.equal(found.userId, B.me.userId);
    await A.sendFriendRequest(found.userId);
    const { incoming } = await B.listRequests();
    assert.equal(incoming.length, 1);
    await B.decideRequest(incoming[0].requestId, "accept");
    await A.refreshContacts();
    assert.equal(A.contactById(B.me.userId).nick, bNick);
  });

  await t.test("nhóm danh bạ: A tạo 'Bạn học' và chuyển B vào", async () => {
    const g = await A.createGroup("Bạn học");
    await A.moveContact(B.me.userId, g.groupId);
    const view = A.contactsView();
    assert.deepEqual(view.groups.find((x) => x.name === "Bạn học").contacts.map((c) => c.userId), [B.me.userId]);
    assert.deepEqual(B.contactsView().groups.map((x) => x.name), ["Bạn bè"]);
  });

  await t.test("trạng thái: A thấy B Online, rồi Bận kèm dòng trạng thái", async () => {
    await A.connect(); await B.connect();
    await waitFor(() => A.presence.get(B.me.userId)?.mode === "online", 5000, "B online");
    await B.setPresence("busy", "Đang ôn thi");
    await waitFor(() => A.presence.get(B.me.userId)?.mode === "busy", 5000, "B bận");
    assert.equal(A.presence.get(B.me.userId).statusText, "Đang ôn thi");
  });

  await t.test("chat offline: B thoát, A gửi; B đăng nhập lại nhận qua đồng bộ lịch sử", async () => {
    await B.disconnect();
    await waitFor(() => (A.presence.get(B.me.userId)?.mode ?? "offline") === "offline", 5000, "B offline");
    const m = await A.sendMessage(B.me.userId, "Chào Bình :) lâu quá không gặp");
    await waitFor(() => A.conversation(B.me.userId).find((x) => x.originId === m.originId)?.status === "stored", 5000, "ack stored");
    await B.connect();
    await waitFor(() => B.conversation(A.me.userId).some((x) => x.body.includes("lâu quá không gặp")), 5000, "B nhận tin offline");
    assert.equal(B.conversation(A.me.userId).filter((x) => x.originId === m.originId).length, 1);
  });

  await t.test("chat trực tiếp có xác nhận đã chuyển", async () => {
    await B.setPresence("online", "");
    const m = await A.sendMessage(B.me.userId, "Online rồi hả =))");
    await waitFor(() => A.conversation(B.me.userId).find((x) => x.originId === m.originId)?.status === "delivered", 5000, "delivered");
  });

  await t.test("Buzz online: B nhận một Buzz còn hạn; Buzz liền tiếp bị giới hạn", async () => {
    const got = [];
    B.on("buzz", (b) => got.push(b));
    assert.deepEqual(await A.buzz(B.me.userId), { ok: true });
    await waitFor(() => got.length === 1, 3000, "nhận buzz");
    assert.ok(got[0].expiresAtMs > Date.now());
    assert.equal((await A.buzz(B.me.userId)).code, "RATE_LIMITED");
  });

  await t.test("Ẩn: A thấy B Offline, Buzz bị từ chối như offline, tin vẫn tới B nhưng không có receipt", async () => {
    const got = [];
    B.on("buzz", (b) => got.push(b));
    await B.setPresence("invisible");
    await waitFor(() => A.presence.get(B.me.userId)?.mode === "offline", 5000, "B trông offline");
    await sleep(10_500); // qua giới hạn 10 giây
    const r = await A.buzz(B.me.userId);
    assert.equal(r.code, "RECIPIENT_UNAVAILABLE");
    const m = await A.sendMessage(B.me.userId, "Có ai ở đó không?");
    await waitFor(() => B.conversation(A.me.userId).some((x) => x.originId === m.originId), 5000, "B nhận khi Ẩn");
    await sleep(800);
    assert.equal(A.conversation(B.me.userId).find((x) => x.originId === m.originId).status, "stored");
    assert.equal(got.length, 0);
  });

  await t.test("đổi nick: A thấy nick mới, ID và lịch sử giữ nguyên", async () => {
    const before = A.conversation(B.me.userId).length;
    await B.changeNick(`BinhMoi_${run}`);
    await waitFor(() => A.contactById(B.me.userId)?.nick === `BinhMoi_${run}`, 5000, "nick mới");
    assert.equal(A.conversation(B.me.userId).length, before);
    await A.disconnect();
    A.messages.clear();
    await A.connect();
    await waitFor(() => A.conversation(B.me.userId).length >= 3, 5000, "lịch sử sau đăng nhập lại");
    const bodies = A.conversation(B.me.userId).map((x) => x.body);
    assert.ok(bodies.includes("Chào Bình :) lâu quá không gặp") && bodies.includes("Có ai ở đó không?"));
    for (let i = 1; i < bodies.length; i++) assert.ok(A.conversation(B.me.userId)[i - 1].ts <= A.conversation(B.me.userId)[i].ts);
  });

  await t.test("xóa bạn: không gửi được nữa", async () => {
    await B.setPresence("online");
    await A.removeFriend(B.me.userId);
    await assert.rejects(A.sendMessage(B.me.userId, "còn đó không"), /bạn bè/);
  });
});
