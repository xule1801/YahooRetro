// 54 smiley vàng — HÌNH VẼ GỐC của dự án (SVG thuần), dựng từ thư viện bộ phận: mắt + miệng + phụ kiện.
// Không sao chép hay đồ lại hình của Yahoo hoặc bên thứ ba; chỉ mã gõ tắt theo quy ước phổ biến (xem packages/contracts).
// Hoạt ảnh bằng CSS (lớp .sm-*), tự tắt khi bật "Giảm chuyển động" hoặc hệ điều hành yêu cầu giảm chuyển động.
import { Smileys, tokenizeSmileys } from "./vendor/contracts.js";

// Toạ độ: mặt tròn tâm (16,16) bán kính 14; viewBox -4..36 chừa chỗ cho phụ kiện tràn ra ngoài.
const dot = (x, y, r = 1.8) => `<circle class="sm-eye" cx="${x}" cy="${y}" r="${r}"/>`;
const line = (d) => `<path class="sm-line" d="${d}"/>`;
const eyeW = (x, y, px = x, py = y, r = 3) => `<circle class="sm-eyew" cx="${x}" cy="${y}" r="${r}"/>${dot(px, py, 1.3)}`;

const EYES = {
  dots: dot(11, 13) + dot(21, 13),
  wink: dot(11, 13) + line("M18.5 13.5 q2.5 -2 5 0"),
  happy: line("M8.5 14 q2.5 -3 5 0") + line("M18.5 14 q2.5 -3 5 0"),
  closed: line("M8.5 13 q2.5 2 5 0") + line("M18.5 13 q2.5 2 5 0"),
  big: eyeW(11, 12.5) + eyeW(21, 12.5),
  roll: eyeW(11, 12.5, 11, 10.6) + eyeW(21, 12.5, 21, 10.6),
  side: eyeW(11, 12.5, 12.6, 12.5) + eyeW(21, 12.5, 22.6, 12.5),
  crazy: eyeW(11, 12.5, 10, 13.5, 3.4) + eyeW(21, 12, 22, 11.4, 2.2),
  angry: line("M7.5 9.5 l5 2.2") + line("M24.5 9.5 l-5 2.2") + dot(11, 14, 1.6) + dot(21, 14, 1.6),
  sad: line("M8 10.5 l4.5 -1.4") + line("M24 10.5 l-4.5 -1.4") + dot(11, 13.5) + dot(21, 13.5),
  worried: line("M8 9 l4.5 1.6") + line("M24 9 l-4.5 1.6") + dot(11, 13.5) + dot(21, 13.5),
  raised: line("M8 10.5 h5") + line("M18.5 8.5 q2.5 -2 5 0.5") + dot(11, 13.5) + dot(21, 13),
  half: line("M8.5 12.5 h5") + line("M18.5 12.5 h5") + `<path class="sm-eye" d="M9.5 12.5 a1.5 1.5 0 0 0 3 0z M19.5 12.5 a1.5 1.5 0 0 0 3 0z"/>`,
  lashes: dot(11, 13) + dot(21, 13) + line("M8.2 10 l1.4 1.3 M10.6 9.2 l.5 1.6 M13.2 9.8 l-.9 1.4 M18.8 9.8 l.9 1.4 M21.4 9.2 l-.5 1.6 M23.8 10 l-1.4 1.3"),
  side2: dot(12.5, 13) + dot(22.5, 13) + line("M9.5 10 h5") + line("M19.5 10 h5"),
  xeyes: line("M9 11 l4 4 M13 11 l-4 4") + line("M19 11 l4 4 M23 11 l-4 4"),
  spiral: `<path class="sm-line sm-thin" d="M11 12.5 m-2.6 0 a2.6 2.6 0 1 0 5.2 0 a1.8 1.8 0 1 0 -3.6 0 a1 1 0 1 0 2 0"/><path class="sm-line sm-thin" d="M21 12.5 m-2.6 0 a2.6 2.6 0 1 0 5.2 0 a1.8 1.8 0 1 0 -3.6 0 a1 1 0 1 0 2 0"/>`,
  hearts: `<path class="sm-heart" d="M11 16 l-3.2 -3.2 a1.9 1.9 0 0 1 3.2 -2.2 a1.9 1.9 0 0 1 3.2 2.2z"/><path class="sm-heart" d="M21 16 l-3.2 -3.2 a1.9 1.9 0 0 1 3.2 -2.2 a1.9 1.9 0 0 1 3.2 2.2z"/>`,
  shades: `<path class="sm-shades" d="M5.5 11 h21 v1.6 h-.8 q-.6 4.4 -4.7 4.4 q-3.6 0 -4.2 -4.2 h-1.6 q-.6 4.2 -4.2 4.2 q-4.1 0 -4.7 -4.4 h-.8z"/><path class="sm-shine2" d="M8 12.5 l2 -.3 l-2 2z M19 12.5 l2 -.3 l-2 2z"/>`,
  glasses: `<circle class="sm-frame" cx="11" cy="13" r="3.6"/><circle class="sm-frame" cx="21" cy="13" r="3.6"/><path class="sm-frame" d="M14.6 13 h2.8 M7.4 12.5 l-2.4 -1 M24.6 12.5 l2.4 -1"/>` + dot(11, 13, 1.4) + dot(21, 13, 1.4),
};

