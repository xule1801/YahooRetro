// Sao chép contracts dùng chung vào renderer (renderer chạy sandbox, không import được node_modules).
import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const dst = join(here, "../renderer/vendor");
mkdirSync(dst, { recursive: true });
copyFileSync(join(here, "../../../packages/contracts/index.js"), join(dst, "contracts.js"));
console.log("contracts → renderer/vendor/contracts.js");
