// Đăng ký bằng mã mời, xác minh kênh, đăng nhập, khôi phục, nick. Thiết kế §3.1.
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { z } from "zod";
import { NICK_PATTERN, normalizeNick, userLocalpart, EventType } from "@yc/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Deps } from "../app.ts";
import { withTx, isUniqueViolation, type Tx } from "../db.ts";
import { addMs, DAY } from "../clock.ts";
import { AppError } from "../errors.ts";
import { hmac, randomOtp, randomToken, safeEqualHex, sha256, xmppToken } from "../crypto.ts";
import { hashInvite, inviteIsUsable } from "./invites.ts";
import { enqueue, flushOutbox } from "../xmpp-appsvc.ts";

const RESERVED = new Set(["admin", "administrator", "root", "system", "support", "appsvc", "yahoo", "yahoochat",
  "moderator", "help", "null", "undefined", "everyone", "operator", "security"]);
const PASSWORD = z.string().min(10, "Mật khẩu tối thiểu 10 ký tự").max(128);
const ARGON = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const; // OWASP 2023 tối thiểu

export function normalizeAddress(channel: "email" | "phone", raw: string): string {
  if (channel === "email") {
    const e = raw.trim().toLowerCase();
    if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new AppError("INVALID_INPUT", { message: "Email không hợp lệ" });
    return e;
  }
  let p = raw.replace(/[\s.\-()]/g, "");
  if (p.startsWith("00")) p = "+" + p.slice(2);
  else if (p.startsWith("0")) p = "+84" + p.slice(1);
  else if (/^84\d/.test(p)) p = "+" + p;
  if (!/^\+\d{9,15}$/.test(p)) throw new AppError("INVALID_INPUT", { message: "Số điện thoại không hợp lệ" });
  return p;
}
const channelOf = (address: string): "email" | "phone" => (address.includes("@") ? "email" : "phone");

export function validateNick(nick: string) {
  if (!NICK_PATTERN.test(nick)) throw new AppError("NICK_INVALID");
  if (RESERVED.has(normalizeNick(nick))) throw new AppError("NICK_UNAVAILABLE");
}

/** Gán nick cho user trong giao dịch. Khóa chính nick_claims bảo đảm duy nhất kể cả khi đua. */
export async function claimNick(tx: Tx, userId: string, nick: string, now: Date, holdDays: number) {
  validateNick(nick);
  const lower = normalizeNick(nick);
  await tx.query("DELETE FROM app.nick_claims WHERE nick_lower=$1 AND kind='held' AND (released_at <= $2 OR user_id=$3)", [lower, now, userId]);
  const cur = (await tx.query("SELECT nick_lower FROM app.nick_claims WHERE user_id=$1 AND kind='active'", [userId])).rows[0]?.nick_lower;
  if (cur !== lower) {
    if (cur) await tx.query("UPDATE app.nick_claims SET kind='held', released_at=$2 WHERE nick_lower=$1", [cur, addMs(now, holdDays * DAY)]);
    try {
      await tx.query("SAVEPOINT claim");
      await tx.query("INSERT INTO app.nick_claims(nick_lower, user_id, kind) VALUES ($1,$2,'active')", [lower, userId]);
    } catch (e) {
      if (isUniqueViolation(e)) throw new AppError("NICK_UNAVAILABLE");
      throw e;
    }
  }
  await tx.query("UPDATE app.users SET nick=$2 WHERE id=$1", [userId, nick]);
}

async function checkOtpSendLimit(deps: Deps, address: string) {
  const now = deps.clock.now();
  const { rows } = await deps.db.query("SELECT count(*)::int AS n, min(sent_at) AS first FROM app.otp_sends WHERE address=$1 AND sent_at > $2",
    [address, addMs(now, -3600_000)]);
  if (rows[0].n >= deps.config.otpSendPerHour) {
    const retry = Math.max(1, Math.ceil((rows[0].first.getTime() + 3600_000 - now.getTime()) / 1000));
    throw new AppError("RATE_LIMITED", { retryAfterSec: retry });
  }
  await deps.db.query("INSERT INTO app.otp_sends(address, purpose, sent_at) VALUES ($1,'otp',$2)", [address, now]);
}

