#!/usr/bin/env bash
# Cập nhật máy chủ lên mã mới nhất trên GitHub (sao lưu trước khi cập nhật).
#   sudo bash infra/prod/update.sh
set -euo pipefail
export MSYS_NO_PATHCONV=1  # chỉ có tác dụng khi chạy thử bằng Git Bash trên Windows
cd "$(dirname "$0")"
DC="docker compose --env-file .env"
bash backup.sh
git -C ../.. pull --ff-only
$DC build api
$DC up -d
bash sync-certs.sh || true
echo "Đã cập nhật. Kiểm tra: curl -fsS https://$(grep -E '^YC_DOMAIN=' .env | cut -d= -f2-)/healthz"
