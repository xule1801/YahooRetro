# Sổ tay vận hành — Zahu!Messenger (MVP)

Dành cho người vận hành máy chủ. Mọi lệnh chạy từ thư mục gốc của repo, trừ khi ghi khác.

> **Chưa triển khai công khai.** Theo kế hoạch, mọi việc tạo tài nguyên cloud tốn tiền, mua tên miền, đăng ký email/SMS thật, phát hành bản cài hay gửi mã mời thật đều **cần người dùng cho phép riêng**. Mục 5 là hướng dẫn để làm khi đã được duyệt.

## 1. Thành phần

```
Client Windows (Electron) ──HTTPS──▶ API (Node 24, Fastify) ──SQL──▶ PostgreSQL 17 (schema app + bảng prosody*)
        │                                 │ XMPP nội bộ (5222, tài khoản appsvc)            ▲
        └──XMPP TLS trực tiếp (5223)──▶ Prosody 13 + mod_yc_policy + mod_auth_appsvc ─SQL─┘
```

| Thành phần | Vị trí | Ghi chú |
|---|---|---|
| API | `services/api` | Đăng ký, mã mời, nick, bạn bè, nhóm, Buzz, job xóa hằng kỳ. Không lưu trạng thái trong bộ nhớ, chạy được nhiều bản |
| Prosody | image `prosodyim/prosody:13.0` + `infra/prosody/` | Định tuyến tin nhắn, presence, lưu trữ MAM. Chạy một tiến trình duy nhất (đơn điểm lỗi) |
| PostgreSQL | `postgres:17-alpine` | Hai role: `yc_app` (schema `app`; chỉ SELECT/DELETE trên archive) và `yc_prosody` (các bảng `prosody*`) |
| Mailpit | chỉ có ở môi trường local/thử | Bắt mọi email, không gửi ra ngoài. Giao diện xem thư: http://127.0.0.1:8025 |

## 2. Cài đặt môi trường thử (một máy Windows)

Cần có: Node.js ≥ 24, Docker Desktop, Git.

```bash
npm install
cp infra/.env.example infra/.env   # rồi thay mọi "change-me" bằng giá trị ngẫu nhiên (xem dưới)
npm run infra:up                    # postgres + prosody + mailpit
npm run db:migrate
npm run api                         # API ở http://127.0.0.1:8080
npm run client                      # mở ứng dụng Windows (dev)
```

Sinh secret ngẫu nhiên:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"   # mật khẩu DB, token secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # YC_BACKUP_KEY (64 hex)
```

`infra/.env` chứa secret. Tệp này **đã nằm trong `.gitignore`, không commit, không gửi qua chat/email.**

Tạo mã mời đầu tiên rồi đăng ký trong ứng dụng (tab Đăng ký). OTP email xem ở Mailpit. OTP SMS giả lập xem bằng `npm run cli -- sms-outbox`.

```bash
npm run cli -- invite create --uses 1 --days 7 --note "Nguyễn Văn A"
```

## 3. Biến môi trường (không chứa giá trị bí mật)

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `YC_PG_OWNER_PASSWORD`, `YC_APP_DB_PASSWORD`, `YC_PROSODY_DB_PASSWORD` | — (bắt buộc) | Mật khẩu ba role của PostgreSQL |
| `YC_XMPP_TOKEN_SECRET` | — (bắt buộc) | Khóa HMAC ký token XMPP. Dùng chung cho API và Prosody |
| `YC_OTP_SECRET` | suy ra từ token secret | Khóa HMAC băm OTP |
| `YC_BACKUP_KEY` | — (bắt buộc khi backup) | 64 ký tự hex, mã hóa AES-256-GCM cho bản sao lưu |
| `YC_DOMAIN` | `localhost` | Domain XMPP. **Phải trùng với chứng chỉ TLS của Prosody** |
| `YC_XMPP_PUBLIC_SERVICE` | `xmpps://127.0.0.1:5223` | Địa chỉ XMPP trả cho client. Bắt buộc dùng `xmpps://` |
| `YC_XMPP_SERVICE` | `xmpp://127.0.0.1:5222` | Kết nối nội bộ từ API (appsvc) tới Prosody |
| `YC_API_HOST` / `YC_API_PORT` | `127.0.0.1` / `8080` | API chỉ nghe nội bộ; reverse proxy lo phần TLS |
| `YC_SMTP_HOST/PORT/USER/PASS/FROM/SECURE` | Mailpit `127.0.0.1:1025` | Máy chủ SMTP gửi OTP |
| `YC_SMS_PROVIDER` | `fake` | Chưa tích hợp nhà cung cấp thật. Đặt giá trị khác `fake` thì việc gửi SMS sẽ báo lỗi |
| `YC_DEV_INSECURE_TLS` | (không đặt) | `1` = chấp nhận cert tự ký. **CHỈ dùng ở máy thử, không bao giờ ở môi trường thật** |
| `YC_MESSAGE_TTL_DAYS` | 30 | Thời hạn giữ tin (đặt cho cả API và Prosody) |
| `YC_PURGE_INTERVAL_MIN` | 15 | Chu kỳ chạy job xóa vật lý |
| `YC_BACKUP_DIR` / `YC_BACKUP_RETENTION_DAYS` | `backups/` / 7 | Thư mục và thời hạn giữ bản sao lưu |
| `YC_INVITE_DEFAULT_DAYS`, `YC_NICK_HOLD_DAYS`, `YC_BUZZ_TTL_SEC`, `YC_BUZZ_PAIR_INTERVAL_SEC`, `YC_OTP_*`, `YC_LOGIN_MAX_FAILS_*`, `YC_SESSION_TTL_DAYS` | xem `packages/contracts` | Các mặc định người dùng đã duyệt ngày 2026-11-19 |
| `YC_TRUST_PROXY` | (không đặt) | Đặt `1` khi API chạy sau reverse proxy, để giới hạn theo IP dùng đúng IP thật |
| `YC_PROSODY_IMAGE` | `prosodyim/prosody:13.0` | **Môi trường thật phải ghim một bản phát hành 13.0.x theo digest** (tag `13.0` là bản nightly) |

