import { yc, $, el, errText, MODE_LABEL, applySettings, playBuzz } from "./common.js";

let state = await applySettings();
let view = { groups: [] };
const collapsed = new Set();

$("#my-nick").textContent = state.me?.nick ?? "";
$("#my-mode").value = state.mode;
$("#my-status").value = state.statusText;
setMyDot(state.mode);
status(state.online ? "Đã kết nối" : "Đang kết nối…");

function setMyDot(mode) { $("#my-dot").className = `dot ${mode}`; $("#my-dot").title = MODE_LABEL[mode]; }
function status(text, bad = false) { $("#statusbar").textContent = text; $("#statusbar").classList.toggle("bad", bad); }

// ------------------------------------------------------------ Danh bạ
function render() {
  const list = $("#list");
  list.replaceChildren();
  const total = view.groups.reduce((n, g) => n + g.contacts.length, 0);
  if (!total) list.append(el("div", { class: "empty", text: "Chưa có bạn bè. Nhập nick chính xác ở trên rồi bấm Thêm để gửi lời mời." }));
  for (const g of view.groups) {
    const online = g.contacts.filter((c) => c.mode !== "offline").length;
    const det = el("details", { class: "group", "data-group": g.groupId });
    det.open = !collapsed.has(g.groupId);
    det.addEventListener("toggle", () => (det.open ? collapsed.delete(g.groupId) : collapsed.add(g.groupId)));
    const actions = el("span", { class: "gactions" });
    if (!g.isDefault) {
      actions.append(
        el("button", { class: "icon-btn", title: "Đổi tên nhóm", "aria-label": `Đổi tên nhóm ${g.name}`, text: "✎", onclick: (e) => { e.preventDefault(); renameGroup(g); } }),
        el("button", { class: "icon-btn", title: "Xóa nhóm", "aria-label": `Xóa nhóm ${g.name}`, text: "✕", onclick: (e) => { e.preventDefault(); deleteGroup(g); } }),
      );
    }
    det.append(el("summary", {}, el("span", { text: g.name }), el("span", { class: "count", text: `(${online}/${g.contacts.length})` }), actions));
    // Online lên trước, rồi theo nick.
    const sorted = [...g.contacts].sort((a, b) => (a.mode === "offline") - (b.mode === "offline") || a.nick.localeCompare(b.nick, "vi"));
    for (const c of sorted) det.append(contactRow(c));
    list.append(det);
  }
}

function contactRow(c) {
  const row = el("div", {
    class: `contact ${c.mode}`, tabindex: "0", role: "button", "data-user": c.userId,
    "aria-label": `${c.nick}, ${MODE_LABEL[c.mode]}${c.statusText ? ", " + c.statusText : ""}. Nhấn Enter để chat.`,
    ondblclick: () => yc.app("openChat", c.userId),
    onkeydown: (e) => { if (e.key === "Enter") yc.app("openChat", c.userId); },
  },
  el("span", { class: `dot ${c.mode}`, title: MODE_LABEL[c.mode], "aria-hidden": "true" }),
  el("div", { class: "who" }, el("div", { class: "nick", text: c.nick }), c.statusText ? el("div", { class: "st", text: c.statusText }) : null),
  el("span", { class: "cactions" },
    el("button", { class: "icon-btn", title: "Chat", "aria-label": `Chat với ${c.nick}`, text: "💬", onclick: () => yc.app("openChat", c.userId) }),
    el("button", { class: "icon-btn", title: "Tùy chọn", "aria-label": `Tùy chọn cho ${c.nick}`, text: "⋯", onclick: () => contactPanel(c) })));
  return row;
}

async function refresh() {
  try { view = await yc.call("refreshContacts"); render(); } catch (e) { status(errText(e), true); }
}

// ------------------------------------------------------------ Panel
function openPanel(title, ...content) {
  const p = $("#panel");
  p.replaceChildren(el("h3", {}, el("span", { text: title }), el("button", { class: "icon-btn", "aria-label": "Đóng", text: "✕", onclick: closePanel })), ...content);
  p.classList.remove("hidden");
  p.querySelector("input,select,button:not(.icon-btn)")?.focus();
}
function closePanel() { $("#panel").classList.add("hidden"); }
const errBox = () => el("div", { class: "error", role: "alert" });

