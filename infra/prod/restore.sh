#!/usr/bin/env bash
# Khôi phục từ một bản backup. Quy trình an toàn: khôi phục vào DB MỚI → xóa tin quá hạn → đổi tên DB → chạy lại.
#   sudo bash infra/prod/restore.sh /var/backups/zahu/yc-XXXX.dump.enc
# Đặt YES=1 để bỏ câu hỏi xác nhận (dùng khi kiểm thử tự động).
set -euo pipefail
export MSYS_NO_PATHCONV=1  # chỉ có tác dụng khi chạy thử bằng Git Bash trên Windows
cd "$(dirname "$0")"
DC="docker compose --env-file .env"
FILE="${1:?Cần đường dẫn tệp backup}"
[ -f "$FILE" ] || { echo "Không thấy $FILE" >&2; exit 1; }
if [ "${YES:-}" != "1" ]; then
  read -r -p "Khôi phục sẽ THAY dữ liệu hiện tại bằng bản $FILE. Gõ YES để tiếp tục: " ok
  [ "$ok" = "YES" ] || { echo "Đã hủy."; exit 1; }
fi
APP_PW="$(grep -E '^YC_APP_DB_PASSWORD=' .env | cut -d= -f2- | tr -d '\r')"
PSQL="$DC exec -T postgres psql -q -v ON_ERROR_STOP=1 -U yc_owner -d postgres"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

echo "1) Giải mã bản backup"
$DC exec -T api node src/cli.ts backup decrypt < "$FILE" > "$TMP"
[ -s "$TMP" ] || { echo "LỖI: giải mã thất bại (sai YC_BACKUP_KEY?)" >&2; exit 1; }

echo "2) Khôi phục vào DB tạm yahoochat_restore"
$PSQL -c "DROP DATABASE IF EXISTS yahoochat_restore" -c "CREATE DATABASE yahoochat_restore OWNER yc_owner"
$DC exec -T postgres pg_restore -U yc_owner -d yahoochat_restore --exit-on-error < "$TMP"

echo "3) Xóa tin quá hạn trên DB tạm (BẮT BUỘC trước khi phục vụ)"
$DC exec -T -e YC_DATABASE_URL="postgres://yc_app:${APP_PW}@postgres:5432/yahoochat_restore" api node src/cli.ts purge

echo "4) Dừng dịch vụ, đổi DB"
$DC stop api prosody
$PSQL -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ('yahoochat','yahoochat_restore') AND pid <> pg_backend_pid()" >/dev/null
$PSQL -c "DROP DATABASE IF EXISTS yahoochat_old" -c "ALTER DATABASE yahoochat RENAME TO yahoochat_old" -c "ALTER DATABASE yahoochat_restore RENAME TO yahoochat"

echo "5) Chạy lại dịch vụ"
$DC up -d
echo "Xong. DB trước khi khôi phục được giữ tên yahoochat_old — kiểm tra ổn rồi xóa:"
echo "  sudo docker compose --env-file .env exec postgres psql -U yc_owner -d postgres -c 'DROP DATABASE yahoochat_old'"
