# ADR 001 — Chọn nền tảng chat (Cổng 1, Tác vụ 1)

**Trạng thái:** ĐÃ PHÊ DUYỆT 2026-11-19 — phương án A (Prosody 13), spike đạt 6/6 (xem §7).
**Ngày:** 2026-11-19
**Phạm vi bằng chứng:** tài liệu/trang phát hành công khai + spike cục bộ (§7). Bảng §2 giữ nguyên đánh giá ban đầu; kết quả thực đo nằm ở §7.

## 1. Ứng viên và phiên bản tại thời điểm khảo sát

| Ứng viên | Phiên bản thấy được | Giấy phép | Nguồn |
|---|---|---|---|
| **Prosody (XMPP)** | 13.0.4 (công bố 2026-01-25) | MIT | prosody.im/doc/release/13.0.4, Wikipedia "Prosody (software)" |
| ejabberd (XMPP) | 26.07 (công bố, 2026-08-05); 26.09 có trên Fedora Rawhide, chưa thấy thông báo | GPL-2.0-or-later (+ MIT/Apache/BSD cho thành phần) | hex.pm/packages/ejabberd, seclists.org/oss-sec/2026/q3/450 |
| Matrix — Synapse | 1.156.0 (2026-07-07); bên thứ ba ghi nhận 1.161.0 (2026-09) — chưa xác nhận từ nguồn chính thức | AGPL-3.0 (kèm lựa chọn giấy phép thương mại của Element) | github.com/element-hq/synapse |
| Telegram (tham chiếu) | — | Client GPL; server không công khai | Thiết kế §2 |

Phiên bản phải được kiểm tra lại ngay trước khi cài đặt.

## 2. Bảng đối chiếu yêu cầu

Ký hiệu: ✅ có theo tài liệu/chuẩn · ⚠️ được nhưng cần mã bổ sung · ❓ cần spike · ❌ không đáp ứng nguyên bản

| Yêu cầu (thiết kế §3) | Prosody 13 / XMPP | Matrix / Synapse |
|---|---|---|
| Chat 1-1, lưu offline | ✅ RFC 6121 offline storage + XEP-0313 MAM | ✅ DM là phòng 2 người |
| Danh bạ có nhóm | ✅ Roster item có `<group>` (RFC 6121) — gần như đúng mô hình Yahoo | ⚠️ Không có khái niệm danh bạ; phải tự lưu trong account data/dịch vụ |
| Hiện diện chỉ sau kết bạn | ✅ Presence subscription hai chiều là cơ chế lõi | ⚠️ Presence chia sẻ với mọi người cùng phòng; phải kiểm soát bằng cách tạo phòng |
| Chặn kết bạn trực tiếp từ client (server-side) | ⚠️ Cần module Lua chặn stanza `subscribe` / roster-set từ client, chỉ cho dịch vụ ứng dụng tạo | ⚠️ Cần module/chính sách chặn invite |
| Ẩn (bạn thấy Offline) | ❓ Client không phát presence available vẫn kết nối được; cần spike xác minh định tuyến tin và XEP-0186 | ❓ Có trạng thái `offline` tự đặt; cần spike xem có lộ qua `last_active`/typing/read receipt |
| Buzz: sự kiện tạm thời, không xếp hàng | ✅/❓ XEP-0224 *Attention* là chuẩn "buzz"; gửi dạng `type="headline"` — RFC 6121 không lưu offline headline. **Cần spike**: MAM có lưu headline không | ❌ Không có custom ephemeral event cho client trong spec ổn định; to-device message **được xếp hàng** cho thiết bị offline → trái yêu cầu. Buzz phải đi kênh riêng |
| Giới hạn Buzz 1/10s do server thực thi | ⚠️ Module Lua chặn Attention từ client; chỉ dịch vụ ứng dụng phát | ⚠️ Kênh riêng của dịch vụ ứng dụng |
| Hết hạn 30 ngày từ lúc server nhận | ✅/❓ `archive_expires_after = "30d"` (mod_mam). Offline store cần xử lý riêng; "không trả tin quá hạn dù job chưa chạy" cần spike | ⚠️ Synapse có cấu hình `retention`; cần spike về hành vi trả tin trước khi purge |
| ID bất biến, nick đổi được | ⚠️ JID không đổi được → dùng `u<id>@domain`, nick do dịch vụ ứng dụng quản lý | ⚠️ MXID không đổi được → tương tự |
| Xác thực ngoài (dịch vụ ứng dụng cấp phiên) | ❓ Module cộng đồng (auth bằng HTTP/token); cần chọn & spike | ✅ OIDC / JWT login |
| SDK cho client Windows | ✅ `@xmpp/client` (JS, ISC) cho Electron | ✅ `matrix-js-sdk` |
| Tài nguyên vận hành <100 người | ✅ Nhẹ (Lua, SQLite/PostgreSQL) | ⚠️ Nặng hơn (Python, PostgreSQL, worker khi scale) |
| Scale out | ⚠️ Prosody chạy đơn tiến trình; không có cluster lõi → đơn điểm lỗi. ejabberd có cluster nếu cần chuyển | ⚠️ Synapse workers; vẫn một DB |
| Nghĩa vụ giấy phép | MIT — nhẹ nhất | AGPL: sửa server và cung cấp qua mạng → phải công bố mã nguồn phần sửa |

