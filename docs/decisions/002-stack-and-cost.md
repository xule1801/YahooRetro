# ADR 002 — Stack kỹ thuật, nhà cung cấp OTP và chi phí (Cổng 1)

**Trạng thái:** ĐỀ XUẤT — chờ phê duyệt. Không tạo tài khoản trả phí, không mua dịch vụ.

## 1. Stack đề xuất

| Thành phần | Đề xuất | Lý do | Giấy phép |
|---|---|---|---|
| Client Windows | **Electron + TypeScript** | Máy phát triển có sẵn Node 24; hỗ trợ nhiều cửa sổ riêng (danh bạ / từng chat), frameless window để dựng giao diện tím cổ điển, rung cửa sổ bằng `setPosition`, `prefers-reduced-motion`, thông báo Windows, bộ gõ tiếng Việt qua Chromium. .NET SDK chưa cài, Tauri cần Rust (chưa cài) | MIT |
| Thư viện XMPP client | `@xmpp/client` | Chạy trong Electron, có WebSocket | ISC |
| Dịch vụ ứng dụng (`services/api`) | **Node.js 24 + TypeScript + Fastify** | Cùng ngôn ngữ với client, dùng chung `packages/contracts` (schema JSON/Zod) | MIT |
| Database | **PostgreSQL 17** | Ràng buộc duy nhất cho nick (`lower(nick)`), giao dịch cho mã mời; Prosody cũng lưu được vào PostgreSQL | PostgreSQL License |
| Server chat | **Prosody 13.0.x** (xem ADR 001) | MIT, nhẹ | MIT |
| Kho chia sẻ khi scale | Redis/Valkey (chỉ khi chạy >1 bản API) | Rate limit, phiên | BSD |
| Test | Vitest (unit/integration), Testcontainers (PostgreSQL + Prosody), Playwright-Electron (E2E Windows), k6 (thử tải) | Kiểm thử được bằng đồng hồ giả lập | MIT/AGPL (k6 chỉ dùng nội bộ, không phân phối) |
| Băm mật khẩu | Argon2id (`argon2` npm, binding tới thư viện tham chiếu) | Không tự viết mật mã | MIT / CC0-Apache |

Nghĩa vụ phân phối client: Electron (MIT) và Chromium (BSD + nhiều giấy phép thành phần) yêu cầu đính kèm thông báo giấy phép trong bản cài. Sẽ sinh tự động bằng công cụ quét giấy phép ở Tác vụ 7.

## 2. Email / SMS OTP

| Kênh | Môi trường dev/test | Môi trường thật (chưa chọn) |
|---|---|---|
| Email | **Mailpit** (container cục bộ, bắt mọi email, không gửi ra ngoài) | Một dịch vụ SMTP giao dịch (vd. Amazon SES, Postmark, Brevo) — cần báo giá |
| SMS | **Fake provider** trong mã: ghi OTP vào hộp thư test nội bộ, không bao giờ log ra console ở môi trường thật | SMS tại Việt Nam thường cần đăng ký brandname. Có thể dùng nhà mạng (vd. dịch vụ SMS brandname của MobiFone) hoặc nhà cung cấp quốc tế — cần báo giá và thủ tục |

Đề xuất MVP: bật **email trước**, còn SMS làm qua interface và chạy bằng fake provider, cho tới khi có phê duyệt nhà cung cấp và chi phí. Thiết kế yêu cầu email **hoặc** số điện thoại; mã và test sẽ phủ cả hai luồng.

## 3. Chi phí

Chưa có báo giá thực, nên agent **không** đưa ra con số. Các hạng mục cần báo giá trước Cổng 3:

| Hạng mục | Quy mô dự kiến | Ghi chú |
|---|---|---|
| Máy chủ | 1 VM ~2 vCPU / 4 GB cho Prosody + API + PostgreSQL ở giai đoạn thử | Tách DB managed khi cần backup tốt hơn |
| Lưu trữ + backup mã hóa | <10 GB; giữ backup tối đa 7 ngày | Cần nhà cung cấp hỗ trợ lifecycle xóa tự động |
| Tên miền + TLS | 1 tên miền; TLS qua Let's Encrypt (miễn phí) | |
| Email giao dịch | <1.000 email/tháng | |
| SMS OTP | Phụ thuộc số đăng ký và tỷ lệ gửi lại | Hạng mục khó dự báo nhất |
| Giám sát | Có thể tự host (Prometheus/Grafana) hoặc gói miễn phí | |

## 4. Các điểm cần quyết định

1. Duyệt Electron + Node/TypeScript + PostgreSQL + Prosody (hoặc chọn phương án B ở ADR 001).
2. Đồng ý MVP bật email trước, SMS dùng fake cho tới khi chọn nhà cung cấp.
3. Có cho phép agent khởi động Docker Desktop trên máy này để chạy spike không.

## Cập nhật sau triển khai (2026-11-19)

- **Đã duyệt** và triển khai đúng stack trên. Phiên bản cuối: Electron **43.8.12** (nâng từ 38 vì advisory mức High), Node 24, Fastify 5, PostgreSQL 17, Prosody 13.0, `@xmpp/client` 0.14, nodemailer 10.6, Argon2id.
- Client viết bằng **JavaScript thuần (ESM)** thay vì TypeScript, để không cần bundler và không phụ thuộc phiên bản Node nhúng trong Electron. API viết bằng TypeScript, chạy trực tiếp bằng type stripping của Node 24 và kiểm kiểu bằng `tsc --noEmit`.
- Testcontainers không được dùng: test tích hợp chạy với `docker compose` của chính dự án (đúng cấu hình sẽ vận hành).
- Thử tải bằng script Node (`tests/load/load.mjs`) thay cho k6 (k6 chưa cài trên máy).
- Chi phí: **vẫn chưa có báo giá thật**. Số liệu tài nguyên đo được, dùng để chọn cấu hình, nằm ở `docs/operations.md` §5 và `docs/test-results/`.
