import { yc, $, el, errText, MODE_LABEL, applySettings, playBuzz } from "./common.js";
import { renderRich, buildPicker } from "./smileys.js";

const peer = new URLSearchParams(location.search).get("userId");
const st = await applySettings();
const myNick = () => st.me?.nick ?? "Tôi";
let contact = await yc.call("contactById", peer);
const STATE_LABEL = { sending: "đang gửi…", stored: "đã gửi", delivered: "đã chuyển", failed: "không gửi được" };

function header() {
  if (!contact) { $("#peer-nick").textContent = "(không còn trong danh bạ)"; return; }
  const view = findInView(contact.userId);
  const mode = view?.mode ?? "offline";
  $("#peer-nick").textContent = contact.nick;
  $("#peer-dot").className = `dot ${mode}`;
  $("#peer-st").textContent = `${MODE_LABEL[mode]}${view?.statusText ? " — " + view.statusText : ""}`;
  document.title = `${contact.nick} — Chat`;
}
let lastView = null;
const findInView = (id) => lastView?.groups.flatMap((g) => g.contacts).find((c) => c.userId === id);

// ------------------------------------------------------------ Lịch sử
const rows = new Map(); // originId → element
const fmt = (ts) => (ts ? new Date(ts).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : "");
function msgNode(m) {
  const body = el("span", { class: "body" });
  renderRich(body, m.body);
  const node = el("div", { class: `msg ${m.dir}`, "data-origin": m.originId },
    el("span", { class: "who", text: (m.dir === "out" ? myNick() : contact?.nick ?? "Bạn") + ": " }), body,
    el("span", { class: "time", text: fmt(m.ts) }),
    m.dir === "out" ? el("span", { class: `state ${m.status}`, text: m.status === "failed" ? `${STATE_LABEL.failed}${m.error ? " (" + m.error + ")" : ""}` : STATE_LABEL[m.status] ?? "" }) : null);
  return node;
}
function upsert(m) {
  const h = $("#history");
  const atBottom = h.scrollHeight - h.scrollTop - h.clientHeight < 40;
  const node = msgNode(m);
  const old = rows.get(m.originId);
  if (old) old.replaceWith(node); else h.append(node);
  rows.set(m.originId, node);
  if (atBottom || m.dir === "out") h.scrollTop = h.scrollHeight;
}
function sysline(text, cls = "sysline") { const h = $("#history"); h.append(el("div", { class: cls, text })); h.scrollTop = h.scrollHeight; }
async function loadHistory() {
  $("#history").replaceChildren(); rows.clear();
  for (const m of await yc.call("conversation", peer)) upsert(m);
  sysline("Tin nhắn tự xóa sau 30 ngày kể từ khi máy chủ nhận. Ảnh chụp màn hình hoặc bản sao bạn tự lưu không bị xóa.");
}

// ------------------------------------------------------------ Gửi
async function send() {
  const text = $("#input").value;
  if (!text.trim()) return;
  try { await yc.call("sendMessage", peer, text); $("#input").value = ""; $("#tool-msg").textContent = ""; }
  catch (e) { $("#tool-msg").textContent = errText(e); }
}
$("#compose").addEventListener("submit", (e) => { e.preventDefault(); send(); });
$("#input").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });

// ------------------------------------------------------------ Smiley
buildPicker($("#picker"), (code) => {
  const i = $("#input"), pos = i.selectionStart ?? i.value.length;
  i.value = i.value.slice(0, pos) + code + " " + i.value.slice(i.selectionEnd ?? pos);
  togglePicker(false); i.focus();
});
function togglePicker(open = $("#picker").classList.contains("hidden")) {
  $("#picker").classList.toggle("hidden", !open);
  $("#btn-smiley").setAttribute("aria-expanded", String(open));
  if (open) $("#picker button")?.focus();
}
$("#btn-smiley").addEventListener("click", () => togglePicker());
document.addEventListener("keydown", (e) => { if (e.key === "Escape") togglePicker(false); });

// ------------------------------------------------------------ Buzz
$("#btn-buzz").addEventListener("click", async () => {
  $("#btn-buzz").disabled = true;
  try {
    const r = await yc.call("buzz", peer);
    if (r.ok) sysline(`Bạn đã gửi BUZZ!!! tới ${contact?.nick}.`, "buzzline");
    else $("#tool-msg").textContent = r.code === "RECIPIENT_UNAVAILABLE" ? `${contact?.nick} hiện không thể nhận Buzz.`
      : r.code === "RATE_LIMITED" ? `Chờ ${r.retryAfterSec ?? 10} giây rồi Buzz tiếp nhé.` : r.message;
  } catch (e) { $("#tool-msg").textContent = errText(e); }
  finally { setTimeout(() => ($("#btn-buzz").disabled = false), 1000); }
});

yc.on((name, p) => {
  if (name === "message" || name === "message-status") { if (p.peer === peer) upsert(p); }
  else if (name === "contacts") { lastView = p; yc.call("contactById", peer).then((c) => { contact = c; header(); }); }
  else if (name === "buzz-received" && p.fromUserId === peer) {
    sysline(`${contact?.nick ?? "Bạn"}: BUZZ!!!`, "buzzline");
    if (p.sound) playBuzz();
    if (p.effect?.flash) { document.body.classList.remove("flash"); void document.body.offsetWidth; document.body.classList.add("flash"); }
  }
  else if (name === "messages-expired") loadHistory();
});

lastView = await yc.call("contactsView");
header();
await loadHistory();
$("#input").focus();
