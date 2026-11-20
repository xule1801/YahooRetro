// Quét giấy phép các gói PRODUCTION (không gồm devDependencies) của API và client Windows.
// Chạy: node scripts/license-scan.mjs  → in bảng + ghi docs/licenses-dependencies.json
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const tree = JSON.parse(execSync("npm ls --omit=dev --all --json --long -w services/api -w apps/windows", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 }));
const seen = new Map();
(function walk(deps) {
  for (const [name, d] of Object.entries(deps ?? {})) {
    const key = `${name}@${d.version}`;
    if (!seen.has(key) && d.version) {
      let license = "UNKNOWN";
      const pj = d.path ? join(d.path, "package.json") : null;
      if (pj && existsSync(pj)) {
        const j = JSON.parse(readFileSync(pj, "utf8"));
        license = typeof j.license === "string" ? j.license : j.license?.type ?? (j.licenses ? j.licenses.map((l) => l.type ?? l).join(" OR ") : "UNKNOWN");
      }
      seen.set(key, { name, version: d.version, license });
    }
    walk(d.dependencies);
  }
})(tree.dependencies);
const PERMISSIVE = /^(\(?)(MIT|ISC|BSD-2-Clause|BSD-3-Clause|Apache-2\.0|0BSD|BlueOak-1\.0\.0|CC0-1\.0|Unlicense|Python-2\.0|MIT-0)/i;
const rows = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
const flagged = rows.filter((r) => !PERMISSIVE.test(r.license));
const byLicense = rows.reduce((m, r) => ((m[r.license] = (m[r.license] ?? 0) + 1), m), {});
console.log("Tổng gói production:", rows.length);
console.log("Theo giấy phép:", byLicense);
console.log("Cần xem xét (không thuộc nhóm permissive):", flagged.length ? flagged : "không có");
writeFileSync(join(ROOT, "docs/licenses-dependencies.json"), JSON.stringify({ generatedAt: new Date().toISOString(), total: rows.length, byLicense, flagged, packages: rows }, null, 2));
