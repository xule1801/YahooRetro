// Sao lưu/khôi phục PostgreSQL (gồm cả dữ liệu Prosody) — mã hóa AES-256-GCM, giữ tối đa N ngày.
// Dùng pg_dump/pg_restore trong container postgres của docker compose (cùng cách chạy ở máy chủ thử nghiệm).
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import type { Clock } from "./clock.ts";
import { DAY } from "./clock.ts";

const MAGIC = Buffer.from("YCB1");
const FILE_RE = /^yc-\d{8}T\d{6}Z\.dump\.enc$/;
const INFRA = resolve(dirname(fileURLToPath(import.meta.url)), "../../../infra");

function keyBuf(hex: string) {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("YC_BACKUP_KEY phải là 64 ký tự hex (32 byte)");
  return Buffer.from(hex, "hex");
}

/** Định dạng: "YCB1" | iv(12) | tag(16) | ciphertext */
export function encryptBuffer(data: Buffer, keyHex: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", keyBuf(keyHex), iv);
  c.setAAD(MAGIC);
  const ct = Buffer.concat([c.update(data), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), ct]);
}

export function decryptBuffer(blob: Buffer, keyHex: string) {
  if (blob.length < 32 || !blob.subarray(0, 4).equals(MAGIC)) throw new Error("Không phải tệp backup của hệ thống");
  const d = createDecipheriv("aes-256-gcm", keyBuf(keyHex), blob.subarray(4, 16));
  d.setAAD(MAGIC);
  d.setAuthTag(blob.subarray(16, 32));
  return Buffer.concat([d.update(blob.subarray(32)), d.final()]);
}

/** Xóa backup cũ hơn `days` ngày (theo thời điểm sửa đổi tệp). Chỉ đụng tệp đúng mẫu tên. */
export function pruneBackups(dir: string, clock: Clock, days: number) {
  const cutoff = clock.now().getTime() - days * DAY;
  const removed: string[] = [];
  for (const f of readdirSync(dir)) {
    if (!FILE_RE.test(f)) continue;
    if (statSync(join(dir, f)).mtimeMs < cutoff) { unlinkSync(join(dir, f)); removed.push(f); }
  }
  return removed;
}

function compose(args: string[], input?: Buffer): Promise<Buffer> {
  return new Promise((res, rej) => {
    const project = process.env.YC_COMPOSE_PROJECT ?? "yahoochat";
    const envFile = process.env.YC_COMPOSE_ENV_FILE ?? ".env";
    const p = spawn("docker", ["compose", "-p", project, "-f", join(INFRA, "docker-compose.yml"), "--env-file", join(INFRA, envFile), ...args],
      { stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [], err: Buffer[] = [];
    p.stdout.on("data", (d) => out.push(d));
    p.stderr.on("data", (d) => err.push(d));
    p.on("error", rej);
    p.on("close", (code) => code === 0 ? res(Buffer.concat(out)) : rej(new Error(`docker compose ${args[0]} lỗi ${code}: ${Buffer.concat(err).toString().slice(0, 500)}`)));
    if (input) p.stdin.end(input); else p.stdin.end();
  });
}

export async function createBackup(opts: { dir: string; key: string; clock: Clock }) {
  keyBuf(opts.key);
  mkdirSync(opts.dir, { recursive: true });
  const dump = await compose(["exec", "-T", "postgres", "pg_dump", "-U", "yc_owner", "-d", "yahoochat", "-Fc"]);
  const stamp = opts.clock.now().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const file = join(opts.dir, `yc-${stamp}.dump.enc`);
  writeFileSync(file, encryptBuffer(dump, opts.key), { mode: 0o600 });
  return file;
}

/**
 * Khôi phục vào database `targetDb` (tạo mới nếu chưa có). Mặc định nên khôi phục vào DB riêng,
 * chạy purge, kiểm tra, rồi mới chuyển dịch vụ sang. Xem docs/operations.md.
 */
export async function restoreBackup(opts: { file: string; key: string; targetDb: string }) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(opts.targetDb)) throw new Error("Tên database không hợp lệ");
  const dump = decryptBuffer(readFileSync(opts.file), opts.key);
  const exists = (await compose(["exec", "-T", "postgres", "psql", "-U", "yc_owner", "-d", "postgres", "-tAc",
    `SELECT 1 FROM pg_database WHERE datname='${opts.targetDb}'`])).toString().trim() === "1";
  if (!exists) await compose(["exec", "-T", "postgres", "createdb", "-U", "yc_owner", opts.targetDb]);
  await compose(["exec", "-T", "postgres", "pg_restore", "-U", "yc_owner", "-d", opts.targetDb, "--clean", "--if-exists", "--exit-on-error"], dump);
}
