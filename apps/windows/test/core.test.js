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
    { accept: true, shake: true, notify: false, sound: true, flash: false });
});
test("Buzz: thu nhỏ hoặc chưa mở → chỉ thông báo, không rung", () => {
  for (const window of [{ visible: true, minimized: true }, null]) {
    const r = decideBuzzEffect({ nowMs: now, expiresAtMs: now + 5000, window, settings: S });
    assert.equal(r.shake, false); assert.equal(r.notify, true);
  }
});
test("Buzz: quá hạn (nhận trễ sau reconnect) → bỏ qua hoàn toàn", () => {
  const r = decideBuzzEffect({ nowMs: now + 5000, expiresAtMs: now + 5000, window: { visible: true, minimized: false }, settings: S });
  assert.deepEqual(r, { accept: false, shake: false, notify: false, sound: false });
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
