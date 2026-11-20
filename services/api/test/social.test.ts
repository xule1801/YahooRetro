// Tác vụ 3 + 4 (phía API): bạn bè, chặn, nhóm danh bạ, Buzz. Thiết kế §3.2, §3.5.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { userLocalpart } from "@yc/contracts";
import { makeTestApp, resetDb, api, registerUser, type TestApp } from "./helpers.ts";

let t: TestApp;
beforeEach(async () => { await resetDb(); t = await makeTestApp(); });
afterEach(async () => { await t.close(); });

async function befriend(a: { token: string }, b: { userId: string; token: string }) {
  const r = await api(t, "POST", "/v1/friend-requests", { toUserId: b.userId }, a.token);
  await api(t, "POST", `/v1/friend-requests/${r.body.requestId}/accept`, {}, b.token);
}
const contactIds = async (token: string) =>
  (await api(t, "GET", "/v1/contacts", undefined, token)).body.groups.flatMap((g: { contacts: { userId: string }[] }) => g.contacts.map((c) => c.userId));

describe("kết bạn", () => {
  it("tìm nick chính xác → mời → chấp nhận tạo liên kết hai chiều và lệnh roster tới Prosody", async () => {
    const a = await registerUser(t, "alice"), b = await registerUser(t, "bob");
    const found = await api(t, "GET", "/v1/users/lookup?nick=BOB", undefined, a.token);
    expect(found.body.userId).toBe(b.userId);
    expect((await api(t, "GET", "/v1/users/lookup?nick=bo", undefined, a.token)).status).toBe(404);

    const req = await api(t, "POST", "/v1/friend-requests", { toUserId: b.userId }, a.token);
    expect(req.status).toBe(201);
    expect(await contactIds(a.token)).toEqual([]); // chưa chấp nhận: chưa hiện
    const incoming = await api(t, "GET", "/v1/friend-requests?direction=in", undefined, b.token);
    expect(incoming.body.requests).toMatchObject([{ requestId: req.body.requestId, userId: a.userId, nick: "alice" }]);
    expect(t.xmpp.calls.filter((c) => c.action === "friend-add")).toHaveLength(0);

    expect((await api(t, "POST", `/v1/friend-requests/${req.body.requestId}/accept`, {}, b.token)).status).toBe(204);
    expect(await contactIds(a.token)).toEqual([b.userId]);
    expect(await contactIds(b.token)).toEqual([a.userId]);
    expect(t.xmpp.calls.find((c) => c.action === "friend-add")!.attrs).toEqual({ a: userLocalpart(a.userId), b: userLocalpart(b.userId) });
  });

  it("chỉ người nhận mới chấp nhận/từ chối được; người gửi hủy được; từ chối không tạo liên kết", async () => {
    const a = await registerUser(t, "alice"), b = await registerUser(t, "bob"), c = await registerUser(t, "carol");
    const r = await api(t, "POST", "/v1/friend-requests", { toUserId: b.userId }, a.token);
    expect((await api(t, "POST", `/v1/friend-requests/${r.body.requestId}/accept`, {}, a.token)).status).toBe(404);
    expect((await api(t, "POST", `/v1/friend-requests/${r.body.requestId}/accept`, {}, c.token)).status).toBe(404);
    expect((await api(t, "POST", `/v1/friend-requests/${r.body.requestId}/decline`, {}, b.token)).status).toBe(204);
    expect(await contactIds(a.token)).toEqual([]);
    const r2 = await api(t, "POST", "/v1/friend-requests", { toUserId: b.userId }, a.token);
    expect((await api(t, "POST", `/v1/friend-requests/${r2.body.requestId}/cancel`, {}, a.token)).status).toBe(204);
    expect((await api(t, "GET", "/v1/friend-requests?direction=in", undefined, b.token)).body.requests).toEqual([]);
  });

  it("hai bên mời nhau thì tự thành bạn; mời lại cùng Idempotency-Key không tạo bản sao", async () => {
    const a = await registerUser(t, "alice"), b = await registerUser(t, "bob");
    const k = { "idempotency-key": "11111111-1111-4111-8111-111111111111" };
    const r1 = await api(t, "POST", "/v1/friend-requests", { toUserId: b.userId }, a.token, k);
    const r2 = await api(t, "POST", "/v1/friend-requests", { toUserId: b.userId }, a.token, k);
    expect(r2).toEqual(r1);
    const r3 = await api(t, "POST", "/v1/friend-requests", { toUserId: a.userId }, b.token);
    expect(r3.body.status).toBe("accepted");
    expect(await contactIds(a.token)).toEqual([b.userId]);
  });

  it("người khác không đọc được danh bạ/lời mời của mình; xóa bạn gỡ hai chiều", async () => {
    const a = await registerUser(t, "alice"), b = await registerUser(t, "bob");
    await befriend(a, b);
    expect((await api(t, "DELETE", `/v1/friends/${b.userId}`, undefined, a.token)).status).toBe(204);
    expect(await contactIds(a.token)).toEqual([]);
    expect(await contactIds(b.token)).toEqual([]);
    expect(t.xmpp.calls.some((c) => c.action === "friend-remove")).toBe(true);
  });
});

