# Kết quả kiểm thử — 2026-11-19

**Môi trường:** Windows 11 (10.0.26100), i7-13650HX 20 luồng, 16 GB RAM, Docker Desktop 29.7.2, Node 24.15.0, Electron 43.8.12, PostgreSQL 17 (alpine), Prosody 13.0 nightly build 103. Toàn bộ là dữ liệu giả và chạy cục bộ.

Mọi số liệu dưới đây là **kết quả của lần chạy cuối, sau tất cả bản sửa**. Chỗ nào chưa chạy được thì ghi rõ.

## 1. Tổng hợp

| Bộ test | Lệnh | Kết quả |
|---|---|---|
| Contracts | `npm test -w packages/contracts` | **3/3** |
| API unit + tích hợp (PostgreSQL thật) | `npm test -w services/api` (`vitest run`) | **42/42** (4 tệp, gồm cả các tệp bên dưới) |
| ↳ Tài khoản, mã mời, OTP, nick, khôi phục | `test/accounts.test.ts` | 19/19 |
| ↳ Bạn bè, chặn, nhóm, Buzz | `test/social.test.ts` | 10/10 |
| ↳ Tích hợp **Prosody thật** (presence, Ẩn, Buzz, chặn ở server, chống trùng, hết hạn MAM, purge) | `test/xmpp.int.test.ts` | 10/10 |
| ↳ Backup mã hóa, giữ 7 ngày, khôi phục cách ly + purge | `test/backup.test.ts` | 3/3 |
| Typecheck API | `npm run typecheck` | sạch |
| Lõi client (Buzz, kho tin, hết hạn, cài đặt, TLS) | `npm test -w apps/windows` | **11/11** |
| E2E hai client trên stack thật (Mailpit + SMS giả lập) | `npm run test:e2e -w apps/windows` | **11/11** |
| E2E giao diện Windows (Playwright điều khiển Electron) — bản dev | `npm run test:ui -w apps/windows` | **10/10** |
| E2E giao diện trên **bản exe đã đóng gói** | `YC_UI_EXE=…/dist/win-unpacked/ZahuMessenger.exe npm run test:ui -w apps/windows` | **10/10** |
| Kiểm tra nội dung gói cài | `node apps/windows/scripts/verify-package.cjs` | GÓI HỢP LỆ |
| Thử tải — tải thực tế | `LOAD_LABEL=thuc-te LOAD_GAP_MS=2000 LOAD_MSGS=10 npm run load` | **PASS** ([json](load-thuc-te-2026-11-19.json)) |
| Thử tải — stress | `npm run load` | **PASS về tính đúng**, độ trễ bị suy giảm ([json](load-stress-2026-11-19.json)) |
| Lỗ hổng dependency (production) | `npm audit --omit=dev` | **0** |
| Giấy phép dependency (production) | `node scripts/license-scan.mjs` | 112 gói bên thứ ba, đều MIT/ISC/BSD-3/MIT-0 ([json](../licenses-dependencies.json)) |

## 2. Rủi ro bắt buộc của kế hoạch → bằng chứng

| # | Rủi ro | Test |
|---|---|---|
| 1 | Tranh chấp nick/mã mời | `accounts`: "hai người đổi cùng nick đồng thời", "hai đăng ký đồng thời cùng nick", "hai hoàn tất đồng thời chỉ dùng đúng số lượt", "100 đăng ký đồng thời qua 2 instance"; thử tải: 100 đăng ký đồng thời trên 2 tiến trình API |
| 2 | Buzz đúng lúc chuyển Ẩn/ngắt mạng | `xmpp.int`: "chuyển sang Ẩn rồi Buzz", "Buzz tới Ẩn và offline trả phản hồi giống hệt", "đăng nhập lại không phát lại"; `core.test`: Buzz quá hạn bị bỏ |
| 3 | Tin quá hạn qua API/cache/khôi phục | `xmpp.int`: tin 29 ngày / đúng 30 ngày / 31 ngày chưa nhận; `core.test`: kho tin client; `backup.test`: khôi phục + purge |
| 4 | Mất kết nối/gửi lại không tạo bản sao | `xmpp.int`: "gửi lại cùng origin-id … ack trả cùng id"; thử tải: 0 bản trùng / 600 tin |
| 5 | Thu nhỏ, giảm chuyển động, nhiều phiên | `ui.e2e`: rung khi hiển thị, thu nhỏ chỉ thông báo và không rung bù, giảm chuyển động thì nhấp nháy thay rung. **Nhiều phiên cùng tài khoản:** Prosody giao Buzz cho mọi phiên available, nhưng **chưa có test riêng** |

