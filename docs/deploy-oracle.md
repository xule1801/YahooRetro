# Hướng dẫn: đăng ký Oracle Cloud miễn phí và cài máy chủ Zahu!Messenger

Dành cho chủ dự án/người vận hành, làm lần đầu. Tổng thời gian khoảng **1–2 giờ**. Phần lớn là chờ Oracle duyệt tài khoản và tạo máy.

Bộ cài (`infra/prod/`) đã được chạy thử trọn vẹn trên máy dev ngày 2026-11-20. Đã kiểm tra:
- cài mới;
- HTTPS (Caddy);
- đồng bộ chứng chỉ sang cổng chat;
- 2 tài khoản đăng ký → kết bạn → nhắn tin → Buzz;
- sao lưu → khôi phục → chạy lại;
- image API trên kiến trúc ARM64 (máy Oracle).

**Chưa** chạy thử trên một máy Oracle thật. Giao diện web của Oracle cũng có thể khác đôi chút so với mô tả dưới đây (Oracle đổi giao diện thường xuyên).

> Bạn cần: một email, số điện thoại, **thẻ Visa/Mastercard** (Oracle chỉ tạm giữ một khoản rất nhỏ để xác minh rồi hoàn lại), và một máy Windows có Git và Node 24 để build bản cài client.

---

## Phần 1 — Đăng ký tài khoản Oracle Cloud Free Tier

1. Mở <https://www.oracle.com/cloud/free/> → bấm **Start for free**.
2. **Country/Territory:** Vietnam. Điền họ tên, email → **Verify my email**. Mở email của Oracle và bấm liên kết xác minh.
3. Trên trang tiếp theo:
   - **Password:** đặt mật khẩu mạnh.
   - **Customer type:** Individual (cá nhân).
   - **Cloud Account Name:** tên tài khoản, viết thường, không dấu (vd `zahuchat`). **Ghi lại tên này**, lần nào đăng nhập cũng cần.
   - **Home Region:** chọn **Singapore (ap-singapore-1)**. ⚠️ **Không đổi được về sau**, và tài nguyên miễn phí chỉ tạo được ở vùng này. Singapore gần Việt Nam nhất, chat nhanh nhất.
4. Điền địa chỉ, số điện thoại.
5. **Payment verification:** nhập thẻ. Oracle tạm giữ một khoản nhỏ rồi hoàn lại. Tài khoản Free Tier **không tự trừ tiền**.
6. Đồng ý điều khoản → **Start my free trial**. Chờ email "Your account is ready" (vài phút đến vài giờ).
7. Đăng nhập tại <https://cloud.oracle.com>: nhập *Cloud Account Name* → email + mật khẩu → bật xác thực 2 lớp theo hướng dẫn (nên làm).

> Tài khoản mới có thêm khoảng $300 dùng thử trong 30 ngày, **ngoài** phần miễn phí vĩnh viễn (*Always Free*). Hướng dẫn này chỉ dùng tài nguyên **Always Free**: máy ảo có nhãn "Always Free-eligible".

## Phần 2 — Tạo máy ảo (VM)

1. Menu ☰ → **Compute** → **Instances** → **Create instance**.
2. **Name:** `zahu-server`.
3. **Image and shape** → **Edit**:
   - **Image:** *Change image* → **Canonical Ubuntu** → **24.04** (bản thường, không chọn *Minimal*).
   - **Shape:** *Change shape* → **Ampere** → **VM.Standard.A1.Flex** → kéo **OCPU = 2**, **Memory = 12 GB**. Kiểm tra có nhãn **Always Free-eligible**.
     (Hạn mức miễn phí ARM hiện là 2 OCPU / 12 GB cho cả tài khoản. Zahu!Messenger chỉ cần khoảng 0,3 GB, nên 1 OCPU / 6 GB cũng dư.)
