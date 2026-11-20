// Tiện ích dùng chung cho các trang renderer.
export const yc = window.yc;
export const $ = (sel, root = document) => root.querySelector(sel);
export function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (k === "text") n.textContent = v;
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children) if (c != null) n.append(c);
  return n;
}
export const MODE_LABEL = { online: "Online", busy: "Bận", away: "Vắng mặt", invisible: "Ẩn", offline: "Offline" };
export const errText = (e) => (e?.retryAfterSec ? `${e.message} (thử lại sau ${e.retryAfterSec} giây)` : e?.message ?? String(e));

export async function applySettings() {
  const st = await yc.app("state");
  document.documentElement.classList.toggle("reduce-motion", !!st.settings.reduceMotion);
  return st;
}
yc.on((name, s) => { if (name === "settings") document.documentElement.classList.toggle("reduce-motion", !!s.reduceMotion); });

/** Âm Buzz tự tạo bằng WebAudio (không dùng tệp âm thanh của bên thứ ba). */
export function playBuzz() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "square"; o.frequency.setValueAtTime(140, ctx.currentTime);
    o.frequency.linearRampToValueAtTime(90, ctx.currentTime + 0.45);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.52);
    o.onended = () => ctx.close();
  } catch { /* không có thiết bị âm thanh */ }
}
