#!/usr/bin/env bash
# Đồng bộ chứng chỉ TLS mà Caddy đã lấy (Let's Encrypt) sang Prosody cho cổng chat 5223.
# Chạy khi cài đặt và hằng ngày (cron). Chỉ nạp lại Prosody khi chứng chỉ thay đổi.
set -euo pipefail
export MSYS_NO_PATHCONV=1  # chỉ có tác dụng khi chạy thử bằng Git Bash trên Windows
cd "$(dirname "$0")"
DC="docker compose --env-file .env"
DOMAIN="$(grep -E '^YC_DOMAIN=' .env | cut -d= -f2- | tr -d '\r')"
CRT=""
for _ in $(seq 1 60); do
  CRT="$($DC exec -T caddy sh -c "find /data/caddy/certificates -type f -name '${DOMAIN}.crt' | head -1" 2>/dev/null | tr -d '\r' || true)"
  [ -n "$CRT" ] && break
  sleep 5
done
if [ -z "$CRT" ]; then
  echo "LỖI: Caddy chưa lấy được chứng chỉ cho ${DOMAIN}. Kiểm tra: tên miền trỏ đúng IP máy chủ, cổng 80/443 đã mở (Security List + tường lửa)." >&2
  echo "Xem log: docker compose --env-file .env logs caddy" >&2
  exit 1
fi
KEY="${CRT%.crt}.key"
D="certs/${DOMAIN}"   # bố cục Prosody đọc: <tên-miền>/fullchain.pem + privkey.pem
mkdir -p "$D"
$DC exec -T caddy cat "$CRT" > "$D/fullchain.pem.new"
$DC exec -T caddy cat "$KEY" > "$D/privkey.pem.new"
if [ ! -s "$D/fullchain.pem.new" ] || [ ! -s "$D/privkey.pem.new" ]; then
  echo "LỖI: chép chứng chỉ thất bại" >&2; rm -f "$D"/*.new; exit 1
fi
if cmp -s "$D/fullchain.pem.new" "$D/fullchain.pem" 2>/dev/null; then
  rm -f "$D"/*.new; echo "Chứng chỉ không đổi."; exit 0
fi
mv "$D/fullchain.pem.new" "$D/fullchain.pem"
mv "$D/privkey.pem.new" "$D/privkey.pem"
# Prosody chạy với uid 100 / gid 102 trong container
chown -R 100:102 certs 2>/dev/null || true
chmod 755 certs "$D"
chmod 644 "$D/fullchain.pem"
chmod 640 "$D/privkey.pem"
if [ -n "$($DC ps -q prosody 2>/dev/null)" ]; then
  # Khởi động lại Prosody để nạp chứng chỉ mới (chỉ khi chứng chỉ đổi, ~60 ngày/lần; app tự kết nối lại).
  $DC restart prosody >/dev/null && echo "Đã cập nhật chứng chỉ và khởi động lại Prosody."
else
  echo "Đã cập nhật chứng chỉ."
fi