function contactPanel(c) {
  const sel = el("select", { "aria-label": "Chuyển sang nhóm" });
  for (const g of view.groups) sel.append(el("option", { value: g.groupId, text: g.name, selected: g.contacts.some((x) => x.userId === c.userId) }));
  const err = errBox();
  const act = (fn, after) => async () => { try { await fn(); after?.(); } catch (e) { err.textContent = errText(e); } };
  openPanel(c.nick,
    el("label", { text: "Nhóm" }), sel,
    el("div", { class: "row end" },
      el("button", { class: "btn small", text: "Chuyển nhóm", onclick: act(() => yc.call("moveContact", c.userId, sel.value), closePanel) })),
    el("div", { class: "row end" },
      el("button", { class: "btn small", text: "Xóa bạn", onclick: act(async () => { if (confirm(`Xóa ${c.nick} khỏi danh bạ? Hai bạn sẽ không nhắn tin và thấy trạng thái của nhau nữa.`)) { await yc.call("removeFriend", c.userId); closePanel(); } }) }),
      el("button", { class: "btn small", text: "Chặn", onclick: act(async () => { if (confirm(`Chặn ${c.nick}? Người này sẽ không nhắn tin, Buzz, mời kết bạn hay thấy trạng thái của bạn.`)) { await yc.call("block", c.userId); closePanel(); } }) })),
    err);
}

async function requestsPanel() {
  const err = errBox();
  try {
    const { incoming, outgoing } = await yc.call("listRequests");
    updateBadge(incoming.length);
    const inList = incoming.length ? incoming.map((r) => el("div", { class: "req" }, el("span", { text: r.nick }),
      el("button", { class: "btn small primary", text: "Đồng ý", onclick: async () => { try { await yc.call("decideRequest", r.requestId, "accept"); requestsPanel(); } catch (e) { err.textContent = errText(e); } } }),
      el("button", { class: "btn small", text: "Từ chối", onclick: async () => { try { await yc.call("decideRequest", r.requestId, "decline"); requestsPanel(); } catch (e) { err.textContent = errText(e); } } })))
      : [el("div", { class: "hint", text: "Không có lời mời mới." })];
    const outList = outgoing.map((r) => el("div", { class: "req" }, el("span", { text: `${r.nick} (đang chờ)` }),
      el("button", { class: "btn small", text: "Hủy", onclick: async () => { try { await yc.call("decideRequest", r.requestId, "cancel"); requestsPanel(); } catch (e) { err.textContent = errText(e); } } })));
    openPanel("Lời mời kết bạn", ...inList, ...(outList.length ? [el("h3", { text: "Đã gửi" }), ...outList] : []), err);
  } catch (e) { status(errText(e), true); }
}
function updateBadge(n) { $("#req-badge").textContent = String(n); $("#req-badge").classList.toggle("hidden", !n); }

async function renameGroup(g) {
  const input = el("input", { type: "text", value: g.name, maxlength: "40", "aria-label": "Tên nhóm mới" });
  const err = errBox();
  openPanel("Đổi tên nhóm", input, el("div", { class: "row end" }, el("button", { class: "btn small primary", text: "Lưu", onclick: async () => {
    try { await yc.call("renameGroup", g.groupId, input.value.trim()); closePanel(); } catch (e) { err.textContent = errText(e); }
  } })), err);
}
async function deleteGroup(g) {
  if (!confirm(`Xóa nhóm "${g.name}"? Bạn bè trong nhóm sẽ chuyển về nhóm mặc định (không bị xóa).`)) return;
  try { await yc.call("deleteGroup", g.groupId); } catch (e) { status(errText(e), true); }
}

