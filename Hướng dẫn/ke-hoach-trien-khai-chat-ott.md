# Kế hoạch triển khai ứng dụng chat hoài niệm

> **Dành cho agent thực thi:** Đọc toàn bộ tài liệu thiết kế và kế hoạch này trước khi làm. Dùng kỹ năng `executing-plans` hoặc `subagent-driven-development` nếu thực sự có trong môi trường; không giả định có agent triển khai độc lập. Đánh dấu từng ô khi có bằng chứng kiểm thử. Không triển khai chỉ vì có kế hoạch: chờ người dùng xác nhận thực thi.

**Mục tiêu:** Xây MVP chat Windows cho nhóm bạn dưới 100 người, mang trải nghiệm Yahoo Messenger cổ điển, dùng máy chủ chat nguồn mở riêng trên cloud.

**Kiến trúc:** Client Windows + dịch vụ ứng dụng kiểm soát tài khoản, bạn bè, nick và Buzz + nền tảng chat tự host đã kiểm chứng. Định danh nội bộ bất biến, nick có thể đổi; API thực thi quyền riêng tư. Chọn nền tảng và công nghệ tại cổng 1, không giả vờ đã xác minh.

**Công nghệ:** Chưa chốt; ưu tiên stack có SDK Windows, tài liệu và kiểm thử tốt. Cổng 1 bắt buộc chọn phiên bản cụ thể trước khi viết mã sản phẩm.

**Thiết kế:** `OUTPUTS/thiet-ke-chat-ott-hoai-niem.md`.

## Ràng buộc và điểm dừng

- Windows trước; chat một-một, không chat nhóm; nhóm chỉ để phân loại danh bạ. Không thêm gọi, tệp, ảnh, Audibles hay Facebook/Zalo vào MVP.
- Quản trị viên tạo mã mời; đăng ký bằng email hoặc số điện thoại xác minh; nick duy nhất có thể đổi mà không thay đổi ID nội bộ.
- Lưu tin 30 ngày tính từ thời điểm server nhận gửi, kể cả tin chưa nhận; bản sao lưu có thể còn tối đa 7 ngày sau thời hạn đó. Không trả tin quá hạn, kể cả sau khôi phục.
- Ẩn trông như offline; không Buzz được và không tiết lộ trạng thái; Buzz offline không xếp hàng. Tin nhắn offline được lưu đến khi nhận hoặc hết hạn.
- Tài sản Yahoo chỉ là ảnh tham chiếu, không mặc định được phép sao chép. Không phát hành logo, âm thanh, icon gốc khi chưa có quyền; lưu nguồn, giấy phép và bằng chứng quyền dùng.
- Không mua SMS/cloud, đưa dữ liệu cá nhân lên dịch vụ, triển khai công khai, gửi lời mời thật hoặc phát hành nếu chưa được cho phép riêng. Các giá trị đề xuất trong thiết kế chưa phải quyết định của người dùng.
- Cần xác nhận thiết kế và các mặc định còn mở trước khi triển khai. Nếu lựa chọn nền tảng làm thay đổi hành vi đã chốt, dừng xin quyết định thay vì âm thầm thay đổi.

## Các rủi ro bắt buộc kiểm thử

1. Nick/mã mời tranh chấp đồng thời không tạo hai tài khoản có cùng nick hoặc dùng vượt hạn mức (Tác vụ 2).
2. Sự kiện Buzz đến cùng lúc người nhận chuyển Ẩn/ngắt mạng không làm lộ trạng thái, không phát sau (Tác vụ 4).
3. Tin quá hạn không xuất hiện qua API, cache hoặc bản khôi phục (Tác vụ 5).
4. Mất kết nối và gửi lại không tạo bản sao tin hoặc mất tin đã xác nhận lưu (Tác vụ 5).
5. Windows thu nhỏ, mất focus, chạy nhiều phiên và giảm chuyển động không gây rung sai hoặc vi phạm quyền riêng tư (Tác vụ 4, 6).

## Cấu trúc dự kiến của dự án mới

Chưa có repository sản phẩm được chỉ định. Khi được phép triển khai, hỏi/chốt thư mục dự án nếu cần; không ghi vào repo khác. Các đường dẫn dưới đây là cấu trúc mục tiêu, tên tệp cụ thể phụ thuộc stack đã chọn:

