// E2E giao diện Windows thật (Electron điều khiển bằng Playwright) + một client đối tác (ChatCore) trên stack thật.
// Kế hoạch Tác vụ 4/6: rung khi hiển thị, thu nhỏ chỉ thông báo và không rung lại khi mở, giảm chuyển động,
// điều hướng bàn phím, nhập tiếng Việt, smiley hiển thị khi nhận và khi mở lại lịch sử.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron } from "playwright-core";
import electronPath from "electron";
import { ChatCore } from "../core/chat-core.js";
import { startApi, createInvite, emailOtp, waitFor, sleep } from "./stack.js";

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = resolve(APP_DIR, "../../docs/screenshots");
const run = Date.now().toString(36).slice(-5);
const PW = "Mat-khau-du-dai-ui";
let api, app, B, aMe;

async function newUser(core, nick) {
  const email = `${nick.toLowerCase()}@example.test`;
  const r = await core.registerStart(createInvite(), "email", email);
  const v = await core.registerVerify(r.registrationId, await emailOtp(email));
  await core.registerComplete(v.verificationToken, PW, nick);
  return core.me;
}
const windowByTitle = async (re) => waitFor(() => app.windows().find((w) => re.test(w.url())), 10000, "cửa sổ " + re);
const buzzLog = (page) => page.evaluate(() => new Promise((r) => { const off = window.yc.on((n, p) => { if (n === "buzz-log") { off(); r(p.effect); } }); }));
const shaken = (page, ms) => page.evaluate((ms) => new Promise((r) => { const off = window.yc.on((n) => { if (n === "shaken") { off(); r(true); } }); setTimeout(() => { off(); r(false); }, ms); }), ms);

before(async () => {
  api = await startApi(18081);
  const A = new ChatCore({ apiBase: api.base, insecureTls: true });
  B = new ChatCore({ apiBase: api.base, insecureTls: true });
  aMe = await newUser(A, `UiAn_${run}`);
  await newUser(B, `UiBinh_${run}`);
  await A.sendFriendRequest(B.me.userId);
  const { incoming } = await B.listRequests();
  await B.decideRequest(incoming[0].requestId, "accept");
  await A.logout();
  await B.connect();
  mkdirSync(SHOTS, { recursive: true });
  app = await _electron.launch({
    // YC_UI_EXE: chạy trên bản đã đóng gói (dist/win-unpacked/ZahuMessenger.exe) thay vì bản dev.
    executablePath: process.env.YC_UI_EXE ?? electronPath, args: process.env.YC_UI_EXE ? [] : [APP_DIR],
    env: { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== "ELECTRON_RUN_AS_NODE")), YC_API_BASE: api.base, YC_DEV_INSECURE_TLS: "1", YC_USER_DATA: mkdtempSync(join(tmpdir(), "yc-ui-")) },
  });
});
after(async () => { await app?.close().catch(() => {}); await B?.disconnect(); api?.stop(); });

