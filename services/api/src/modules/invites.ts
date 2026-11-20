import { randomUUID } from "node:crypto";
import type { Db } from "../db.ts";
import { addMs, DAY, type Clock } from "../clock.ts";
import { inviteCode, normalizeInviteCode, sha256 } from "../crypto.ts";

export const hashInvite = (code: string) => sha256("invite:" + normalizeInviteCode(code));

export async function createInvite(db: Db, clock: Clock, opts: { maxUses: number; days: number; note?: string }) {
  if (!(opts.maxUses >= 1 && opts.maxUses <= 1000)) throw new Error("maxUses phải trong 1..1000");
  if (!(opts.days > 0 && opts.days <= 365)) throw new Error("days phải trong (0, 365]");
  const code = inviteCode();
  const id = randomUUID();
  const now = clock.now();
  const expiresAt = addMs(now, opts.days * DAY);
  await db.query(
    "INSERT INTO app.invites(id, code_hash, code_last4, max_uses, expires_at, note, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [id, hashInvite(code), code.slice(-4), opts.maxUses, expiresAt, opts.note ?? null, now],
  );
  return { id, code, expiresAt, maxUses: opts.maxUses };
}

export async function revokeInvite(db: Db, clock: Clock, id: string) {
  const r = await db.query("UPDATE app.invites SET revoked_at=$2 WHERE id=$1 AND revoked_at IS NULL", [id, clock.now()]);
  return (r.rowCount ?? 0) > 0;
}

export async function listInvites(db: Db) {
  const { rows } = await db.query(
    "SELECT id, code_last4, max_uses, uses, expires_at, revoked_at, note, created_at FROM app.invites ORDER BY created_at DESC LIMIT 500");
  return rows;
}

/** Mã mời còn hiệu lực tại thời điểm `now` (chưa thu hồi, chưa hết hạn, còn lượt). */
export const inviteIsUsable = (row: { revoked_at: Date | null; expires_at: Date; uses: number; max_uses: number } | undefined, now: Date) =>
  !!row && !row.revoked_at && row.expires_at > now && row.uses < row.max_uses;