## 3. Telegram (phương án tham chiếu)

Không chọn. Server Telegram không mã nguồn mở để tự host; chat cloud không mặc định E2EE; không kiểm soát được Buzz, danh bạ tùy biến, quy tắc 30 ngày trên client khác. Khớp với thiết kế §2.

## 4. Phát hiện quan trọng cần người dùng quyết định

**Gần như mọi quy tắc nghiệp vụ đều phải tự viết, bất kể nền tảng:** kết bạn qua dịch vụ, Ẩn không rò rỉ, Buzz có rate-limit server, nick, mã mời, hết hạn 30 ngày. Với XMPP/Matrix, các quy tắc đó còn phải viết thêm dưới dạng **plugin bên trong server chat** (Lua cho Prosody), để chặn client đi vòng qua dịch vụ ứng dụng. Nền tảng chỉ thực sự giúp phần định tuyến, lưu offline và lưu trữ.

Vì vậy có hai lựa chọn hợp lý:

- **A. (Theo thiết kế §2, hướng 2) Prosody 13 + dịch vụ ứng dụng + module Lua.** Dùng chuẩn có sẵn (roster nhóm, subscription, XEP-0224, MAM). Đổi lại có hai codebase server (TypeScript + Lua), và cần spike 6 điểm ❓ ở trên.
- **B. (Hướng 3 rút gọn) Một dịch vụ realtime tự viết** (WebSocket + PostgreSQL). Mọi quy tắc nằm ở một chỗ, dễ kiểm thử bằng đồng hồ giả lập. Đổi lại thiết kế đã xếp hướng này sau vì chi phí bảo trì và bảo mật cao hơn, và phải tự lo định tuyến/presence.

**Đề xuất của agent: A (Prosody 13.0.x)**, với điều kiện spike §5 đạt. Nếu spike cho thấy Ẩn hoặc Buzz không thể bảo đảm phía server mà không sửa sâu Prosody, quay lại cổng này và cân nhắc B. Agent **không** tự chuyển sang B, vì như vậy là thay đổi quyết định đã ghi trong thiết kế.

Matrix không được đề xuất vì: Buzz không có kênh tạm thời chuẩn (to-device bị xếp hàng), không có mô hình danh bạ, AGPL, vận hành nặng hơn cho quy mô <100 người.

## 5. Tiêu chí spike

Kịch bản đã soạn ở `spike/prosody/` (xem README ở đó). Tiêu chí đạt:

1. A gửi tin cho B đang offline → B đăng nhập nhận được (offline/MAM).
2. Tin có timestamp server > 30 ngày (dùng cấu hình expiry ngắn, vd. `"60s"`, để mô phỏng) không còn trả về qua MAM.
3. Stanza Attention `type="headline"` gửi khi B offline **không** được giao khi B đăng nhập lại và **không** có trong MAM.
4. B kết nối mà không phát presence available → A (đã subscribe) thấy B unavailable; tin chat gửi tới B vẫn tới được B (qua MAM hoặc định tuyến).
5. Module chặn: client A gửi `subscribe` hoặc Attention trực tiếp → bị từ chối; chỉ JID của dịch vụ ứng dụng được phép.
6. Xác thực bằng token ngắn hạn do dịch vụ ứng dụng cấp.

