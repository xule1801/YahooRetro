# Sổ tiến độ — kế hoạch `Hướng dẫn/ke-hoach-trien-khai-chat-ott.md`

Spec: `Hướng dẫn/thiet-ke-chat-ott-hoai-niem.md`. Kế hoạch kỹ thuật của repo: `docs/technical-plan.md`.

## Phê duyệt của người dùng (2026-11-19)
- Nền tảng **Prosody 13**; stack **Electron + Node 24/TypeScript (Fastify) + PostgreSQL 17**; agent được phép chạy Docker cục bộ.
- Chấp nhận mọi mặc định đề xuất: mã mời 1 lượt/7 ngày; nick 3–32 ký tự, giữ nick cũ 30 ngày; Buzz 1 lần/10 giây, TTL 5 giây; 12 smiley; status 140 ký tự; email trước, SMS dùng giả lập.
- Yêu cầu "tự động tiếp tục đến khi hoàn thành bàn giao sản phẩm cuối cùng".

## Cổng 1 — Tác vụ 1: complete
Bảng so sánh có nguồn (ADR 001), spike Prosody đạt 6/6 (2 điểm đạt sau khi sửa), stack và OTP (ADR 002), contracts.

## Cổng 2
- **Tác vụ 2** (tài khoản, mã mời, OTP, nick, khôi phục): complete. `accounts.test.ts` 19/19.
- **Tác vụ 3** (bạn bè, nhóm, chặn, trạng thái): complete. `social.test.ts` + `xmpp.int.test.ts`.
- **Tác vụ 4** (Buzz, smiley): complete. API + Prosody + UI (rung, thu nhỏ, giảm chuyển động).
- **Tác vụ 5** (chat, hết hạn, backup/khôi phục): complete. MAM lọc ở lớp đọc, purge, `backup.test.ts`.
- **Tác vụ 6** (client Windows): complete. E2E hai client 11/11, UI 10/10 trên cả bản dev lẫn exe đã đóng gói.

## Cổng 3 — Tác vụ 7: complete (trong giới hạn không triển khai và không chi tiền)
Tài liệu vận hành, tự rà soát bảo mật, quét lỗ hổng và giấy phép, thử tải (thực tế + stress, 2 bản API). Báo giá cloud/SMS **chưa có** (cần người dùng duyệt nhà cung cấp). **Chưa** triển khai cloud, **chưa** phát hành bản cài. Rà soát cuối là **tự rà soát** (không có reviewer độc lập).