const MOUTH = {
  smile: line("M10 20 q6 5 12 0"),
  small: line("M12.5 21 q3.5 2.4 7 0"),
  sad: line("M10 23 q6 -5 12 0"),
  frown: line("M10.5 24 q5.5 -6.5 11 0"),
  flat: line("M11 22 h10"),
  wavy: line("M10 22 q1.5 -1.6 3 0 t3 0 t3 0 t3 0"),
  smirk: line("M11.5 21.5 q5.5 1.8 10 -2.5"),
  grin: `<path class="sm-mouth" d="M9 18.5 h14 q-1 7 -7 7 q-6 0 -7 -7z"/><path class="sm-teeth" d="M10 19 h12 v1.6 h-12z"/>`,
  laugh: `<path class="sm-mouth" d="M8 18 h16 q-1 8 -8 8 q-7 0 -8 -8z"/><path class="sm-teeth" d="M9 18.6 h14 v1.5 h-14z"/><path class="sm-tongue" d="M12.5 23.6 q3.5 -2.6 7 0 q-3.5 2.2 -7 0z"/>`,
  tongue: line("M10 20 h12") + `<path class="sm-tongue" d="M17 20 h4 v3.2 a2 2 0 0 1 -4 0z"/>`,
  tongueBig: line("M10 20.5 h12") + `<path class="sm-tongue" d="M13 20.5 h6 v4.5 a3 3 0 0 1 -6 0z"/><path class="sm-line sm-thin" d="M16 21 v3"/>`,
  o: `<ellipse class="sm-mouth" cx="16" cy="22" rx="2.6" ry="3.2"/>`,
  oSmall: `<circle class="sm-mouth" cx="17" cy="22" r="1.5"/>`,
  bigO: `<ellipse class="sm-mouth" cx="16" cy="22.5" rx="3.8" ry="4.6"/><path class="sm-tongue" d="M13.2 25 q2.8 -1.8 5.6 0 q-2.8 2 -5.6 0z"/>`,
  kiss: line("M15 19 q3 1.5 0 3 q3 1.5 0 3"),
  zipper: line("M10 22 h12") + `<path class="sm-line sm-thin" d="M11.5 20.6 v2.8 M13.5 20.6 v2.8 M15.5 20.6 v2.8 M17.5 20.6 v2.8 M19.5 20.6 v2.8"/><rect class="sm-zip" x="20.5" y="20.4" width="2.6" height="3.4" rx=".6"/>`,
  pout: line("M12 23.5 q4 -3 8 0"),
  buck: line("M10 20 q6 5 12 0") + `<path class="sm-teeth sm-stroke" d="M14 21.6 h1.9 v2.4 h-1.9z M16.1 21.6 h1.9 v2.4 h-1.9z"/>`,
  teeth: `<rect class="sm-mouth" x="10" y="19.5" width="12" height="5" rx="1.5"/><path class="sm-teeth" d="M10.8 20.2 h10.4 v3.6 h-10.4z"/><path class="sm-line sm-thin" d="M10.8 22 h10.4 M13.4 20.2 v3.6 M16 20.2 v3.6 M18.6 20.2 v3.6"/>`,
  drool: `<path class="sm-mouth" d="M10 19 h12 q-1 6 -6 6 q-5 0 -6 -6z"/><path class="sm-tongue" d="M12.5 22.5 q3.5 -2 7 0 q-3.5 2.4 -7 0z"/>`,
  smileOpen: `<path class="sm-mouth" d="M10.5 19.5 h11 q-1 5 -5.5 5 q-4.5 0 -5.5 -5z"/>`,
};