async function deliver(deps: Deps, address: string, subject: string, text: string) {
  if (channelOf(address) === "email") await deps.otp.sendEmail(address, subject, text);
  else await deps.otp.sendSms(address, text);
}

async function createSession(tx: Tx | Deps["db"], deps: Deps, userId: string) {
  const token = randomToken();
  const now = deps.clock.now();
  const expiresAt = addMs(now, deps.config.sessionTtlDays * DAY);
  await tx.query("INSERT INTO app.sessions(id, user_id, token_hash, created_at, expires_at) VALUES ($1,$2,$3,$4,$5)",
    [randomUUID(), userId, sha256(token), now, expiresAt]);
  return { token, expiresAt };
}

export async function authenticate(deps: Deps, req: FastifyRequest) {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) throw new AppError("UNAUTHENTICATED");
  const { rows } = await deps.db.query(
    `SELECT u.id, u.nick, s.id AS session_id FROM app.sessions s JOIN app.users u ON u.id=s.user_id
     WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at > $2 AND u.disabled_at IS NULL`,
    [sha256(h.slice(7)), deps.clock.now()]);
  if (!rows[0]) throw new AppError("UNAUTHENTICATED");
  return { userId: rows[0].id as string, nick: rows[0].nick as string, sessionId: rows[0].session_id as string };
}