4. **Networking:** để mặc định *Create new virtual cloud network* và *Create new public subnet*. Bảo đảm **Assign a public IPv4 address = Yes**.
5. **Add SSH keys:** chọn **Generate a key pair for me** → bấm **Save private key** (tệp `.key`) và **Save public key**. ⚠️ **Mất tệp private key thì không vào được máy chủ.** Cất vào `C:\Users\<tên bạn>\.ssh\zahu.key`.
6. **Boot volume:** để mặc định (khoảng 50 GB, nằm trong 200 GB miễn phí).
7. Bấm **Create**. Chờ trạng thái **Running** (1–3 phút). Ở trang máy, ghi lại **Public IP address**, ví dụ `140.245.x.x`.

**Nếu báo "Out of capacity for shape VM.Standard.A1.Flex"** (lỗi rất hay gặp, máy ARM miễn phí thường hết chỗ):
- thử lại sau vài giờ, thường đêm/sáng sớm dễ hơn;
- ở mục *Placement*, đổi sang *availability domain* khác nếu có;
- hoặc tạm giảm còn 1 OCPU / 6 GB.

## Phần 3 — Mở cổng mạng trên Oracle (Security List)

Oracle chặn mọi cổng trừ SSH (22). Cần mở thêm **80, 443** (web/HTTPS) và **5223** (chat).

1. Trang máy `zahu-server` → mục **Primary VNIC** → bấm tên **Subnet**.
2. Tab **Security** (hoặc *Security Lists*) → bấm **Default Security List for …**.
3. **Security rules** → **Add Ingress Rules**. Thêm **3 quy tắc**, mỗi quy tắc gồm:
   - **Source CIDR:** `0.0.0.0/0`
   - **IP Protocol:** TCP
   - **Destination Port Range:** lần lượt `80`, `443`, `5223`
4. **Không** mở cổng 5432 (database) hay 5222.

Tường lửa *bên trong* máy Ubuntu được script cài đặt tự mở ở Phần 6.

## Phần 4 — Tên miền miễn phí (DuckDNS)

App bắt buộc kết nối qua chứng chỉ TLS hợp lệ (biện pháp bảo mật), nên cần một tên miền.

1. Mở <https://www.duckdns.org> → đăng nhập bằng Google/GitHub…
2. Ô **sub domain:** gõ tên muốn dùng, ví dụ `zahuchat` → **add domain**. Tên miền sẽ là `zahuchat.duckdns.org`.
3. Ô **current ip** của tên miền đó: dán **Public IP** của máy Oracle → **update ip**.
4. Kiểm tra trên Windows (PowerShell): `nslookup zahuchat.duckdns.org` phải trả về đúng IP máy Oracle (có thể mất vài phút).

Có tên miền riêng (vd mua ở nhà đăng ký Việt Nam) thì tạo bản ghi **A** `chat.tenmien.vn` → IP máy Oracle, và dùng tên đó thay cho DuckDNS.

## Phần 5 — Đăng nhập vào máy chủ bằng SSH (từ Windows)

Mở **PowerShell** trên máy Windows:

```powershell
# Chỉ cho chính bạn đọc tệp khóa (OpenSSH từ chối khóa có quyền quá rộng)
icacls "$env:USERPROFILE\.ssh\zahu.key" /inheritance:r /grant:r "$($env:USERNAME):(R)"
# Đăng nhập (thay IP)
ssh -i "$env:USERPROFILE\.ssh\zahu.key" ubuntu@140.245.x.x
```

Lần đầu SSH hỏi *Are you sure you want to continue connecting?* → gõ `yes`. Thấy dấu nhắc `ubuntu@zahu-server:~$` là đã vào được máy chủ.

## Phần 6 — Cài máy chủ Zahu!Messenger (một lệnh)

Trong cửa sổ SSH ở trên, chạy:

```bash
sudo timedatectl set-timezone Asia/Ho_Chi_Minh      # giờ Việt Nam (lịch backup chạy theo giờ máy)
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/xule1801/YahooRetro.git
cd YahooRetro
sudo bash infra/prod/setup.sh zahuchat.duckdns.org email-cua-ban@example.com
```

