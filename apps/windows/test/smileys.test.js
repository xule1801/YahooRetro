// Bộ smiley vẽ bằng SVG: mỗi mã có hình riêng, SVG cân bằng thẻ, không trùng nhau, nhãn được escape.
import { test } from "node:test";
import assert from "node:assert/strict";
import { smileySvg, hasDesign } from "../renderer/smileys.js";
import { Smileys } from "../renderer/vendor/contracts.js";

test("đủ 54 hình, mỗi id có thiết kế riêng (không rơi về hình mặc định)", () => {
  assert.equal(Smileys.length, 54);
  for (const s of Smileys) assert.ok(hasDesign(s.id), "thiếu thiết kế: " + s.id);
});

test("54 SVG khác nhau từng đôi một", () => {
  const svgs = Smileys.map((s) => smileySvg(s.id, "x"));
  assert.equal(new Set(svgs).size, 54);
});

test("SVG hợp lệ: thẻ mở/đóng cân bằng, có title và aria-label", () => {
  for (const s of Smileys) {
    const svg = smileySvg(s.id, s.label);
    const opens = [...svg.matchAll(/<([a-zA-Z]+)(?=[\s>])[^>]*?(?<!\/)>/g)].map((m) => m[1]);
    const closes = [...svg.matchAll(/<\/([a-zA-Z]+)>/g)].map((m) => m[1]);
    assert.deepEqual(opens.sort(), closes.sort(), s.id);
    assert.ok(svg.startsWith("<svg") && svg.includes(`aria-label="${s.label}"`) && svg.includes("<title>"), s.id);
  }
});

test("nhãn được escape (không chèn được HTML qua nhãn)", () => {
  assert.ok(!smileySvg("happy", '<img onerror=x>"').includes("<img"));
});
