import { Defaults } from "@yc/contracts";

const num = (name: string, def: number) => {
  const v = process.env[name];
  return v === undefined || v === "" ? def : Number(v);
};
const req = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
};

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig() {
  return {
    port: num("YC_API_PORT", 8080),
    host: process.env.YC_API_HOST ?? "127.0.0.1",
    databaseUrl: process.env.YC_DATABASE_URL ??
      `postgres://yc_app:${encodeURIComponent(req("YC_APP_DB_PASSWORD"))}@127.0.0.1:${num("YC_PG_PORT", 5433)}/yahoochat`,
    domain: process.env.YC_DOMAIN ?? "localhost",
    xmppService: process.env.YC_XMPP_SERVICE ?? "xmpp://127.0.0.1:5222", // nội bộ appsvc ↔ Prosody (cùng máy/mạng riêng)
    // Địa chỉ client dùng: luôn TLS trực tiếp (xmpps) để không bị hạ cấp STARTTLS.
    xmppPublicService: process.env.YC_XMPP_PUBLIC_SERVICE ?? "xmpps://127.0.0.1:5223",
    xmppTokenSecret: req("YC_XMPP_TOKEN_SECRET"),
    otpSecret: process.env.YC_OTP_SECRET ?? req("YC_XMPP_TOKEN_SECRET") + ":otp",
    devInsecureTls: process.env.YC_DEV_INSECURE_TLS === "1",
    smtp: {
      host: process.env.YC_SMTP_HOST ?? "127.0.0.1", port: num("YC_SMTP_PORT", 1025),
      user: process.env.YC_SMTP_USER, pass: process.env.YC_SMTP_PASS,
      from: process.env.YC_SMTP_FROM ?? "Zahu!Messenger <no-reply@localhost>", secure: process.env.YC_SMTP_SECURE === "1",
    },
    smsProvider: process.env.YC_SMS_PROVIDER ?? "fake",
    messageTtlDays: num("YC_MESSAGE_TTL_DAYS", Defaults.MESSAGE_TTL_DAYS),
    inviteDefaultDays: num("YC_INVITE_DEFAULT_DAYS", Defaults.INVITE_DEFAULT_DAYS),
    inviteDefaultMaxUses: num("YC_INVITE_DEFAULT_MAX_USES", Defaults.INVITE_DEFAULT_MAX_USES),
    nickHoldDays: num("YC_NICK_HOLD_DAYS", Defaults.NICK_HOLD_DAYS),
    buzzTtlSec: num("YC_BUZZ_TTL_SEC", Defaults.BUZZ_TTL_SEC),
    buzzPairIntervalSec: num("YC_BUZZ_PAIR_INTERVAL_SEC", Defaults.BUZZ_PAIR_INTERVAL_SEC),
    otpTtlMin: num("YC_OTP_TTL_MIN", Defaults.OTP_TTL_MIN),
    otpMaxAttempts: num("YC_OTP_MAX_ATTEMPTS", Defaults.OTP_MAX_ATTEMPTS),
    otpSendPerHour: num("YC_OTP_SEND_PER_HOUR", Defaults.OTP_SEND_PER_HOUR),
    loginMaxFails: num("YC_LOGIN_MAX_FAILS_PER_15MIN", Defaults.LOGIN_MAX_FAILS_PER_15MIN),
    loginMaxFailsPerIp: num("YC_LOGIN_MAX_FAILS_PER_IP_15MIN", 30),
    sessionTtlDays: num("YC_SESSION_TTL_DAYS", Defaults.SESSION_TTL_DAYS),
    xmppTokenTtlSec: num("YC_XMPP_TOKEN_TTL_SEC", Defaults.XMPP_TOKEN_TTL_SEC),
    purgeIntervalMin: num("YC_PURGE_INTERVAL_MIN", Defaults.PURGE_INTERVAL_MIN),
    backupDir: process.env.YC_BACKUP_DIR ?? "../../backups",
    backupKey: process.env.YC_BACKUP_KEY, // 32 byte hex; bắt buộc khi chạy backup
    backupRetentionDays: num("YC_BACKUP_RETENTION_DAYS", Defaults.BACKUP_RETENTION_DAYS),
  };
}
