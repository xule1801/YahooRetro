// Tiện ích test E2E: chạy API thật trên cổng riêng, đọc OTP từ Mailpit (email) và CLI sms-outbox (SMS giả lập).
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const API_DIR = resolve(ROOT, "services/api");
// Test E2E chạy trên BỘ MÁY CHỦ RIÊNG (infra/.env.test) — không đụng môi trường dùng thử.
const ENV_FILE = "--env-file=../../infra/.env.test";
process.loadEnvFile(resolve(ROOT, "infra/.env.test"));
if (process.env.YC_TEST_STACK !== "1") throw new Error("Từ chối chạy test: không phải bộ máy chủ test");
const MAILPIT = `http://127.0.0.1:${process.env.YC_MAILPIT_HTTP_PORT}`;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function startApi(port = 18080) {
  const p = spawn(process.execPath, [ENV_FILE, "src/server.ts"], {
    cwd: API_DIR, env: { ...process.env, YC_API_PORT: String(port), YC_LOG_LEVEL: "warn" }, stdio: ["ignore", "pipe", "pipe"],
  });
  let err = "";
  p.stderr.on("data", (d) => { err += d; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + "/healthz")).ok) return { base, stop: () => p.kill() }; } catch { /* chưa lên */ }
    if (p.exitCode != null) throw new Error("API thoát sớm: " + err);
    await sleep(200);
  }
  p.kill();
  throw new Error("API không khởi động: " + err);
}

export function cli(...args) {
  const out = execFileSync(process.execPath, [ENV_FILE, "src/cli.ts", ...args], { cwd: API_DIR, encoding: "utf8" });
  return JSON.parse(out.slice(out.indexOf(out.trimStart()[0] === "{" ? "{" : "[")));
}
export const createInvite = () => cli("invite", "create", "--note", "e2e test").code;

/** Lấy OTP mới nhất gửi tới email từ Mailpit (SMTP thật, không ra Internet). */
export async function emailOtp(address) {
  for (let i = 0; i < 50; i++) {
    const r = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`)).json();
    const id = r.messages?.[0]?.ID;
    if (id) {
      const m = await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json();
      const otp = m.Text?.match(/\b(\d{6})\b/)?.[1];
      if (otp) return otp;
    }
    await sleep(100);
  }
  throw new Error("Không thấy email OTP cho " + address);
}
export function smsOtp(phone) {
  const rows = cli("sms-outbox");
  return rows.find((r) => r.phone === phone)?.body.match(/\b(\d{6})\b/)?.[1];
}

export async function waitFor(fn, ms = 5000, label = "điều kiện") {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(50); }
  throw new Error("Hết thời gian chờ: " + label);
}