async function menuPanel() {
  state = await yc.app("state");
  const s = state.settings;
  const cb = (key, label) => {
    const i = el("input", { type: "checkbox", checked: !!s[key] });
    i.addEventListener("change", () => yc.app("settings", { [key]: i.checked }));
    return el("label", { class: "check" }, i, label);
  };
  const groupName = el("input", { type: "text", maxlength: "40", placeholder: "Tên nhóm mới", "aria-label": "Tên nhóm mới" });
  const nick = el("input", { type: "text", maxlength: "32", value: state.me?.nick ?? "", "aria-label": "Nick mới" });
  const blocks = el("div");
  const err = errBox();
  openPanel("Tài khoản và cài đặt",
    el("label", { text: "Thêm nhóm" }), el("div", { class: "row" }, groupName,
      el("button", { class: "btn small", text: "Tạo", onclick: async () => { try { await yc.call("createGroup", groupName.value.trim()); groupName.value = ""; err.textContent = ""; } catch (e) { err.textContent = errText(e); } } })),
    el("label", { text: "Đổi nick (nick cũ được giữ 30 ngày)" }), el("div", { class: "row" }, nick,
      el("button", { class: "btn small", text: "Đổi", onclick: async () => { try { const r = await yc.call("changeNick", nick.value.trim()); $("#my-nick").textContent = r.nick; err.textContent = ""; } catch (e) { err.textContent = errText(e); } } })),
    el("label", { text: "Buzz và hiển thị" }),
    cb("autoOpenChat", "Tự mở cửa sổ chat khi có tin nhắn hoặc Buzz"),
    cb("buzzVibrate", "Rung cửa sổ khi nhận Buzz"),
    cb("buzzSound", "Phát âm thanh khi nhận Buzz"),
    cb("reduceMotion", "Giảm chuyển động (smiley tĩnh, không rung)"),
    el("label", { text: "Đã chặn" }), blocks,
    err,
    el("div", { class: "row end" }, el("button", { class: "btn", text: "Đăng xuất", onclick: () => yc.app("logout") })));
  try {
    const { blocks: list } = await yc.call("listBlocks");
    blocks.replaceChildren(...(list.length ? list.map((b) => el("div", { class: "req" }, el("span", { text: b.nick }),
      el("button", { class: "btn small", text: "Bỏ chặn", onclick: async () => { await yc.call("unblock", b.userId); menuPanel(); } })))
      : [el("div", { class: "hint", text: "Không chặn ai." })]));
  } catch { /* bỏ qua */ }
}

// ------------------------------------------------------------ Sự kiện UI
$("#my-mode").addEventListener("change", async () => {
  const mode = $("#my-mode").value;
  try { await yc.call("setPresence", mode, $("#my-status").value); setMyDot(mode); } catch (e) { status(errText(e), true); }
});
$("#my-status").addEventListener("change", () => yc.call("setPresence", $("#my-mode").value, $("#my-status").value).catch((e) => status(errText(e), true)));
$("#btn-add").addEventListener("click", addFriend);
$("#add-nick").addEventListener("keydown", (e) => { if (e.key === "Enter") addFriend(); });
async function addFriend() {
  const nick = $("#add-nick").value.trim();
  if (!nick) return;
  try {
    const u = await yc.call("lookup", nick);
    const r = await yc.call("sendFriendRequest", u.userId);
    status(r.status === "accepted" ? `${u.nick} đã là bạn của bạn.` : `Đã gửi lời mời tới ${u.nick}.`);
    $("#add-nick").value = "";
  } catch (e) { status(e.code === "NOT_FOUND" ? `Không tìm thấy nick "${nick}".` : errText(e), true); }
}
$("#btn-requests").addEventListener("click", requestsPanel);
$("#btn-menu").addEventListener("click", menuPanel);

yc.on((name, p) => {
  if (name === "contacts") { view = p; render(); }
  else if (name === "connection") {
    const map = { online: ["Đã kết nối", false], offline: ["Mất kết nối", true], reconnecting: ["Mất kết nối — đang thử lại…", true], error: [`Lỗi kết nối: ${p.message ?? ""}`, true] };
    status(...(map[p.state] ?? [p.state, false]));
  } else if (name === "requests-changed") { yc.call("listRequests").then((r) => updateBadge(r.incoming.length)).catch(() => {}); status("Bạn có lời mời kết bạn mới."); }
  else if (name === "me") $("#my-nick").textContent = p.nick;
  else if (name === "play-buzz") playBuzz();
});

await refresh();
yc.call("listRequests").then((r) => updateBadge(r.incoming.length)).catch(() => {});
