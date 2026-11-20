#!/usr/bin/env bash
# Sao lưu toàn bộ DB (gồm dữ liệu chat của Prosody), mã hóa AES-256-GCM bằng YC_BACKUP_KEY, giữ tối đa 7 ngày.
# Cron chạy hằng ngày (setup.sh cài sẵn). Thư mục: YC_BACKUP_DIR (mặc định /var/backups/zahu).
set -euo pipefail
export MSYS_NO_PATHCONV=1  # chỉ có tác dụng khi chạy thử bằng Git Bash trên Windows
cd "$(dirname "$0")"
DC="docker compose --env-file .env"
DIR="${YC_BACKUP_DIR:-/var/backups/zahu}"
mkdir -p "$DIR"
chmod 700 "$DIR" 2>/dev/null || true
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$DIR/yc-$TS.dump.enc"
$DC exec -T postgres pg_dump -U yc_owner -d yahoochat -Fc | $DC exec -T api node src/cli.ts backup encrypt > "$OUT.tmp"
if [ "$(wc -c < "$OUT.tmp")" -le 1000 ]; then
  echo "LỖI: bản backup quá nhỏ, có thể đã thất bại" >&2; rm -f "$OUT.tmp"; exit 1
fi
mv "$OUT.tmp" "$OUT"
chmod 600 "$OUT" 2>/dev/null || true
# Chính sách đã duyệt: bản sao lưu tồn tại tối đa 7 ngày
find "$DIR" -maxdepth 1 -name 'yc-*.dump.enc' -mtime +6 -print -delete
echo "Đã sao lưu: $OUT ($(wc -c < "$OUT") byte)"
