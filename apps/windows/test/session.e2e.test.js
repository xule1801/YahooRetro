// "Ghi nhớ đăng nhập": đăng nhập (hoặc đăng ký) → đóng app → mở lại phải vào thẳng danh bạ, không hỏi lại mật khẩu.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron } from "playwright-core";
import electronPath from "electron";
import { ChatCore } from "../core/chat-core.js";
import { startApi, createInvite, emailOtp, waitFor } from "./stack.js";

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const run = Date.now().toString(36).slice(-5);
const PW = "Mat-khau-du-dai-ss";
const userData = mkdtempSync(join(tmpdir(), "yc-session-"));
let api;

const launch = () => _electron.launch({
  executablePath: process.env.YC_UI_EXE ?? electronPath, args: process.env.YC_UI_EXE ? [] : [APP_DIR],
  env: { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== "ELECTRON_RUN_AS_NODE")), YC_API_BASE: api.base, YC_DEV_INSECURE_TLS: "1", YC_USER_DATA: userData },
});
const pageFor = (app, re) => waitFor(() => app.windows().find((w) => re.test(w.url())), 15000, "cửa sổ " + re);

before(async () => { api = await startApi(18082); });
after(() => api?.stop());

test("đăng ký trong app → đóng → mở lại: tự đăng nhập", async () => {
  const nick = `Ss_${run}`, email = `ss.${run}@example.test`;
  let app = await launch();
  const login = await app.firstWindow();
  await login.click("#tab-register");
  await login.fill("#rg-code", createInvite());
  await login.fill("#rg-addr", email);
  await login.click("#rg-step1 button[type=submit]");
  await login.fill("#rg-otp", await emailOtp(email));
  await login.click("#rg-step2 button[type=submit]");
  await login.fill("#rg-nick", nick);
  await login.fill("#rg-pw", PW);
  await login.fill("#rg-pw2", PW);
  await login.click("#rg-step3 button[type=submit]");
  const contacts = await pageFor(app, /contacts\.html/);
  await contacts.waitForSelector(`#my-nick:text("${nick}")`);
  await waitFor(() => existsSync(join(userData, "session.bin")), 5000, "session.bin được ghi");
  await app.close();

  app = await launch();
  const again = await pageFor(app, /contacts\.html/);
  await again.waitForSelector(`#my-nick:text("${nick}")`);
  assert.equal(app.windows().some((w) => /login\.html/.test(w.url())), false);
  await app.close();
});

test("bỏ chọn 'Ghi nhớ' khi đăng nhập → mở lại phải đăng nhập", async () => {
  const c = new ChatCore({ apiBase: api.base, insecureTls: true });
  const nick = `Sn_${run}`, email = `sn.${run}@example.test`;
  const r = await c.registerStart(createInvite(), "email", email);
  const v = await c.registerVerify(r.registrationId, await emailOtp(email));
  await c.registerComplete(v.verificationToken, PW, nick);
  let app = await launch();
  let first = await app.firstWindow();
  if (!/login\.html/.test(first.url())) { // còn phiên của test trước → đăng xuất
    // Đăng xuất đóng chính cửa sổ này → không chờ kết quả trong trang.
    await first.evaluate(() => { window.yc.app("logout"); }).catch(() => {});
    first = await pageFor(app, /login\.html/);
  }
  await first.waitForSelector("#li-id");
  await first.fill("#li-id", nick);
  await first.fill("#li-pw", PW);
  await first.uncheck("#li-remember");
  await first.click("#li-submit");
  await pageFor(app, /contacts\.html/);
  await app.close();
  app = await launch();
  await pageFor(app, /login\.html/);
  await app.close();
});
