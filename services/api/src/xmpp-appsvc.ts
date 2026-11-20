// Kết nối của dịch vụ ứng dụng tới Prosody (tài khoản "appsvc") để gửi lệnh tới mod_yc_policy.
import { client, xml } from "@xmpp/client";
import { Xmlns } from "@yc/contracts";
import { xmppToken } from "./crypto.ts";
import type { Db, Tx } from "./db.ts";
import type { Clock } from "./clock.ts";

export interface XmppCommander {
  command(action: string, attrs: Record<string, string>, text?: string): Promise<{ count: number }>;
}

export class AppsvcXmpp implements XmppCommander {
  private x: ReturnType<typeof client> | null = null;
  private ready: Promise<void> | null = null;
  private opts: { service: string; domain: string; secret: string; insecureTls: boolean };
  constructor(opts: { service: string; domain: string; secret: string; insecureTls: boolean }) {
    this.opts = opts;
  }

  private connect() {
    if (this.ready) return this.ready;
    if (this.opts.insecureTls) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // CHỈ môi trường local có cert tự ký
    const x = client({
      service: this.opts.service, domain: this.opts.domain, username: "appsvc", resource: `api-${process.pid}`,
      // Token mới mỗi lần (kể cả khi tự kết nối lại). API 0.14: authenticate(credentials, mechanism).
      credentials: (auth: (c: { username: string; password: string }, mech: string) => Promise<void>, mechanisms: string[]) => {
        const exp = Math.floor(Date.now() / 1000) + 120;
        const mech = mechanisms.includes("PLAIN") ? "PLAIN" : mechanisms[0];
        return auth({ username: "appsvc", password: xmppToken(this.opts.secret, "appsvc", exp) }, mech);
      },
    });
    x.on("error", () => {}); // @xmpp/reconnect tự kết nối lại
    this.x = x;
    this.ready = x.start().then(() => undefined).catch((e: unknown) => { this.ready = null; this.x = null; throw e; });
    return this.ready;
  }

  async command(action: string, attrs: Record<string, string>, text?: string) {
    await this.connect();
    const res = await withTimeout(
      this.x!.iqCaller.request(xml("iq", { type: "set", to: this.opts.domain },
        xml("command", { xmlns: Xmlns.APPSVC, action, ...attrs }, text ?? ""))),
      5000,
    );
    const child = res.getChild("delivered", Xmlns.APPSVC) ?? res.getChild("online", Xmlns.APPSVC);
    const count = child?.attrs.count !== undefined ? Number(child.attrs.count) : child?.attrs.value === "true" ? 1 : 0;
    return { count };
  }

  async stop() { try { await this.x?.stop(); } catch { /* ignore */ } }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("xmpp timeout")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/** Ghi lệnh vào outbox trong cùng giao dịch nghiệp vụ. */
export async function enqueue(tx: Tx, clock: Clock, action: string, attrs: Record<string, string>) {
  await tx.query("INSERT INTO app.xmpp_outbox(action, attrs, created_at) VALUES ($1,$2,$3)", [action, attrs, clock.now()]);
}

let flushing: Promise<void> | null = null;
/** Gửi các lệnh chưa xong theo thứ tự; dừng ở lệnh lỗi đầu tiên để giữ thứ tự (thử lại lần sau). */
export function flushOutbox(db: Db, xmpp: XmppCommander): Promise<void> {
  if (flushing) return flushing.then(() => flushOutbox(db, xmpp));
  flushing = (async () => {
    const { rows } = await db.query("SELECT id, action, attrs FROM app.xmpp_outbox WHERE done_at IS NULL ORDER BY id LIMIT 200");
    for (const r of rows) {
      try {
        await xmpp.command(r.action, r.attrs);
        await db.query("UPDATE app.xmpp_outbox SET done_at = now(), attempts = attempts + 1 WHERE id=$1", [r.id]);
      } catch (e) {
        await db.query("UPDATE app.xmpp_outbox SET attempts = attempts + 1, last_error=$2 WHERE id=$1", [r.id, String((e as Error).message).slice(0, 200)]);
        break;
      }
    }
  })().finally(() => { flushing = null; });
  return flushing;
}
