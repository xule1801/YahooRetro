// Main process — cửa sổ danh bạ + cửa sổ chat riêng, cầu nối IPC tới ChatCore, rung cửa sổ khi Buzz.
import { app, BrowserWindow, ipcMain, Notification, safeStorage, session } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { ChatCore } from "../core/chat-core.js";
import { decideBuzzEffect, decideIncomingMessage, mergeSettings } from "../core/model.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const RENDERER = join(HERE, "../renderer");
const ICON = join(HERE, "../assets/icon.png"); // icon cửa sổ/taskbar (kết xuất từ renderer/logo.svg)
if (process.env.YC_USER_DATA) { mkdirSync(process.env.YC_USER_DATA, { recursive: true }); app.setPath("userData", process.env.YC_USER_DATA); }
// Bản cài dùng đúng appId của bộ cài (khớp lối tắt Start Menu → taskbar lấy đúng icon).
// Bản dev/test chạy bằng electron.exe (icon nguyên tử) dùng ID riêng để Windows không gộp chung nút taskbar và nhớ nhầm icon.
app.setAppUserModelId(app.isPackaged ? "local.zahu.messenger" : "local.zahu.messenger.dev");

// ---------------------------------------------------------------- Cài đặt & phiên
const settingsFile = () => join(app.getPath("userData"), "settings.json");
const sessionFile = () => join(app.getPath("userData"), "session.bin");
let settings = mergeSettings({}, process.env);
function loadSettings() {
  let saved = {};
  try { saved = JSON.parse(readFileSync(settingsFile(), "utf8")); } catch { /* lần đầu */ }
  settings = mergeSettings(saved, process.env);
}
// Không bao giờ ghi insecureTls xuống đĩa (xem mergeSettings).
const saveSettings = () => writeFileSync(settingsFile(), JSON.stringify(mergeSettings.persistable(settings), null, 2));
// Token phiên được mã hóa bằng DPAPI của Windows (safeStorage); không lưu mật khẩu.
function saveSession(token) {
  if (!settings.rememberMe || !safeStorage.isEncryptionAvailable()) return;
  writeFileSync(sessionFile(), safeStorage.encryptString(token));
}
function loadSession() {
  try { return existsSync(sessionFile()) ? safeStorage.decryptString(readFileSync(sessionFile())) : null; } catch { return null; }
}
function clearSession() { try { unlinkSync(sessionFile()); } catch { /* */ } }

// ---------------------------------------------------------------- Lõi chat
let core = null;
function createCore() {
  core?.removeAllListeners();
  core = new ChatCore({ apiBase: settings.apiBase, insecureTls: settings.insecureTls });
  for (const ev of ["contacts", "presence", "message", "message-status", "connection", "server-event", "requests-changed", "me", "me-presence", "history-synced", "messages-expired"]) {
    core.on(ev, (payload) => broadcast(ev, payload));
  }
  core.on("buzz", onBuzz);
  core.on("incoming-message", onIncomingMessage);
  core.on("session-expired", () => logout("Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại."));
  return core;
}

