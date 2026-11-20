# Giấy phép và quyền dùng tài sản

## Phần mềm bên thứ ba

| Thành phần | Giấy phép | Cách dùng | Nghĩa vụ |
|---|---|---|---|
| Prosody 13 | MIT | Chạy trên máy chủ (image Docker chính thức) | Giữ thông báo bản quyền |
| PostgreSQL 17 | PostgreSQL License | Máy chủ | — |
| Electron 43.8.12 + Chromium | MIT + nhiều giấy phép của Chromium | Đóng gói trong bản cài | Bản cài **đã kèm sẵn** `LICENSE.electron.txt` và `LICENSES.chromium.html` (electron-builder tự thêm) |
| Gói npm production (112 gói) | MIT 71, ISC 34, BSD-3-Clause 4, MIT-0 1 | API + client | Danh sách đầy đủ: [licenses-dependencies.json](licenses-dependencies.json). Tạo lại bằng `node scripts/license-scan.mjs` |
| Mailpit | MIT | Chỉ môi trường thử | — |
| Công cụ dev (vitest, playwright-core, electron-builder, TypeScript) | MIT / Apache-2.0 | Không phân phối | — |

Không dùng thành phần GPL/AGPL nào trong những gì được phân phối. Matrix/Synapse (AGPL) đã bị loại ở Cổng 1.

## Tài sản giao diện

- **54 smiley** (`apps/windows/renderer/smileys.js`): do agent vẽ mới bằng SVG/CSS cho dự án này, dựng từ thư viện bộ phận riêng (mắt, miệng, phụ kiện). Không sao chép hay đồ lại hình smiley của Yahoo hoặc bên thứ ba. Chỉ **mã gõ tắt và ý nghĩa** (`:)`, `>:D<`, `=D>`, `<):)`…) theo quy ước phổ biến của các ứng dụng chat cổ điển, do chủ dự án cung cấp bảng tham chiếu ngày 2026-11-20. Mã cũ `:X`, `:O`, `>:(` vẫn được nhận.
- **Logo Zahu!Messenger** (`apps/windows/renderer/logo.svg`, icon `apps/windows/assets/icon.png` được kết xuất bằng `npm run icon -w apps/windows`): do agent thiết kế ngày 2026-11-20. Chủ dự án yêu cầu "phong cách tựa Yahoo"; agent giữ tinh thần (bong bóng chat tím bóng, mặt cười vàng) nhưng **cố ý không sao chép bố cục logo Yahoo**: không có chữ cái trong bong bóng, không có thanh "!" dựng đứng riêng, mặt cười nằm **bên trong** bong bóng chứ không đè góc, có thêm ngôi sao lấp lánh. Logo kết hợp với tên "Zahu!Messenger" vẫn gợi liên tưởng tới Yahoo! Messenger → nằm trong phạm vi đánh giá rủi ro nhãn hiệu ở mục "Tên sản phẩm".
- **Âm Buzz:** tổng hợp bằng WebAudio ngay lúc chạy, không dùng tệp âm thanh nào.
- **Màu tím, bố cục danh bạ/cửa sổ chat:** lấy cảm hứng từ phong cách ứng dụng chat cổ điển. Không dùng logo, biểu tượng, phông chữ độc quyền hay ảnh chụp màn hình của Yahoo.
- **Ảnh tham chiếu của người dùng:** không có trong repo và không được dùng làm tài sản phát hành.

## Tên sản phẩm

Tên sản phẩm là **"Zahu!Messenger"**, do chủ dự án chọn ngày 2026-11-20 (thay tên tạm "Hoài Niệm Chat" mà agent đặt trước đó). Tên tệp cài đặt và `productName` là `ZahuMessenger` (bỏ dấu "!" cho an toàn với tên tệp và dòng lệnh); lối tắt Start Menu hiển thị "Zahu!Messenger".

**Rủi ro nhãn hiệu cần kiểm tra trước khi phát hành công khai:** "Zahu!Messenger" gần với "Yahoo! Messenger" cả về cách đọc lẫn cách viết (dấu "!" ngay sau tên, đi kèm "Messenger"). Thiết kế §4 yêu cầu không gây nhầm là sản phẩm của Yahoo. Đề xuất: (1) nhờ người có chuyên môn sở hữu trí tuệ đánh giá trước khi phát hành ngoài nhóm bạn; (2) giữ dòng ghi chú "không liên quan tới Yahoo" trong ứng dụng/tài liệu; (3) không dùng logo, phông chữ hay bảng màu nhận diện của Yahoo. Dùng nội bộ trong nhóm bạn nhỏ thì rủi ro thấp hơn, nhưng agent không đưa ra kết luận pháp lý.

Tên thư mục repo (`YahooChat`) và một số định danh kỹ thuật nội bộ không hiển thị cho người dùng (`urn:yahoochat:*`, tên DB `yahoochat`) vẫn giữ nguyên; nên đổi trước khi phát hành công khai.

## Mã nguồn của dự án

Các `package.json` đặt `"license": "UNLICENSED"` (độc quyền, chưa cấp phép cho ai) cho tới khi chủ dự án chọn giấy phép.