const EXTRA = {
  blush: `<ellipse class="sm-blush" cx="7.5" cy="18" rx="2.6" ry="1.6"/><ellipse class="sm-blush" cx="24.5" cy="18" rx="2.6" ry="1.6"/>`,
  tears: `<path class="sm-tear" d="M9 15.5 q-1.6 4.5 0 5.5 q1.6 -1 0 -5.5z"/><path class="sm-tear sm-tear2" d="M23 15.5 q-1.6 4.5 0 5.5 q1.6 -1 0 -5.5z"/>`,
  stream: `<path class="sm-tear" d="M8.5 15 q-2 7 -1 11 q2 0 2 -4 z"/><path class="sm-tear sm-tear2" d="M23.5 15 q2 7 1 11 q-2 0 -2 -4 z"/>`,
  sweat: `<path class="sm-tear" d="M27 4 q-2.6 4.4 0 5.6 q2.6 -1.2 0 -5.6z"/>`,
  halo: `<ellipse class="sm-halo" cx="16" cy="-0.5" rx="8" ry="2.4"/>`,
  horns: `<path class="sm-horn" d="M6.5 6 q-2.5 -6 -.5 -9 q1.5 4 5.5 5.5z M25.5 6 q2.5 -6 .5 -9 q-1.5 4 -5.5 5.5z"/>`,
  heartFloat: `<path class="sm-heart sm-float" d="M28 6 l-2.6 -2.6 a1.5 1.5 0 0 1 2.6 -1.8 a1.5 1.5 0 0 1 2.6 1.8z"/>`,
  heartBroken: `<g class="sm-float"><path class="sm-heart" d="M28 10 l-3.6 -3.6 a2.2 2.2 0 0 1 3.4 -3.1 l-.8 2.4 l1.4 1.2 z"/><path class="sm-heart" d="M29 10 l-.6 -3.4 l-1 -1 l1 -2.4 a2.2 2.2 0 0 1 3.4 3.1z"/></g>`,
  question: `<text class="sm-text sm-float" x="25" y="4" font-size="11">?</text>`,
  excl: `<text class="sm-text sm-float" x="26" y="4" font-size="10">!</text>`,
  zzz: `<text class="sm-text sm-float" x="23" y="5" font-size="7">z</text><text class="sm-text sm-float sm-delay" x="27" y="1" font-size="9">Z</text>`,
  phone: `<path class="sm-phone" d="M-1 9 q-2 7 1 13 l3.4 -1.4 q-1.6 -5.2 -.4 -10.4z"/><rect class="sm-phone" x="-2.6" y="7.2" width="5" height="3" rx="1" transform="rotate(-25 0 8.7)"/><rect class="sm-phone" x="-1.6" y="20.4" width="5" height="3" rx="1" transform="rotate(25 1 22)"/>`,
  callHand: `<g class="sm-hand-anim"><path class="sm-hand" d="M28 9 q3 -1 4 1 l-1.5 2 q2 3 1 6 l2.5 1.5 q-.5 2.5 -3 2 l-3 -2.5 q-2 -4 0 -10z"/></g>`,
  waveHand: `<g class="sm-wave"><path class="sm-hand" d="M27 22 l0 -9 q0 -1.4 1.2 -1.4 q1.2 0 1.2 1.4 l0 4 l0 -6 q0 -1.4 1.2 -1.4 q1.2 0 1.2 1.4 l0 6 l0 -4.5 q0 -1.4 1.2 -1.4 q1.2 0 1.2 1.4 l0 8 q0 4 -4 4.5 z"/></g>`,
  stopHand: `<path class="sm-hand" d="M33 8 v14 q0 4 -4.5 4 h-1.5 l-1 -3 l2 -1 v-11 q0 -1.4 1.2 -1.4 q1.2 0 1.2 1.4 v4 v-6 q0 -1.4 1.3 -1.4 q1.3 0 1.3 1.4z"/>`,
  clap: `<g class="sm-clap"><path class="sm-hand" d="M3 29 l4 -6 q1 -1 2 0 l2 2 l-4 6 q-2 1 -4 -2z"/><path class="sm-hand" d="M29 29 l-4 -6 q-1 -1 -2 0 l-2 2 l4 6 q2 1 4 -2z"/></g><path class="sm-line sm-thin" d="M16 29 v3 M13 30 l-1 2 M19 30 l1 2"/>`,
  hugArms: `<path class="sm-hand" d="M0 20 q-3 6 3 9 q6 2 10 -1 l-1.5 -2 q-4 2 -8 0 q-2 -2 0 -5z M32 20 q3 6 -3 9 q-6 2 -10 -1 l1.5 -2 q4 2 8 0 q2 -2 0 -5z"/>`,
  thinkHand: `<path class="sm-hand" d="M19 30 q-1 -3 2 -4.5 l5 -1 q1.6 -.2 1.6 1 q0 1 -1.4 1.2 l-2 .4 l3 .2 q1.4 .2 1.2 1.4 q-.2 1 -1.6 1 l-3 -.2 l2 .8 q1.2 .6 .6 1.6 q-.6 .8 -1.8 .2 z"/>`,
  foreheadHand: `<path class="sm-hand" d="M3 9 q2 -5 7 -6 l9 -1 q1.6 0 1.6 1.2 q0 1.2 -1.6 1.4 l-5 .6 l7 -.4 q1.6 0 1.6 1.2 q0 1.2 -1.6 1.4 l-7 .6 l5 .2 q1.4 .2 1.2 1.4 q-.2 1 -1.6 1 l-8 -.4 q-3 0 -4.6 1.8z"/>`,
  wipeHand: `<path class="sm-hand sm-wave" d="M22 2 q4 -3 8 -1 l3 2 q1 1 0 2 l-3 -1 l2 3 q.6 1.2 -.6 1.6 q-1 .2 -1.6 -.8 l-2 -2.6 l1 3.2 q.2 1.2 -1 1.2 q-1 0 -1.4 -1z"/>`,
  timeoutHands: `<path class="sm-hand" d="M7 29 h18 q1.6 0 1.6 1.6 q0 1.6 -1.6 1.6 h-18 q-1.6 0 -1.6 -1.6 q0 -1.6 1.6 -1.6z M14.2 32 h3.6 v5 q0 1.6 -1.8 1.6 q-1.8 0 -1.8 -1.6z"/>`,
  nails: `<path class="sm-hand" d="M12 28 v-4 q0 -1.4 1.3 -1.4 q1.3 0 1.3 1.4 v4 M15 28 v-4.4 q0 -1.4 1.3 -1.4 q1.3 0 1.3 1.4 v4.4 M18 28 v-4 q0 -1.4 1.3 -1.4 q1.3 0 1.3 1.4 v4"/>`,
  bubble: `<g class="sm-float"><circle class="sm-cloud" cx="27" cy="7" r="1.2"/><circle class="sm-cloud" cx="29.5" cy="3.5" r="1.8"/><ellipse class="sm-cloud" cx="32" cy="-1.5" rx="5" ry="3.4"/><path class="sm-heart" d="M32 0 l-1.6 -1.6 a1 1 0 0 1 1.6 -1.1 a1 1 0 0 1 1.6 1.1z"/></g>`,
  puff: `<g class="sm-float"><circle class="sm-cloud" cx="24" cy="24" r="1.4"/><circle class="sm-cloud" cx="27" cy="24.5" r="2"/><circle class="sm-cloud" cx="30.5" cy="24" r="2.4"/></g>`,
  spit: `<g class="sm-float"><circle class="sm-tear" cx="23" cy="26" r=".9"/><circle class="sm-tear" cx="26" cy="24" r=".7"/><circle class="sm-tear" cx="25" cy="28" r=".8"/></g>`,
  droolDrop: `<path class="sm-tear sm-drip" d="M20 25 q-1.4 3.6 0 4.6 q1.4 -1 0 -4.6z"/>`,
  clownNose: `<circle class="sm-nose" cx="16" cy="17.5" r="2.6"/><path class="sm-hair" d="M2 10 q-4 -4 0 -7 q-1 3 3 4 q-3 -5 2 -6 q-1 4 2 5z M30 10 q4 -4 0 -7 q1 3 -3 4 q3 -5 -2 -6 q1 4 -2 5z"/>`,
  longNose: `<path class="sm-face-fill sm-stroke" d="M16 16.5 h11 q1.6 0 1.6 1.2 q0 1.2 -1.6 1.2 h-11z"/>`,
  lMark: `<text class="sm-text sm-lmark" x="13.2" y="8.5" font-size="7">L</text>`,
  cowboyHat: `<path class="sm-hat" d="M-1 5 q17 4 34 0 q-1 3 -4 3.4 l-2 .2 q-11 1.2 -22 0 l-2 -.2 q-3 -.4 -4 -3.4z M7 6.5 q0 -8 4 -9 q3 1 5 -1 q2 2 5 1 q4 1 4 9 q-9 1.4 -18 0z"/><path class="sm-band" d="M7.4 4 q8.6 1.2 17.2 0 v1.6 q-8.6 1.4 -17.2 0z"/>`,
  partyHat: `<path class="sm-party" d="M9 3.5 l7 -9 l7 9 q-7 2 -14 0z"/><path class="sm-band" d="M11.2 0.8 l2.4 -3.2 M14 2.8 l3.6 -5 M17.8 3.6 l2.6 -3.6"/><circle class="sm-pom" cx="16" cy="-5.6" r="1.6"/><path class="sm-party" d="M20 22 l9 1 l2 -2 l1 3 l-2 1.4 l-10 -.4z"/>`,
  watch: `<circle class="sm-watch" cx="30" cy="24" r="3.6"/><path class="sm-line sm-thin" d="M30 22 v2 h1.6"/><path class="sm-line sm-thin sm-tick" d="M27 30 l1 -2 M33 30 l-1 -2"/>`,
  silentMark: `<path class="sm-line sm-thin" d="M24 4 l6 -2 M25 7 l6 0"/>`,
};

