import { existsSync } from "node:fs";
// Test chạy trên BỘ MÁY CHỦ RIÊNG (infra/.env.test, compose project yahoochat-test) vì test xóa dữ liệu.
// Tuyệt đối không dùng infra/.env (môi trường dùng thử/thật).
const envFile = new URL("../../../infra/.env.test", import.meta.url);
if (!existsSync(envFile)) throw new Error("Thiếu infra/.env.test — tạo từ infra/.env.test.example rồi chạy `npm run test:infra:up`");
process.loadEnvFile(envFile);
if (process.env.YC_TEST_STACK !== "1") throw new Error("Từ chối chạy test: không phải bộ máy chủ test (YC_TEST_STACK=1)");
process.env.YC_DEV_INSECURE_TLS = "1";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // chỉ test local: Prosody dùng cert tự ký
