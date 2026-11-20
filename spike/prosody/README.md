# Spike Prosody — trạng thái: CHƯA CHẠY

Mục tiêu: chứng minh/bác bỏ 6 tiêu chí trong `docs/decisions/001-chat-platform.md` §5.

```bash
cd spike/prosody
docker compose up -d
docker compose exec prosody prosodyctl register alice localhost alice-test-pw
docker compose exec prosody prosodyctl register bob   localhost bob-test-pw
```

Sau đó kiểm tra từng tiêu chí bằng client test (sẽ viết bằng `@xmpp/client` sau khi được phép chạy) và ghi
lệnh, phiên bản image (`docker compose exec prosody prosodyctl about`), đầu ra và kết luận đạt/không đạt vào ADR 001.
Tiêu chí 5 và 6 cần module Lua tùy biến; nếu không viết được gọn, ghi "không đạt" và quay lại quyết định A/B.

Dọn: `docker compose down -v`.
