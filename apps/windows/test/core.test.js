import { test } from "node:test";
import assert from "node:assert/strict";
import { jidToUserId, presenceMode, presenceForMode, decideBuzzEffect, MessageStore } from "../core/model.js";

const S = { buzzVibrate: true, buzzSound: true, reduceMotion: false };
const now = 1_000_000;

test("jidToUserId đảo ngược userLocalpart", () => {
  assert.equal(jidToUserId("u0193a1b200007000800000000000000a@localhost/res"), "0193a1b2-0000-7000-8000-00000000000a");
  assert.equal(jidToUserId("appsvc@localhost"), null);
});

test("ánh xạ presence", () => {
  assert.equal(presenceMode(undefined, null), "online");
  assert.equal(presenceMode(undefined, "dnd"), "busy");
  assert.equal(presenceMode(undefined, "xa"), "away");
  assert.equal(presenceMode("unavailable", null), "offline");
  assert.equal(presenceForMode("invisible"), null);
  assert.deepEqual(presenceForMode("busy"), { show: "dnd" });
});

test("Buzz: cửa sổ đang hiện → rung một lần, không thông báo", () => {
  assert.deepEqual(decideBuzzEffect({ nowMs: now, expiresAtMs: now + 5000, window: { visible: true, minimized: false }, settings: S }),
    { accept: true, open: false, shake: true, notify: false, sound: true, flash: false });
});
test("Buzz: cửa sổ thu nhỏ → chỉ thông báo, không rung, không bung ra (thiết kế §3.5)", () => {
  const r = decideBuzzEffect({ nowMs: now, expiresAtMs: now + 5000, window: { visible: true, minimized: true }, settings: S });
  assert.equal(r.shake, false); assert.equal(r.notify, true); assert.equal(r.open, false);
});
test("Buzz: chưa mở cửa sổ chat → tự mở cửa sổ và rung (yêu cầu chủ dự án 2026-11-20)", () => {
  const r = decideBuzzEffect({ nowMs: now, expiresAtMs: now + 5000, window: null, settings: S });
  assert.deepEqual(r, { accept: true, open: true, shake: true, notify: false, sound: true, flash: false });
});
test("Buzz: chưa mở + giảm chuyển động → mở cửa sổ, nhấp nháy thay rung", () => {
  const r = decideBuzzEffect({ nowMs: now, expiresAtMs: now + 5000, window: null, settings: { ...S, reduceMotion: true } });
  assert.equal(r.open, true); assert.equal(r.shake, false); assert.equal(r.flash, true);
});
test("Buzz: chưa mở + tắt tự mở cửa sổ → chỉ thông báo như cũ", () => {
  const r = decideBuzzEffect({ nowMs: now, expiresAtMs: now + 5000, window: null, settings: { ...S, autoOpenChat: false } });
  assert.equal(r.open, false); assert.equal(r.shake, false); assert.equal(r.notify, true);
});
test("Buzz: quá hạn (nhận trễ sau reconnect) → bỏ qua hoàn toàn", () => {
  const r = decideBuzzEffect({ nowMs: now + 5000, expiresAtMs: now + 5000, window: { visible: true, minimized: false }, settings: S });
  assert.deepEqual(r, { accept: false, open: false, shake: false, notify: false, sound: false });
});
test("Buzz: giảm chuyển động / tắt rung / tắt âm thanh", () => {
  const w = { visible: true, minimized: false };
  const rm = decideBuzzEffect({ nowMs: now, expiresAtMs: now + 5000, window: w, settings: { ...S, reduceMotion: true } });
  assert.equal(rm.shake, false); assert.equal(rm.flash, true);
  assert.equal(decideBuzzEffect({ nowMs: now, expiresAtMs: now + 5000, window: w, settings: { ...S, buzzVibrate: false } }).shake, false);
  assert.equal(decideBuzzEffect({ nowMs: now, expiresAtMs: now + 5000, window: w, settings: { ...S, buzzSound: false } }).sound, false);
});

test("MessageStore: chống trùng theo originId và stanzaId, cập nhật trạng thái tiến lên", () => {
  const s = new MessageStore(30);
  s.upsert({ peer: "p", originId: "o1", dir: "out", body: "hi", status: "sending" }, now);
  s.upsert({ peer: "p", originId: "o1", stanzaId: "s1", ts: now, status: "stored" }, now);
  s.upsert({ peer: "p", originId: "o1", status: "sending" }, now); // không lùi trạng thái
  s.upsert({ peer: "p", stanzaId: "s1", originId: "o1", ts: now }, now); // bản từ MAM
  assert.equal(s.list("p").length, 1);
  assert.equal(s.list("p")[0].status, "stored");
  s.upsert({ peer: "p", originId: "o1", status: "delivered" }, now);
  assert.equal(s.list("p")[0].status, "delivered");
});

