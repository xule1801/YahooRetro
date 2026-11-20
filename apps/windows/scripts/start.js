// Khởi chạy Electron. Bỏ ELECTRON_RUN_AS_NODE (VS Code đặt biến này cho terminal tích hợp → Electron chạy như Node).
import { spawn } from "node:child_process";
import electronPath from "electron";
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const p = spawn(electronPath, ["."], { stdio: "inherit", env });
p.on("close", (code) => process.exit(code ?? 0));