/** id → [mắt, miệng, hoạt ảnh, phụ kiện[], biến thể mặt] */
const DESIGN = {
  happy: ["dots", "smile", "bob"],
  sad: ["sad", "sad", "droop"],
  wink: ["wink", "smile", "tilt"],
  grin: ["happy", "grin", "bob"],
  lashes: ["lashes", "small", "tilt", ["blush"]],
  hug: ["happy", "smileOpen", "pulse", ["hugArms", "blush"]],
  confused: ["raised", "wavy", "tilt", ["question"]],
  love: ["hearts", "smile", "pulse"],
  blush: ["happy", "small", "bob", ["blush"]],
  tongue: ["dots", "tongue", "wiggle"],
  kiss: ["closed", "kiss", "pulse", ["heartFloat", "blush"]],
  heartbreak: ["sad", "frown", "droop", ["heartBroken", "tears"]],
  surprise: ["big", "o", "pop"],
  angry: ["angry", "frown", "shake", [], "red"],
  smug: ["half", "smirk", "tilt"],
  cool: ["shades", "smirk", "bob"],
  worried: ["worried", "wavy", "shake"],
  whew: ["closed", "small", "bob", ["sweat", "wipeHand"]],
  devil: ["angry", "smirk", "wiggle", ["horns"], "purple"],
  cry: ["closed", "frown", "droop", ["stream"]],
  laugh: ["happy", "laugh", "bob"],
  straight: ["dots", "flat", "none"],
  eyebrow: ["raised", "flat", "tilt"],
  rofl: ["happy", "laugh", "spin", ["tears"]],
  angel: ["dots", "smile", "bob", ["halo"]],
  nerd: ["glasses", "buck", "bob"],
  talkhand: ["side2", "pout", "tilt", ["stopHand"]],
  callme: ["wink", "smileOpen", "bob", ["callHand"]],
  phone: ["side", "smileOpen", "bob", ["phone"]],
  witsend: ["xeyes", "bigO", "shake", ["sweat", "excl"]],
  wave: ["happy", "smileOpen", "bob", ["waveHand"]],
  timeout: ["sad", "flat", "none", ["timeoutHands"]],
  daydream: ["roll", "small", "tilt", ["bubble"]],
  sleepy: ["closed", "oSmall", "droop", ["zzz"]],
  rolleyes: ["roll", "flat", "tilt"],
  loser: ["half", "pout", "droop", ["lMark"]],
  sick: ["half", "wavy", "shake", ["sweat"], "green"],
  secret: ["side", "zipper", "none"],
  silent: ["closed", "pout", "none", ["silentMark"]],
  clown: ["big", "grin", "bob", ["clownNose"]],
  silly: ["crazy", "tongueBig", "wiggle"],
  party: ["happy", "smileOpen", "bob", ["partyHat"]],
  yawn: ["closed", "bigO", "pop", ["zzz"]],
  drool: ["big", "drool", "bob", ["droolDrop"]],
  thinking: ["side2", "smirk", "tilt", ["thinkHand", "question"]],
  doh: ["xeyes", "o", "shake", ["foreheadHand"]],
  applause: ["happy", "grin", "bob", ["clap"]],
  nailbite: ["worried", "teeth", "shake", ["nails"]],
  hypno: ["spiral", "wavy", "spin"],
  liar: ["side", "smirk", "tilt", ["longNose"]],
  waiting: ["half", "flat", "none", ["watch"]],
  sigh: ["closed", "oSmall", "droop", ["puff"]],
  phbbt: ["closed", "tongueBig", "wiggle", ["spit"]],
  cowboy: ["dots", "grin", "bob", ["cowboyHat"]],
};