// ---------------------------------------------------------------- Cửa sổ
let loginWin = null, contactsWin = null;
const chatWins = new Map(); // userId → BrowserWindow
const webPreferences = { preload: join(HERE, "preload.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false };

function lockDown(win) {
  win.removeMenu();
}
// Phòng thủ chiều sâu cho MỌI webContents (kể cả nếu sau này có cửa sổ mới):
// - không mở cửa sổ mới, không chuyển liên kết ra trình duyệt/hệ điều hành (app không có liên kết nào cần mở);
// - không điều hướng khỏi trang của app; không cho gắn <webview>.
app.on("web-contents-created", (_e, contents) => {
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", (e) => e.preventDefault());
  contents.on("will-redirect", (e) => e.preventDefault());
  contents.on("will-attach-webview", (e) => e.preventDefault());
});
function openLogin(message) {
  if (loginWin && !loginWin.isDestroyed()) { loginWin.focus(); return; }
  loginWin = new BrowserWindow({ icon: ICON, width: 380, height: 600, resizable: false, title: "Zahu!Messenger — Đăng nhập", backgroundColor: "#4b1c7d", webPreferences });
  lockDown(loginWin);
  loginWin.loadFile(join(RENDERER, "login.html"), { query: message ? { message } : {} });
  loginWin.on("closed", () => { loginWin = null; });
}
function openContacts() {
  if (contactsWin && !contactsWin.isDestroyed()) { contactsWin.show(); contactsWin.focus(); return; }
  contactsWin = new BrowserWindow({ icon: ICON, width: 310, height: 640, minWidth: 260, minHeight: 420, title: "Zahu!Messenger", backgroundColor: "#4b1c7d", webPreferences });
  lockDown(contactsWin);
  contactsWin.loadFile(join(RENDERER, "contacts.html"));
  contactsWin.on("closed", () => { contactsWin = null; if (core?.token) app.quit(); });
}
/**
 * Mở cửa sổ chat. popup=true: do tin nhắn/Buzz đến → hiện NỔI LÊN TRÊN nhưng không lấy focus bàn phím
 * (tránh người dùng đang gõ ở ứng dụng khác bị gõ nhầm vào khung chat), nhấp nháy taskbar.
 * buzz: hiệu ứng Buzz cần áp dụng ngay khi cửa sổ vừa hiện (rung/nhấp nháy, dòng BUZZ!!!, âm thanh).
 */
function openChat(userId, { popup = false, buzz = null } = {}) {
  let win = chatWins.get(userId);
  if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); if (!popup) win.focus(); return win; }
  const c = core.contactById(userId);
  win = new BrowserWindow({ icon: ICON, width: 500, height: 480, minWidth: 360, minHeight: 320, title: c ? `${c.nick} — Chat` : "Chat", backgroundColor: "#f4effa", show: false, webPreferences });
  lockDown(win);
  win.ycUserId = userId;
  const query = { userId };
  if (buzz) Object.assign(query, { buzz: "1", sound: buzz.sound ? "1" : "0", flash: buzz.flash ? "1" : "0" });
  win.loadFile(join(RENDERER, "chat.html"), { query });
  win.once("ready-to-show", () => {
    if (!popup) { win.show(); return; }
    win.setAlwaysOnTop(true);
    win.showInactive();
    win.flashFrame(true);
    setTimeout(() => { if (!win.isDestroyed()) win.setAlwaysOnTop(false); }, 400);
    if (buzz?.shake) setTimeout(() => { if (!win.isDestroyed()) shake(win); }, 150);
  });
  win.on("closed", () => chatWins.delete(userId));
  chatWins.set(userId, win);
  return win;
}
function allWindows() { return BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed()); }
function broadcast(name, payload) { for (const w of allWindows()) w.webContents.send("core-event", name, payload); }

// ---------------------------------------------------------------- Buzz
const shaking = new WeakSet();
function shake(win) {
  if (shaking.has(win)) return;
  shaking.add(win);
  const [x, y] = win.getPosition();
  const offsets = [[-8, 0], [8, 0], [-6, 3], [6, -3], [-4, 2], [4, -2], [-2, 0], [2, 0], [0, 0]];
  let i = 0;
  const step = () => {
    if (win.isDestroyed()) return;
    if (i >= offsets.length) { win.setPosition(x, y); shaking.delete(win); broadcast("shaken", { userId: win.ycUserId }); return; }
    win.setPosition(x + offsets[i][0], y + offsets[i][1]); i++;
    setTimeout(step, 35);
  };
  step();
}
function onBuzz(b) {
  const win = chatWins.get(b.fromUserId);
  const live = win && !win.isDestroyed() ? win : null;
  const eff = decideBuzzEffect({
    nowMs: Date.now(), expiresAtMs: b.expiresAtMs,
    window: live ? { visible: live.isVisible(), minimized: live.isMinimized() } : null, settings,
  });
  if (!eff.accept) return; // quá hạn: không xếp hàng, không phát lại
  if (eff.open) {
    // Chưa mở cửa sổ chat: bật cửa sổ lên và rung ngay (kiểu ứng dụng chat cổ điển).
    openChat(b.fromUserId, { popup: true, buzz: eff });
    broadcast("buzz-log", { fromUserId: b.fromUserId, effect: eff });
    return;
  }
  const nick = core.contactById(b.fromUserId)?.nick ?? "Một người bạn";
  live?.webContents.send("core-event", "buzz-received", { fromUserId: b.fromUserId, sound: eff.sound, effect: eff });
  if (eff.shake) shake(live);
  if (eff.flash) live.flashFrame(true);
  if (eff.notify) {
    if (live) live.flashFrame(true);
    if (Notification.isSupported()) {
      const n = new Notification({ title: "BUZZ!!!", body: `${nick} vừa Buzz bạn`, silent: !eff.sound });
      n.on("click", () => openChat(b.fromUserId));
      n.show();
    }
    if (!live && eff.sound) contactsWin?.webContents.send("core-event", "play-buzz", {});
  }
  broadcast("buzz-log", { fromUserId: b.fromUserId, effect: eff }); // cho test/quan sát
}

