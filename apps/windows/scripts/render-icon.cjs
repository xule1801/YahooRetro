// Kết xuất renderer/logo.svg → assets/icon.png (256×256, nền trong suốt) để làm icon cửa sổ/taskbar và bản cài.
// Chạy bằng Electron: node scripts/run-electron.js scripts/render-icon.cjs  (hoặc: npm run icon)
const { app, BrowserWindow } = require("electron");
const { readFileSync, writeFileSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const svg = readFileSync(join(root, "renderer/logo.svg"), "utf8").replace(/width="128" height="128"/, 'width="256" height="256"');
const html = `<!doctype html><html><head><style>html,body{margin:0;padding:0;overflow:hidden;background:transparent}svg{display:block}</style></head><body>${svg}</body></html>`;

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 256, height: 256, show: false, transparent: true, frame: false, useContentSize: true, webPreferences: { offscreen: true } });
  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 300));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 256, height: 256 });
  mkdirSync(join(root, "assets"), { recursive: true });
  const png = img.resize({ width: 256, height: 256 }).toPNG();
  writeFileSync(join(root, "assets/icon.png"), png);
  console.log("assets/icon.png", png.length, "byte");
  app.quit();
});