export const hasDesign = (id) => Object.hasOwn(DESIGN, id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function smileySvg(id, label, size = 22) {
  const [eyes, mouth, anim, extras = [], face = "yellow"] = DESIGN[id] ?? DESIGN.happy;
  const L = esc(label);
  return `<svg class="smiley sm-${anim} sm-${face}" viewBox="-4 -4 40 40" width="${size}" height="${size}" role="img" aria-label="${L}">` +
    `<title>${L}</title><g class="sm-body"><circle class="sm-face" cx="16" cy="16" r="14"/><ellipse class="sm-shine" cx="11" cy="7.5" rx="5.5" ry="2.8"/>` +
    `${EYES[eyes]}${MOUTH[mouth]}${extras.map((x) => EXTRA[x]).join("")}</g></svg>`;
}

const svgCache = new Map();
function smileyNode(id, code) {
  const meta = Smileys.find((s) => s.id === id);
  if (!svgCache.has(id)) svgCache.set(id, smileySvg(id, meta?.label ?? code));
  const span = document.createElement("span");
  span.className = "smiley-wrap";
  span.title = `${meta?.label ?? ""} ${code}`;
  span.innerHTML = svgCache.get(id); // chuỗi SVG do chính module này tạo; nhãn đã escape
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
    b.type = "button"; b.className = "picker-item"; b.title = `${s.label}  ${s.code}`;
    b.setAttribute("aria-label", `${s.label} (${s.code})`);
    b.innerHTML = smileySvg(s.id, s.label, 26);
    b.addEventListener("click", () => onPick(s.code));
    container.append(b);
  }
}
