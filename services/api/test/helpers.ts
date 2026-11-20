import pg from "pg";
import { Writable } from "node:stream";
import { buildApp, type Deps } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import { createPool } from "../src/db.ts";
import { FakeClock } from "../src/clock.ts";
import { createInvite } from "../src/modules/invites.ts";
import { migrate } from "../src/migrate.ts";
import type { XmppCommander } from "../src/xmpp-appsvc.ts";

export const ownerUrl = () =>
  `postgres://yc_owner:${encodeURIComponent(process.env.YC_PG_OWNER_PASSWORD!)}@127.0.0.1:${process.env.YC_PG_PORT ?? 5433}/yahoochat`;

export async function resetDb() {
  const c = new pg.Client({ connectionString: ownerUrl() });
  await c.connect();
  const { rows } = await c.query(`SELECT tablename FROM pg_tables WHERE schemaname='app' AND tablename <> 'schema_migrations'`);
  if (rows.length) await c.query(`TRUNCATE ${rows.map((r) => `app."${r.tablename}"`).join(",")} CASCADE`);
  await c.query(`DELETE FROM public.prosodyarchive`).catch(() => {});
  await c.query(`DELETE FROM public.prosody WHERE store IN ('roster','account_roles')`).catch(() => {});
  await c.end();
}

export class CaptureOtp {
  sent: Array<{ channel: "email" | "phone"; to: string; text: string }> = [];
  async sendEmail(to: string, _subject: string, text: string) { this.sent.push({ channel: "email", to, text }); }
  async sendSms(to: string, text: string) { this.sent.push({ channel: "phone", to, text }); }
  lastOtp(to: string) {
    const m = [...this.sent].reverse().find((s) => s.to === to)?.text.match(/\b(\d{6})\b/);
    return m?.[1];
  }
}

/** Fake Prosody: ghi lệnh, trả về "delivered" theo bảng online. */
export class FakeXmpp implements XmppCommander {
  calls: Array<{ action: string; attrs: Record<string, string>; text?: string }> = [];
  online = new Set<string>();
  fail = false;
  async command(action: string, attrs: Record<string, string>, text?: string) {
    if (this.fail) throw new Error("xmpp down");
    this.calls.push({ action, attrs, text });
    if (action === "buzz") return { count: this.online.has(attrs.to) ? 1 : 0 };
    return { count: 0 };
  }
}

export async function makeTestApp(overrides: Partial<Deps> = {}) {
  const config = loadConfig();
  const db = createPool(config.databaseUrl);
  await migrate(db).catch(() => {});
  const logs: string[] = [];
  const logStream = new Writable({ write(chunk, _e, cb) { logs.push(chunk.toString()); cb(); } });
  const deps: Deps = {
    db, config, clock: new FakeClock(Date.UTC(2026, 10, 1, 8, 0, 0)),
    otp: new CaptureOtp(), xmpp: new FakeXmpp(), logStream, ...overrides,
  };
  const app = await buildApp(deps);
  return {
    app, deps, logs,
    clock: deps.clock as FakeClock, otp: deps.otp as CaptureOtp, xmpp: deps.xmpp as FakeXmpp,
    async close() { await app.close(); await db.end(); },
  };
}
export type TestApp = Awaited<ReturnType<typeof makeTestApp>>;

export async function api(t: TestApp, method: string, url: string, body?: unknown, token?: string, headers: Record<string, string> = {}) {
  const res = await t.app.inject({
    method: method as "GET", url, payload: body as object | undefined,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
  });
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : undefined };
}

let seq = 0;
/** Tạo tài khoản qua luồng đăng ký thật (mã mời → OTP → hoàn tất). */
export async function registerUser(t: TestApp, nick?: string, channel: "email" | "phone" = "email") {
  seq++;
  const n = nick ?? `user${Date.now() % 100000}_${seq}`;
  const address = channel === "email" ? `${n.toLowerCase()}@example.test` : `+849${String(10000000 + seq).slice(-8)}`;
  const inv = await createInvite(t.deps.db, t.clock, { maxUses: 1, days: 7 });
  const s = await api(t, "POST", "/v1/registration/start", { inviteCode: inv.code, channel, address });
  if (s.status !== 202) throw new Error(`start ${s.status} ${JSON.stringify(s.body)}`);
  const otp = t.otp.lastOtp(address)!;
  const v = await api(t, "POST", "/v1/registration/verify", { registrationId: s.body.registrationId, otp });
  const c = await api(t, "POST", "/v1/registration/complete", { verificationToken: v.body.verificationToken, password: "Mat-khau-du-dai-1", nick: n });
  if (c.status !== 201) throw new Error(`complete ${c.status} ${JSON.stringify(c.body)}`);
  return { userId: c.body.userId as string, nick: n, token: c.body.token as string, address };
}
