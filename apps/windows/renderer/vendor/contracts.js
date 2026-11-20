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

/** 12 smiley gốc của dự án (tự vẽ, xem apps/windows/assets/smileys/LICENSE.md). Mã ổn định, không đổi. */
export const Smileys = Object.freeze([
  { code: ":)", id: "smile", label: "Cười" },
  { code: ":(", id: "sad", label: "Buồn" },
  { code: ";)", id: "wink", label: "Nháy mắt" },
  { code: ":D", id: "grin", label: "Cười lớn" },
  { code: ":P", id: "tongue", label: "Lè lưỡi" },
  { code: ":O", id: "surprise", label: "Ngạc nhiên" },
  { code: ":X", id: "love", label: "Yêu" },
  { code: "B-)", id: "cool", label: "Ngầu" },
  { code: ":-*", id: "kiss", label: "Hôn" },
  { code: ">:(", id: "angry", label: "Giận" },
  { code: ":((", id: "cry", label: "Khóc" },
  { code: "=))", id: "laugh", label: "Cười lăn" },
]);

/** Tách văn bản thành các phần text/smiley. Ưu tiên mã dài nhất. Thuần, không phụ thuộc DOM. */
export function tokenizeSmileys(text) {
  const codes = [...Smileys].sort((a, b) => b.code.length - a.code.length);
  const out = [];
  let buf = "";
  for (let i = 0; i < text.length; ) {
    const hit = codes.find((s) => text.startsWith(s.code, i));
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
