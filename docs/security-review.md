# Rà soát bảo mật — TỰ RÀ SOÁT của agent (KHÔNG phải kiểm toán độc lập)

Ngày 2026-11-19. Người viết mã cũng là người rà soát, nên dễ có điểm mù chung. Kế hoạch yêu cầu rà soát **độc lập** khi có người đủ năng lực; việc đó chưa được thực hiện.

## Biện pháp đã có (đều có test)

| Lĩnh vực | Biện pháp |
|---|---|
| Đường truyền | API sau reverse proxy HTTPS. XMPP client chỉ dùng TLS trực tiếp (`xmpps`, 5223); client từ chối `xmpp://` và từ chối `http://` tới máy không phải localhost. Prosody đặt `c2s_require_encryption = true`; s2s (liên kết server) bị tắt |
| Mật khẩu | Argon2id (m=19 MiB, t=2, p=1). Tối thiểu 10 ký tự. Đăng nhập với tài khoản không tồn tại vẫn chạy verify trên một hash giả để thời gian phản hồi tương đương |
| Phiên | Token ngẫu nhiên 256 bit, DB chỉ lưu SHA-256. Hạn 30 ngày. Bị thu hồi khi đăng xuất, khôi phục mật khẩu, đổi mật khẩu (các phiên khác) hoặc khóa tài khoản. Client lưu token bằng Windows DPAPI (`safeStorage`), không bao giờ lưu mật khẩu |
| OTP | 6 số từ `crypto.randomInt`, lưu dạng HMAC, hạn 10 phút, tối đa 5 lần thử, gửi tối đa 5 lần/giờ/địa chỉ |
| Liệt kê tài khoản | Phản hồi giống nhau cho đăng nhập sai, khôi phục mật khẩu, đăng ký bằng địa chỉ đã tồn tại, mã mời sai, nick đã có hoặc đang giữ, Buzz tới Ẩn/offline, lời mời bị chặn |
| Giới hạn tần suất (trong DB, đúng khi chạy nhiều bản API) | Đăng nhập: 10 lần sai/15 phút/tài khoản và 30/15 phút/IP. OTP. Buzz 1 lần/10 giây/cặp (upsert nguyên tử) |
| Phân quyền | Mọi thao tác trên bạn bè/nhóm/lời mời đều kiểm chủ sở hữu ở server (trả 404 khi không thuộc quyền). Prosody chặn ở biên: subscribe/probe/directed presence, roster-set, IQ giữa người dùng (chống dò phiên Ẩn), Attention, payload dành riêng, chat với người không phải bạn bè |
| DB | Hai role tách quyền. `yc_app` chỉ có SELECT/DELETE trên archive của Prosody. Mọi câu SQL đều tham số hóa |
| Quản trị | Không có endpoint quản trị qua mạng; chỉ có CLI qua SSH. Mã mời lưu dạng hash và chỉ hiển thị một lần |
| Log | Không ghi body. Che `Authorization` và `Idempotency-Key`. Test xác nhận log không chứa mật khẩu, OTP hay token |
| Client Electron | `contextIsolation`, `sandbox`, `nodeIntegration=false`, CSP `default-src 'self'` (không cho script inline), chặn điều hướng và cửa sổ mới, IPC theo whitelist. Văn bản người dùng hiển thị qua `textContent`; smiley là SVG nội bộ |
| Bí mật | `infra/.env` nằm trong gitignore; không hard-code khóa. Spike dùng secret giả có ghi chú "spike-only" |
| Backup | AES-256-GCM có xác thực (sửa một byte là bị từ chối). Tệp quyền 600. Giữ 7 ngày |
| Dependency | `npm audit --omit=dev`: 0 lỗ hổng. Đã nâng Electron 38→43.8.12 và nodemailer 7→10.6.0 vì có advisory mức High |

## Rủi ro còn lại

| Rủi ro | Mức | Ghi chú / đề xuất |
|---|---|---|
| Không có E2EE: người vận hành đọc được tin | Đã chấp nhận theo thiết kế | Phải thông báo rõ cho người dùng |
| Email/SMS OTP không phải kênh chống chiếm tài khoản mạnh | Trung bình | Thiết kế đã lưu ý. Có thể cân nhắc thêm TOTP sau MVP |
| Token XMPP có hạn 5 phút, dùng lại được trong cửa sổ đó nếu bị lộ | Thấp | Chỉ lộ được khi TLS bị phá |
| Rate limit theo IP phụ thuộc `YC_TRUST_PROXY` được cấu hình đúng sau proxy | Thấp | Xem sổ tay vận hành §5 |
| Chống trùng tin của Prosody chỉ nằm trong RAM | Thấp | Khởi động lại Prosody đúng lúc client gửi lại có thể tạo 1 bản trùng |
| 6 advisory mức Moderate trong `minimatch` (thông qua electron-builder) | Thấp | Chỉ là công cụ build, không nằm trong bản phát hành. Bản fix của npm đòi hạ cấp electron-builder |
| Bản cài chưa ký số (code signing) | Trung bình | Windows SmartScreen sẽ cảnh báo. Cần chứng chỉ ký mã (tốn phí, chưa được duyệt) |
| Prosody 13.0 dùng image nightly | Trung bình | Phải ghim một bản phát hành 13.0.x theo digest trước khi lên môi trường thật |
| Tài khoản bị khóa vẫn có thể nằm trong roster của người khác | Thấp | Họ thấy tài khoản đó offline. Tài khoản bị khóa không xin được token XMPP mới (vẫn còn token hợp lệ tối đa 5 phút, nhưng phiên đã bị ngắt) |

