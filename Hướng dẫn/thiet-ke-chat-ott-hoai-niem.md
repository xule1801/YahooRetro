# Thiết kế sản phẩm: ứng dụng chat hoài niệm trên Windows

**Trạng thái:** Bản dự thảo chờ phê duyệt. Quyết định của người dùng được ghi rõ; các thông số còn lại là đề xuất để agent triển khai, không phải yêu cầu đã chốt. Không triển khai sản phẩm hoặc mua dịch vụ cho tới khi thiết kế và kế hoạch được phê duyệt.

## 1. Mục tiêu và phạm vi

Ứng dụng chat riêng cho bạn bè cũ, ưu tiên trải nghiệm Yahoo Messenger cổ điển theo ảnh tham chiếu: danh bạ và cửa sổ chat riêng, tông tím, smiley vàng động, Buzz rung cửa sổ người nhận. Giai đoạn đầu dưới 100 người, Windows trước, triển khai cloud; thiết kế có đường scale out. Không nhằm trao đổi tài liệu mật, nhưng phải bảo vệ dữ liệu và tài khoản.

**Không thuộc phiên bản đầu:** macOS, mobile, chat nhóm, gọi thoại/video, chia sẻ ảnh/tệp, Audibles, hoạt động nâng cao, đăng nhập Facebook/Zalo. Nhóm là nhóm phân loại danh bạ cá nhân, không phải phòng chat.

**Tiêu chí thành công đề xuất:** một nhóm dưới 100 người có thể đăng ký bằng mã mời, kết bạn, nhìn thấy trạng thái và chat/Buzz ổn định; người vận hành khác có thể cài đặt, sao lưu và khôi phục bằng tài liệu. Các chỉ tiêu hiệu năng cần đo và thống nhất, không coi quy mô 100 người là bằng chứng scale out.

## 2. Các hướng đã cân nhắc

1. Client dùng mạng Telegram: nhanh tận dụng hệ sinh thái nhưng phụ thuộc mạng và hành vi Telegram; không đảm bảo Buzz và danh bạ tùy biến hoạt động với client khác.
2. **Được chọn: nền tảng chat mã nguồn mở có máy chủ riêng, kết hợp client Windows và dịch vụ bổ sung.** Tận dụng phần giao tiếp sẵn có nhưng cần xác minh kỹ thuật, giấy phép, bảo mật và khả năng vận hành.
3. Tự xây toàn bộ: tự do nhưng tăng chi phí bảo mật, duy trì và vận hành.

Telegram không được coi là nền tảng mặc định: mã nguồn client không đồng nghĩa server Telegram công khai; chat cloud Telegram không mặc định mã hóa đầu cuối. Mã nguồn mở tự nó không bảo đảm an toàn.

### Cổng chọn nền tảng — bắt buộc trước khi lập kế hoạch chi tiết

Agent đánh giá ít nhất Matrix (server/client SDK) và một nền tảng tự host khả thi khác bằng tài liệu và phiên bản chính thức tại thời điểm triển khai. Kiểm tra: giấy phép từng thành phần và nghĩa vụ phân phối client Windows; chat 1-1/offline; hiện diện và quyền riêng tư; custom event cho Buzz; xóa thật và thời hạn sao lưu; thay đổi nick duy nhất mà không đổi định danh nội bộ; giới hạn và phương án scale out thực tế; xác thực ngoài; chi phí vận hành; khả năng hỗ trợ Windows. Matrix là **ứng viên khảo sát, chưa được phê duyệt là lựa chọn cuối**. Nếu nền tảng không hỗ trợ đổi định danh đăng nhập, dùng nick tìm kiếm do dịch vụ ứng dụng quản lý, ánh xạ vào ID nền tảng cố định; không giả định có thể đổi ID gốc. Báo cáo kết quả, phiên bản, giấy phép, điểm không đáp ứng và chi phí trước khi chốt. Không tự phát triển mật mã.

## 3. Luồng sản phẩm và tiêu chí nghiệm thu

### 3.1 Đăng ký và tài khoản