export function accountRoutes(app: FastifyInstance, deps: Deps) {
  const { db, clock, config } = deps;
  const otpHash = (id: string, otp: string) => hmac(config.otpSecret, `${id}:${otp}`);
  let dummyHash: Promise<string> | null = null;
  const getDummy = () => (dummyHash ??= argon2.hash("dummy-password-for-timing", ARGON));

  // ---- Đăng ký ----
  app.post("/v1/registration/start", async (req, reply) => {
    const b = z.object({ inviteCode: z.string().max(64), channel: z.enum(["email", "phone"]), address: z.string().max(254) }).parse(req.body);
    const address = normalizeAddress(b.channel, b.address);
    const now = clock.now();
    const inv = (await db.query("SELECT * FROM app.invites WHERE code_hash=$1", [hashInvite(b.inviteCode)])).rows[0];
    if (!inviteIsUsable(inv, now)) throw new AppError("INVITE_INVALID");
    await checkOtpSendLimit(deps, address);
    const exists = (await db.query("SELECT 1 FROM app.users WHERE email=$1 OR phone=$1", [address])).rowCount;
    const id = randomUUID();
    const otp = randomOtp();
    await db.query(
      "INSERT INTO app.registrations(id, invite_id, channel, address, otp_hash, otp_expires_at, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [id, inv.id, b.channel, address, exists ? null : otpHash(id, otp), addMs(now, config.otpTtlMin * 60_000), now]);
    if (exists) {
      await deliver(deps, address, "Zahu!Messenger: yêu cầu đăng ký",
        "Địa chỉ này đã có tài khoản Zahu!Messenger. Nếu bạn quên mật khẩu, hãy dùng chức năng Quên mật khẩu. Nếu không phải bạn, hãy bỏ qua tin này.");
    } else {
      await deliver(deps, address, "Zahu!Messenger: mã xác thực",
        `Mã xác thực Zahu!Messenger của bạn là ${otp}. Mã hết hạn sau ${config.otpTtlMin} phút. Không chia sẻ mã này cho ai.`);
    }
    return reply.code(202).send({ registrationId: id });
  });

  app.post("/v1/registration/verify", async (req) => {
    const b = z.object({ registrationId: z.uuid(), otp: z.string().regex(/^\d{6}$/) }).parse(req.body);
    return withTx(db, async (tx) => {
      const r = (await tx.query("SELECT * FROM app.registrations WHERE id=$1 FOR UPDATE", [b.registrationId])).rows[0];
      const now = clock.now();
      if (!r || r.completed_at || r.verified_at || !r.otp_hash || r.otp_expires_at <= now || r.attempts >= config.otpMaxAttempts) {
        throw new AppError("VERIFICATION_FAILED");
      }
      if (!safeEqualHex(r.otp_hash, otpHash(r.id, b.otp))) {
        await tx.query("UPDATE app.registrations SET attempts=attempts+1 WHERE id=$1", [r.id]);
        return { __fail: true };
      }
      const token = randomToken();
      await tx.query("UPDATE app.registrations SET verified_at=$2, verification_token_hash=$3 WHERE id=$1", [r.id, now, sha256(token)]);
      return { verificationToken: token };
    }).then((res) => { if ("__fail" in res) throw new AppError("VERIFICATION_FAILED"); return res; });
  });

  app.post("/v1/registration/complete", async (req, reply) => {
    const b = z.object({ verificationToken: z.string().max(100), password: PASSWORD, nick: z.string().max(64) }).parse(req.body);
    validateNick(b.nick);
    const hash = await argon2.hash(b.password, ARGON);
    const res = await withTx(db, async (tx) => {
      const now = clock.now();
      const r = (await tx.query("SELECT * FROM app.registrations WHERE verification_token_hash=$1 FOR UPDATE", [sha256(b.verificationToken)])).rows[0];
      if (!r || r.completed_at || !r.verified_at || r.verified_at < addMs(now, -30 * 60_000)) throw new AppError("VERIFICATION_FAILED");
      // FOR NO KEY UPDATE: tuần tự hóa các lượt hoàn tất trên cùng mã mời nhưng KHÔNG xung đột với khóa
      // FOR KEY SHARE mà kiểm tra khóa ngoại của INSERT registrations (luồng start) cần → tránh deadlock 40P01.
      const inv = (await tx.query("SELECT * FROM app.invites WHERE id=$1 FOR NO KEY UPDATE", [r.invite_id])).rows[0];
      if (!inviteIsUsable(inv, now)) throw new AppError("INVITE_INVALID");
      const userId = randomUUID();
      try {
        await tx.query("SAVEPOINT u");
        await tx.query(`INSERT INTO app.users(id, nick, ${r.channel === "email" ? "email" : "phone"}, password_hash, created_at, password_changed_at)
          VALUES ($1,$2,$3,$4,$5,$5)`, [userId, b.nick, r.address, hash, now]);
      } catch (e) {
        if (isUniqueViolation(e)) throw new AppError("CONFLICT");
        throw e;
      }
      await claimNick(tx, userId, b.nick, now, config.nickHoldDays);
      await tx.query("INSERT INTO app.contact_groups(id, user_id, name, is_default, created_at) VALUES ($1,$2,'Bạn bè',true,$3)", [randomUUID(), userId, now]);
      await tx.query("UPDATE app.invites SET uses=uses+1 WHERE id=$1", [inv.id]);
      await tx.query("UPDATE app.registrations SET completed_at=$2 WHERE id=$1", [r.id, now]);
      const s = await createSession(tx, deps, userId);
      return { userId, nick: b.nick, token: s.token, expiresAt: s.expiresAt };
    });
    return reply.code(201).send(res);
  });

  // ---- Đăng nhập ----
  app.post("/v1/auth/login", async (req) => {
    const b = z.object({ identifier: z.string().min(1).max(254), password: z.string().min(1).max(128) }).parse(req.body);
    const ident = b.identifier.trim();
    const key = "login:" + ident.toLowerCase();
    const now = clock.now();
    const ipKey = "ip:" + req.ip;
    const since = addMs(now, -15 * 60_000);
    const f = (await db.query(
      "SELECT count(*) FILTER (WHERE key=$1)::int AS acct, count(*) FILTER (WHERE key=$2)::int AS ip FROM app.login_failures WHERE key IN ($1,$2) AND at > $3",
      [key, ipKey, since])).rows[0];
    // Giới hạn theo tài khoản (đoán mật khẩu) và theo IP (thử một mật khẩu trên nhiều tài khoản).
    if (f.acct >= config.loginMaxFails || f.ip >= config.loginMaxFailsPerIp) throw new AppError("RATE_LIMITED", { retryAfterSec: 900 });
    let address: string | null = null;
    try { address = normalizeAddress(channelOf(ident), ident); } catch { /* có thể là nick */ }
    const u = (await db.query(
      `SELECT u.id, u.nick, u.password_hash FROM app.users u
       LEFT JOIN app.nick_claims n ON n.user_id=u.id AND n.kind='active'
       WHERE u.disabled_at IS NULL AND (u.email=$1 OR u.phone=$1 OR n.nick_lower=$2) LIMIT 1`,
      [address, normalizeNick(ident)])).rows[0];
    const ok = await argon2.verify(u?.password_hash ?? (await getDummy()), b.password).catch(() => false);
    if (!u || !ok) {
      await db.query("INSERT INTO app.login_failures(key, at) VALUES ($1,$3), ($2,$3)", [key, ipKey, now]);
      throw new AppError("UNAUTHENTICATED");
    }
    const s = await createSession(db, deps, u.id);
    return { userId: u.id, nick: u.nick, token: s.token, expiresAt: s.expiresAt };
  });

  app.post("/v1/auth/logout", async (req, reply) => {
    const me = await authenticate(deps, req);
    await db.query("UPDATE app.sessions SET revoked_at=$2 WHERE id=$1", [me.sessionId, clock.now()]);
    return reply.code(204).send();
  });

  // ---- Khôi phục mật khẩu ----
  app.post("/v1/auth/recovery/start", async (req, reply) => {
    const b = z.object({ address: z.string().max(254) }).parse(req.body);
    const address = normalizeAddress(channelOf(b.address), b.address);
    await checkOtpSendLimit(deps, address);
    const now = clock.now();
    const u = (await db.query("SELECT id FROM app.users WHERE (email=$1 OR phone=$1) AND disabled_at IS NULL", [address])).rows[0];
    const id = randomUUID();
    const otp = randomOtp();
    await db.query("INSERT INTO app.recoveries(id, user_id, otp_hash, otp_expires_at, created_at) VALUES ($1,$2,$3,$4,$5)",
      [id, u?.id ?? null, u ? otpHash(id, otp) : null, addMs(now, config.otpTtlMin * 60_000), now]);
    if (u) await deliver(deps, address, "Zahu!Messenger: khôi phục mật khẩu",
      `Mã khôi phục mật khẩu Zahu!Messenger là ${otp}. Mã hết hạn sau ${config.otpTtlMin} phút. Nếu không phải bạn yêu cầu, hãy bỏ qua.`);
    return reply.code(202).send({ recoveryId: id });
  });

  app.post("/v1/auth/recovery/complete", async (req, reply) => {
    const b = z.object({ recoveryId: z.uuid(), otp: z.string().regex(/^\d{6}$/), newPassword: PASSWORD }).parse(req.body);
    const hash = await argon2.hash(b.newPassword, ARGON);
    const res = await withTx(db, async (tx) => {
      const now = clock.now();
      const r = (await tx.query("SELECT * FROM app.recoveries WHERE id=$1 FOR UPDATE", [b.recoveryId])).rows[0];
      if (!r || !r.user_id || !r.otp_hash || r.used_at || r.otp_expires_at <= now || r.attempts >= config.otpMaxAttempts) return false;
      if (!safeEqualHex(r.otp_hash, otpHash(r.id, b.otp))) {
        await tx.query("UPDATE app.recoveries SET attempts=attempts+1 WHERE id=$1", [r.id]);
        return false;
      }
      await tx.query("UPDATE app.recoveries SET used_at=$2 WHERE id=$1", [r.id, now]);
      await tx.query("UPDATE app.users SET password_hash=$2, password_changed_at=$3 WHERE id=$1", [r.user_id, hash, now]);
      await tx.query("UPDATE app.sessions SET revoked_at=$2 WHERE user_id=$1 AND revoked_at IS NULL", [r.user_id, now]);
      await enqueue(tx, clock, "disconnect", { user: userLocalpart(r.user_id) });
      return true;
    });
    if (!res) throw new AppError("VERIFICATION_FAILED");
    await flushOutbox(db, deps.xmpp).catch(() => {});
    return reply.code(204).send();
  });

  // ---- Tài khoản của tôi ----
  app.get("/v1/me", async (req) => {
    const me = await authenticate(deps, req);
    const u = (await db.query("SELECT id, nick, email, phone FROM app.users WHERE id=$1", [me.userId])).rows[0];
    return { userId: u.id, nick: u.nick, jid: `${userLocalpart(u.id)}@${config.domain}`, channel: u.email ? "email" : "phone" };
  });

  app.put("/v1/me/password", async (req, reply) => {
    const me = await authenticate(deps, req);
    const b = z.object({ currentPassword: z.string().max(128), newPassword: PASSWORD }).parse(req.body);
    const u = (await db.query("SELECT password_hash FROM app.users WHERE id=$1", [me.userId])).rows[0];
    if (!(await argon2.verify(u.password_hash, b.currentPassword).catch(() => false))) throw new AppError("UNAUTHENTICATED");
    const hash = await argon2.hash(b.newPassword, ARGON);
    const now = clock.now();
    await withTx(db, async (tx) => {
      await tx.query("UPDATE app.users SET password_hash=$2, password_changed_at=$3 WHERE id=$1", [me.userId, hash, now]);
      await tx.query("UPDATE app.sessions SET revoked_at=$3 WHERE user_id=$1 AND id<>$2 AND revoked_at IS NULL", [me.userId, me.sessionId, now]);
    });
    return reply.code(204).send();
  });

  app.put("/v1/me/nick", async (req) => {
    const me = await authenticate(deps, req);
    const b = z.object({ nick: z.string().max(64) }).parse(req.body);
    await withTx(db, async (tx) => {
      await claimNick(tx, me.userId, b.nick, clock.now(), config.nickHoldDays);
      const { rows } = await tx.query("SELECT friend_id FROM app.friendships WHERE user_id=$1", [me.userId]);
      for (const r of rows) {
        await enqueue(tx, clock, "notify", { to: userLocalpart(r.friend_id), type: EventType.NICK_CHANGED });
      }
    });
    await flushOutbox(db, deps.xmpp).catch(() => {});
    return { userId: me.userId, nick: b.nick };
  });

  app.get("/v1/users/lookup", async (req) => {
    await authenticate(deps, req);
    const q = z.object({ nick: z.string().max(64) }).parse(req.query);
    const r = (await db.query(
      `SELECT u.id, u.nick FROM app.nick_claims n JOIN app.users u ON u.id=n.user_id
       WHERE n.nick_lower=$1 AND n.kind='active' AND u.disabled_at IS NULL`, [normalizeNick(q.nick)])).rows[0];
    if (!r) throw new AppError("NOT_FOUND");
    return { userId: r.id, nick: r.nick };
  });

  // ---- Token XMPP ngắn hạn ----
  app.post("/v1/xmpp/token", async (req) => {
    const me = await authenticate(deps, req);
    const localpart = userLocalpart(me.userId);
    // Prosody so với đồng hồ thật của máy chủ, nên dùng Date.now() chứ không dùng clock giả lập.
    const exp = Math.floor(Date.now() / 1000) + config.xmppTokenTtlSec;
    return {
      jid: `${localpart}@${config.domain}`, username: localpart, domain: config.domain,
      service: config.xmppPublicService,
      token: xmppToken(config.xmppTokenSecret, localpart, exp), expiresAt: new Date(exp * 1000),
    };
  });
}
