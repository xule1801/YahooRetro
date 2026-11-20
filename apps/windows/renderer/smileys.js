// 12 smiley vàng — hình vẽ gốc của dự án (SVG thuần), không sao chép tài sản của bên thứ ba.
// Hoạt ảnh bằng CSS (lớp .sm-*), tự tắt khi bật "Giảm chuyển động" hoặc hệ điều hành yêu cầu giảm chuyển động.
import { Smileys, tokenizeSmileys } from "./vendor/contracts.js";

const EYES = {
  dots: '<circle class="sm-eye" cx="11" cy="13" r="1.8"/><circle class="sm-eye" cx="21" cy="13" r="1.8"/>',
  wink: '<circle class="sm-eye" cx="11" cy="13" r="1.8"/><path class="sm-line" d="M18.5 13.5 q2.5 -2 5 0"/>',
  happy: '<path class="sm-line" d="M8.5 14 q2.5 -3 5 0"/><path class="sm-line" d="M18.5 14 q2.5 -3 5 0"/>',
  big: '<circle class="sm-eyew" cx="11" cy="12.5" r="3"/><circle class="sm-eye" cx="11" cy="12.5" r="1.4"/><circle class="sm-eyew" cx="21" cy="12.5" r="3"/><circle class="sm-eye" cx="21" cy="12.5" r="1.4"/>',
  angry: '<path class="sm-line" d="M8 10 l5 2"/><path class="sm-line" d="M24 10 l-5 2"/><circle class="sm-eye" cx="11" cy="14" r="1.6"/><circle class="sm-eye" cx="21" cy="14" r="1.6"/>',
  shades: '<path class="sm-shades" d="M6 11 h20 v2 h-1 q-1 4 -5 4 q-3 0 -4 -4 h-0 q-1 4 -4 4 q-4 0 -5 -4 h-1z"/>',
  hearts: '<path class="sm-heart" d="M11 16 l-3.2 -3.2 a1.9 1.9 0 0 1 3.2 -2.2 a1.9 1.9 0 0 1 3.2 2.2z"/><path class="sm-heart" d="M21 16 l-3.2 -3.2 a1.9 1.9 0 0 1 3.2 -2.2 a1.9 1.9 0 0 1 3.2 2.2z"/>',
  closed: '<path class="sm-line" d="M8.5 13 q2.5 2 5 0"/><path class="sm-line" d="M18.5 13 q2.5 2 5 0"/>',
};
const MOUTH = {
  smile: '<path class="sm-line" d="M10 20 q6 5 12 0"/>',
  sad: '<path class="sm-line" d="M10 23 q6 -5 12 0"/>',
  grin: '<path class="sm-mouth" d="M9 18.5 h14 q-1 7 -7 7 q-6 0 -7 -7z"/><path class="sm-teeth" d="M10 19 h12 v1.6 h-12z"/>',
  tongue: '<path class="sm-line" d="M10 20 h12"/><path class="sm-tongue" d="M17 20 h4 v3 a2 2 0 0 1 -4 0z"/>',
  o: '<ellipse class="sm-mouth" cx="16" cy="22" rx="2.6" ry="3.2"/>',
  kiss: '<path class="sm-line" d="M15 19 q3 1.5 0 3 q3 1.5 0 3"/>',
  flat: '<path class="sm-line" d="M11 22 h10"/>',
  laugh: '<path class="sm-mouth" d="M8 18 h16 q-1 8 -8 8 q-7 0 -8 -8z"/>',
};
const DESIGN = {
  smile: ["dots", "smile", "bob"], sad: ["dots", "sad", "droop"], wink: ["wink", "smile", "tilt"], grin: ["happy", "grin", "bob"],
  tongue: ["dots", "tongue", "wiggle"], surprise: ["big", "o", "pop"], love: ["hearts", "smile", "pulse"], cool: ["shades", "smile", "tilt"],
  kiss: ["closed", "kiss", "pulse"], angry: ["angry", "flat", "shake"], cry: ["closed", "sad", "droop", true], laugh: ["happy", "laugh", "roll"],
};

export function smileySvg(id, label) {
  const [eyes, mouth, anim, tears] = DESIGN[id] ?? DESIGN.smile;
  const tear = tears ? '<path class="sm-tear" d="M9 15 q-1.5 4 0 5 q1.5 -1 0 -5z"/><path class="sm-tear sm-tear2" d="M23 15 q-1.5 4 0 5 q1.5 -1 0 -5z"/>' : "";
  return `<svg class="smiley sm-${anim}${id === "angry" ? " sm-red" : ""}" viewBox="0 0 32 32" width="22" height="22" role="img" aria-label="${label}">` +
    `<title>${label}</title><g class="sm-body"><circle class="sm-face" cx="16" cy="16" r="14"/><ellipse class="sm-shine" cx="11" cy="8" rx="5" ry="2.6"/>` +
    `${EYES[eyes]}${MOUTH[mouth]}${tear}</g></svg>`;
}

const svgCache = new Map();
function smileyNode(id, code) {
  const meta = Smileys.find((s) => s.id === id);
  if (!svgCache.has(id)) svgCache.set(id, smileySvg(id, meta?.label ?? code));
  const span = document.createElement("span");
  span.className = "smiley-wrap";
  span.title = `${meta?.label ?? ""} ${code}`;
  span.innerHTML = svgCache.get(id); // chuỗi SVG do chính module này tạo (không có dữ liệu người dùng)
  return span;
}

/** Chuyển văn bản người dùng thành DOM an toàn: text đi qua textContent, smiley là SVG nội bộ. */
export function renderRich(parent, text) {
  for (const part of tokenizeSmileys(text)) {
    if (part.type === "text") parent.append(document.createTextNode(part.text));
    else parent.append(smileyNode(part.id, part.code));
  }
}

export function buildPicker(container, onPick) {
  for (const s of Smileys) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "picker-item"; b.title = `${s.label} ${s.code}`;
    b.setAttribute("aria-label", `${s.label} (${s.code})`);
    b.innerHTML = smileySvg(s.id, s.label);
    b.addEventListener("click", () => onPick(s.code));
    container.append(b);
  }
}
