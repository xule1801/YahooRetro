// Kiểm tra gói đã build: có đủ mã chạy, không lẫn công cụ dev/test.
const asar = require("@electron/asar");
const files = asar.listPackage("dist/win-unpacked/resources/app.asar").map((f) => f.replace(/\\/g, "/"));
const must = ["/node_modules/@xmpp/client/", "/node_modules/@yc/contracts/index.js", "/core/chat-core.js", "/renderer/vendor/contracts.js", "/main/preload.cjs"];
const mustNot = ["/node_modules/playwright-core/", "/node_modules/electron-builder/", "/test/"];
let ok = true;
for (const m of must) { const hit = files.some((f) => f.includes(m)); console.log(hit ? "có     " : "THIẾU  ", m); ok &&= hit; }
for (const m of mustNot) { const hit = files.some((f) => f.includes(m)); console.log(hit ? "THỪA   " : "không  ", m); ok &&= !hit; }
console.log(ok ? "GÓI HỢP LỆ" : "GÓI CÓ VẤN ĐỀ");
process.exit(ok ? 0 : 1);