## Ruling (quyết định agent tự đưa ra)
- Ruling: Thư mục dự án = `YahooChat` hiện tại — nếu sai: di chuyển cả repo.
- Ruling: Không `git init`/commit vì người dùng chưa yêu cầu — nếu sai: chạy `git init` và commit một lần.
- Ruling: Tắt `mod_offline`, chỉ dùng MAM làm kho tin offline, để quy tắc 30 ngày áp dụng ở một chỗ — nếu sai: client XMPP bên thứ ba không có MAM sẽ không nhận được tin offline (MVP chỉ có client của dự án).
- Ruling: Prosody lưu dữ liệu vào cùng PostgreSQL (role riêng) → một bản backup, một job xóa — nếu sai: phải tách DB khi scale.
- Ruling: Một token phiên opaque 30 ngày thay vì access + refresh token — nếu sai: thêm refresh token sau, không phá vỡ API.
- Ruling: Presence đi qua XMPP; sự kiện realtime dùng headline XMPP thay vì WebSocket riêng — nếu sai: thêm kênh WS.
- Ruling: Quản trị chỉ qua CLI/SSH, không có endpoint quản trị qua mạng — nếu sai: cần làm giao diện quản trị có MFA.
- Ruling: Lời mời gửi tới người đã chặn mình vẫn trả 201 nhưng bị ẩn với người nhận (không lộ việc chặn); lịch sử chat sau khi chặn giữ tới khi hết hạn 30 ngày — nếu sai: đổi chính sách xóa lịch sử khi chặn.
- ~~Ruling: Buzz tới bạn chưa mở cửa sổ chat chỉ hiện thông báo~~ — **Thay ngày 2026-11-20 theo yêu cầu chủ dự án:** tin nhắn đến trực tiếp hoặc Buzz khi chưa mở cửa sổ chat → cửa sổ tự bật lên nổi trên cùng, không lấy focus bàn phím; Buzz thì rung. Cửa sổ thu nhỏ giữ đúng thiết kế §3.5 (chỉ thông báo). Có tùy chọn tắt "Tự mở cửa sổ chat". Tin từ đồng bộ lịch sử không bật cửa sổ.
- Sự cố 2026-11-20: bộ test dùng chung database với máy chủ dùng thử nên `npm test` đã xóa 2 tài khoản dùng thử của chủ dự án. Đã sửa: test chạy trên bộ máy chủ riêng (`infra/.env.test`, project `yahoochat-test`), có chốt chặn `YC_TEST_STACK=1`; đã kiểm chứng DB dùng thử không đổi sau toàn bộ test.
- Lỗi tìm thấy 2026-11-20 (test `session.e2e`): nút Đăng xuất làm thoát app (đóng hết cửa sổ trước khi mở màn hình đăng nhập) và để lõi chat rỗng. Đã sửa.
- Ruling: Client không ghi lịch sử ra đĩa (chỉ trong bộ nhớ, đồng bộ lại từ MAM khi đăng nhập) — nếu sai: không xem được lịch sử khi offline.
- Ruling: Mật khẩu tối thiểu 10 ký tự (thiết kế chưa quy định) — nếu sai: chỉnh một hằng số.
- Ruling: Tên hiển thị tạm "Hoài Niệm Chat" thay cho "YahooChat" để tránh dùng thương hiệu Yahoo (thiết kế §4). **Đã được thay ngày 2026-11-20:** chủ dự án chốt tên **"Zahu!Messenger"** (tệp cài `ZahuMessenger`). Rủi ro gần nhãn hiệu "Yahoo! Messenger" đã ghi ở `docs/licenses.md`.
- Ruling: Client bắt buộc `xmpps://` (TLS trực tiếp, 5223), không chấp nhận STARTTLS — nếu sai: không có (biện pháp bảo mật).
- Ruling: Sửa deadlock bằng `FOR NO KEY UPDATE`; test hồi quy trong tiến trình không tái hiện được lỗi, nên bằng chứng là thử tải với 2 tiến trình — nếu sai: deadlock vẫn có thể xuất hiện ở điều kiện khác; giám sát lỗi 500.
- Ruling: Nâng Electron 38→43.8.12 và nodemailer 7→10.6.0 do advisory mức High (chọn nhánh 43, bản vá mới nhất của nhánh ổn định) — nếu sai: đổi sang nhánh 44/45.
- Ruling: Chấp nhận 6 advisory mức Moderate trong `minimatch` (công cụ build, không phân phối) — nếu sai: chờ electron-builder phát hành bản vá.
- Ruling: Không dùng subagent reviewer vì người dùng không yêu cầu; rà soát cuối là tự rà soát — nếu sai: chạy `/code-review` hoặc rà soát độc lập.

## Việc còn mở (cần người dùng quyết định)
1. ~~Tên sản phẩm chính thức~~ — đã chốt "Zahu!Messenger" (2026-11-20); còn cần đánh giá rủi ro nhãn hiệu (xem licenses.md).
2. Nhà cung cấp cloud, tên miền, SMTP, SMS (cần báo giá thật; agent không tạo tài khoản trả phí).
3. Chính sách xóa tài khoản (chưa triển khai).
4. Chứng chỉ ký mã cho bản cài Windows.
5. Ghim bản phát hành Prosody 13.0.x theo digest.
6. Rà soát bảo mật độc lập; thử tải trên máy chủ thật.
7. Cho phép phát hành bản cài nội bộ và gửi mã mời thật.