## 3. Thử tải (2 bản API dùng chung PostgreSQL và Prosody)

| Chỉ số | Thực tế (~13 tin/giây) | Stress (~115 tin/giây) |
|---|---|---|
| Đăng ký (p50 / p95) | 155 / 263 ms | 152 / 338 ms |
| Kết nối XMPP + đồng bộ (p50 / p95) | 207 / 248 ms | 199 / 230 ms |
| Độ trễ tin end-to-end (p50 / p95 / p99) | **8 / 126 / 133 ms** | 1.343 / 2.577 / 2.759 ms |
| Mất / trùng | 0 / 0 trên 300 | 0 / 0 trên 600 |
| Buzz bắn đồng thời vào cả 2 bản API | 1 được nhận, 5 bị `429` | như bên trái |
| Lỗi | 0 | 0 |

**Nút thắt đo được:** Prosody ghi lưu trữ MAM vào PostgreSQL theo kiểu đồng bộ trong một tiến trình. Trên ~100 tin/giây, tin phải xếp hàng. Nhu cầu của nhóm dưới 100 người thấp hơn nhiều so với ngưỡng này. Thêm bản API không giúp gì cho phần chat. **Không tuyên bố scale out cho toàn hệ thống.**

## 4. Lỗi tìm ra và đã sửa trong quá trình kiểm thử

| Lỗi | Phát hiện bởi | Sửa |
|---|---|---|
| `mod_mam` trả tin quá hạn cho tới khi job xóa hằng ngày chạy | Spike Cổng 1 | Hook ép `start ≥ now − TTL` ở mọi truy vấn MAM |
| Module chính sách chặn nhầm presence do chính Prosody sinh ra (probe/broadcast) | `xmpp.int` | Chuyển kiểm tra sang bộ lọc `stanzas/in` của từng phiên c2s |
| Tài khoản appsvc không đăng nhập được (sai chữ ký callback SASL của `@xmpp/client` 0.14) | `xmpp.int` | Truyền thêm tên cơ chế SASL |
| **Deadlock 40P01** khi nhiều người đăng ký đồng thời trên cùng một mã mời | Thử tải (2 tiến trình) | `FOR UPDATE` → `FOR NO KEY UPDATE`. *Test trong tiến trình không tái hiện được lỗi trước khi sửa; bằng chứng là log PostgreSQL và thử tải fail→pass* |
| Sắp xếp tin đang gửi bị `NaN` | `core.test` | Viết lại comparator |
| Electron chạy ở chế độ Node trong terminal VS Code (`ELECTRON_RUN_AS_NODE`) | `ui.e2e` | Script `start.js` gỡ biến này trước khi khởi chạy |
| Lỗ hổng mức High trong `electron` 38 và `nodemailer` 7 | `npm audit` | Nâng lên Electron 43.8.12 và nodemailer 10.6.0, rồi chạy lại toàn bộ test |
| STARTTLS có thể bị hạ cấp; cờ `insecureTls` bị lưu ra đĩa; chưa có giới hạn đăng nhập theo IP | Tự rà soát bảo mật | Bắt buộc `xmpps`; cờ chỉ lấy từ biến môi trường; giới hạn 30 lần sai/15 phút/IP (đều có test) |

## 5. Chưa kiểm thử / ngoài khả năng của agent

- **DPI cao / phóng to Windows** (125–200%): chưa chạy có kiểm soát. Electron tự hỗ trợ DPI theo màn hình, nhưng chưa có bằng chứng.
- **Bộ gõ tiếng Việt (Unikey/Telex) thật:** test chỉ chứng minh văn bản Unicode có dấu đi đúng từ đầu đến cuối. Sự kiện IME composition chưa được thử với bộ gõ thật (mã đã bỏ qua phím Enter khi đang `isComposing`).
- **Thông báo Windows:** test xác nhận ứng dụng *quyết định* thông báo. Việc toast thực sự hiện trên màn hình chưa được quan sát tự động.
- Nhiều phiên cùng một tài khoản: chưa có test riêng (xem mục 2).
- Thử tải trên cloud thật, chứng chỉ TLS thật, SMTP/SMS thật: chưa làm (chưa được phép chi tiền hay triển khai).
- Chưa có rà soát bảo mật **độc lập**. Chỉ có tự rà soát của agent ([security-review.md](../security-review.md)).