test("MessageStore: tin 29 ngày giữ, đúng 30 ngày và quá 30 ngày bị xóa; không nhận tin đã quá hạn", () => {
  const D = 86_400_000, s = new MessageStore(30), t = 100 * D;
  s.upsert({ peer: "p", originId: "a", ts: t - 29 * D, body: "29" }, t);
  s.upsert({ peer: "p", originId: "b", ts: t - 10 * D, body: "10" }, t);
  assert.equal(s.upsert({ peer: "p", originId: "c", ts: t - 31 * D, body: "31" }, t).added, false);
  assert.equal(s.sweep(t + 1 * D), 1); // tin 29 ngày giờ là 30 ngày
  assert.deepEqual(s.list("p").map((m) => m.body), ["10"]);
  assert.equal(s.sweep(t + 20 * D), 1);
  assert.deepEqual(s.list("p"), []);
});

test("MessageStore: sắp xếp theo giờ server; tin đang gửi (chưa có ts) nằm cuối", () => {
  const s = new MessageStore(30);
  s.upsert({ peer: "p", originId: "x", dir: "out", body: "đang gửi", status: "sending" }, now);
  s.upsert({ peer: "p", originId: "b", ts: now - 10, body: "sau" }, now);
  s.upsert({ peer: "p", originId: "a", ts: now - 20, body: "trước" }, now);
  assert.deepEqual(s.list("p").map((m) => m.body), ["trước", "sau", "đang gửi"]);
  assert.equal(s.pending().length, 1);
});

import { mergeSettings, assertSecureEndpoint } from "../core/model.js";

test("cài đặt: insecureTls chỉ lấy từ biến môi trường, không bao giờ từ tệp đã lưu", () => {
  const saved = { insecureTls: true, buzzSound: false, apiBase: "https://chat.example.vn" };
  assert.equal(mergeSettings(saved, {}).insecureTls, false);
  assert.equal(mergeSettings(saved, { YC_DEV_INSECURE_TLS: "1" }).insecureTls, true);
  assert.equal(mergeSettings(saved, {}).buzzSound, false);
  assert.equal(mergeSettings(saved, { YC_API_BASE: "http://127.0.0.1:8080" }).apiBase, "http://127.0.0.1:8080");
  assert.equal("insecureTls" in mergeSettings.persistable({ insecureTls: true, buzzSound: true }), false);
});

test("đầu mối mạng: bắt buộc mã hóa trừ máy local hoặc chế độ dev", () => {
  assert.doesNotThrow(() => assertSecureEndpoint("https://chat.example.vn", false));
  assert.doesNotThrow(() => assertSecureEndpoint("xmpps://chat.example.vn:5223", false));
  assert.doesNotThrow(() => assertSecureEndpoint("http://127.0.0.1:8080", false));
  assert.doesNotThrow(() => assertSecureEndpoint("http://localhost:8080", false));
  assert.throws(() => assertSecureEndpoint("http://chat.example.vn", false), /mã hóa/);
  assert.throws(() => assertSecureEndpoint("xmpp://chat.example.vn:5222", false), /mã hóa/);
  assert.throws(() => assertSecureEndpoint("xmpp://127.0.0.1:5222", false), /mã hóa/); // STARTTLS có thể bị gỡ
  assert.doesNotThrow(() => assertSecureEndpoint("xmpp://127.0.0.1:5222", true));
});

import { ChatCore } from "../core/chat-core.js";

test("địa chỉ máy chủ sai (trả HTML) → thông báo dễ hiểu, không lộ lỗi JSON", async () => {
  const fetchImpl = async () => new Response("<!doctype html><html><head></head></html>", { status: 200, headers: { "content-type": "text/html" } });
  const c = new ChatCore({ apiBase: "http://127.0.0.1:8080", fetchImpl });
  await assert.rejects(c.registerStart("X", "email", "a@b.c"), (e) => {
    assert.equal(e.code, "BAD_SERVER");
    assert.match(e.message, /127\.0\.0\.1:8080/);
    assert.match(e.message, /quản trị viên/);
    assert.doesNotMatch(e.message, /mục "Máy chủ"/);
    assert.doesNotMatch(e.message, /Unexpected token|JSON/);
    return true;
  });
});

