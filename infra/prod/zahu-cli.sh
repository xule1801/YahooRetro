#!/usr/bin/env bash
# Chạy lệnh quản trị trong container API. Ví dụ:
#   sudo bash infra/prod/zahu-cli.sh invite create --note "Tên bạn"
#   sudo bash infra/prod/zahu-cli.sh invite list
#   sudo bash infra/prod/zahu-cli.sh user disable <nick>
#   sudo bash infra/prod/zahu-cli.sh purge
set -euo pipefail
export MSYS_NO_PATHCONV=1  # chỉ có tác dụng khi chạy thử bằng Git Bash trên Windows
cd "$(dirname "$0")"
exec docker compose --env-file .env exec -T api node src/cli.ts "$@"