// Tin nhắn đến trực tiếp: chưa mở cửa sổ chat thì tự bật lên; đang mở nhưng không focus/thu nhỏ thì nhấp nháy taskbar.
function onIncomingMessage({ peer }) {
  const win = chatWins.get(peer);
  const live = win && !win.isDestroyed() ? win : null;
  const eff = decideIncomingMessage({
    window: live ? { visible: live.isVisible(), minimized: live.isMinimized(), focused: live.isFocused() } : null, settings,
  });
  if (eff.open) openChat(peer, { popup: true });
  else if (eff.flash) live.flashFrame(true);
  broadcast("incoming-log", { peer, effect: eff }); // cho test/quan sát
}

// ---------------------------------------------------------------- IPC
const CORE_METHODS = new Set([
  "registerStart", "registerVerify", "recoveryStart", "recoveryComplete",
  "contactsView", "refreshContacts", "lookup", "sendFriendRequest", "listRequests", "decideRequest", "removeFriend", "block", "unblock", "listBlocks",
  "createGroup", "renameGroup", "deleteGroup", "moveContact", "changeNick", "changePassword",
  "setPresence", "conversation", "sendMessage", "buzz", "contactById",
]);
const wrap = (fn) => async (_e, name, args) => {
  try { return { ok: true, value: await fn(name, args ?? []) }; }
  catch (e) { return { ok: false, error: { code: e.code ?? "ERROR", message: e.message, retryAfterSec: e.retryAfterSec } }; }
};

ipcMain.handle("core", wrap(async (method, args) => {
  if (!CORE_METHODS.has(method)) throw new Error("Không cho phép: " + method);
  return core[method](...args);
}));

ipcMain.handle("app", wrap(async (action, args) => {
  switch (action) {
    case "state": return {
      me: core?.me ?? null, mode: core?.mode ?? "online", statusText: core?.statusText ?? "", online: !!core?.online,
      settings: { ...settings },
    };
    case "settings": settings = { ...settings, ...pick(args[0], ["reduceMotion", "buzzVibrate", "buzzSound", "autoOpenChat", "rememberMe", "apiBase"]) }; saveSettings(); broadcast("settings", settings); return settings;
    case "login": {
      createCore();
      await core.login(args[0], args[1]);
      settings.lastIdentifier = args[0]; saveSettings();
      return afterLogin();
    }
    case "registerComplete": {
      await core.registerComplete(args[0], args[1], args[2]);
      return afterLogin();
    }
    case "logout": await logout(); return true;
    case "openChat": openChat(args[0]); return true;
    case "openContacts": openContacts(); return true;
    case "newCore": createCore(); return true;
    default: throw new Error("Không rõ hành động: " + action);
  }
}));
const pick = (o, keys) => Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => keys.includes(k)));

async function afterLogin() {
  saveSession(core.token);
  openContacts();
  loginWin?.close();
  core.connect().catch((e) => broadcast("connection", { state: "error", message: e.message }));
  return core.me;
}
async function logout(message) {
  const c = core;
  c?.removeAllListeners();
  createCore(); // lõi mới, sạch — màn hình đăng nhập/đăng ký/quên mật khẩu dùng ngay được
  clearSession();
  // Mở cửa sổ đăng nhập TRƯỚC khi đóng các cửa sổ khác: nếu có lúc không còn cửa sổ nào,
  // sự kiện window-all-closed sẽ thoát luôn ứng dụng thay vì quay về màn hình đăng nhập.
  openLogin(message);
  for (const w of chatWins.values()) if (!w.isDestroyed()) w.destroy();
  chatWins.clear();
  const cw = contactsWin; contactsWin = null;
  if (cw && !cw.isDestroyed()) cw.destroy();
  await c?.logout();
}

// ---------------------------------------------------------------- Khởi động
app.whenReady().then(async () => {
  // Từ chối mọi yêu cầu quyền từ trang (camera, micro, vị trí, clipboard, thông báo web…).
  // Thông báo Buzz do main process tạo bằng Electron Notification nên không bị ảnh hưởng.
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  loadSettings();
  createCore();
  const token = loadSession();
  if (token) {
    try { await core.useSession(token); await afterLogin(); }
    catch { clearSession(); openLogin(); }
  } else openLogin();
  // Xóa tin quá hạn khỏi bộ nhớ (client không ghi lịch sử ra đĩa).
  setInterval(() => core?.sweepExpired(), 60_000);
  core?.sweepExpired();
});
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => { core?.disconnect(); });