test("ứng dụng Windows: đăng nhập → danh bạ → chat → Buzz", async (t) => {
  let contacts, chat;

  await t.test("đăng nhập bằng nick", async () => {
    const login = await app.firstWindow();
    await login.waitForSelector("#li-id");
    await login.fill("#li-id", aMe.nick);
    await login.fill("#li-pw", PW);
    await login.screenshot({ path: join(SHOTS, "01-dang-nhap.png") });
    await login.click("#li-submit");
    contacts = await windowByTitle(/contacts\.html/);
    await contacts.waitForSelector(`#my-nick:text("${aMe.nick}")`);
  });

  await t.test("danh bạ hiện bạn trong nhóm mặc định với đèn Online và dòng trạng thái", async () => {
    await B.setPresence("busy", "Đang nghe nhạc 🎵");
    const row = contacts.locator(`.contact[data-user="${B.me.userId}"]`);
    await row.locator(".dot.busy").waitFor({ timeout: 8000 });
    assert.match(await row.innerText(), /Đang nghe nhạc/);
    await B.setPresence("online", "");
    await row.locator(".dot.online").waitFor({ timeout: 8000 });
    await contacts.screenshot({ path: join(SHOTS, "02-danh-ba.png") });
  });

  await t.test("mở chat bằng bàn phím (Tab/Enter)", async () => {
    await contacts.locator(`.contact[data-user="${B.me.userId}"]`).focus();
    await contacts.keyboard.press("Enter");
    chat = await windowByTitle(/chat\.html/);
    await chat.waitForSelector(`#peer-nick:text("UiBinh_${run}")`);
  });

  await t.test("gửi tiếng Việt có dấu + smiley; B nhận đúng; smiley hiển thị dạng SVG", async () => {
    const text = "Chào Bình! Tiếng Việt: ắ ằ ẳ ẵ ặ đ Ư ơ :) =))";
    await chat.fill("#input", text);
    await chat.keyboard.press("Enter");
    await waitFor(() => B.conversation(aMe.userId).some((m) => m.body === text), 5000, "B nhận");
    await chat.locator(".msg.out .state.delivered").waitFor({ timeout: 5000 });
    assert.equal(await chat.locator(".msg.out svg.smiley").count(), 2);
    await B.sendMessage(aMe.userId, "Nhớ mọi người quá :X ;)");
    await chat.locator(".msg.in svg.smiley").nth(1).waitFor({ timeout: 5000 });
    await chat.click("#btn-smiley");
    await chat.screenshot({ path: join(SHOTS, "03-chat-smiley.png") });
    await chat.keyboard.press("Escape");
  });

  await t.test("Buzz khi cửa sổ chat đang hiển thị: rung đúng một lần", async () => {
    const effect = buzzLog(contacts);
    const shook = shaken(chat, 4000);
    assert.deepEqual(await B.buzz(aMe.userId), { ok: true });
    assert.equal((await effect).shake, true);
    assert.equal(await shook, true);
    await chat.locator(".buzzline").first().waitFor();
    await chat.screenshot({ path: join(SHOTS, "04-buzz.png") });
  });

  await t.test("cửa sổ thu nhỏ: chỉ thông báo, không rung; mở lại không rung bù", async () => {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("chat.html")).minimize());
    await sleep(10_300);
    const effect = buzzLog(contacts);
    assert.deepEqual(await B.buzz(aMe.userId), { ok: true });
    const e = await effect;
    assert.equal(e.shake, false);
    assert.equal(e.notify, true);
    const shook = shaken(chat, 2500);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("chat.html")).restore());
    assert.equal(await shook, false);
  });

  await t.test("bật Giảm chuyển động: Buzz không rung (nhấp nháy thay thế), smiley tĩnh", async () => {
    await contacts.evaluate(() => window.yc.app("settings", { reduceMotion: true }));
    await sleep(10_300);
    const effect = buzzLog(contacts);
    const shook = shaken(chat, 2000);
    assert.deepEqual(await B.buzz(aMe.userId), { ok: true });
    const e = await effect;
    assert.equal(e.shake, false);
    assert.equal(e.flash, true);
    assert.equal(await shook, false);
    const anim = await chat.locator(".msg svg.smiley .sm-body").first().evaluate((n) => getComputedStyle(n).animationName);
    assert.equal(anim, "none");
  });

  await t.test("đóng/mở lại cửa sổ chat: lịch sử và smiley còn nguyên", async () => {
    await chat.close();
    await contacts.locator(`.contact[data-user="${B.me.userId}"]`).dblclick();
    chat = await windowByTitle(/chat\.html/);
    await chat.locator(".msg.in svg.smiley").nth(1).waitFor({ timeout: 5000 });
    assert.ok((await chat.locator(".msg").count()) >= 2);
  });

  await t.test("B chuyển Ẩn: A thấy Offline", async () => {
    await B.setPresence("invisible");
    await contacts.locator(`.contact[data-user="${B.me.userId}"] .dot.offline`).waitFor({ timeout: 8000 });
  });
});
