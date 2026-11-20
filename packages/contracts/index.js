// Contracts v1 dùng chung client/server. Xem docs/contracts.md.
export const API_VERSION = 1;

export const ErrorCode = Object.freeze({
  INVALID_INPUT: "INVALID_INPUT",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  INVITE_INVALID: "INVITE_INVALID",
  VERIFICATION_FAILED: "VERIFICATION_FAILED",
  NICK_UNAVAILABLE: "NICK_UNAVAILABLE",
  NICK_INVALID: "NICK_INVALID",
  RATE_LIMITED: "RATE_LIMITED",
  RECIPIENT_UNAVAILABLE: "RECIPIENT_UNAVAILABLE",
  NOT_FRIENDS: "NOT_FRIENDS",
  CONFLICT: "CONFLICT",
});

/** Mặc định đã được người dùng chấp thuận ngày 2026-11-19. Ghi đè bằng biến môi trường cùng tên. */
export const Defaults = Object.freeze({
  MESSAGE_TTL_DAYS: 30,
  BACKUP_RETENTION_DAYS: 7,
  INVITE_DEFAULT_DAYS: 7,
  INVITE_DEFAULT_MAX_USES: 1,
  NICK_MIN: 3,
  NICK_MAX: 32,
  NICK_HOLD_DAYS: 30,
  STATUS_MAX_CHARS: 140,
  BUZZ_TTL_SEC: 5,
  BUZZ_PAIR_INTERVAL_SEC: 10,
  OTP_TTL_MIN: 10,
  OTP_MAX_ATTEMPTS: 5,
  OTP_SEND_PER_HOUR: 5,
  LOGIN_MAX_FAILS_PER_15MIN: 10,
  SESSION_TTL_DAYS: 30,
  XMPP_TOKEN_TTL_SEC: 300,
  PRESENCE_TIMEOUT_SEC: 60,
  PURGE_INTERVAL_MIN: 15,
});

export const NICK_PATTERN = /^[A-Za-z0-9_]{3,32}$/;

export const PresenceMode = Object.freeze({ ONLINE: "online", BUSY: "busy", AWAY: "away", INVISIBLE: "invisible" });

export const Xmlns = Object.freeze({
  APPSVC: "urn:yahoochat:appsvc",
  EVENT: "urn:yahoochat:event",
  ACK: "urn:yahoochat:ack",
  BUZZ: "urn:yahoochat:buzz",
  ATTENTION: "urn:xmpp:attention:0",
  MAM: "urn:xmpp:mam:2",
  SID: "urn:xmpp:sid:0",
  RECEIPTS: "urn:xmpp:receipts",
  SMILEY: "urn:yahoochat:smiley",
});

export const EventType = Object.freeze({
  FRIEND_REQUEST: "friend.request",
  FRIEND_ACCEPTED: "friend.accepted",
  FRIEND_REMOVED: "friend.removed",
  CONTACTS_CHANGED: "contacts.changed",
  NICK_CHANGED: "nick.changed",
  SESSION_REVOKED: "session.revoked",
});

/**
 * 54 smiley — mã gõ tắt theo quy ước phổ biến của ứng dụng chat cổ điển; HÌNH VẼ là của dự án
 * (apps/windows/renderer/smileys.js, vẽ mới bằng SVG). `aliases`: mã cũ vẫn được nhận để tin cũ hiển thị đúng.
 * Mã và id ổn định — không đổi sau khi phát hành.
 */
