// Bạn bè, chặn, nhóm danh bạ, Buzz. Thiết kế §3.2, §3.5. Quyền luôn kiểm tra phía server.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { EventType, userLocalpart } from "@yc/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Deps } from "../app.ts";
import { withTx, isUniqueViolation, type Tx } from "../db.ts";
import { addMs } from "../clock.ts";
import { AppError } from "../errors.ts";
import { enqueue, flushOutbox } from "../xmpp-appsvc.ts";
import { authenticate } from "./accounts.ts";

const IdParam = z.object({ id: z.uuid() });
const UserParam = z.object({ userId: z.uuid() });
const GroupName = z.string().trim().min(1).max(40);

/** Thực thi idempotent theo header Idempotency-Key: lặp lại trả nguyên kết quả thành công trước đó. */
async function idempotent(deps: Deps, req: FastifyRequest, reply: FastifyReply, userId: string, route: string,
  fn: () => Promise<{ status: number; body: unknown }>) {
  const key = req.headers["idempotency-key"];
  if (typeof key === "string" && key.length > 0 && key.length <= 100) {
    const prev = (await deps.db.query("SELECT status, body FROM app.idempotency WHERE user_id=$1 AND key=$2 AND route=$3", [userId, key, route])).rows[0];
    if (prev) return reply.code(prev.status).send(prev.body);
    const res = await fn();
    await deps.db.query("INSERT INTO app.idempotency(user_id, key, route, status, body, created_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
      [userId, key, route, res.status, JSON.stringify(res.body), deps.clock.now()]);
    return reply.code(res.status).send(res.body);
  }
  const res = await fn();
  return reply.code(res.status).send(res.body);
}

async function defaultGroup(tx: Tx, userId: string) {
  return (await tx.query("SELECT id FROM app.contact_groups WHERE user_id=$1 AND is_default", [userId])).rows[0].id as string;
}

async function makeFriends(tx: Tx, deps: Deps, a: string, b: string) {
  const now = deps.clock.now();
  await tx.query("INSERT INTO app.friendships(user_id, friend_id, group_id, created_at) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING", [a, b, await defaultGroup(tx, a), now]);
  await tx.query("INSERT INTO app.friendships(user_id, friend_id, group_id, created_at) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING", [b, a, await defaultGroup(tx, b), now]);
  await enqueue(tx, deps.clock, "friend-add", { a: userLocalpart(a), b: userLocalpart(b) });
  await enqueue(tx, deps.clock, "notify", { to: userLocalpart(a), type: EventType.FRIEND_ACCEPTED });
  await enqueue(tx, deps.clock, "notify", { to: userLocalpart(b), type: EventType.FRIEND_ACCEPTED });
}

async function unfriend(tx: Tx, deps: Deps, a: string, b: string) {
  const r = await tx.query("DELETE FROM app.friendships WHERE (user_id=$1 AND friend_id=$2) OR (user_id=$2 AND friend_id=$1)", [a, b]);
  if ((r.rowCount ?? 0) > 0) {
    await enqueue(tx, deps.clock, "friend-remove", { a: userLocalpart(a), b: userLocalpart(b) });
    await enqueue(tx, deps.clock, "notify", { to: userLocalpart(b), type: EventType.FRIEND_REMOVED });
    await enqueue(tx, deps.clock, "notify", { to: userLocalpart(a), type: EventType.CONTACTS_CHANGED });
  }
}

