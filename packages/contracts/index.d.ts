export declare const API_VERSION: 1;
export declare const ErrorCode: Readonly<Record<
  "INVALID_INPUT" | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "INVITE_INVALID" | "VERIFICATION_FAILED" |
  "NICK_UNAVAILABLE" | "NICK_INVALID" | "RATE_LIMITED" | "RECIPIENT_UNAVAILABLE" | "NOT_FRIENDS" | "CONFLICT", string>>;
export type ErrorCodeT = keyof typeof ErrorCode;
export declare const Defaults: Readonly<{
  MESSAGE_TTL_DAYS: number; BACKUP_RETENTION_DAYS: number; INVITE_DEFAULT_DAYS: number; INVITE_DEFAULT_MAX_USES: number;
  NICK_MIN: number; NICK_MAX: number; NICK_HOLD_DAYS: number; STATUS_MAX_CHARS: number; BUZZ_TTL_SEC: number;
  BUZZ_PAIR_INTERVAL_SEC: number; OTP_TTL_MIN: number; OTP_MAX_ATTEMPTS: number; OTP_SEND_PER_HOUR: number;
  LOGIN_MAX_FAILS_PER_15MIN: number; SESSION_TTL_DAYS: number; XMPP_TOKEN_TTL_SEC: number; PRESENCE_TIMEOUT_SEC: number;
  PURGE_INTERVAL_MIN: number;
}>;
export declare const NICK_PATTERN: RegExp;
export declare const PresenceMode: Readonly<{ ONLINE: "online"; BUSY: "busy"; AWAY: "away"; INVISIBLE: "invisible" }>;
export type PresenceModeT = "online" | "busy" | "away" | "invisible";
export declare const Xmlns: Readonly<Record<"APPSVC" | "EVENT" | "ACK" | "BUZZ" | "ATTENTION" | "MAM" | "SID" | "RECEIPTS" | "SMILEY", string>>;
export declare const EventType: Readonly<Record<"FRIEND_REQUEST" | "FRIEND_ACCEPTED" | "FRIEND_REMOVED" | "CONTACTS_CHANGED" | "NICK_CHANGED" | "SESSION_REVOKED", string>>;
export declare const Smileys: ReadonlyArray<{ code: string; id: string; label: string }>;
export declare function tokenizeSmileys(text: string): Array<{ type: "text"; text: string } | { type: "smiley"; id: string; code: string }>;
export declare function normalizeNick(nick: string): string;
export declare function userLocalpart(userId: string): string;