describe("chặn", () => {
  it("chặn gỡ bạn, ẩn lời mời mới mà không tiết lộ cho người bị chặn, chặn Buzz", async () => {
    const a = await registerUser(t, "alice"), b = await registerUser(t, "bob");
    await befriend(a, b);
    expect((await api(t, "POST", "/v1/blocks", { userId: b.userId }, a.token)).status).toBe(204);
    expect(await contactIds(a.token)).toEqual([]);
    expect(await contactIds(b.token)).toEqual([]);
    // B mời lại A: phản hồi như bình thường, nhưng A không thấy
    const r = await api(t, "POST", "/v1/friend-requests", { toUserId: a.userId }, b.token);
    expect(r.status).toBe(201);
    expect((await api(t, "GET", "/v1/friend-requests?direction=in", undefined, a.token)).body.requests).toEqual([]);
    expect((await api(t, "GET", "/v1/friend-requests?direction=out", undefined, b.token)).body.requests).toHaveLength(1);
    // A không mời được B khi đang chặn
    expect((await api(t, "POST", "/v1/friend-requests", { toUserId: b.userId }, a.token)).status).toBe(409);
    t.xmpp.online.add(userLocalpart(a.userId));
    expect((await api(t, "POST", "/v1/buzz", { toUserId: a.userId }, b.token)).body.error.code).toBe("NOT_FRIENDS");
    expect((await api(t, "DELETE", `/v1/blocks/${b.userId}`, undefined, a.token)).status).toBe(204);
  });
});

describe("nhóm danh bạ", () => {
  it("tạo/đổi tên/xóa nhóm; xóa chuyển bạn về nhóm mặc định; nhóm hai bên độc lập", async () => {
    const a = await registerUser(t, "alice"), b = await registerUser(t, "bob");
    await befriend(a, b);
    const g = await api(t, "POST", "/v1/groups", { name: "Bạn học" }, a.token);
    expect(g.status).toBe(201);
    expect((await api(t, "POST", "/v1/groups", { name: "bạn HỌC" }, a.token)).status).toBe(409);
    expect((await api(t, "PUT", `/v1/contacts/${b.userId}/group`, { groupId: g.body.groupId }, a.token)).status).toBe(204);
    expect((await api(t, "PATCH", `/v1/groups/${g.body.groupId}`, { name: "Lớp 12A" }, a.token)).status).toBe(204);
    let ca = (await api(t, "GET", "/v1/contacts", undefined, a.token)).body.groups;
    expect(ca.find((x: { name: string }) => x.name === "Lớp 12A").contacts.map((c: { userId: string }) => c.userId)).toEqual([b.userId]);
    const cb = (await api(t, "GET", "/v1/contacts", undefined, b.token)).body.groups;
    expect(cb.map((x: { name: string }) => x.name)).toEqual(["Bạn bè"]);
    // B không sửa được nhóm của A
    expect((await api(t, "PATCH", `/v1/groups/${g.body.groupId}`, { name: "hack" }, b.token)).status).toBe(404);
    expect((await api(t, "PUT", `/v1/contacts/${a.userId}/group`, { groupId: g.body.groupId }, b.token)).status).toBe(404);
    expect((await api(t, "DELETE", `/v1/groups/${g.body.groupId}`, undefined, a.token)).status).toBe(204);
    ca = (await api(t, "GET", "/v1/contacts", undefined, a.token)).body.groups;
    expect(ca).toHaveLength(1);
    expect(ca[0]).toMatchObject({ name: "Bạn bè", isDefault: true });
    expect(ca[0].contacts.map((c: { userId: string }) => c.userId)).toEqual([b.userId]);
    const def = ca[0].groupId;
    expect((await api(t, "DELETE", `/v1/groups/${def}`, undefined, a.token)).status).toBe(400);
  });
});