Thay `zahuchat.duckdns.org` bằng tên miền của bạn. Email dùng để Let's Encrypt báo khi chứng chỉ sắp hết hạn.

Script tự làm 7 bước, mất khoảng 5–10 phút ở lần đầu:

1. cài Docker;
2. mở cổng 80/443/5223 trong tường lửa của máy;
3. kiểm tra tên miền trỏ đúng IP;
4. tạo các mật khẩu/khóa ngẫu nhiên vào `infra/prod/.env`;
5. build và chạy dịch vụ (PostgreSQL, Prosody, API, Caddy);
6. lấy chứng chỉ Let's Encrypt và nạp cho cổng chat;
7. đặt lịch backup 03:00 và gia hạn chứng chỉ 04:00.

Kết thúc thấy **`HOÀN TẤT: https://…/healthz trả lời OK`** là thành công. Kiểm tra thêm bằng trình duyệt: mở `https://zahuchat.duckdns.org/healthz`, phải thấy `{"ok":true,...}` và ổ khóa hợp lệ.

⚠️ **Sao lưu tệp bí mật ngay:** `infra/prod/.env` chứa mọi mật khẩu và **khóa giải mã backup** (`YC_BACKUP_KEY`). Mất máy chủ mà không có khóa này thì các bản backup vô dụng. Xem rồi chép nội dung vào nơi an toàn, ví dụ trình quản lý mật khẩu:

```bash
sudo cat ~/YahooRetro/infra/prod/.env
```

## Phần 7 — Email mã xác thực (OTP)

Người dùng đăng ký phải nhận mã 6 số qua email. Có 2 cách:

**Cách A — tạm thời, không cần dịch vụ email (mặc định sau khi cài).** Email OTP nằm trong hộp thư nội bộ trên máy chủ. Chỉ quản trị viên xem được, qua đường hầm SSH:

```powershell
ssh -i "$env:USERPROFILE\.ssh\zahu.key" -L 8025:127.0.0.1:8025 ubuntu@140.245.x.x
```

Giữ cửa sổ này mở, rồi mở trình duyệt <http://127.0.0.1:8025> để xem mã và nhắn cho người đang đăng ký. Hợp với nhóm nhỏ, nhưng thủ công.

**Cách B — gửi email thật (khuyến nghị), ví dụ Brevo, miễn phí khoảng 300 email/ngày:**

1. Đăng ký <https://www.brevo.com> → **Senders, Domains & Dedicated IPs** → thêm và xác minh email người gửi (vd email Gmail của bạn).
2. **SMTP & API** → tab **SMTP** → **Generate a new SMTP key**. Ghi lại *Login* và *SMTP key*.
3. Trên máy chủ: `sudo nano ~/YahooRetro/infra/prod/.env`
   - bỏ dấu `#` ở 5 dòng `YC_SMTP_...`, điền `YC_SMTP_USER` = Login, `YC_SMTP_PASS` = SMTP key, `YC_SMTP_FROM` = `Zahu!Messenger <email-đã-xác-minh>`;
   - **xóa dòng** `COMPOSE_PROFILES=mailpit`;
   - lưu: `Ctrl+O`, `Enter`, `Ctrl+X`.
4. Áp dụng:
   ```bash
   cd ~/YahooRetro/infra/prod
   sudo docker compose --env-file .env up -d
   sudo docker compose --env-file .env rm -sf mailpit
   ```

## Phần 8 — Tạo mã mời

```bash
sudo bash ~/YahooRetro/infra/prod/zahu-cli.sh invite create --note "Tên người được mời"
```

Mã (dạng `XXXX-XXXX-XXXX`) **chỉ hiện một lần**. Gửi riêng cho từng người. Mặc định mỗi mã dùng 1 lần, hạn 7 ngày. Các lệnh khác: `invite list`, `invite revoke <id>`, `user disable <nick>`.

## Phần 9 — Build bản cài Windows trỏ tới máy chủ

Làm trên máy Windows có mã nguồn (thư mục `YahooChat`):