- `apps/windows/`: client Windows, màn hình, trạng thái và xử lý cửa sổ.
- `services/api/`: đăng ký, xác thực, mã mời, nick, bạn bè, nhóm, phân quyền và Buzz.
- `services/chat-adapter/`: lớp tích hợp SDK/protocol chat đã chọn; tách để tránh lộ chi tiết nền tảng ra UI.
- `packages/contracts/`: schema phiên bản hóa của API, sự kiện và lỗi, dùng chung client/server.
- `infra/`: cấu hình local và cloud, migration, giám sát và backup không chứa secret.
- `tests/`: unit, integration, Windows end-to-end, thử tải và phục hồi.
- `docs/`: quyết định kỹ thuật, giấy phép, vận hành và kết quả kiểm thử.

Sau cổng 1, agent phải bổ sung danh sách đường dẫn tệp, API và lệnh chạy chính xác theo stack đã chọn vào kế hoạch kỹ thuật của repo trước khi chuyển sang Tác vụ 2. Không bịa tên API của nền tảng chưa được kiểm chứng.

## Cổng 1 — Kiểm chứng nền tảng và chuẩn bị hợp đồng

### Tác vụ 1: Spike lựa chọn nền tảng (đọc/kiểm thử cục bộ)

**Đầu ra:** `docs/decisions/001-chat-platform.md`, `docs/decisions/002-stack-and-cost.md`, `docs/contracts.md`, kết quả spike có thể xóa, không có dữ liệu thật.

- [ ] Thu thập tài liệu chính thức và giấy phép có phiên bản cho ít nhất Matrix và một nền tảng self-hosted khác. Lập bảng: chat 1-1/offline, presence riêng tư, custom event không lưu cho Buzz, xóa 30 ngày và backup, ID bất biến/nick đổi được, SDK Windows, khả năng mở rộng thực tế, bảo mật, giấy phép client/server và nghĩa vụ phân phối. Ghi link, phiên bản và bằng chứng; không khẳng định khả năng chưa thử.
- [ ] Đánh giá Telegram như phương án tham chiếu, không giả định có server chính thức mã nguồn mở hoặc chat cloud mặc định E2EE.
- [ ] Dùng môi trường cục bộ và tài khoản thử để chứng minh gửi/nhận khi offline, kiểm soát presence, sự kiện tạm thời và xóa dữ liệu với ứng viên dẫn đầu. Ghi lệnh chạy, phiên bản, đầu ra và các giới hạn; nếu tính năng không thể bảo đảm, đánh dấu không đạt.
- [ ] Chọn stack client/API/DB và nhà cung cấp email/SMS khả thi, liệt kê cách test giả lập không tốn phí và chi phí dự kiến dựa trên báo giá thực. Không tạo tài khoản dịch vụ trả phí. Mô tả rõ ai có thể đọc nội dung theo thiết kế, E2EE có hay không; không hứa an toàn tuyệt đối.
- [ ] Định nghĩa contracts cụ thể: các endpoint, quyền, schema request/response, mã lỗi, sự kiện realtime, idempotency key, timestamp server UTC, phiên bản và quy tắc retry. Mapping nick → ID nội bộ độc lập ID nền tảng; thao tác quyền phải được server thực thi. Đặt mã lỗi chung cho người offline và Ẩn.
- [ ] Báo cáo quyết định, rủi ro, các điều không hỗ trợ và ngân sách; chỉ sang cổng sau khi người dùng phê duyệt nền tảng, stack và khoản chi cần thiết. Nếu chưa xác minh được, dừng và báo rõ, không suy đoán.

**Kiểm tra cổng:** có bảng so sánh có nguồn và bằng chứng spike, sơ đồ luồng và contracts; các giới hạn mâu thuẫn yêu cầu phải được giải quyết trước khi code.

## Cổng 2 — Triển khai MVP theo lát dọc

**Quy trình mỗi tác vụ:** Viết test chỉ rõ hành vi và giá trị; chạy xác nhận test thất bại đúng lý do; triển khai tối thiểu; chạy lại test và regression; ghi lệnh, kết quả, phiên bản, rủi ro. Không báo pass nếu chưa chạy. Khi phát hiện nền tảng không hỗ trợ điều kiện đã chốt, dừng ở cổng 1 thay vì lách quyền riêng tư.

### Tác vụ 2: Tài khoản, xác thực và mã mời

**Phụ thuộc:** cổng 1 được chấp thuận. **Đầu ra:** migrations, API quản trị mã mời, đăng ký/khôi phục, client đăng nhập và test.