describe("Buzz", () => {
  it("online → 202; offline và Ẩn → cùng 409 với body giống hệt; giới hạn 1 lần/10 giây mỗi cặp", async () => {
    const a = await registerUser(t, "alice"), b = await registerUser(t, "bob");
    await befriend(a, b);
    const bLocal = userLocalpart(b.userId);
    const off1 = await api(t, "POST", "/v1/buzz", { toUserId: b.userId }, a.token);
    expect(off1.status).toBe(409);
    t.clock.advance(10_000);
    t.xmpp.online.add(bLocal);
    const ok = await api(t, "POST", "/v1/buzz", { toUserId: b.userId }, a.token);
    expect(ok.status).toBe(202);
    expect(new Date(ok.body.expiresAt).getTime() - t.clock.now().getTime()).toBe(5000);
    const call = t.xmpp.calls.filter((c) => c.action === "buzz").at(-1)!;
    expect(call.attrs).toMatchObject({ from: userLocalpart(a.userId), to: bLocal, id: ok.body.buzzId });
    const limited = await api(t, "POST", "/v1/buzz", { toUserId: b.userId }, a.token);
    expect(limited.status).toBe(429);
    t.clock.advance(10_000);
    t.xmpp.online.delete(bLocal); // Ẩn: Prosody không có phiên available ⇒ giống offline
    const off2 = await api(t, "POST", "/v1/buzz", { toUserId: b.userId }, a.token);
    expect(off2).toEqual(off1);
    // chiều ngược lại có giới hạn riêng
    t.xmpp.online.add(userLocalpart(a.userId));
    expect((await api(t, "POST", "/v1/buzz", { toUserId: a.userId }, b.token)).status).toBe(202);
  });

  it("không phải bạn → NOT_FRIENDS; Prosody lỗi → RECIPIENT_UNAVAILABLE (không khẳng định đã rung)", async () => {
    const a = await registerUser(t, "alice"), b = await registerUser(t, "bob"), c = await registerUser(t, "carol");
    await befriend(a, b);
    expect((await api(t, "POST", "/v1/buzz", { toUserId: c.userId }, a.token)).body.error.code).toBe("NOT_FRIENDS");
    t.xmpp.fail = true;
    expect((await api(t, "POST", "/v1/buzz", { toUserId: b.userId }, a.token)).body.error.code).toBe("RECIPIENT_UNAVAILABLE");
  });

  it("hai Buzz đồng thời cùng cặp: chỉ một được gửi", async () => {
    const a = await registerUser(t, "alice"), b = await registerUser(t, "bob");
    await befriend(a, b);
    t.xmpp.online.add(userLocalpart(b.userId));
    const rs = await Promise.all([1, 2, 3].map(() => api(t, "POST", "/v1/buzz", { toUserId: b.userId }, a.token)));
    expect(rs.filter((r) => r.status === 202)).toHaveLength(1);
    expect(t.xmpp.calls.filter((c) => c.action === "buzz")).toHaveLength(1);
  });

  it("thử lại cùng Idempotency-Key trả lại kết quả cũ, không gửi Buzz lần hai", async () => {
    const a = await registerUser(t, "alice"), b = await registerUser(t, "bob");
    await befriend(a, b);
    t.xmpp.online.add(userLocalpart(b.userId));
    const k = { "idempotency-key": "22222222-2222-4222-8222-222222222222" };
    const r1 = await api(t, "POST", "/v1/buzz", { toUserId: b.userId }, a.token, k);
    const r2 = await api(t, "POST", "/v1/buzz", { toUserId: b.userId }, a.token, k);
    expect(r2).toEqual(r1);
    expect(t.xmpp.calls.filter((c) => c.action === "buzz")).toHaveLength(1);
  });
});
