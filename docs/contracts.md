# Contracts v1 (đã triển khai)

Nguồn sự thật cho mã lỗi, hằng số, namespace: [`packages/contracts/index.js`](../packages/contracts/index.js). Tài liệu này mô tả đúng những gì mã đang làm (cập nhật 2026-11-19). Các khác biệt so với bản nháp ở Cổng 1 được ghi ở cuối.

## 1. Quy ước chung

- REST JSON, tiền tố `/v1`. API chỉ nghe `127.0.0.1` theo mặc định. Môi trường thật đặt sau reverse proxy TLS (`https://`).
- Thời gian: ISO-8601 UTC, do **server** gán.
- Định danh: `userId` là UUID nội bộ, bất biến. JID XMPP = `u<uuid bỏ gạch>@<domain>`, không hiển thị cho người dùng. `nick` chỉ dùng để tìm và hiển thị.
- Xác thực REST: `Authorization: Bearer <token>`. Token phiên ngẫu nhiên 256 bit, DB chỉ lưu SHA-256 của token. Hạn 30 ngày, bị thu hồi khi đăng xuất, đặt lại mật khẩu hoặc khóa tài khoản.
- Xác thực XMPP: `POST /v1/xmpp/token` trả token HMAC-SHA256 hạn 5 phút. Prosody kiểm tra token qua `mod_auth_appsvc`.
- **Client luôn kết nối XMPP bằng TLS trực tiếp (`xmpps://…:5223`).** Client từ chối `xmpp://` (STARTTLS) và `http://` tới máy không phải localhost, trừ khi chạy chế độ dev (`YC_DEV_INSECURE_TLS=1`).
- Idempotency: `POST /v1/friend-requests` và `POST /v1/buzz` nhận header `Idempotency-Key`. Lặp lại cùng key thì trả nguyên kết quả thành công lần trước (lưu 24 giờ).
- Lỗi: `{ "error": { "code", "message", "retryAfterSec"? } }`. Lỗi `429` có kèm header `Retry-After`.

## 2. Mã lỗi

| Code | HTTP | Ý nghĩa |
|---|---|---|
| `INVALID_INPUT` | 400 | Sai schema / mật khẩu < 10 ký tự / số điện thoại hoặc email sai định dạng |
| `UNAUTHENTICATED` | 401 | Thiếu/hết hạn phiên; sai thông tin đăng nhập (một phản hồi chung, không lộ tài khoản có tồn tại) |
| `NOT_FOUND` | 404 | Không tồn tại hoặc không thuộc quyền của bạn (không phân biệt hai trường hợp) |
| `INVITE_INVALID` | 400 | Mã mời sai, hết hạn, đã dùng hết hoặc đã bị thu hồi (một mã chung) |
| `VERIFICATION_FAILED` | 400 | OTP sai, hết hạn hoặc vượt số lần thử |
| `NICK_INVALID` | 400 | Không khớp `^[A-Za-z0-9_]{3,32}$` |
| `NICK_UNAVAILABLE` | 409 | Đã có người dùng, đang trong thời gian giữ 30 ngày, hoặc nick dành riêng |
| `CONFLICT` | 409 | Đã là bạn / đang chặn người đó / trùng tên nhóm |
| `RATE_LIMITED` | 429 | OTP (5/giờ/địa chỉ), đăng nhập (10 lần sai/15 phút/tài khoản, 30/15 phút/IP), Buzz (1/10 giây/cặp) |
| `RECIPIENT_UNAVAILABLE` | 409 | Buzz: người nhận Offline, Ẩn hoặc không xác nhận được việc chuyển. **Body giống hệt nhau** ở cả ba trường hợp |
| `NOT_FRIENDS` | 403 | Buzz/chat với người không phải bạn bè. Cũng dùng khi đã bị chặn, để không lộ việc chặn |

## 3. Endpoint REST