- [ ] Cài đặt môi trường local, lệnh build/test một bước và cơ chế fake email/SMS; không lưu thông tin thật. Tạo bootstrap admin theo quy trình cục bộ có kiểm soát và hướng dẫn khôi phục.
- [ ] Viết test mã hết hạn/thu hồi/dùng hết bị từ chối; hai yêu cầu đồng thời chỉ dùng được số lượt còn lại; OTP sai/hết hạn bị từ chối và bị giới hạn; email **và** điện thoại đều có luồng test. Kiểm tra mật khẩu/OTP không có trong log.
- [ ] Triển khai mã mời do admin quản lý, xác minh kênh, băm mật khẩu, giới hạn thử, phiên và khôi phục; test tích hợp với dịch vụ giả lập. Chỉ tích hợp dịch vụ thật sau phê duyệt nhà cung cấp/chi phí.
- [ ] Viết test tạo/đổi nick, không phân biệt hoa thường, đua đồng thời và ID bất biến; triển khai ràng buộc duy nhất ở database, giao dịch và kiểm tra các tên cấm. Đề xuất 3–32 ký tự ASCII, giữ nick cũ 30 ngày là mặc định cần xác nhận.
- [ ] Kiểm tra client đăng ký đến tài khoản thật trong môi trường test; xác thực lỗi rõ ràng, không tiết lộ tài khoản qua phản hồi đăng nhập/khôi phục.

### Tác vụ 3: Kết bạn, nhóm danh bạ và trạng thái

**Phụ thuộc:** Tác vụ 2. **Đầu ra:** API/DB quan hệ, nhóm cá nhân, presence; UI danh bạ.

- [ ] Test tìm nick chính xác, mời/chấp nhận/từ chối, quyền xem trạng thái chỉ sau kết bạn; người khác không đọc được danh bạ. Triển khai kiểm soát server-side và test hai client.
- [ ] Test tạo/đổi/xóa nhóm; xóa chuyển liên hệ về nhóm mặc định, không xóa kết bạn; nhóm hai bên độc lập. Mặc định mỗi bạn thuộc một nhóm là đề xuất.
- [ ] Test Online/Bận/Vắng mặt/Ẩn, status tự viết, mất kết nối và nhiều phiên. Server chỉ hiển thị Offline cho bạn bè khi Ẩn; kiểm tra mọi API/event không rò rỉ. Mặc định nhiều phiên và timeout cần được ghi thành cấu hình và xác nhận.
- [ ] Đề xuất chặn/xóa bạn; trước khi triển khai chốt cách xử lý tin đang chờ và lịch sử. Xác nhận bằng test không có rò rỉ dữ liệu qua API sau khi chặn.

### Tác vụ 4: Buzz và biểu tượng cảm xúc

**Phụ thuộc:** Tác vụ 3 và khả năng realtime từ cổng 1. **Đầu ra:** Buzz ngắn hạn không lưu hàng đợi, bộ smiley động được cấp phép, trải nghiệm Windows.

- [ ] Test server từ chối Buzz đến người offline hoặc Ẩn bằng cùng mã lỗi và dữ liệu công khai giống nhau; khi chuyển trạng thái đồng thời không chuyển Buzz sau khi offline/Ẩn. Không suy luận đã rung khi chưa có xác nhận client.
- [ ] Test giới hạn tần suất ở server, tin/sự kiện hết hạn và không phát lại sau reconnect; đề xuất 1 lần/10 giây mỗi cặp và TTL 5 giây là thông số cần xác nhận.
- [ ] Test trên Windows: cửa sổ đang hiện rung một lần khi nhận; cửa sổ thu nhỏ nhận thông báo, không rung lại sau khi mở; giảm chuyển động và tắt rung/âm thanh hoạt động. Làm rõ hành vi nhiều phiên và đo thực tế race; không hứa hoàn toàn loại bỏ rò rỉ thời gian mạng.
- [ ] Tạo hoặc chọn bộ smiley vàng động có quyền dùng, mã ổn định, tĩnh dự phòng; đề xuất 12 biểu cảm. Test gửi/nhận, mở lại lịch sử và chế độ giảm chuyển động; lưu nguồn và giấy phép.

### Tác vụ 5: Chat, hết hạn và khôi phục

**Phụ thuộc:** Tác vụ 3 và adapter đã kiểm chứng. **Đầu ra:** gửi/nhận, history, job dọn dẹp, backup/restore test.

- [ ] Test gửi online/offline, retry cùng idempotency key không tạo hai tin; xử lý mất kết nối giữa lưu và xác nhận. Hiển thị trạng thái chuyển phù hợp, không khai đã đọc.
- [ ] Test đồng hồ kiểm soát được: tin ở 29 ngày đọc được, tại và sau mốc 30 ngày không trả qua API hoặc phát sau khi nhận; xóa vật lý và cache được chạy, xử lý tin chưa nhận. Dùng timestamp server UTC và chỉ định độ trễ dọn vật lý trong cấu hình.
- [ ] Backup được mã hóa và giới hạn quyền; test bản sao lưu được xóa theo lịch tối đa 7 ngày, kể cả sau lỗi, có cảnh báo; khôi phục cách ly, lọc tin hết hạn trước khi phục vụ. Với backup tại 29,9 ngày, xác nhận bản sao không tồn tại quá 7 ngày sau hạn tin; ghi rõ giới hạn nhà cung cấp.
- [ ] Test người dùng offline quá 30 ngày không nhận tin hết hạn; test Windows cache khi offline, sau reconnect và khi mở lại ứng dụng. Không khẳng định xóa ảnh chụp hay bản sao người dùng tự tạo.

