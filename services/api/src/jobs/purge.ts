// Job xóa vật lý định kỳ. Việc KHÔNG trả tin quá hạn được bảo đảm riêng ở lớp đọc (mod_yc_policy),
// nên job này chậm hay lỗi cũng không làm lộ tin quá hạn; nó chỉ giải phóng dữ liệu trên đĩa.
import type { Db } from "../db.ts";
import { addMs, DAY, type Clock } from "../clock.ts";

export async function runPurge(db: Db, clock: Clock, ttlDays: number) {
  const now = clock.now();
  const cutoffEpoch = Math.floor(addMs(now, -ttlDays * DAY).getTime() / 1000);
  const dayAgo = addMs(now, -DAY);
  try {
    // Lần cài đầu: API có thể chạy job trước khi Prosody kịp tạo bảng lưu trữ → chưa có gì để xóa.
    const hasArchive = (await db.query(`SELECT to_regclass('public.prosodyarchive') IS NOT NULL AS ok`)).rows[0].ok;
    const msgs = hasArchive
      ? await db.query(`DELETE FROM public.prosodyarchive WHERE "when" < $1`, [cutoffEpoch])
      : { rowCount: 0 };
    await db.query("DELETE FROM app.registrations WHERE created_at < $1", [dayAgo]);
    await db.query("DELETE FROM app.recoveries WHERE created_at < $1", [dayAgo]);
    await db.query("DELETE FROM app.otp_sends WHERE sent_at < $1", [dayAgo]);
    await db.query("DELETE FROM app.login_failures WHERE at < $1", [dayAgo]);
    await db.query("DELETE FROM app.idempotency WHERE created_at < $1", [dayAgo]);
    await db.query("DELETE FROM app.fake_sms_outbox WHERE created_at < $1", [dayAgo]);
    await db.query("DELETE FROM app.sessions WHERE expires_at < $1 OR revoked_at < $1", [dayAgo]);
    await db.query("DELETE FROM app.nick_claims WHERE kind='held' AND released_at <= $1", [now]);
    await db.query("DELETE FROM app.xmpp_outbox WHERE done_at < $1", [addMs(now, -7 * DAY)]);
    await db.query("DELETE FROM app.job_runs WHERE ran_at < $1", [addMs(now, -30 * DAY)]);
    const deleted = msgs.rowCount ?? 0;
    await db.query("INSERT INTO app.job_runs(job, ran_at, ok, deleted) VALUES ('purge',$1,true,$2)", [now, deleted]);
    return { ok: true, deleted };
  } catch (e) {
    await db.query("INSERT INTO app.job_runs(job, ran_at, ok, error) VALUES ('purge',$1,false,$2)", [now, String((e as Error).message).slice(0, 300)]).catch(() => {});
    return { ok: false, deleted: 0, error: (e as Error).message };
  }
}