test("không kết nối được máy chủ → thông báo dễ hiểu", async () => {
  const fetchImpl = async () => { throw new TypeError("fetch failed"); };
  const c = new ChatCore({ apiBase: "http://127.0.0.1:9", fetchImpl });
  await assert.rejects(c.login("a", "b"), (e) => {
    assert.equal(e.code, "NETWORK");
    assert.match(e.message, /Không kết nối được/);
    return true;
  });
});

import { decideIncomingMessage } from "../core/model.js";
import { xml } from "@xmpp/client";
import { Xmlns } from "@yc/contracts";

test("tin nhắn đến: chưa mở cửa sổ → tự mở; đã mở → không mở thêm; thu nhỏ/không focus → nhấp nháy; tắt tùy chọn → không mở", () => {
  assert.deepEqual(decideIncomingMessage({ window: null, settings: S }), { open: true, flash: false });
  assert.deepEqual(decideIncomingMessage({ window: { visible: true, minimized: false, focused: true }, settings: S }), { open: false, flash: false });
  assert.deepEqual(decideIncomingMessage({ window: { visible: true, minimized: false, focused: false }, settings: S }), { open: false, flash: true });
  assert.deepEqual(decideIncomingMessage({ window: { visible: true, minimized: true, focused: false }, settings: S }), { open: false, flash: true });
  assert.deepEqual(decideIncomingMessage({ window: null, settings: { ...S, autoOpenChat: false } }), { open: false, flash: false });
});

test("ChatCore: chỉ tin đến TRỰC TIẾP phát 'incoming-message'; tin từ đồng bộ lịch sử thì không", () => {
  const c = new ChatCore({ apiBase: "http://127.0.0.1:1" });
  c.me = { userId: "11111111-1111-1111-1111-111111111111", jid: "u11111111111111111111111111111111@localhost" };
  const peerJid = "u22222222222222222222222222222222@localhost";
  const got = [];
  c.on("incoming-message", (e) => got.push(e));
  c.onMessage(xml("message", { from: peerJid + "/r", type: "chat", id: "o1" }, xml("body", {}, "chào"), xml("origin-id", { xmlns: Xmlns.SID, id: "o1" })));
  assert.deepEqual(got, [{ peer: "22222222-2222-2222-2222-222222222222" }]);
  c.onMessage(xml("message", { from: peerJid + "/r", type: "chat", id: "o1" }, xml("body", {}, "chào"), xml("origin-id", { xmlns: Xmlns.SID, id: "o1" })));
  assert.equal(got.length, 1, "bản trùng không mở lại cửa sổ");
  c.ingestArchived(xml("result", { xmlns: Xmlns.MAM, id: "a2" }, xml("forwarded", { xmlns: "urn:xmpp:forward:0" },
    xml("delay", { xmlns: "urn:xmpp:delay", stamp: new Date().toISOString() }),
    xml("message", { from: peerJid + "/r", to: c.me.jid, type: "chat" }, xml("body", {}, "cũ"), xml("origin-id", { xmlns: Xmlns.SID, id: "o2" })))));
  assert.equal(got.length, 1, "tin lịch sử không bật cửa sổ");
});

test("chế độ bỏ kiểm tra chứng chỉ (dev/dùng thử) CHỈ áp dụng cho máy chủ trên chính máy này", () => {
  assert.doesNotThrow(() => assertSecureEndpoint("xmpps://127.0.0.1:5223", true));
  assert.doesNotThrow(() => assertSecureEndpoint("http://localhost:8090", true));
  assert.throws(() => assertSecureEndpoint("https://chat.example.vn", true), /chỉ dùng cho máy chủ trên chính máy này/);
  assert.throws(() => assertSecureEndpoint("xmpps://10.0.0.5:5223", true), /chỉ dùng cho máy chủ trên chính máy này/);
  assert.throws(() => new ChatCore({ apiBase: "https://chat.example.vn", insecureTls: true }), /chỉ dùng cho máy chủ trên chính máy này/);
});

test("địa chỉ máy chủ: lấy từ cấu hình cài sẵn của bản build; bỏ qua giá trị cũ trong settings.json; biến môi trường (lối tắt dùng thử) ghi đè được", () => {
  const defaults = { apiBase: "https://chat.zahu.example" };
  assert.equal(mergeSettings({ apiBase: "http://127.0.0.1:8080" }, {}, defaults).apiBase, "https://chat.zahu.example");
  assert.equal(mergeSettings({}, { YC_API_BASE: "http://127.0.0.1:8090" }, defaults).apiBase, "http://127.0.0.1:8090");
  assert.equal("apiBase" in mergeSettings.persistable({ apiBase: "x", buzzSound: true }), false);
});
