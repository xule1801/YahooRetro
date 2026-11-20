# Kế hoạch kỹ thuật của repo (sau Cổng 1)

Bổ sung cho `Hướng dẫn/ke-hoach-trien-khai-chat-ott.md`. Chỉ dùng các API Prosody đã kiểm chứng trong spike (ADR 001 §7).

## Kiến trúc chốt

```
 Electron client ──REST/HTTPS──▶ services/api (Fastify, Node 24, TS) ──SQL──▶ PostgreSQL 17
        │                                   │ (XMPP, tài khoản "appsvc")          ▲
        └──────XMPP (TLS 5222)──────▶ Prosody 13 + module yc_policy ──SQL (storage)──┘
```

- **Một database** (PostgreSQL): schema `app` của API + bảng `prosody*` do Prosody tạo (`storage = "sql"`). Một bản backup, một job xóa.
- **Prosody chỉ định tuyến/lưu MAM.** Mọi quy tắc nghiệp vụ nằm ở API; module Lua `mod_yc_policy` chỉ thực thi quyền ở biên:
  - chặn client tự subscribe / roster-set / Attention; chặn `chat` giữa hai người không phải bạn (roster `both`);
  - IQ `urn:yahoochat:appsvc` (chỉ appsvc): `friend-add`, `friend-remove`, `buzz` (giao tới phiên đang **available**, trả số phiên nhận), `notify` (sự kiện tới user);
  - ép `start ≥ now − TTL` cho mọi truy vấn MAM; chống trùng theo `origin-id` và trả ack `stored`;
  - chuyển tin `chat` tới phiên Ẩn (kết nối nhưng không phát presence) mà không lộ trạng thái.
- **Xác thực XMPP:** `mod_auth_appsvc`: token HMAC-SHA256 5 phút do API cấp, localpart = `u` + userId không gạch.
- **Sự kiện realtime API → client:** stanza headline `<event xmlns="urn:yahoochat:event">` do appsvc gửi qua module (không lưu, không xếp hàng). Client luôn gọi lại REST khi đăng nhập.
- **Quản trị:** chỉ qua CLI trên máy chủ (`npm run cli`). Truy cập shell/SSH là lớp xác thực mạnh; không mở endpoint quản trị ra Internet trong MVP.

## Cấu trúc tệp

| Đường dẫn | Nội dung |
|---|---|
| `package.json` | npm workspaces, lệnh gốc |
| `packages/contracts/` | mã lỗi, hằng số cấu hình, kiểu sự kiện (JS + `.d.ts`), dùng chung |
| `services/api/src/` | `server.ts`, `config.ts`, `db.ts`, `migrations/*.sql`, `modules/{auth,invites,nick,friends,groups,presence,buzz,messages}.ts`, `xmpp-appsvc.ts`, `otp/{email,sms-fake}.ts`, `jobs/purge.ts`, `cli.ts`, `backup.ts` |
| `services/api/test/` | Vitest unit + integration (DB thật, Prosody thật) |
| `apps/windows/` | Electron: `main/` (cửa sổ, XMPP, IPC), `renderer/` (HTML/CSS/JS danh bạ + chat), `core/` (logic thuần, test được bằng Node), `assets/smileys/` |
| `infra/` | `docker-compose.yml` (postgres, prosody, mailpit), `prosody/` (cfg + plugins), `.env.example` |
| `tests/load/` | thử tải 100 tài khoản / 30 kết nối |
| `docs/` | ADR, contracts, vận hành, kết quả kiểm thử |

## Lệnh

| Mục đích | Lệnh |
|---|---|
| Cài | `npm install` |
| Bật hạ tầng local | `npm run infra:up` (= `docker compose -f infra/docker-compose.yml up -d`) |
| Migration | `npm run db:migrate` |
| Chạy API | `npm run api` |
| Test API (unit + integration) | `npm test` |
| Typecheck | `npm run typecheck` |
| Client dev | `npm run client` |
| Đóng gói Windows | `npm run client:dist` |
| Thử tải | `npm run load` |

TypeScript của API chạy trực tiếp bằng **type stripping có sẵn của Node 24** (không cần bundler). `tsc --noEmit` dùng để kiểm kiểu. Client Electron viết JS thuần (ESM/CommonJS) để không phụ thuộc phiên bản Node nhúng trong Electron.
