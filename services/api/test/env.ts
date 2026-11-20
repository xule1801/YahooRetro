import { existsSync } from "node:fs";
const envFile = new URL("../../../infra/.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);
process.env.YC_DEV_INSECURE_TLS = "1";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // chỉ test local: Prosody dùng cert tự ký
