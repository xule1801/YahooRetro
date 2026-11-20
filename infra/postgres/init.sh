#!/bin/sh
# Tạo 2 role tách quyền: yc_app (schema app) và yc_prosody (bảng lưu trữ Prosody ở schema public).
set -e
psql -v ON_ERROR_STOP=1 -U yc_owner -d yahoochat <<SQL
CREATE ROLE yc_app LOGIN PASSWORD '${YC_APP_DB_PASSWORD}';
CREATE ROLE yc_prosody LOGIN PASSWORD '${YC_PROSODY_DB_PASSWORD}';
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO yc_prosody;
GRANT USAGE ON SCHEMA public TO yc_app;
CREATE SCHEMA app AUTHORIZATION yc_app;
-- Job xóa hết hạn của API cần đọc/xóa archive của Prosody:
ALTER DEFAULT PRIVILEGES FOR ROLE yc_prosody IN SCHEMA public GRANT SELECT, DELETE ON TABLES TO yc_app;
SQL
