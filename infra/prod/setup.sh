#!/usr/bin/env bash
# Cài Zahu!Messenger server lên Ubuntu 22.04/24.04 (Oracle Cloud Ampere ARM hoặc máy x86).
#   sudo bash infra/prod/setup.sh <tên-miền> <email>
#   vd: sudo bash infra/prod/setup.sh zahuchat.duckdns.org ban@example.com
# Chạy lại an toàn: không tạo lại secret đã có trong infra/prod/.env.
set -euo pipefail
export MSYS_NO_PATHCONV=1  # chỉ có tác dụng khi chạy thử bằng Git Bash trên Windows
[ "$(id -u)" = 0 ] || { echo "Hãy chạy bằng sudo." >&2; exit 1; }
DOMAIN="${1:-}"
EMAIL="${2:-}"
usage() { echo "Cách dùng: sudo bash infra/prod/setup.sh <tên-miền> <email>" >&2; exit 1; }
[[ "$DOMAIN" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$ ]] || usage
[[ "$EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || usage
cd "$(dirname "$0")"
HERE="$(pwd)"
DC="docker compose --env-file .env"

echo "== 1/7 Cài Docker, cron và công cụ"
export DEBIAN_FRONTEND=noninteractive
if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y docker.io docker-compose-v2 cron openssl curl
  systemctl enable --now docker
fi
command -v netfilter-persistent >/dev/null 2>&1 || apt-get install -y iptables-persistent

echo "== 2/7 Mở cổng 80, 443, 5223 trong tường lửa của máy (Ubuntu trên Oracle chặn mặc định)"
for p in 80 443 5223; do
  if ! iptables -C INPUT -p tcp -m state --state NEW --dport "$p" -j ACCEPT 2>/dev/null; then
    n="$(iptables -L INPUT --line-numbers -n | awk '$2=="REJECT"{print $1; exit}')"
    if [ -n "$n" ]; then
      iptables -I INPUT "$n" -p tcp -m state --state NEW --dport "$p" -j ACCEPT
    else
      iptables -A INPUT -p tcp -m state --state NEW --dport "$p" -j ACCEPT
    fi
  fi
done
netfilter-persistent save >/dev/null

echo "== 3/7 Kiểm tra tên miền đã trỏ về máy này"
PUBIP="$(curl -fsS4 --max-time 10 https://ifconfig.me || true)"
DNSIP="$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}')"
echo "   IP công khai của máy: ${PUBIP:-?}   |   $DOMAIN -> ${DNSIP:-chưa phân giải được}"
if [ -z "$DNSIP" ] || [ "$PUBIP" != "$DNSIP" ]; then
  echo "CẢNH BÁO: tên miền chưa trỏ đúng IP máy chủ, Let's Encrypt sẽ không cấp chứng chỉ." >&2
  if [ "${FORCE:-}" != "1" ]; then
    echo "Sửa DNS (vd trên duckdns.org) rồi chạy lại. Hoặc đặt FORCE=1 để bỏ qua kiểm tra." >&2
    exit 1
  fi
fi

echo "== 4/7 Tạo cấu hình bí mật infra/prod/.env (chỉ root đọc được)"
if [ ! -f .env ]; then
  umask 077
  r() { openssl rand -hex "$1"; }
  {
    echo "# Tạo bởi setup.sh $(date -u +%F). KHÔNG commit, KHÔNG gửi file này cho ai. Hãy sao lưu riêng YC_BACKUP_KEY."
    echo "YC_DOMAIN=$DOMAIN"
    echo "YC_TLS_MODE=$EMAIL"
    echo "YC_PROSODY_IMAGE=prosodyim/prosody:13.0@sha256:529999c9e4f20cfa5040450530f219bb1723d6471b3b8299ce5e6c64a9f208a5"
    echo "YC_PG_OWNER_PASSWORD=$(r 24)"
    echo "YC_APP_DB_PASSWORD=$(r 24)"
    echo "YC_PROSODY_DB_PASSWORD=$(r 24)"
    echo "YC_XMPP_TOKEN_SECRET=$(r 32)"
    echo "YC_OTP_SECRET=$(r 32)"
    echo "YC_BACKUP_KEY=$(r 32)"
    echo "YC_MESSAGE_TTL_DAYS=30"
    echo "# Email OTP thật (vd Brevo): bỏ dấu # ở 5 dòng dưới, điền thông tin, XÓA dòng COMPOSE_PROFILES,"
    echo "# rồi chạy: sudo docker compose --env-file .env up -d"
    echo "# YC_SMTP_HOST=smtp-relay.brevo.com"
    echo "# YC_SMTP_PORT=587"
    echo "# YC_SMTP_USER="
    echo "# YC_SMTP_PASS="
    echo "# YC_SMTP_FROM=Zahu!Messenger <no-reply@ten-mien-cua-ban>"
    echo "# Tạm thời: hộp thư nội bộ Mailpit (xem mã OTP qua đường hầm SSH — docs/deploy-oracle.md)"
    echo "COMPOSE_PROFILES=mailpit"
  } > .env
  echo "   Đã tạo .env mới."
else
  echo "   Giữ nguyên .env đã có."
fi

echo "== 5/7 Build và khởi động dịch vụ (lần đầu mất vài phút)"
mkdir -p "certs/$DOMAIN"
if [ ! -s "certs/$DOMAIN/fullchain.pem" ]; then
  # Chứng chỉ tạm 2 ngày để Prosody khởi động; bước 6 thay bằng chứng chỉ Let's Encrypt
  openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj "/CN=$DOMAIN" \
    -keyout "certs/$DOMAIN/privkey.pem" -out "certs/$DOMAIN/fullchain.pem" >/dev/null 2>&1
  chown -R 100:102 certs
  chmod 755 certs "certs/$DOMAIN"
  chmod 640 "certs/$DOMAIN/privkey.pem"
  chmod 644 "certs/$DOMAIN/fullchain.pem"
fi
$DC build api
$DC up -d

echo "== 6/7 Lấy chứng chỉ Let's Encrypt (Caddy) và nạp cho cổng chat 5223"
bash sync-certs.sh

echo "== 7/7 Lịch tự động: backup 03:00, đồng bộ chứng chỉ 04:00 (giờ máy chủ)"
cat > /etc/cron.d/zahu <<CRON
SHELL=/bin/bash
0 3 * * * root bash $HERE/backup.sh >> /var/log/zahu-backup.log 2>&1
0 4 * * * root bash $HERE/sync-certs.sh >> /var/log/zahu-certs.log 2>&1
CRON
systemctl enable --now cron >/dev/null 2>&1 || true

echo
if curl -fsS --max-time 15 "https://$DOMAIN/healthz" >/dev/null; then
  echo "HOÀN TẤT: https://$DOMAIN/healthz trả lời OK."
else
  echo "Dịch vụ đã chạy nhưng chưa truy cập được https://$DOMAIN — xem: sudo docker compose --env-file $HERE/.env logs caddy api"
fi
echo "Bước tiếp theo:"
echo "  - Tạo mã mời:      sudo bash $HERE/zahu-cli.sh invite create --note \"Tên bạn\""
echo "  - Xem trạng thái:  cd $HERE && sudo docker compose --env-file .env ps"
echo "  - Client Windows:  đặt \"apiBase\": \"https://$DOMAIN\" trong apps/windows/app-config.json rồi build bản cài."