- Chỉ quản trị viên tạo mã mời. Người dùng nhập mã còn hiệu lực, chọn email **hoặc** số điện thoại, xác minh quyền sở hữu qua mã xác thực, đặt mật khẩu và nick duy nhất.
- Đề xuất: mã mời mặc định dùng một lần, hết hạn sau 7 ngày; quản trị viên có thể thu hồi. Kiểm tra mã và tiêu thụ lượt phải nguyên tử khi hoàn tất đăng ký; việc xác minh thất bại không tiêu thụ mã. Đặt giới hạn gửi mã, số lần nhập sai và thời gian hết hạn; phản hồi không tiết lộ thông tin tài khoản không cần thiết.
- Mật khẩu lưu bằng thuật toán băm mật khẩu phù hợp, có salt; không ghi mật khẩu hay OTP vào log. Quy trình quên mật khẩu dựa trên xác minh kênh đã đăng ký, vô hiệu hóa phiên cũ khi khôi phục. Không giả định email hoặc SMS là kênh chống chiếm tài khoản mạnh.
- Nick tìm kiếm duy nhất toàn hệ thống, do người dùng tự tạo và đổi trong quản lý tài khoản. ID nội bộ cố định giữ bạn bè và lịch sử sau đổi. Đề xuất nick 3–32 ký tự ASCII chữ, số, dấu gạch dưới; so sánh không phân biệt hoa/thường, lưu cách viết hiển thị. Từ chối nick trùng hoặc dành riêng. Nick cũ được giải phóng sau 30 ngày; trong thời gian đó không ai khác nhận được. Không tự chuyển tiếp nick cũ trong tìm kiếm. Tất cả các thông số đề xuất có thể điều chỉnh trước triển khai.
- Kiểm thử: hai lần đăng ký/đổi nick đồng thời không thể chiếm cùng một nick; đổi nick không mất kết bạn hoặc chat; mã hết hạn, đã dùng, thu hồi bị từ chối.

### 3.2 Bạn bè và danh bạ

- Tìm nick chính xác; gửi lời mời, người nhận chấp nhận hoặc từ chối. Chỉ sau chấp nhận hai bên hiện trong danh bạ và chia sẻ hiện diện. Đề xuất thêm hủy lời mời, xóa bạn và chặn để tránh quấy rối; chặn ngăn chat, Buzz, lời mời và hiện diện hai chiều.
- Người dùng tự tạo, đổi tên, xóa nhóm phân loại và chuyển bạn vào nhóm; mặc định một bạn nằm trong một nhóm, xóa nhóm chuyển bạn về nhóm mặc định, không xóa bạn. Mỗi người tự quản lý nhóm của mình.
- Kiểm thử: không xem được hiện diện của người chưa kết bạn; chấp nhận tạo liên kết hai chiều; nhóm của một người không thay đổi nhóm của người kia.

### 3.3 Trạng thái

- Các lựa chọn Online, Bận, Vắng mặt, Ẩn; Offline khi ngắt kết nối. Dòng trạng thái do người dùng viết. Đề xuất giới hạn 140 ký tự.
- Khi Ẩn, bạn bè nhìn thấy Offline; vẫn gửi tin nhắn được nhưng không Buzz được. Kiểm tra quyền hiện diện ở phía server, không chỉ giấu trên client. Tài khoản nhiều phiên: đề xuất một trạng thái tự chọn đồng bộ; hiện online nếu có ít nhất một phiên kết nối, trừ khi chọn Ẩn.
- Kiểm thử: mất kết nối chuyển Offline sau timeout có thể cấu hình; khi Ẩn, API và phản hồi Buzz không tiết lộ hiện diện thật.

### 3.4 Chat và lưu trữ

- Chat văn bản 1-1 giữa bạn bè; gửi, nhận và hiển thị lịch sử; tin khi người nhận offline được lưu và chuyển khi online, nếu chưa hết hạn. Đề xuất trạng thái gửi/đã chuyển, không yêu cầu đã đọc; thử gửi lại không tạo bản sao nhờ ID tin nhắn duy nhất.
- Tin nhắn hết hạn **30 ngày từ lúc server nhận gửi**, kể cả chưa nhận/chưa xem. Không trả nội dung đã hết hạn qua API dù tác vụ dọn dữ liệu chưa chạy. Tác vụ xóa vật lý định kỳ; client xóa cache hết hạn khi mở ứng dụng và định kỳ. Không hứa xóa bản chụp màn hình hoặc bản sao người dùng tự tạo.
- Sao lưu: người dùng đã chấp thuận bản sao lưu giữ tối đa 7 ngày; dữ liệu đã hết 30 ngày có thể còn trong bản sao lưu tối đa 7 ngày nữa. Mã hóa bản sao lưu và hạn chế quyền truy cập cho người vận hành được ủy quyền. Khi khôi phục phải lọc xóa tin hết hạn trước khi phục vụ người dùng.
- Kiểm thử: tin 29 ngày còn xem được, tin quá 30 ngày không được trả; tin chưa nhận cũng hết hạn; sau khôi phục không xuất hiện tin quá hạn; ghi nhận và theo dõi kết quả tác vụ xóa.

