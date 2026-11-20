import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenizeSmileys, Smileys, userLocalpart, normalizeNick, NICK_PATTERN } from "../index.js";

test("12 smiley có mã và id duy nhất", () => {
  assert.equal(Smileys.length, 12);
  assert.equal(new Set(Smileys.map((s) => s.code)).size, 12);
  assert.equal(new Set(Smileys.map((s) => s.id)).size, 12);
});
test("tokenizeSmileys ưu tiên mã dài nhất và giữ text", () => {
  assert.deepEqual(tokenizeSmileys("hi :(( bye :("), [
    { type: "text", text: "hi " }, { type: "smiley", id: "cry", code: ":((" },
    { type: "text", text: " bye " }, { type: "smiley", id: "sad", code: ":(" },
  ]);
  assert.deepEqual(tokenizeSmileys("không có"), [{ type: "text", text: "không có" }]);
});
test("localpart và nick", () => {
  assert.equal(userLocalpart("0193A1B2-0000-7000-8000-00000000000A"), "u0193a1b200007000800000000000000a");
  assert.equal(normalizeNick("Chi_En"), "chi_en");
  assert.ok(NICK_PATTERN.test("abc") && !NICK_PATTERN.test("ab") && !NICK_PATTERN.test("a".repeat(33)) && !NICK_PATTERN.test("tên"));
});