export function socialRoutes(app: FastifyInstance, deps: Deps) {
  const { db, clock, config } = deps;
  const flush = () => flushOutbox(db, deps.xmpp).catch(() => {});

  // ---------------- Lời mời kết bạn ----------------
  app.post("/v1/friend-requests", async (req, reply) => {
    const me = await authenticate(deps, req);
    const b = z.object({ toUserId: z.uuid() }).parse(req.body);
    return idempotent(deps, req, reply, me.userId, "friend-request", async () => {
      if (b.toUserId === me.userId) throw new AppError("INVALID_INPUT");
      const res = await withTx(db, async (tx) => {
        const now = clock.now();
        const target = (await tx.query("SELECT id FROM app.users WHERE id=$1 AND disabled_at IS NULL", [b.toUserId])).rows[0];
        if (!target) throw new AppError("NOT_FOUND");
        // Khóa theo thứ tự cố định để hai lời mời ngược chiều đồng thời không tạo hai yêu cầu.
        const [x, y] = [me.userId, b.toUserId].sort();
        await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`fr:${x}:${y}`]);
        if ((await tx.query("SELECT 1 FROM app.blocks WHERE user_id=$1 AND blocked_id=$2", [me.userId, b.toUserId])).rowCount)
          throw new AppError("CONFLICT", { message: "Bạn đang chặn người này" });
        if ((await tx.query("SELECT 1 FROM app.friendships WHERE user_id=$1 AND friend_id=$2", [me.userId, b.toUserId])).rowCount)
          throw new AppError("CONFLICT", { message: "Hai bạn đã là bạn bè" });
        const blockedByTarget = (await tx.query("SELECT 1 FROM app.blocks WHERE user_id=$1 AND blocked_id=$2", [b.toUserId, me.userId])).rowCount! > 0;
        if (!blockedByTarget) {
          const reverse = (await tx.query("SELECT id FROM app.friend_requests WHERE from_user=$1 AND to_user=$2 AND status='pending' AND NOT suppressed FOR UPDATE",
            [b.toUserId, me.userId])).rows[0];
          if (reverse) {
            await tx.query("UPDATE app.friend_requests SET status='accepted', decided_at=$2 WHERE id=$1", [reverse.id, now]);
            await makeFriends(tx, deps, b.toUserId, me.userId);
            return { requestId: reverse.id, status: "accepted" };
          }
        }
        const existing = (await tx.query("SELECT id FROM app.friend_requests WHERE from_user=$1 AND to_user=$2 AND status='pending'", [me.userId, b.toUserId])).rows[0];
        if (existing) return { requestId: existing.id, status: "pending" };
        const id = randomUUID();
        await tx.query("INSERT INTO app.friend_requests(id, from_user, to_user, status, suppressed, created_at) VALUES ($1,$2,$3,'pending',$4,$5)",
          [id, me.userId, b.toUserId, blockedByTarget, now]);
        if (!blockedByTarget) await enqueue(tx, clock, "notify", { to: userLocalpart(b.toUserId), type: EventType.FRIEND_REQUEST });
        return { requestId: id, status: "pending" };
      });
      await flush();
      return { status: 201, body: res };
    });
  });

  app.get("/v1/friend-requests", async (req) => {
    const me = await authenticate(deps, req);
    const q = z.object({ direction: z.enum(["in", "out"]) }).parse(req.query);
    const sql = q.direction === "in"
      ? `SELECT r.id, r.created_at, u.id AS uid, u.nick FROM app.friend_requests r JOIN app.users u ON u.id=r.from_user
         WHERE r.to_user=$1 AND r.status='pending' AND NOT r.suppressed ORDER BY r.created_at`
      : `SELECT r.id, r.created_at, u.id AS uid, u.nick FROM app.friend_requests r JOIN app.users u ON u.id=r.to_user
         WHERE r.from_user=$1 AND r.status='pending' ORDER BY r.created_at`;
    const { rows } = await db.query(sql, [me.userId]);
    return { requests: rows.map((r) => ({ requestId: r.id, userId: r.uid, nick: r.nick, createdAt: r.created_at })) };
  });

  const decide = (action: "accept" | "decline" | "cancel") => async (req: FastifyRequest, reply: FastifyReply) => {
    const me = await authenticate(deps, req);
    const { id } = IdParam.parse(req.params);
    await withTx(db, async (tx) => {
      const r = (await tx.query("SELECT * FROM app.friend_requests WHERE id=$1 AND status='pending' FOR UPDATE", [id])).rows[0];
      const mine = action === "cancel" ? r?.from_user === me.userId : r?.to_user === me.userId && !r.suppressed;
      if (!r || !mine) throw new AppError("NOT_FOUND");
      const status = action === "accept" ? "accepted" : action === "decline" ? "declined" : "cancelled";
      await tx.query("UPDATE app.friend_requests SET status=$2, decided_at=$3 WHERE id=$1", [id, status, clock.now()]);
      if (action === "accept") await makeFriends(tx, deps, r.from_user, r.to_user);
    });
    await flush();
    return reply.code(204).send();
  };
  app.post("/v1/friend-requests/:id/accept", decide("accept"));
  app.post("/v1/friend-requests/:id/decline", decide("decline"));
  app.post("/v1/friend-requests/:id/cancel", decide("cancel"));

  app.delete("/v1/friends/:userId", async (req, reply) => {
    const me = await authenticate(deps, req);
    const { userId } = UserParam.parse(req.params);
    await withTx(db, (tx) => unfriend(tx, deps, me.userId, userId));
    await flush();
    return reply.code(204).send();
  });

  // ---------------- Chặn ----------------
  app.post("/v1/blocks", async (req, reply) => {
    const me = await authenticate(deps, req);
    const b = z.object({ userId: z.uuid() }).parse(req.body);
    if (b.userId === me.userId) throw new AppError("INVALID_INPUT");
    await withTx(db, async (tx) => {
      if (!(await tx.query("SELECT 1 FROM app.users WHERE id=$1", [b.userId])).rowCount) throw new AppError("NOT_FOUND");
      await tx.query("INSERT INTO app.blocks(user_id, blocked_id, created_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [me.userId, b.userId, clock.now()]);
      await unfriend(tx, deps, me.userId, b.userId);
      await tx.query("UPDATE app.friend_requests SET status='cancelled', decided_at=$3 WHERE from_user=$1 AND to_user=$2 AND status='pending'", [me.userId, b.userId, clock.now()]);
      await tx.query("UPDATE app.friend_requests SET suppressed=true WHERE from_user=$2 AND to_user=$1 AND status='pending'", [me.userId, b.userId]);
    });
    await flush();
    return reply.code(204).send();
  });
  app.delete("/v1/blocks/:userId", async (req, reply) => {
    const me = await authenticate(deps, req);
    const { userId } = UserParam.parse(req.params);
    await db.query("DELETE FROM app.blocks WHERE user_id=$1 AND blocked_id=$2", [me.userId, userId]);
    return reply.code(204).send();
  });
  app.get("/v1/blocks", async (req) => {
    const me = await authenticate(deps, req);
    const { rows } = await db.query("SELECT u.id, u.nick FROM app.blocks b JOIN app.users u ON u.id=b.blocked_id WHERE b.user_id=$1 ORDER BY lower(u.nick)", [me.userId]);
    return { blocks: rows.map((r) => ({ userId: r.id, nick: r.nick })) };
  });

  // ---------------- Danh bạ và nhóm ----------------
  app.get("/v1/contacts", async (req) => {
    const me = await authenticate(deps, req);
    const groups = (await db.query("SELECT id, name, is_default FROM app.contact_groups WHERE user_id=$1 ORDER BY is_default DESC, lower(name)", [me.userId])).rows;
    const contacts = (await db.query(
      `SELECT f.group_id, u.id, u.nick FROM app.friendships f JOIN app.users u ON u.id=f.friend_id
       WHERE f.user_id=$1 AND u.disabled_at IS NULL ORDER BY lower(u.nick)`, [me.userId])).rows;
    return {
      groups: groups.map((g) => ({
        groupId: g.id, name: g.name, isDefault: g.is_default,
        contacts: contacts.filter((c) => c.group_id === g.id).map((c) => ({ userId: c.id, nick: c.nick, jid: `${userLocalpart(c.id)}@${config.domain}` })),
      })),
    };
  });

  app.post("/v1/groups", async (req, reply) => {
    const me = await authenticate(deps, req);
    const b = z.object({ name: GroupName }).parse(req.body);
    const id = randomUUID();
    try {
      await db.query("INSERT INTO app.contact_groups(id, user_id, name, created_at) VALUES ($1,$2,$3,$4)", [id, me.userId, b.name, clock.now()]);
    } catch (e) {
      if (isUniqueViolation(e)) throw new AppError("CONFLICT", { message: "Đã có nhóm cùng tên" });
      throw e;
    }
    return reply.code(201).send({ groupId: id, name: b.name });
  });

  app.patch("/v1/groups/:id", async (req, reply) => {
    const me = await authenticate(deps, req);
    const { id } = IdParam.parse(req.params);
    const b = z.object({ name: GroupName }).parse(req.body);
    try {
      const r = await db.query("UPDATE app.contact_groups SET name=$3 WHERE id=$1 AND user_id=$2", [id, me.userId, b.name]);
      if (!r.rowCount) throw new AppError("NOT_FOUND");
    } catch (e) {
      if (isUniqueViolation(e)) throw new AppError("CONFLICT", { message: "Đã có nhóm cùng tên" });
      throw e;
    }
    return reply.code(204).send();
  });

  app.delete("/v1/groups/:id", async (req, reply) => {
    const me = await authenticate(deps, req);
    const { id } = IdParam.parse(req.params);
    await withTx(db, async (tx) => {
      const g = (await tx.query("SELECT is_default FROM app.contact_groups WHERE id=$1 AND user_id=$2 FOR UPDATE", [id, me.userId])).rows[0];
      if (!g) throw new AppError("NOT_FOUND");
      if (g.is_default) throw new AppError("INVALID_INPUT", { message: "Không xóa được nhóm mặc định" });
      await tx.query("UPDATE app.friendships SET group_id=$3 WHERE user_id=$1 AND group_id=$2", [me.userId, id, await defaultGroup(tx, me.userId)]);
      await tx.query("DELETE FROM app.contact_groups WHERE id=$1", [id]);
    });
    return reply.code(204).send();
  });

  app.put("/v1/contacts/:userId/group", async (req, reply) => {
    const me = await authenticate(deps, req);
    const { userId } = UserParam.parse(req.params);
    const b = z.object({ groupId: z.uuid() }).parse(req.body);
    const r = await db.query(
      `UPDATE app.friendships f SET group_id=$3 FROM app.contact_groups g
       WHERE f.user_id=$1 AND f.friend_id=$2 AND g.id=$3 AND g.user_id=$1`, [me.userId, userId, b.groupId]);
    if (!r.rowCount) throw new AppError("NOT_FOUND");
    return reply.code(204).send();
  });

  // ---------------- Buzz ----------------
  app.post("/v1/buzz", async (req, reply) => {
    const me = await authenticate(deps, req);
    const b = z.object({ toUserId: z.uuid() }).parse(req.body);
    return idempotent(deps, req, reply, me.userId, "buzz", async () => {
      if (!(await db.query("SELECT 1 FROM app.friendships WHERE user_id=$1 AND friend_id=$2", [me.userId, b.toUserId])).rowCount) {
        throw new AppError("NOT_FRIENDS");
      }
      const now = clock.now();
      // Giới hạn tần suất nguyên tử ở DB (đúng cả khi chạy nhiều bản API).
      const allowed = await db.query(
        `INSERT INTO app.buzz_rate(from_user, to_user, last_at) VALUES ($1,$2,$3)
         ON CONFLICT (from_user, to_user) DO UPDATE SET last_at=EXCLUDED.last_at WHERE app.buzz_rate.last_at <= $4 RETURNING 1`,
        [me.userId, b.toUserId, now, addMs(now, -config.buzzPairIntervalSec * 1000)]);
      if (!allowed.rowCount) throw new AppError("RATE_LIMITED", { retryAfterSec: config.buzzPairIntervalSec });
      const buzzId = randomUUID();
      const expiresAt = addMs(now, config.buzzTtlSec * 1000);
      let delivered = 0;
      try {
        delivered = (await deps.xmpp.command("buzz", {
          from: userLocalpart(me.userId), to: userLocalpart(b.toUserId), id: buzzId, expires: expiresAt.toISOString(),
        })).count;
      } catch { delivered = 0; }
      // Offline, Ẩn hay không xác nhận được: cùng một phản hồi.
      if (delivered < 1) throw new AppError("RECIPIENT_UNAVAILABLE");
      return { status: 202, body: { buzzId, expiresAt } };
    });
  });
}