1. Mở `apps/windows/app-config.json`, đổi:
   ```json
   "apiBase": "https://zahuchat.duckdns.org"
   ```
2. Build:
   ```powershell
   npm install
   npm run client:dist
   ```
   Kết quả: `apps\windows\dist\ZahuMessenger Setup 0.1.0.exe`.
3. Lấy mã kiểm tra để bạn bè đối chiếu file không bị tráo:
   ```powershell
   certutil -hashfile "apps\windows\dist\ZahuMessenger Setup 0.1.0.exe" SHA256
   ```
4. Gửi file cài + mã SHA-256 + mã mời cho bạn bè **qua kênh tin cậy**. Bản cài chưa ký số, nên Windows có thể hiện cảnh báo SmartScreen: chọn *More info* → *Run anyway*.
5. Thử ngay: cài lên máy bạn, mở **Zahu!Messenger** từ Start Menu (không dùng lối tắt "Zahu thu", vốn trỏ máy chủ local), đăng ký bằng mã mời.

## Phần 10 — Vận hành hằng ngày

| Việc | Lệnh (trên máy chủ, trong `~/YahooRetro`) |
|---|---|
| Xem trạng thái | `cd infra/prod && sudo docker compose --env-file .env ps` |
| Xem log | `sudo docker compose --env-file .env logs --tail 100 api caddy prosody` |
| Backup ngay | `sudo bash infra/prod/backup.sh` (tự động 03:00, lưu ở `/var/backups/zahu`, giữ 7 ngày) |
| Khôi phục | `sudo bash infra/prod/restore.sh /var/backups/zahu/yc-....dump.enc` |
| Cập nhật lên mã mới nhất | `sudo bash infra/prod/update.sh` (tự backup trước) |
| Khóa tài khoản | `sudo bash infra/prod/zahu-cli.sh user disable <nick>` |

**Nên làm thêm (tránh bị Oracle thu hồi máy):** Oracle có thể thu hồi máy *Always Free* chạy quá nhàn rỗi trong 7 ngày, mà máy chat thì rất nhàn. Để tránh:
- **Billing & Cost Management** → **Upgrade and Manage Payment** → nâng lên **Pay As You Go**. Vẫn miễn phí nếu dùng trong hạn mức Always Free.
- **Billing → Budgets → Create Budget** → ngân sách **$1**, gửi cảnh báo về email, để biết ngay nếu có gì phát sinh phí.
- Giữ đúng cấu hình 2 OCPU / 12 GB (hoặc ít hơn), không tạo thêm tài nguyên trả phí.

## Phần 11 — Xử lý sự cố

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| `setup.sh` báo tên miền chưa trỏ đúng IP | DuckDNS chưa cập nhật IP | Sửa IP trên duckdns.org, chờ vài phút, chạy lại `setup.sh` |
| `Caddy chưa lấy được chứng chỉ` | Chưa mở cổng 80/443 ở **Security List** (Phần 3) | Thêm ingress rule, chạy lại `sudo bash infra/prod/sync-certs.sh` |
| App đăng nhập được nhưng báo **mất kết nối chat** | Chưa mở cổng **5223** ở Security List | Thêm ingress rule 5223 |
| App báo "không phải máy chủ Zahu!Messenger" / "không kết nối được" | `apiBase` trong `app-config.json` sai, hoặc chưa build lại | Sửa `apiBase`, build lại bản cài |
| Không nhận được email OTP | Đang dùng Cách A (Mailpit) | Xem mã qua đường hầm SSH, hoặc cấu hình Brevo (Phần 7) |
| Máy bị Oracle tắt/thu hồi | Nhàn rỗi quá lâu khi ở chế độ Free | Nâng Pay As You Go (Phần 10); khôi phục từ backup nếu cần |
| IP máy đổi | Máy bị xóa/tạo lại | Cập nhật IP trên DuckDNS; chứng chỉ tự lấy lại |

Thông tin thêm: [operations.md](operations.md) (vận hành chi tiết), [security-review.md](security-review.md) (bảo mật).