## 4. Lệnh quản trị (CLI trên máy chủ)

Hệ thống **không có giao diện quản trị qua mạng**. Người vận hành là người có quyền SSH vào máy chủ; xác thực mạnh do SSH key/MFA của nhà cung cấp cloud đảm nhận. "Khởi tạo admin" chính là cấp quyền SSH. "Khôi phục admin" là thay SSH key qua console của nhà cung cấp cloud.

| Việc | Lệnh |
|---|---|
| Tạo mã mời (hiện mã đúng một lần) | `npm run cli -- invite create [--uses N] [--days D] [--note "..."]` |
| Liệt kê mã mời (chỉ hiện 4 ký tự cuối) | `npm run cli -- invite list` |
| Thu hồi mã mời | `npm run cli -- invite revoke <inviteId>` |
| Khóa / mở khóa tài khoản | `npm run cli -- user disable <nick>` (thu hồi mọi phiên, ngắt XMPP) / `user enable <nick>` |
| Chạy job xóa ngay | `npm run cli -- purge` |
| Sao lưu | `npm run cli -- backup create` |
| Khôi phục | `npm run cli -- backup restore <tệp> --target <db_mới>` |

Gửi mã mời cho người được mời qua kênh riêng (gặp trực tiếp, nhắn tin cá nhân). **Hệ thống không tự gửi mã mời.**

## 5. Triển khai máy chủ thử nghiệm trên cloud (khi đã được duyệt)

