// Logic thuần của client (không phụ thuộc Electron/DOM) — test bằng node --test.

/** "u0193a1b2...@localhost" → UUID có gạch. */
export function jidToUserId(jid) {
  const local = String(jid).split("@")[0];
  if (!/^u[0-9a-f]{32}$/.test(local)) return null;
  const h = local.slice(1);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Presence XMPP → trạng thái hiển thị. Ẩn của người khác luôn trông như offline (server không gửi gì). */
export function presenceMode(type, show) {
  if (type === "unavailable" || type === "error") return "offline";
  if (show === "dnd") return "busy";
  if (show === "away" || show === "xa") return "away";
  return "online";
}

/** Trạng thái của mình → stanza presence cần gửi. null = Ẩn (không broadcast). */
export function presenceForMode(mode) {
  switch (mode) {
    case "online": return { show: null };
    case "busy": return { show: "dnd" };
    case "away": return { show: "away" };
    case "invisible": return null;
    default: throw new Error("mode không hợp lệ: " + mode);
  }
}

export const PRESENCE_LABEL = { online: "Online", busy: "Bận", away: "Vắng mặt", invisible: "Ẩn", offline: "Offline" };

/**
 * Quyết định hiệu ứng khi nhận Buzz.
 * - Buzz quá hạn: bỏ qua hoàn toàn (không xếp hàng, không phát lại) — thiết kế §3.5.
 * - Cửa sổ chat đang hiển thị: rung một lần (trừ khi giảm chuyển động/tắt rung → nhấp nháy).
 * - CHƯA mở cửa sổ chat: tự mở cửa sổ và rung, như ứng dụng chat cổ điển (yêu cầu chủ dự án 2026-11-20).
 *   Tắt tùy chọn autoOpenChat → chỉ thông báo.
 * - Cửa sổ đang thu nhỏ: chỉ thông báo, không bung ra, không ghi nhớ để rung sau — thiết kế §3.5.
 */
export function decideBuzzEffect({ nowMs, expiresAtMs, window, settings }) {
  if (!(nowMs < expiresAtMs)) return { accept: false, open: false, shake: false, notify: false, sound: false };
  const open = !window && settings.autoOpenChat !== false;
  const visible = open || (!!window && window.visible && !window.minimized);
  const shake = visible && settings.buzzVibrate && !settings.reduceMotion;
  return {
    accept: true,
    open,
    shake,
    notify: !visible,
    sound: settings.buzzSound,
    flash: visible && !shake, // giảm chuyển động/tắt rung: nhấp nháy khung thay cho rung
  };
}

/** Tin nhắn đến trực tiếp: chưa mở cửa sổ chat → tự mở; có cửa sổ nhưng không focus/thu nhỏ → nhấp nháy taskbar. */
export function decideIncomingMessage({ window, settings }) {
  if (!window) return { open: settings.autoOpenChat !== false, flash: false };
  return { open: false, flash: window.minimized || !window.focused };
}

/** Kho tin nhắn theo từng người bạn: chống trùng theo originId/stanzaId, sắp xếp theo giờ server, tự xóa khi hết hạn. */
export class MessageStore {
  constructor(ttlDays = 30) {
    this.ttlMs = ttlDays * 86_400_000;
    this.byPeer = new Map();
  }
  list(peer) { return this.byPeer.get(peer) ?? []; }
  find(peer, key) { return this.list(peer).find((m) => m.originId === key || (m.stanzaId && m.stanzaId === key)); }
  /** Thêm hoặc gộp. Trả về {msg, added}. */
  upsert(m, nowMs) {
    if (m.ts && nowMs - m.ts >= this.ttlMs) return { msg: null, added: false };
    const arr = this.byPeer.get(m.peer) ?? [];
    const existing = arr.find((x) => (m.originId && x.originId === m.originId) || (m.stanzaId && x.stanzaId === m.stanzaId));
    if (existing) {
      if (m.stanzaId && !existing.stanzaId) existing.stanzaId = m.stanzaId;
      if (m.ts && (existing.status === "sending" || !existing.ts)) existing.ts = m.ts;
      if (m.status && rank(m.status) > rank(existing.status)) existing.status = m.status;
      return { msg: existing, added: false };
    }
    arr.push(m);
    arr.sort(byServerTs);
    this.byPeer.set(m.peer, arr);
    return { msg: m, added: true };
  }
  /** Xóa tin đã quá TTL tính từ giờ server nhận. Trả về số tin đã xóa. */
  sweep(nowMs) {
    let n = 0;
    for (const [peer, arr] of this.byPeer) {
      const keep = arr.filter((m) => !m.ts || nowMs - m.ts < this.ttlMs);
      n += arr.length - keep.length;
      if (keep.length) this.byPeer.set(peer, keep); else this.byPeer.delete(peer);
    }
    return n;
  }
  pending() { return [...this.byPeer.values()].flat().filter((m) => m.dir === "out" && m.status === "sending"); }
  clear() { this.byPeer.clear(); }
}
/** Tin chưa có giờ server (đang gửi) xếp cuối, giữ thứ tự chèn. */
function byServerTs(a, b) {
  if (a.ts == null && b.ts == null) return 0;
  if (a.ts == null) return 1;
  if (b.ts == null) return -1;
  return a.ts - b.ts;
}
const rank = (s) => ({ sending: 0, failed: 0, stored: 1, delivered: 2 })[s] ?? 0;

const SAVED_KEYS = ["reduceMotion", "buzzVibrate", "buzzSound", "autoOpenChat", "rememberMe", "lastIdentifier"];
/**
 * Gộp cài đặt đã lưu với biến môi trường. `insecureTls` (bỏ kiểm tra chứng chỉ — chỉ cho máy thử nghiệm)
 * CHỈ lấy từ biến môi trường của lần chạy hiện tại, không bao giờ đọc/ghi tệp cài đặt.
 */
export function mergeSettings(saved, env, defaults = {}) {
  const s = { apiBase: "http://127.0.0.1:8090", reduceMotion: false, buzzVibrate: true, buzzSound: true, autoOpenChat: true, rememberMe: true, lastIdentifier: "", ...defaults };
  for (const k of SAVED_KEYS) if (saved && k in saved) s[k] = saved[k];
  if (env.YC_API_BASE) s.apiBase = env.YC_API_BASE;
  s.insecureTls = env.YC_DEV_INSECURE_TLS === "1";
  return s;
}
mergeSettings.persistable = (s) => Object.fromEntries(SAVED_KEYS.filter((k) => k in s).map((k) => [k, s[k]]));

/**
 * Chặn kết nối không mã hóa. HTTP chỉ chấp nhận tới máy local. XMPP luôn phải là TLS trực tiếp (xmpps://):
 * STARTTLS (xmpp://) có thể bị kẻ tấn công ở giữa gỡ bỏ khiến token gửi dạng rõ. Chế độ dev được phép bỏ qua.
 */
export function assertSecureEndpoint(url, insecureDev) {
  const u = new URL(url);
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname);
  if (insecureDev) {
    // Chế độ dev/dùng thử tắt kiểm tra chứng chỉ → chỉ an toàn khi máy chủ nằm ngay trên máy này (không qua mạng).
    if (!local) throw new Error(`Chế độ bỏ kiểm tra chứng chỉ (YC_DEV_INSECURE_TLS) chỉ dùng cho máy chủ trên chính máy này, không dùng với ${u.host}.`);
    return;
  }
  if (u.protocol === "https:" || u.protocol === "xmpps:" || u.protocol === "wss:") return;
  if (u.protocol === "http:" && local) return;
  throw new Error(`Từ chối kết nối không mã hóa tới ${u.protocol}//${u.host}. Máy chủ phải dùng https:// và xmpps://.`);
}