### Tác vụ 6: Hoàn thiện client Windows và trải nghiệm

**Phụ thuộc:** Tác vụ 2–5. **Đầu ra:** ứng dụng cài được trong môi trường thử, mockup đối chiếu với ảnh tham khảo.

- [ ] Dựng danh bạ và cửa sổ chat độc lập theo ảnh: màu tím, nick/trạng thái, đèn bạn bè, nhóm, khung hội thoại, thanh icon và Buzz; tách các thành phần chưa hỗ trợ thay vì tạo nút giả.
- [ ] Kiểm tra DPI Windows, thu phóng, nhập tiếng Việt, điều hướng bàn phím, lỗi mạng và đóng/mở lại. Xác minh ảnh tham khảo có sẵn và được dùng đúng quyền; nếu không, dừng chốt phần nhìn và đề nghị người dùng cung cấp lại.
- [ ] Test end-to-end hai tài khoản giả: đăng ký bằng mời → kết bạn → nhóm → trạng thái → chat offline → Buzz online → Ẩn → đổi nick → kiểm tra lịch sử. Ghi video/ảnh thử nếu được phép, không chứa thông tin thật.

## Cổng 3 — Vận hành, an toàn và bàn giao

### Tác vụ 7: Cloud, scale, kiểm thử và tài liệu

- [ ] Viết hướng dẫn build/cài đặt, quản trị mã mời, bootstrap/khôi phục admin, đổi secret, cập nhật/rollback, theo dõi, backup/restore và xử lý sự cố; chỉ rõ quyền truy cập nội dung, chính sách log và thời hạn. Chạy thử bàn giao cho người khác nếu có, nếu không tự kiểm và ghi rõ không độc lập.
- [ ] Thực thi test bảo mật: xác thực, phân quyền, rate limit, quản trị, kiểm soát secrets, TLS, log và dependency/license scan. Thực hiện rà soát độc lập khi có người đủ năng lực; không mô tả tự rà soát là kiểm toán độc lập.
- [ ] Thử tải mục tiêu đề xuất 100 tài khoản/30 phiên đồng thời; ghi thời gian, phiên bản, cấu hình, tỷ lệ lỗi, độ trễ và tiêu chí pass đã chốt. Thử tăng bản API và xác nhận kết nối/presence/giới hạn dùng kho chia sẻ; đo nút thắt server chat và DB. Không tuyên bố scale out toàn hệ thống chỉ vì API có nhiều bản.
- [ ] Lập báo cáo chi phí và cấu hình cloud từ giá thực, gồm compute, lưu trữ/backup, mạng, email/SMS, DNS, giám sát. Xin phép trước khi tạo tài nguyên tốn tiền hoặc triển khai công khai.
- [ ] Chạy toàn bộ test unit, integration, Windows end-to-end, bảo mật và restore; nêu lệnh, kết quả, lỗi tồn đọng và giới hạn. Đưa bản cài thử nội bộ chỉ sau khi được chấp thuận, không gửi mã mời thật tự động.

## Những quyết định phải chốt trong lúc thực hiện

- Thư mục/repository sản phẩm; chọn stack, nền tảng, phiên bản, nhà cung cấp cloud/OTP và ngân sách sau báo cáo cổng 1.
- Mặc định cụ thể về mã mời, nick cũ, giới hạn Buzz, timeout presence, smiley, nhóm, nhiều phiên, chặn/xóa bạn và mục tiêu hiệu năng. Không nâng các đề xuất thành yêu cầu đã được duyệt một cách âm thầm.
- Chốt quyền và tài sản giao diện, người quản trị ban đầu, nội dung nào người vận hành có thể truy cập, chính sách xóa tài khoản và cách cung cấp lại ảnh tham khảo cho agent.

**Hoàn tất:** Chỉ kết luận MVP sẵn sàng dùng thử khi mọi điều kiện đã chốt được kiểm thử, bảo mật và quyền sử dụng được rà soát, tài liệu bàn giao đầy đủ, các hạn chế được công bố và người dùng cho phép triển khai.