1. **Máy chủ:** 1 VM Linux, khoảng 2 vCPU / 4 GB RAM / 40 GB SSD, cài Docker và Node 24. Lần đo tải ở máy dev: DB khoảng 14 MB sau 2.400 bản ghi tin nhắn; Prosody khoảng 10 MB RAM; PostgreSQL khoảng 80 MB RAM.
2. **DNS:** bản ghi A `chat.<tên-miền>` trỏ về IP của VM.
3. **TLS cho API:** đặt reverse proxy (ví dụ Caddy, tự lấy chứng chỉ Let's Encrypt) `https://chat.<tên-miền>` → `127.0.0.1:8080`, và đặt `YC_TRUST_PROXY=1`.
4. **TLS cho XMPP:** lấy chứng chỉ cho `chat.<tên-miền>` (certbot), rồi `prosodyctl --root cert import /etc/letsencrypt/live`. Mount thư mục cert vào container. Đặt `YC_DOMAIN=chat.<tên-miền>` và `YC_XMPP_PUBLIC_SERVICE=xmpps://chat.<tên-miền>:5223`.
5. **Cổng:** trong `infra/docker-compose.yml`, đổi cổng 5223 sang nghe trên `0.0.0.0`. Tường lửa chỉ mở **443** (API) và **5223** (XMPP-TLS). **Không mở** 5222, 5432, 1025, 8025.
6. **Email thật:** đặt các biến `YC_SMTP_*` của nhà cung cấp đã duyệt, rồi bỏ dịch vụ `mailpit` khỏi compose.
7. **Bỏ** `YC_DEV_INSECURE_TLS`.
8. **Chạy API như một dịch vụ** (systemd hoặc container) với `npm run api`. Có thể chạy nhiều bản sau cùng một proxy: giới hạn Buzz/đăng nhập nằm trong DB, đã thử với 2 bản.
9. Đặt lịch **backup hằng ngày** (cron), xem mục 8.
10. Client: trên màn hình đăng nhập, mở "Máy chủ" và nhập `https://chat.<tên-miền>`. Client từ chối `http://` tới máy không phải localhost.

## 6. Đổi secret

| Secret | Cách đổi | Ảnh hưởng |
|---|---|---|
| `YC_XMPP_TOKEN_SECRET` | Sửa `.env`, rồi khởi động lại **cả** Prosody và API | Các kết nối XMPP hiện có vẫn giữ. Lần kết nối lại, client tự xin token mới |
| Mật khẩu DB | `ALTER ROLE yc_app PASSWORD '...'` (tương tự cho role khác), sửa `.env`, khởi động lại | Gián đoạn ngắn |
| `YC_BACKUP_KEY` | Tạo khóa mới cho các bản backup mới. **Giữ khóa cũ ít nhất 7 ngày** để còn giải mã được các bản backup cũ chưa hết hạn | Không gián đoạn |
| Phiên người dùng bị lộ | `npm run cli -- user disable <nick>` rồi `enable` | Người dùng phải đăng nhập lại |

## 7. Giám sát

- `GET /healthz` trả `{ ok, lastPurge: {ran_at, ok}, xmppOutboxPending }`. **Cần cảnh báo khi:** không phản hồi; `lastPurge.ok=false`; `lastPurge.ran_at` cũ hơn 1 giờ; `xmppOutboxPending > 0` kéo dài quá 5 phút (lệnh kết bạn/xóa bạn chưa tới được Prosody).
- Log: `docker compose -f infra/docker-compose.yml logs prosody postgres`, cộng stdout của API (JSON). API **không ghi body request**, che header `Authorization`, không ghi OTP, mật khẩu hay nội dung tin nhắn. Prosody chạy mức `info`, mức này không ghi nội dung stanza. **Không bật mức debug ở môi trường thật**, vì debug có thể ghi nội dung.
- Lịch sử job xóa: `SELECT * FROM app.job_runs ORDER BY id DESC LIMIT 20;`
- Ngưỡng tải đã đo (mục 11): khoảng **115 tin/giây** thì độ trễ tăng lên giây. Cần cảnh báo nếu độ trễ chat vượt 1 giây.

## 8. Sao lưu và khôi phục

**Chính sách đã được duyệt:** bản sao lưu tồn tại tối đa 7 ngày. Dữ liệu đã quá 30 ngày có thể còn trong backup thêm tối đa 7 ngày. Tin hết hạn **không bao giờ** được phục vụ lại sau khôi phục.

- `backup create`: chạy `pg_dump` toàn bộ DB (gồm cả dữ liệu Prosody), mã hóa **AES-256-GCM** bằng `YC_BACKUP_KEY` (tệp `backups/yc-<thời điểm>.dump.enc`, quyền 600), rồi xóa ngay các bản cũ hơn 7 ngày.
- Lịch: cron `0 3 * * * cd /srv/zahu && npm run cli -- backup create`. Nếu sao chép ra kho ngoài (object storage), kho đó **phải có lifecycle tự xóa sau 7 ngày** và giới hạn quyền đọc chỉ cho người vận hành. Agent chưa thiết lập phần này.
- Nếu backup lỗi: lần chạy sau vẫn tự xóa bản quá hạn. Theo dõi tệp mới nhất (cảnh báo nếu không có tệp nào mới hơn 26 giờ).

**Quy trình khôi phục** (đã thử tự động trong `services/api/test/backup.test.ts`):

1. Dừng phục vụ: dừng API, rồi `docker compose stop prosody`.
2. Khôi phục **vào DB mới, cách ly**: `npm run cli -- backup restore backups/yc-XXXX.dump.enc --target yahoochat_restore`.
3. **Bắt buộc lọc dữ liệu hết hạn trước khi phục vụ:** `YC_DATABASE_URL=postgres://yc_app:...@127.0.0.1:5433/yahoochat_restore npm run cli -- purge`. Ngay cả khi bỏ sót bước này, Prosody vẫn không trả tin quá 30 ngày vì lọc ở lớp đọc.
4. Kiểm tra: đếm user, thử đăng nhập một tài khoản thử.
5. Chuyển sang DB mới: trong `psql -U yc_owner -d postgres` chạy `ALTER DATABASE yahoochat RENAME TO yahoochat_old; ALTER DATABASE yahoochat_restore RENAME TO yahoochat;`
6. Khởi động Prosody, rồi API. Xóa `yahoochat_old` sau khi xác nhận ổn (DB cũ cũng phải tuân thủ giới hạn 7 ngày).

## 9. Xử lý sự cố

| Triệu chứng | Kiểm tra | Xử lý |
|---|---|---|
| Client báo "Mất kết nối" | `docker compose ps`; log Prosody; cổng 5223 có mở không | Khởi động lại Prosody. Client tự kết nối lại và gửi lại tin chưa có ack (không tạo bản trùng, trừ khi Prosody vừa khởi động lại; xem mục 11) |
| Kết bạn xong nhưng không thấy trạng thái/không chat được | `/healthz` → `xmppOutboxPending`; xem `SELECT * FROM app.xmpp_outbox WHERE done_at IS NULL` | Kiểm tra kết nối API→Prosody (5222, `YC_XMPP_TOKEN_SECRET` có khớp không). Outbox tự gửi lại mỗi 5 giây |
| Không nhận được OTP email | Log API; trạng thái nhà cung cấp SMTP | OTP bị giới hạn 5 lần/giờ/địa chỉ |
| `lastPurge.ok=false` | `SELECT error FROM app.job_runs ORDER BY id DESC LIMIT 1` | Sửa nguyên nhân rồi chạy `npm run cli -- purge`. Tin quá hạn vẫn bị chặn ở lớp đọc trong thời gian này |
| Nghi lộ tài khoản | — | `user disable <nick>`; đổi secret liên quan (mục 6) |
| Nghi lộ `infra/.env` | — | Đổi **toàn bộ** secret; khóa mọi phiên (đổi `YC_XMPP_TOKEN_SECRET` và chạy `UPDATE app.sessions SET revoked_at=now()`) |
| DB hỏng/mất dữ liệu | — | Khôi phục theo mục 8. Mất tối đa 24 giờ dữ liệu (lịch backup hằng ngày) |

## 10. Cập nhật và rollback

1. **Luôn `backup create` trước khi cập nhật.**
2. Cập nhật mã → `npm install` → `npm run db:migrate` → khởi động lại API. Migration chỉ đi tiến; muốn quay lại một migration đã chạy thì phải **khôi phục backup** (mục 8).
3. Prosody: đổi `YC_PROSODY_IMAGE` sang digest mới, rồi `docker compose up -d prosody`. Rollback bằng cách đặt lại digest cũ.
4. Client: build bằng `npm run client:dist`, phát bản cài mới. Rollback bằng cách cài lại bản cũ (server tương thích ngược trong v1).
5. Sau cập nhật: chạy `npm test` trên máy thử và kiểm `/healthz`.

## 11. Quyền riêng tư, nội dung và giới hạn đã biết

- **Ai đọc được nội dung chat:** người có quyền vào máy chủ, DB hoặc backup (và giữ khóa backup) đọc được tin nhắn. **Không có mã hóa đầu cuối (E2EE).** Mã hóa chỉ ở đường truyền (TLS) và ở bản backup. Mã hóa ổ đĩa phụ thuộc nhà cung cấp cloud. Không tuyên bố "an toàn tuyệt đối".
- **Thời hạn:** tin bị ẩn khỏi API đúng 30 ngày sau khi server nhận, kể cả tin chưa được nhận. Xóa vật lý chạy mỗi 15 phút. Backup giữ tối đa 7 ngày. Client chỉ giữ tin trong bộ nhớ (không ghi ra đĩa) và xóa tin hết hạn mỗi phút. Hệ thống không xóa được ảnh chụp màn hình hay bản sao người dùng tự lưu.
- **Bộ nhớ chống trùng của Prosody nằm trong RAM:** nếu Prosody khởi động lại đúng lúc client đang gửi lại một tin chưa có ack, tin đó có thể bị lưu 2 lần.
- **Ẩn:** hai bên mạng có thể suy ra thời điểm kết nối qua phân tích lưu lượng. Trong ứng dụng thì không lộ: không presence, không receipt, Buzz trả cùng phản hồi như offline.
- **Prosody là đơn điểm lỗi** và ghi SQL đồng bộ. Ngưỡng đo được khoảng 115 tin/giây trên máy dev. **Không tuyên bố scale out cho toàn hệ thống.** API thì chạy được nhiều bản (đã thử với 2 bản).
- **Chưa có:** xóa tài khoản (cần chốt chính sách), nhà cung cấp SMS thật, Audibles, chat nhóm, gọi thoại, gửi tệp, macOS/mobile (ngoài phạm vi MVP).