## Rà soát 2026-11-20: kẻ gian có lợi dụng app để xâm nhập máy tính được không?

Phương pháp: rà mã tĩnh theo danh sách kiểm tra bảo mật chính thức của Electron, cộng các **bài test tấn công chạy trên app thật**: `apps/windows/test/security.e2e.test.js` (bản dev) và `apps/windows/test/fuses.test.js` (exe đã đóng gói). Công cụ quét bên ngoài (Electronegativity) **không chạy được** vì môi trường của agent chặn tải công cụ bên thứ ba.

| # | Đường tấn công | Trước khi sửa | Sau khi sửa | Bằng chứng |
|---|---|---|---|---|
| 1 | Bạn bè độc hại gửi tin nhắn/dòng trạng thái chứa HTML/JS (`<img onerror>`, `<script>`, `<svg onload>`, `<iframe javascript:>`, `<a href=javascript:>`, ký tự đảo chiều RTL) | **An toàn**: chỉ hiện dạng chữ, không thực thi | — | security.e2e #1 |
| 2 | Mã trong cửa sổ truy cập Node/hệ điều hành (`require`, `process`) | **An toàn**: sandbox + contextIsolation, preload chỉ mở `call/app/on` | — | security.e2e #2 |
| 3 | Gọi lệnh nội bộ qua IPC ngoài danh sách cho phép | **An toàn**: whitelist | — | security.e2e #3 |
| 4 | `window.open("https://…/mã-độc.exe")` → mở trình duyệt hệ thống | **Lỗ hổng**: app chuyển URL cho `shell.openExternal` | Chặn mọi cửa sổ mới, điều hướng, redirect và `<webview>` cho **mọi** webContents; bỏ hẳn `openExternal` | security.e2e #4 |
| 5 | Trang xin quyền camera/micro/vị trí/clipboard/thông báo | **Lỗ hổng**: Electron mặc định tự đồng ý | Từ chối mọi yêu cầu quyền (`setPermissionRequestHandler`/`CheckHandler`) | security.e2e #5 |
| 6 | Dùng `ZahuMessenger.exe` làm trình chạy JavaScript tùy ý (`ELECTRON_RUN_AS_NODE=1`, kỹ thuật "LOLBin") | **Lỗ hổng, đã tái hiện thật** | Fuse: tắt `RunAsNode`, `NODE_OPTIONS`, tham số `--inspect` | fuses #1, #2 |
| 7 | Nạp mã độc qua `NODE_OPTIONS=--require` | An toàn (Electron đã chặn sẵn) | Fuse tắt hẳn | fuses #3 |
| 8 | Sửa lén mã của app trong `app.asar` (cấy mã độc vào app đã cài) | Không phát hiện được | Fuse: chỉ nạp từ asar + **kiểm tra toàn vẹn**: app bị sửa 1 byte sẽ từ chối chạy | fuses #5 |
| 9 | Lối tắt dùng thử (bỏ kiểm tra chứng chỉ) bị trỏ sang máy chủ thật → có thể bị giả mạo máy chủ | Lỗ hổng cấu hình | Chế độ này **chỉ** chấp nhận máy chủ ở 127.0.0.1/localhost | core.test |
| 10 | Truy cập dịch vụ của hệ thống từ máy khác trong mạng LAN | **An toàn**: mọi cổng (API, Prosody, PostgreSQL, Mailpit) chỉ nghe `127.0.0.1` | — | `netstat` |
| 11 | Lỗ hổng đã biết trong thư viện | `npm audit --omit=dev`: 0 | — | — |

**Rủi ro còn lại / khuyến nghị**
- **Bản cài chưa ký số:** kẻ gian có thể phát tán một bản cài giả mạo trông giống hệt. Nên mua chứng chỉ ký mã. Trước mắt, chỉ phát bản cài qua kênh tin cậy và kèm mã SHA-256 để đối chiếu.
- **Chưa có tự động cập nhật:** bản vá bảo mật của Electron/Chromium chỉ tới máy người dùng khi họ cài lại. Electron 43 sẽ hết được hỗ trợ khi có bản 46 → cần lịch nâng cấp.
- **Trang trong app được nạp qua `file://`.** Đây là cách được phép, nhưng dùng giao thức riêng (`app://`) sẽ chặt hơn nữa. Chưa làm.
- **Chỉ ở môi trường dùng thử:** một website độc hại mở trong trình duyệt trên *cùng máy* về lý thuyết có thể gửi yêu cầu tới `127.0.0.1:8090`/`8025` (DNS rebinding). API không dùng cookie nên không mạo danh được người dùng, nhưng giao diện Mailpit (chứa OTP thử nghiệm) không có mật khẩu. Không áp dụng cho môi trường thật (không có Mailpit).
- Từ khi tắt cờ `--inspect`, test giao diện tự động (Playwright) **chỉ chạy trên bản dev**. Bản exe được kiểm bằng `npm run test:exe -w apps/windows` (fuse, chặn LOLBin, chống sửa mã, khởi động bình thường).
- Đây vẫn là **tự rà soát**, chưa phải kiểm toán độc lập.
