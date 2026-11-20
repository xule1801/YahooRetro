// Công cụ quản trị — chỉ chạy trên máy chủ (yêu cầu truy cập shell). Không có endpoint quản trị qua mạng.
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { userLocalpart, normalizeNick } from "@yc/contracts";
import { loadConfig } from "./config.ts";
import { createPool, withTx } from "./db.ts";
import { migrate } from "./migrate.ts";
import { systemClock } from "./clock.ts";
import { createInvite, listInvites, revokeInvite } from "./modules/invites.ts";
import { runPurge } from "./jobs/purge.ts";
import { createBackup, pruneBackups, restoreBackup } from "./backup.ts";
import { AppsvcXmpp, enqueue, flushOutbox } from "./xmpp-appsvc.ts";

const HELP = `Zahu!Messenger — CLI quản trị
  invite create [--uses N] [--days D] [--note "..."]   Tạo mã mời (mặc định 1 lượt, 7 ngày)
  invite list                                           Liệt kê mã mời (chỉ 4 ký tự cuối)
  invite revoke <inviteId>                              Thu hồi mã mời
  user disable <nick> | user enable <nick>              Khóa/mở tài khoản (khóa: thu hồi mọi phiên)
  purge                                                 Chạy job xóa dữ liệu hết hạn ngay
  backup create                                         Tạo backup mã hóa + xóa bản quá hạn giữ
  backup prune                                          Chỉ xóa backup quá hạn giữ
  backup restore <file> --target <db>                   Khôi phục vào database <db> (nên là DB mới)
  sms-outbox                                            (Chỉ môi trường thử) xem SMS giả lập
`;

const [cmd, sub, ...rest] = process.argv.slice(2);
const config = loadConfig();
const db = createPool(config.databaseUrl);
const out = (o: unknown) => console.log(typeof o === "string" ? o : JSON.stringify(o, null, 2));

try {
  await migrate(db);
  if (cmd === "invite" && sub === "create") {
    const { values } = parseArgs({ args: rest, options: { uses: { type: "string" }, days: { type: "string" }, note: { type: "string" } } });
    const inv = await createInvite(db, systemClock, {
      maxUses: Number(values.uses ?? config.inviteDefaultMaxUses), days: Number(values.days ?? config.inviteDefaultDays), note: values.note,
    });
    out({ ...inv, warning: "Mã chỉ hiển thị một lần. Gửi cho người được mời qua kênh riêng." });
  } else if (cmd === "invite" && sub === "list") {
    out(await listInvites(db));
  } else if (cmd === "invite" && sub === "revoke" && rest[0]) {
    out((await revokeInvite(db, systemClock, rest[0])) ? "Đã thu hồi" : "Không tìm thấy hoặc đã thu hồi");
  } else if (cmd === "user" && (sub === "disable" || sub === "enable") && rest[0]) {
    const u = (await db.query("SELECT u.id FROM app.nick_claims n JOIN app.users u ON u.id=n.user_id WHERE n.nick_lower=$1 AND n.kind='active'", [normalizeNick(rest[0])])).rows[0];
    if (!u) throw new Error("Không tìm thấy nick");
    await withTx(db, async (tx) => {
      const now = systemClock.now();
      await tx.query("UPDATE app.users SET disabled_at=$2 WHERE id=$1", [u.id, sub === "disable" ? now : null]);
      if (sub === "disable") {
        await tx.query("UPDATE app.sessions SET revoked_at=$2 WHERE user_id=$1 AND revoked_at IS NULL", [u.id, now]);
        await enqueue(tx, systemClock, "disconnect", { user: userLocalpart(u.id) });
      }
    });
    if (sub === "disable") {
      const x = new AppsvcXmpp({ service: config.xmppService, domain: config.domain, secret: config.xmppTokenSecret, insecureTls: config.devInsecureTls });
      await flushOutbox(db, x).catch(() => {});
      await x.stop();
    }
    out(sub === "disable" ? "Đã khóa và ngắt mọi phiên" : "Đã mở khóa");
  } else if (cmd === "purge") {
    out(await runPurge(db, systemClock, config.messageTtlDays));
  } else if (cmd === "backup" && sub === "create") {
    if (!config.backupKey) throw new Error("Thiếu YC_BACKUP_KEY");
    const dir = resolve(config.backupDir);
    const file = await createBackup({ dir, key: config.backupKey, clock: systemClock });
    out({ file, pruned: pruneBackups(dir, systemClock, config.backupRetentionDays) });
  } else if (cmd === "backup" && sub === "prune") {
    out({ pruned: pruneBackups(resolve(config.backupDir), systemClock, config.backupRetentionDays) });
  } else if (cmd === "backup" && sub === "restore" && rest[0]) {
    if (!config.backupKey) throw new Error("Thiếu YC_BACKUP_KEY");
    const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { target: { type: "string" } } });
    if (!values.target) throw new Error("Cần --target <database>");
    await restoreBackup({ file: positionals[0], key: config.backupKey, targetDb: values.target });
    out(`Đã khôi phục vào ${values.target}. Bước tiếp theo BẮT BUỘC: chạy purge trên DB này trước khi phục vụ (xem docs/operations.md).`);
  } else if (cmd === "sms-outbox") {
    if (config.smsProvider !== "fake") throw new Error("Chỉ dùng khi YC_SMS_PROVIDER=fake");
    out((await db.query("SELECT phone, body, created_at FROM app.fake_sms_outbox ORDER BY id DESC LIMIT 20")).rows);
  } else {
    out(HELP);
  }
} catch (e) {
  console.error("Lỗi:", (e as Error).message);
  process.exitCode = 1;
} finally {
  await db.end();
}
