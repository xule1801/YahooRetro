// Tác vụ 5: backup mã hóa, giữ tối đa 7 ngày, khôi phục cách ly và lọc tin hết hạn trước khi phục vụ.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, utimesSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { encryptBuffer, decryptBuffer, pruneBackups, createBackup, restoreBackup } from "../src/backup.ts";
import { runPurge } from "../src/jobs/purge.ts";
import { FakeClock, DAY, systemClock } from "../src/clock.ts";
import { ownerUrl, resetDb } from "./helpers.ts";
import { createPool } from "../src/db.ts";

const key = randomBytes(32).toString("hex");
let dir: string;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "yc-backup-")); });
afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

describe("mã hóa backup", () => {
  it("giải mã được bằng đúng khóa; sai khóa hoặc sửa 1 byte đều bị từ chối", () => {
    const data = Buffer.from("nội dung bí mật ".repeat(100));
    const enc = encryptBuffer(data, key);
    expect(enc.includes(Buffer.from("nội dung bí mật"))).toBe(false);
    expect(decryptBuffer(enc, key).equals(data)).toBe(true);
    expect(() => decryptBuffer(enc, randomBytes(32).toString("hex"))).toThrow();
    const tampered = Buffer.from(enc); tampered[tampered.length - 20] ^= 1;
    expect(() => decryptBuffer(tampered, key)).toThrow();
    expect(() => encryptBuffer(data, "ngắn")).toThrow();
  });
});

describe("thời hạn giữ backup", () => {
  it("xóa bản cũ hơn 7 ngày, giữ bản mới; không đụng tệp khác", () => {
    const clock = new FakeClock(Date.UTC(2026, 10, 20));
    const mk = (name: string, ageDays: number) => {
      const p = join(dir, name); writeFileSync(p, "x");
      const t = (clock.now().getTime() - ageDays * DAY) / 1000; utimesSync(p, t, t);
    };
    mk("yc-20261110T000000Z.dump.enc", 10);
    mk("yc-20261113T000000Z.dump.enc", 7.01);
    mk("yc-20261114T000000Z.dump.enc", 6);
    mk("ghi-chu.txt", 30);
    const removed = pruneBackups(dir, clock, 7);
    expect(removed.sort()).toEqual(["yc-20261110T000000Z.dump.enc", "yc-20261113T000000Z.dump.enc"]);
    expect(readdirSync(dir).sort()).toEqual(["ghi-chu.txt", "yc-20261114T000000Z.dump.enc"]);
  });
});

describe("backup → khôi phục cách ly", () => {
  it("bản dump được mã hóa; khôi phục vào DB riêng rồi purge: không còn tin quá hạn", async () => {
    await resetDb();
    const owner = new pg.Client({ connectionString: ownerUrl() });
    await owner.connect();
    const now = Math.floor(Date.now() / 1000);
    const row = (user: string, key: string, when: number, text: string) =>
      owner.query(`INSERT INTO public.prosodyarchive(host,"user",store,key,"when","with",type,value) VALUES ('localhost',$1,'archive2',$2,$3,'x@localhost<chat','xml',$4)`,
        [user, key, when, `<message><body>${text}</body></message>`]);
    await row("u1", "k1", now - 29 * 86400, "tin-còn-hạn");
    await row("u1", "k2", now - 31 * 86400, "tin-quá-hạn");

    const file = await createBackup({ dir, key, clock: systemClock });
    const raw = readFileSync(file);
    expect(raw.includes(Buffer.from("tin-còn-hạn"))).toBe(false);

    await owner.query("DROP DATABASE IF EXISTS yc_restore_test");
    await restoreBackup({ file, key, targetDb: "yc_restore_test" });
    const restoredUrl = ownerUrl().replace(/\/yahoochat$/, "/yc_restore_test");
    const r = createPool(restoredUrl);
    const res = await runPurge(r, systemClock, 30);
    expect(res.ok).toBe(true);
    const bodies = (await r.query(`SELECT value FROM public.prosodyarchive`)).rows.map((x) => x.value).join();
    expect(bodies).toContain("tin-còn-hạn");
    expect(bodies).not.toContain("tin-quá-hạn");
    await r.end();
    await owner.query("DROP DATABASE IF EXISTS yc_restore_test");
    await owner.end();
  }, 120000);
});