### 3.5 Buzz và smiley

- Buzz chỉ gửi đến bạn bè đang online và không Ẩn; người offline/Ẩn nhận cùng thông báo không thể Buzz. Không xếp hàng và không phát lại khi đăng nhập. Khi nhận, rung cửa sổ chat phía nhận nếu đang hiển thị; nếu đang thu nhỏ, chỉ thông báo, không xếp hàng rung sau khi mở lại. Không yêu cầu rung toàn bộ màn hình.
- Đề xuất Buzz hết hiệu lực sau 5 giây, giới hạn mỗi cặp 1 lần/10 giây do server thực thi; nếu không thể xác nhận chuyển đến phiên hoạt động thì báo không thể chuyển, không khẳng định đã rung. Cần kiểm tra race khi mất kết nối/đổi Ẩn; không phát lộ trạng thái. Cho phép tắt âm thanh/rung ở client để hỗ trợ khả năng tiếp cận, không thay đổi việc gửi tin.
- Smiley vàng dạng động, chọn từ bảng icon và gửi trong chat. Đề xuất tập ban đầu 12 biểu cảm, mỗi biểu cảm có mã ổn định và hình dự phòng tĩnh; hỗ trợ giảm chuyển động. Agent tạo hoặc dùng tài sản có quyền phù hợp, lưu nguồn và giấy phép; không lấy trực tiếp ảnh tham khảo làm tài sản phát hành nếu chưa được cấp quyền.
- Kiểm thử: Buzz online rung một lần, offline/Ẩn không phát sau; giới hạn tần suất có hiệu lực; smiley hiển thị khi nhận và khi mở lại lịch sử.

## 4. Giao diện

Tham chiếu ảnh do người dùng cung cấp: cửa sổ danh bạ và cửa sổ chat Windows riêng, màu tím, nhóm bạn có đèn hiện diện, dòng trạng thái, khung hội thoại và thanh công cụ. Tạo cảm giác gần ảnh nhất trong giới hạn quyền sử dụng và khả năng tiếp cận. Không khẳng định được phép dùng logo, tên Yahoo, icon hay âm thanh gốc; cần kiểm tra quyền trước khi sử dụng. Không quảng bá là sản phẩm chính thức của Yahoo.

```text
[DANH BẠ]                    [CHAT: nick bạn]
 Nick của tôi  • Online      Menu / thanh công cụ
 Trạng thái của tôi          ┌──────────────────────┐
 Tìm nick                    │ Lịch sử tin nhắn     │
 ▾ Bạn học                   │ smiley động / Buzz   │
   ● nick bạn                └──────────────────────┘
 ▾ Bạn khác                  [smiley] [Buzz]
   ○ nick khác               [Nhập tin...] [Gửi]
```

Ảnh là định hướng, không yêu cầu nút gọi, ảnh hay Audibles hoạt động ở MVP. Các nút chưa hỗ trợ không được giả vờ hoạt động; ưu tiên ẩn hoặc đánh dấu rõ. Tên sản phẩm, bộ màu chi tiết và tài sản phát hành chưa chốt.

## 5. Kiến trúc và vận hành đề xuất