export const Smileys = Object.freeze([
  { code: ":)", id: "happy", label: "Vui" },
  { code: ":(", id: "sad", label: "Buồn" },
  { code: ";)", id: "wink", label: "Nháy mắt" },
  { code: ":D", id: "grin", label: "Cười toe" },
  { code: ";;)", id: "lashes", label: "Chớp mắt điệu đà" },
  { code: ">:D<", id: "hug", label: "Ôm chặt" },
  { code: ":-/", id: "confused", label: "Bối rối" },
  { code: ":x", id: "love", label: "Mê mẩn", aliases: [":X"] },
  { code: ':">', id: "blush", label: "Ngượng ngùng" },
  { code: ":P", id: "tongue", label: "Lè lưỡi", aliases: [":p"] },
  { code: ":-*", id: "kiss", label: "Hôn" },
  { code: "=((", id: "heartbreak", label: "Tan nát cõi lòng" },
  { code: ":-O", id: "surprise", label: "Ngạc nhiên", aliases: [":O"] },
  { code: "X(", id: "angry", label: "Giận", aliases: [">:("] },
  { code: ":>", id: "smug", label: "Tự mãn" },
  { code: "B-)", id: "cool", label: "Ngầu" },
  { code: ":-S", id: "worried", label: "Lo lắng" },
  { code: "#:-S", id: "whew", label: "Phù, thoát rồi!" },
  { code: ">:)", id: "devil", label: "Quỷ sứ" },
  { code: ":((", id: "cry", label: "Khóc" },
  { code: ":))", id: "laugh", label: "Cười lớn" },
  { code: ":|", id: "straight", label: "Mặt lạnh" },
  { code: "/:)", id: "eyebrow", label: "Nhướng mày" },
  { code: "=))", id: "rofl", label: "Cười lăn lộn" },
  { code: "O:-)", id: "angel", label: "Thiên thần" },
  { code: ":-B", id: "nerd", label: "Mọt sách" },
  { code: "=;", id: "talkhand", label: "Nói với bàn tay" },
  { code: ":-c", id: "callme", label: "Gọi cho tớ" },
  { code: ":)]", id: "phone", label: "Đang nghe điện thoại" },
  { code: "~X(", id: "witsend", label: "Hết chịu nổi" },
  { code: ":-h", id: "wave", label: "Vẫy tay" },
  { code: ":-t", id: "timeout", label: "Tạm dừng" },
  { code: "8->", id: "daydream", label: "Mơ mộng" },
  { code: "I-)", id: "sleepy", label: "Buồn ngủ" },
  { code: "8-|", id: "rolleyes", label: "Đảo mắt" },
  { code: "L-)", id: "loser", label: "Thua rồi" },
  { code: ":-&", id: "sick", label: "Ốm" },
  { code: ":-$", id: "secret", label: "Đừng nói với ai" },
  { code: "[-(", id: "silent", label: "Không thèm nói" },
  { code: ":O)", id: "clown", label: "Chú hề" },
  { code: "8-}", id: "silly", label: "Ngớ ngẩn" },
  { code: "<:-P", id: "party", label: "Tiệc tùng" },
  { code: "(:|", id: "yawn", label: "Ngáp" },
  { code: "=P~", id: "drool", label: "Thèm chảy nước miếng" },
  { code: ":-?", id: "thinking", label: "Suy nghĩ" },
  { code: "#-o", id: "doh", label: "Ôi trời ơi!" },
  { code: "=D>", id: "applause", label: "Vỗ tay" },
  { code: ":-SS", id: "nailbite", label: "Cắn móng tay" },
  { code: "@-)", id: "hypno", label: "Bị thôi miên" },
  { code: ":^o", id: "liar", label: "Nói dối" },
  { code: ":-w", id: "waiting", label: "Chờ mãi" },
  { code: ":-<", id: "sigh", label: "Thở dài" },
  { code: ">:P", id: "phbbt", label: "Lêu lêu" },
  { code: "<):)", id: "cowboy", label: "Cao bồi" },
]);

const SMILEY_CODES = Smileys.flatMap((s) => [s.code, ...(s.aliases ?? [])].map((code) => ({ code, id: s.id })))
  .sort((a, b) => b.code.length - a.code.length);
const isWordChar = (ch) => !!ch && /[\p{L}\p{N}]/u.test(ch);

/**
 * Tách văn bản thành các phần text/smiley. Ưu tiên mã dài nhất. Mã bắt đầu bằng chữ/số (X(, I-), 8->, L-), B-))
 * không được nhận khi dính liền sau một chữ/số (tránh "MAX(" hay "HI-)" thành smiley). Thuần, không phụ thuộc DOM.
 */
export function tokenizeSmileys(text) {
  const out = [];
  let buf = "";
  for (let i = 0; i < text.length; ) {
    const hit = SMILEY_CODES.find((s) => text.startsWith(s.code, i) && !(isWordChar(s.code[0]) && isWordChar(text[i - 1])));
    if (hit) {
      if (buf) { out.push({ type: "text", text: buf }); buf = ""; }
      out.push({ type: "smiley", id: hit.id, code: hit.code });
      i += hit.code.length;
    } else { buf += text[i]; i++; }
  }
  if (buf) out.push({ type: "text", text: buf });
  return out;
}

/** Chuẩn hóa nick để so sánh không phân biệt hoa/thường. */
export const normalizeNick = (nick) => String(nick).toLowerCase();

/** userId (UUID) → localpart XMPP. */
export const userLocalpart = (userId) => "u" + String(userId).replace(/-/g, "").toLowerCase();
