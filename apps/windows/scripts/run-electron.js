// Chạy một script bằng Electron, bỏ ELECTRON_RUN_AS_NODE (VS Code đặt biến này).
import { spawnSync } from "node:child_process";
import electronPath from "electron";
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const r = spawnSync(electronPath, process.argv.slice(2), { stdio: "inherit", env });
process.exit(r.status ?? 0);