| Phương thức + đường dẫn | Mô tả |
|---|---|
| `POST /v1/registration/start` `{inviteCode, channel: email\|phone, address}` | → `202 {registrationId}`. Kiểm tra mã mời nhưng **không** tiêu thụ lượt. Nếu địa chỉ đã có tài khoản: phản hồi vẫn y hệt, nhưng gửi thông báo thay vì OTP |
| `POST /v1/registration/verify` `{registrationId, otp}` | → `{verificationToken}` (OTP 6 số, hạn 10 phút, tối đa 5 lần thử) |
| `POST /v1/registration/complete` `{verificationToken, password, nick}` | → `201 {userId, nick, token, expiresAt}`. Chạy trong một giao dịch: khóa mã mời (`FOR NO KEY UPDATE`), tăng lượt dùng, tạo user, nhận nick, tạo nhóm mặc định "Bạn bè" |
| `POST /v1/auth/login` `{identifier: nick\|email\|phone, password}` | → `{userId, nick, token, expiresAt}` |
| `POST /v1/auth/logout` | → `204` |
| `POST /v1/auth/recovery/start` `{address}` | → luôn `202 {recoveryId}` |
| `POST /v1/auth/recovery/complete` `{recoveryId, otp, newPassword}` | → `204`. Thu hồi mọi phiên và ngắt mọi kết nối XMPP |
| `GET /v1/me` | → `{userId, nick, jid, channel}` |
| `PUT /v1/me/password` `{currentPassword, newPassword}` | → `204`, thu hồi các phiên khác |
| `PUT /v1/me/nick` `{nick}` | → `{userId, nick}`. Nick cũ được giữ 30 ngày (chủ cũ vẫn lấy lại được). Bạn bè nhận sự kiện `nick.changed` |
| `GET /v1/users/lookup?nick=` | → `{userId, nick}` hoặc `404`. So khớp chính xác, không phân biệt hoa/thường. Không trả trạng thái |
| `POST /v1/xmpp/token` | → `{jid, username, domain, service: "xmpps://…", token, expiresAt}` |
| `POST /v1/friend-requests` `{toUserId}` | → `201 {requestId, status: pending\|accepted}`. Nếu hai bên mời nhau thì tự thành bạn. Nếu người nhận đang chặn người gửi: phản hồi như bình thường, nhưng lời mời bị ẩn với người nhận |
| `GET /v1/friend-requests?direction=in\|out` | → `{requests: [{requestId, userId, nick, createdAt}]}` |
| `POST /v1/friend-requests/:id/accept\|decline\|cancel` | → `204`. Chỉ người nhận được accept/decline, chỉ người gửi được cancel; trường hợp khác trả `404` |
| `DELETE /v1/friends/:userId` | → `204`, gỡ liên kết hai chiều |
| `POST /v1/blocks` `{userId}` / `DELETE /v1/blocks/:userId` / `GET /v1/blocks` | Chặn: gỡ bạn, hủy lời mời mình đã gửi, ẩn lời mời từ người bị chặn |
| `GET /v1/contacts` | → `{groups: [{groupId, name, isDefault, contacts: [{userId, nick, jid}]}]}`. Hiện diện lấy qua XMPP, không qua REST |
| `POST /v1/groups` `{name}` / `PATCH /v1/groups/:id` / `DELETE /v1/groups/:id` | Nhóm của riêng mỗi người. Xóa nhóm thì bạn bè trong nhóm chuyển về nhóm mặc định; không xóa được nhóm mặc định |
| `PUT /v1/contacts/:userId/group` `{groupId}` | Chuyển một bạn sang nhóm khác |
| `POST /v1/buzz` `{toUserId}` | → `202 {buzzId, expiresAt}` (hạn 5 giây) \| `409 RECIPIENT_UNAVAILABLE` \| `429` \| `403 NOT_FRIENDS`. Không xếp hàng, không phát lại |
| `GET /healthz` | → `{ok, lastPurge, xmppOutboxPending}` |

Quản trị (mã mời, khóa tài khoản, purge, backup) **chỉ có qua CLI trên máy chủ**, không có endpoint mạng. Xem `docs/operations.md`.

## 4. XMPP (client ↔ Prosody)

| Stanza | Ý nghĩa |
|---|---|
| `<presence>` không có `to`, có thể kèm `<show>dnd\|away</show>` và `<status>` (server cắt ở 140 ký tự) | Online/Bận/Vắng mặt. **Ẩn = không phát presence** (hoặc gửi `unavailable`) mà vẫn giữ kết nối |
| `<message type="chat" id=X><body/><origin-id xmlns="urn:xmpp:sid:0" id=X/><request xmlns="urn:xmpp:receipts"/></message>` | Tin nhắn. Bắt buộc có `origin-id` (khóa chống trùng). Chỉ gửi được cho bạn bè (roster `both`) |
| `<message type="headline" from=host><stored xmlns="urn:yahoochat:ack" origin-id id ts/></message>` | Server xác nhận **đã lưu**, kèm giờ server. Gửi lại cùng `origin-id` thì server trả lại đúng ack cũ, không lưu thêm |
| `<received xmlns="urn:xmpp:receipts" id=X/>` | Người nhận xác nhận **đã chuyển**. Client đang Ẩn không gửi receipt |
| `<message type="headline"><attention xmlns="urn:xmpp:attention:0"/><buzz xmlns="urn:yahoochat:buzz" id expires/></message>` | Buzz (chỉ appsvc gửi được). Client bỏ qua nếu đã quá `expires` |
| `<message type="headline" from=host><event xmlns="urn:yahoochat:event" type=…/></message>` | Sự kiện: `friend.request`, `friend.accepted`, `friend.removed`, `contacts.changed`, `nick.changed` |
| MAM (XEP-0313) | Lịch sử. Server ép `start ≥ now − 30 ngày` ở mọi truy vấn |

Phía server chặn từ client: subscribe/probe/directed presence, roster-set, IQ tới người dùng khác, Attention, payload dành riêng (`event`/`stored`/`buzz`), message không phải `chat`, và chat tới người không phải bạn bè.

## 5. Thay đổi so với bản nháp Cổng 1

| Bản nháp | Đã triển khai | Lý do |
|---|---|---|
| Access token 15 phút + refresh token | Một token phiên 30 ngày, opaque, thu hồi được | Đơn giản hơn và vẫn thu hồi được ngay (kiểm tra DB ở mỗi request). Quy mô <100 người |
| `PUT /v1/me/presence` qua REST | Presence qua XMPP | Prosody đã phân phối presence theo quan hệ bạn bè; tránh có hai nguồn sự thật |
| WebSocket `/v1/events` | Headline XMPP `urn:yahoochat:event` | Dùng chung kết nối đã có, không lưu và không xếp hàng |
| Endpoint `/v1/admin/*` | CLI trên máy chủ | Không mở bề mặt quản trị ra Internet. Truy cập shell/SSH đóng vai trò xác thực mạnh |
| `xmpp://` (STARTTLS) cho client | `xmpps://` cổng 5223 | Chống tấn công hạ cấp STARTTLS (rà soát bảo mật) |