- Client Windows kết nối TLS tới dịch vụ chat và API ứng dụng; API quản lý tài khoản, mã mời, nick, quan hệ bạn bè, danh bạ và chính sách Buzz. Nền tảng chat nguồn mở cung cấp các khả năng đã được kiểm chứng. Dùng database bền vững cho dữ liệu tài khoản và dữ liệu khác theo thiết kế nền tảng; không tự đoán schema/SDK trước cổng chọn nền tảng.
- Triển khai cloud nhỏ cho thử nghiệm; tách cấu hình và dữ liệu khỏi tiến trình, hỗ trợ chạy nhiều bản API không trạng thái, quản lý phiên và giới hạn tần suất dùng kho chia sẻ khi scale. Kết nối thời gian thực cần kiến trúc định tuyến/presence và broker phù hợp với nền tảng đã chọn. Database và server chat có thể là điểm nghẽn/đơn điểm lỗi: chỉ công bố scale out sau khi xác minh hỗ trợ và thử tải, không giả định thêm container là đủ.
- Bảo mật: TLS, kiểm soát truy cập server-side, mã hóa lưu trữ theo khả năng cloud, secrets manager hoặc cơ chế bí mật thích hợp, vá lỗi, sao lưu kiểm tra khôi phục, giới hạn đăng nhập/OTP/Buzz, log không chứa nội dung chat/OTP/mật khẩu, cảnh báo và quyền quản trị tối thiểu. Xác định rõ ai có thể truy cập nội dung; không tuyên bố E2EE hoặc an toàn tuyệt đối nếu chưa có bằng chứng. Nếu chọn E2EE phải kiểm tra tương thích chính sách lưu/xóa, đa thiết bị và quản trị.
- Tài liệu bàn giao: sơ đồ, biến môi trường không chứa bí mật, hướng dẫn cài đặt, cấu hình cloud/DNS/TLS, tạo/thu hồi mã mời, quan sát hệ thống, sao lưu/khôi phục, xử lý sự cố, cập nhật và rollback; quản trị viên có xác thực mạnh. Không hard-code khóa; không công khai dịch vụ hoặc chi tiền nếu chưa được chấp thuận.
- Chi phí cần báo giá thực tế theo vùng và nhà cung cấp: máy chủ, DB/lưu trữ và backup, mạng, tên miền, email, SMS OTP, giám sát. SMS phụ thuộc số đăng ký và mức gửi lại; chưa đủ dữ liệu để đưa ra giá đáng tin cậy.

## 6. Bàn giao cho agent và cổng kiểm thử

1. Kiểm chứng nguồn, giấy phép, lựa chọn nền tảng và nhà cung cấp OTP; báo các giới hạn và ngân sách dự kiến. Chỉ chốt sau phê duyệt.
2. Lập kế hoạch theo các lát dọc: đăng ký/mời → bạn bè/hiện diện → chat/lưu/xóa → Buzz/smiley → giao diện và vận hành. Có kiểm thử tự động, tích hợp và hướng dẫn chạy.
3. Kiểm tra trên Windows: các luồng ở mục 3, đồng thời đăng ký/đổi nick, ngắt mạng, khôi phục, hai client Buzz, Ẩn, chống lặp, thông báo và giảm chuyển động. Thử tải mục tiêu ban đầu (đề xuất 100 tài khoản, 30 kết nối đồng thời; chưa phải cam kết sức chứa), rồi thử tăng số bản dịch vụ và đo điểm nghẽn.
4. Kiểm tra quyền dùng tài sản và phần mềm, rà soát bảo mật độc lập nếu có điều kiện; liệt kê lỗi còn lại và không tuyên bố kiểm thử thành công nếu chưa chạy.

## 7. Các điểm cần phê duyệt hoặc xác minh

- Các mặc định do người thiết kế đề xuất: thời hạn mã mời, quy tắc nick và giữ nick cũ, cách quản lý nhóm, giới hạn Buzz, bộ 12 smiley, quy tắc đa phiên, mục tiêu thử tải.
- Đã chấp thuận: bản sao lưu có thể còn tối đa 7 ngày sau thời hạn xóa 30 ngày; tin hết hạn không được hiển thị lại sau khôi phục.
- Nền tảng chat, framework Windows, nhà cung cấp cloud/OTP, phạm vi mã hóa và ngân sách: chưa chọn, phụ thuộc kiểm chứng và quyết định sau.
- Cần xác định đường dẫn và quyền sử dụng ảnh tham chiếu khi triển khai; bản thiết kế mô tả ảnh người dùng đã gửi trong hội thoại, chưa đóng gói ảnh vào dự án.
