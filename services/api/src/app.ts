import Fastify from "fastify";
import { ZodError } from "zod";
import type { Writable } from "node:stream";
import type { Db } from "./db.ts";
import type { Clock } from "./clock.ts";
import type { Config } from "./config.ts";
import type { OtpSender } from "./otp.ts";
import type { XmppCommander } from "./xmpp-appsvc.ts";
import { AppError } from "./errors.ts";
import { accountRoutes } from "./modules/accounts.ts";
import { socialRoutes } from "./modules/social.ts";

export interface Deps {
  db: Db; clock: Clock; config: Config; otp: OtpSender; xmpp: XmppCommander;
  logStream?: Writable;
}

export async function buildApp(deps: Deps) {
  const app = Fastify({
    logger: {
      level: process.env.YC_LOG_LEVEL ?? "info",
      stream: deps.logStream ?? process.stdout,
      // Không bao giờ log body; che header nhạy cảm. Query string có thể chứa nick (không bí mật).
      redact: { paths: ["req.headers.authorization", "req.headers.cookie", "req.headers[\"idempotency-key\"]"], censor: "[redacted]" },
    },
    bodyLimit: 64 * 1024,
    trustProxy: process.env.YC_TRUST_PROXY === "1",
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      if (err.retryAfterSec) reply.header("retry-after", String(err.retryAfterSec));
      return reply.code(err.status).send({ error: { code: err.code, message: err.message, ...(err.retryAfterSec ? { retryAfterSec: err.retryAfterSec } : {}) } });
    }
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: { code: "INVALID_INPUT", message: err.issues[0]?.message ?? "Dữ liệu không hợp lệ" } });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) {
      return reply.code(status).send({ error: { code: "INVALID_INPUT", message: "Yêu cầu không hợp lệ" } });
    }
    req.log.error({ errName: (err as Error).name, errMessage: (err as Error).message, errCode: (err as { code?: string }).code }, "unhandled error");
    if (process.env.YC_LOG_LEVEL === "warn") console.error("unhandled error:", (err as Error).message, (err as { code?: string }).code);
    return reply.code(500).send({ error: { code: "INTERNAL", message: "Lỗi máy chủ" } });
  });

  app.get("/healthz", async () => {
    await deps.db.query("SELECT 1");
    const last = (await deps.db.query("SELECT ran_at, ok FROM app.job_runs WHERE job='purge' ORDER BY id DESC LIMIT 1")).rows[0];
    const pending = (await deps.db.query("SELECT count(*)::int AS n FROM app.xmpp_outbox WHERE done_at IS NULL")).rows[0].n;
    return { ok: true, lastPurge: last ?? null, xmppOutboxPending: pending };
  });

  accountRoutes(app, deps);
  socialRoutes(app, deps);
  return app;
}
