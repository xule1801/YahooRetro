import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenizeSmileys, Smileys, userLocalpart, normalizeNick, NICK_PATTERN } from "../index.js";

const allCodes = Smileys.flatMap((s) => [s.code, ...(s.aliases ?? [])]);

test("54 smiley, id và mã (kể cả mã phụ) đều duy nhất", () => {
  assert.equal(Smileys.length, 54);
  assert.equal(new Set(Smileys.map((s) => s.id)).size, 54);
  assert.equal(new Set(allCodes).size, allCodes.length);
});
test("đủ các mã theo bảng tham chiếu, kèm mã cũ để tin nhắn cũ vẫn hiển thị", () => {
  for (const c of [":)", ":(", ";)", ":D", ";;)", ">:D<", ":-/", ":x", ':">', ":P", ":-*", "=((", ":-O", "X(", ":>", "B-)", ":-S", "#:-S",
    ">:)", ":((", ":))", ":|", "/:)", "=))", "O:-)", ":-B", "=;", ":-c", ":)]", "~X(", ":-h", ":-t", "8->", "I-)", "8-|", "L-)", ":-&",
    ":-$", "[-(", ":O)", "8-}", "<:-P", "(:|", "=P~", ":-?", "#-o", "=D>", ":-SS", "@-)", ":^o", ":-w", ":-<", ">:P", "<):)",
    ":X", ":O", ">:("]) assert.ok(allCodes.includes(c), c);
});
test("tokenizeSmileys ưu tiên mã dài nhất và giữ text", () => {
  const ids = (t) => tokenizeSmileys(t).filter((p) => p.type === "smiley").map((p) => p.id);
  assert.deepEqual(tokenizeSmileys("hi :(( bye :("), [
    { type: "text", text: "hi " }, { type: "smiley", id: "cry", code: ":((" },
    { type: "text", text: " bye " }, { type: "smiley", id: "sad", code: ":(" },
  ]);
  assert.deepEqual(ids(":-SS :-S :O) :-O :O >:D< =D> <):) :)] :))"), ["nailbite", "worried", "clown", "surprise", "surprise", "hug", "applause", "cowboy", "phone", "laugh"]);
  assert.deepEqual(tokenizeSmileys("không có"), [{ type: "text", text: "không có" }]);
});
test("mã bắt đầu bằng chữ/số không bị nhận nhầm khi dính liền sau chữ (MAX( , HI-), x8->)", () => {
  const ids = (t) => tokenizeSmileys(t).filter((p) => p.type === "smiley").map((p) => p.id);
  assert.deepEqual(ids("MAX(1,2) HI-) x8->"), []);
  assert.deepEqual(ids("X( I-) 8->"), ["angry", "sleepy", "daydream"]);
  assert.deepEqual(ids("chán X("), ["angry"]);
});
test("localpart và nick", () => {
  assert.equal(userLocalpart("0193A1B2-0000-7000-8000-00000000000A"), "u0193a1b200007000800000000000000a");
  assert.equal(normalizeNick("Chi_En"), "chi_en");
  assert.ok(NICK_PATTERN.test("abc") && !NICK_PATTERN.test("ab") && !NICK_PATTERN.test("a".repeat(33)) && !NICK_PATTERN.test("tên"));
});
