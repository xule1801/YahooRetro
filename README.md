# Zahu!Messenger — MVP

Ứng dụng chat riêng cho nhóm bạn cũ (dưới 100 người) mang phong cách ứng dụng chat cổ điển những năm 2000: cửa sổ danh bạ và cửa sổ chat riêng, tông tím, smiley vàng động, **BUZZ!** rung cửa sổ. Windows trước, máy chủ tự host.

> Zahu!Messenger **không** liên quan và không phải sản phẩm của Yahoo, không dùng tài sản của Yahoo. Tên gần "Yahoo! Messenger" nên cần đánh giá rủi ro nhãn hiệu trước khi phát hành công khai — xem [docs/licenses.md](docs/licenses.md).

## Tính năng (MVP)

- Đăng ký **chỉ bằng mã mời** do quản trị viên cấp, xác minh qua email hoặc số điện thoại (OTP), đặt nick duy nhất. Đổi nick được mà không mất bạn bè hay lịch sử; nick cũ được giữ 30 ngày.
- Kết bạn bằng nick chính xác (mời/chấp nhận/từ chối/hủy), xóa bạn, chặn. Tự tạo nhóm danh bạ.
- Trạng thái Online / Bận / Vắng mặt / **Ẩn** (bạn bè thấy Offline; kiểm soát ở phía server), kèm dòng trạng thái.
- Chat 1-1, lưu tin khi người nhận offline, xác nhận "đã gửi/đã chuyển", gửi lại không tạo bản trùng.
- **Tin tự xóa sau 30 ngày** kể từ khi server nhận (kể cả tin chưa đọc). Backup mã hóa, giữ tối đa 7 ngày.
- **Tin nhắn hoặc BUZZ! đến khi chưa mở cửa sổ chat → cửa sổ chat tự bật lên** (Buzz thì bật lên và rung), nổi trên cùng nhưng không chiếm bàn phím. Cửa sổ đang mở thì rung khi Buzz; đang thu nhỏ thì chỉ thông báo; không xếp hàng; không Buzz được người Offline/Ẩn; giới hạn 1 lần/10 giây.
- 12 smiley vàng động tự vẽ, có chế độ giảm chuyển động.

Ngoài phạm vi MVP: chat nhóm, gọi thoại/video, gửi tệp/ảnh, Audibles, macOS/mobile, đăng nhập Facebook/Zalo.

## Bắt đầu nhanh (máy thử Windows)

Cần có Node.js ≥ 24 và Docker Desktop.

```bash
npm install
cp infra/.env.example infra/.env        # thay mọi "change-me" bằng giá trị ngẫu nhiên — xem docs/operations.md §2
npm run infra:up && npm run db:migrate
npm run api                              # cửa sổ terminal 1
npm run cli -- invite create             # lấy mã mời
npm run client                           # cửa sổ terminal 2 — mở ứng dụng
```

OTP email xem tại http://127.0.0.1:8025 (Mailpit). OTP SMS giả lập xem bằng `npm run cli -- sms-outbox`.

Bản cài Windows: `npm run client:dist` → `apps/windows/dist/ZahuMessenger Setup 0.1.0.exe` (chưa ký số).

## Kiểm thử

Test chạy trên **bộ máy chủ riêng** (`infra/.env.test`, compose project `yahoochat-test`, cổng 5434/5232/5233/1035/8035) vì test xóa dữ liệu. Test **từ chối chạy** nếu trỏ vào môi trường dùng thử.

```bash
cp infra/.env.test.example infra/.env.test   # thay change-me
npm run test:infra:up                      # một lần
npm test                                   # contracts + API (gồm tích hợp với Prosody/PostgreSQL thật) + lõi client
npm run test:e2e -w apps/windows           # hai client đi trọn luồng trên stack thật
npm run test:ui  -w apps/windows           # điều khiển ứng dụng Electron thật
npm run load                               # thử tải 100 tài khoản / 30 kết nối / 2 bản API
```

Kết quả lần chạy cuối: [docs/test-results/README.md](docs/test-results/README.md).

## Cấu trúc

| Thư mục | Nội dung |
|---|---|
| `apps/windows/` | Client Electron: `main/` (cửa sổ, IPC, Buzz), `core/` (logic phiên, test bằng Node), `renderer/` (giao diện) |
| `services/api/` | API Fastify + CLI quản trị + job xóa + backup |
| `packages/contracts/` | Mã lỗi, hằng số, smiley, namespace dùng chung |
| `infra/` | Docker Compose, cấu hình và module Lua của Prosody, khởi tạo role PostgreSQL |
| `tests/load/` | Thử tải |
| `spike/` | Spike Cổng 1 (lưu lại làm bằng chứng, không dùng ở môi trường thật) |
| `docs/` | Quyết định kỹ thuật, contracts, vận hành, bảo mật, giấy phép, kết quả test, ảnh chụp màn hình |

## Tài liệu

- [Sổ tay vận hành](docs/operations.md): cài đặt, cloud/DNS/TLS, mã mời, đổi secret, giám sát, backup/khôi phục, sự cố, cập nhật/rollback, quyền truy cập nội dung.
- [Contracts API/XMPP](docs/contracts.md) · [Kế hoạch kỹ thuật](docs/technical-plan.md) · [ADR 001 nền tảng](docs/decisions/001-chat-platform.md) · [ADR 002 stack và chi phí](docs/decisions/002-stack-and-cost.md)
- [Rà soát bảo mật (tự rà soát)](docs/security-review.md) · [Giấy phép](docs/licenses.md) · [Tiến độ và các quyết định](docs/progress.md)
