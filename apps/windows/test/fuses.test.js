// Gia cố file exe đã đóng gói: không cho dùng ZahuMessenger.exe làm "trình chạy mã hộ" (LOLBin).
// Chỉ chạy khi có YC_UI_EXE (đường dẫn tới exe đã build/cài).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getCurrentFuseWire, FuseV1Options } from "@electron/fuses";
const ENABLED = "1".charCodeAt(0); // getCurrentFuseWire trả mã ký tự: 49 = bật, 48 = tắt

import { existsSync as exists0 } from "node:fs";
const EXE = process.env.YC_UI_EXE;
if (EXE && !exists0(EXE)) throw new Error("YC_UI_EXE không tồn tại (cần đường dẫn Windows, vd C:\...\ZahuMessenger.exe): " + EXE);
const opts = { skip: !EXE && "cần YC_UI_EXE" };

function runFor(ms, env, args) {
  return new Promise((res) => {
    const p = spawn(EXE, args, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.on("error", (e) => { throw new Error("Không khởi chạy được exe — kết quả test sẽ vô nghĩa: " + e.message); });
    p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (out += d));
    const t = setTimeout(() => p.kill(), ms);
    p.on("close", () => { clearTimeout(t); res(out); });
  });
}

test("fuse: tắt RunAsNode, NODE_OPTIONS, tham số --inspect; bật chỉ nạp app từ asar có kiểm tra toàn vẹn", opts, async () => {
  const w = await getCurrentFuseWire(EXE);
  const on = (k) => w[k] === ENABLED;
  assert.equal(on(FuseV1Options.RunAsNode), false);
  assert.equal(on(FuseV1Options.EnableNodeOptionsEnvironmentVariable), false);
  assert.equal(on(FuseV1Options.EnableNodeCliInspectArguments), false);
  assert.equal(on(FuseV1Options.OnlyLoadAppFromAsar), true);
  assert.equal(on(FuseV1Options.EnableEmbeddedAsarIntegrityValidation), true);
  assert.equal(on(FuseV1Options.EnableCookieEncryption), true);
});

test("tấn công: ELECTRON_RUN_AS_NODE=1 không biến exe thành trình chạy JavaScript", opts, async () => {
  const out = await runFor(6000, { ELECTRON_RUN_AS_NODE: "1", YC_USER_DATA: mkdtempSync(join(tmpdir(), "yc-f-")) }, ["-e", "process.stdout.write('PWNED-'+require('os').userInfo().username)"]);
  assert.ok(!out.includes("PWNED"), out.slice(0, 200));
});

test("tấn công: NODE_OPTIONS=--require <mã độc> không được nạp", opts, async () => {
  const dir = mkdtempSync(join(tmpdir(), "yc-f-"));
  const marker = join(dir, "pwned.txt");
  const evil = join(dir, "evil.js");
  writeFileSync(evil, `require('fs').writeFileSync(${JSON.stringify(marker)}, 'x')`);
  await runFor(6000, { NODE_OPTIONS: `--require "${evil}"`, YC_USER_DATA: join(dir, "ud") }, []);
  assert.equal(existsSync(marker), false);
});

import { execFileSync } from "node:child_process";
import { cpSync, readFileSync } from "node:fs";
import { dirname as dn, basename } from "node:path";

function windowTitleAfter(exe, ms, env) {
  const p = spawn(exe, [], { env: { ...process.env, ...env }, stdio: "ignore" });
  return new Promise((res) => setTimeout(() => {
    let title = "";
    try {
      title = execFileSync("powershell", ["-NoProfile", "-Command",
        `(Get-Process | Where-Object { $_.Path -eq '${exe.replace(/'/g, "''")}' -and $_.MainWindowTitle }).MainWindowTitle`], { encoding: "utf8" }).trim();
    } catch { /* */ }
    p.kill();
    try { execFileSync("taskkill", ["/F", "/T", "/PID", String(p.pid)], { stdio: "ignore" }); } catch { /* đã thoát */ }
    res({ title, exited: p.exitCode });
  }, ms));
}

test("app đã gia cố vẫn khởi động bình thường (hiện cửa sổ đăng nhập)", opts, async () => {
  const r = await windowTitleAfter(EXE, 7000, { YC_API_BASE: "http://127.0.0.1:9", YC_USER_DATA: mkdtempSync(join(tmpdir(), "yc-f-")) });
  assert.match(r.title, /Zahu!Messenger/);
});

test("tấn công: sửa lén mã của app (app.asar) → app từ chối chạy (kiểm tra toàn vẹn)", opts, async () => {
  const copy = join(mkdtempSync(join(tmpdir(), "yc-tamper-")), "app");
  cpSync(dn(EXE), copy, { recursive: true });
  const asar = join(copy, "resources", "app.asar");
  const buf = readFileSync(asar);
  const i = buf.indexOf(Buffer.from("Từ chối mọi yêu cầu quyền"));
  assert.ok(i > 0, "tìm thấy đoạn mã để sửa");
  buf.write("X", i + 2); // sửa 1 byte trong mã main process
  writeFileSync(asar, buf);
  const exe = join(copy, basename(EXE));
  const r = await windowTitleAfter(exe, 7000, { YC_API_BASE: "http://127.0.0.1:9", YC_USER_DATA: mkdtempSync(join(tmpdir(), "yc-f-")) });
  assert.equal(r.title, "", "app bị sửa không được mở cửa sổ");
});
