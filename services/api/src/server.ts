import { loadConfig } from "./config.ts";
import { createPool } from "./db.ts";
import { migrate } from "./migrate.ts";
import { buildApp } from "./app.ts";
import { createOtpSender } from "./otp.ts";
import { AppsvcXmpp, flushOutbox } from "./xmpp-appsvc.ts";
import { runPurge } from "./jobs/purge.ts";
import { systemClock } from "./clock.ts";

const config = loadConfig();
const db = createPool(config.databaseUrl);
await migrate(db);
const xmpp = new AppsvcXmpp({ service: config.xmppService, domain: config.domain, secret: config.xmppTokenSecret, insecureTls: config.devInsecureTls });
const app = await buildApp({ db, clock: systemClock, config, otp: createOtpSender(config, db), xmpp });

const purge = async () => {
  const r = await runPurge(db, systemClock, config.messageTtlDays);
  if (r.ok) app.log.info({ deleted: r.deleted }, "purge done");
  else app.log.error({ err: r.error }, "purge FAILED");
};
const timers = [
  setInterval(() => { flushOutbox(db, xmpp).catch(() => {}); }, 5000),
  setInterval(purge, config.purgeIntervalMin * 60_000),
];
await purge();
await app.listen({ port: config.port, host: config.host });
if (config.smsProvider === "fake") app.log.warn("YC_SMS_PROVIDER=fake: OTP SMS chỉ ghi vào app.fake_sms_outbox, KHÔNG gửi thật. Không dùng ở môi trường thật.");
if (config.devInsecureTls) app.log.warn("YC_DEV_INSECURE_TLS=1: bỏ kiểm tra chứng chỉ TLS. CHỈ dùng ở máy thử.");

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    timers.forEach(clearInterval);
    await app.close();
    await xmpp.stop();
    await db.end();
    process.exit(0);
  });
}