Điểm nào không đạt: ghi "không đạt" vào ADR này và dừng.

## 6. Ai đọc được nội dung chat

Không có E2EE trong phương án đề xuất. Người có quyền quản trị server/DB/backup đọc được nội dung tin nhắn. Mã hóa chỉ ở mức đường truyền (TLS) và mã hóa ổ đĩa/backup theo khả năng cloud. E2EE (OMEMO) không nằm trong MVP vì xung đột với quy tắc xóa phía server và đa thiết bị. Nếu cần, phải xét ở một cổng riêng.

## 7. Kết quả spike (2026-11-19)

**Môi trường:** Windows 11, Docker 29.7.2, image `prosodyim/prosody:13.0` = *Prosody 13.0 nightly build 103 (2026-11-08, 564ae9db49b8)*. Client test: Node v24.15.0, `@xmpp/client` 0.14.0.
**Lệnh:** `cd spike/prosody && docker compose up -d` rồi `cd spike/client && node spike.mjs`. Đầu ra đầy đủ: `spike/spike-result.txt`.

| # | Tiêu chí | Kết quả | Ghi chú |
|---|---|---|---|
| 1 | Tin offline được giao | ĐẠT | Qua MAM; `mod_offline` đã **tắt**, người gửi không bị trả lỗi |
| 2 | Tin quá hạn không trả dù job chưa chạy | ĐẠT *sau khi sửa* | Lượt 1 **KHÔNG ĐẠT**: `mod_mam` chỉ lọc theo `start` của client, job xóa chạy `module:daily`. Đã thêm hook ép `start ≥ now − TTL` (`plugins/mod_spike_policy.lua`). Mô phỏng TTL = 60 giây |
| 3 | Buzz headline không lưu/không phát lại; online thì tới | ĐẠT | Không có trong MAM |
| 4 | Ẩn: bạn thấy offline, vẫn nhận tin | ĐẠT | Không lộ khi kết nối, không lộ qua probe; tin chỉ tới **qua MAM**, không đẩy realtime |
| 5 | Client không tự subscribe/Attention/roster-set; appsvc tạo bạn hai chiều có nhóm | ĐẠT *sau khi sửa* | Lượt 1 roster-set lọt qua vì hook sai tên sự kiện (lỗi của module spike, đúng là `iq/self/jabber:iq:roster:query`) |
| 6 | Xác thực token HMAC ngắn hạn | ĐẠT | Token sai và token hết hạn đều bị từ chối |

### Giới hạn và việc chuyển sang Cổng 2
- **Ẩn chưa nhận tin realtime:** người dùng Ẩn chỉ thấy tin khi đồng bộ MAM. Ở Tác vụ 3/5 cần cơ chế đẩy (vd. module định tuyến tin `chat` tới phiên đang kết nối nhưng không phát presence), kèm test không lộ trạng thái.
- **Rò rỉ hiện diện chỉ mới thử 2 đường** (presence khi kết nối, probe). Còn phải thử: IQ tới full JID, XEP-0012 Last Activity, vCard/PEP, receipt/chat state khi Ẩn. Giữ `lastactivity` tắt.
- **Xóa vật lý chạy theo ngày:** dữ liệu có thể nằm trên đĩa thêm tối đa khoảng 1 ngày sau hạn (API vẫn không trả). Cần xác nhận mức trễ này với người dùng, hoặc viết job xóa thường xuyên hơn.
- **Phiên bản:** tag `13.0` là bản nightly. Production phải ghim một bản phát hành 13.0.x có checksum.
- **Đơn điểm lỗi:** Prosody một tiến trình. Chấp nhận được cho <100 người; không tuyên bố scale out.
- Token HMAC dùng primitive chuẩn (`util.hashes`), không tự viết mật mã. Secret của spike là giả, không dùng lại.
