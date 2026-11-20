-- Prosody cho YahooChat. Secret lấy từ biến môi trường, không ghi vào tệp.
local env = Lua.os.getenv
plugin_paths = { "/etc/prosody/yc_plugins" }
admins = { }
modules_enabled = { "roster"; "saslauth"; "tls"; "disco"; "carbons"; "ping"; "mam"; "yc_policy"; }
-- Tắt những gì không dùng hoặc có thể lộ thông tin/hiện diện:
modules_disabled = { "offline"; "s2s"; "version"; "uptime"; "time"; "lastactivity"; "vcard"; "vcard_legacy"; "pep"; "register"; "bosh"; "websocket"; "http"; "admin_adhoc"; "invites"; }
c2s_require_encryption = true
c2s_direct_tls_ports = { 5223 } -- client dùng TLS trực tiếp (xmpps); 5222 chỉ cho appsvc nội bộ
s2s_require_encryption = true
storage = "sql"
sql = { driver = "PostgreSQL"; database = "yahoochat"; username = "yc_prosody"; password = env("YC_PROSODY_DB_PASSWORD"); host = "postgres"; }
archive_expires_after = Lua.tonumber(env("YC_MESSAGE_TTL_DAYS") or "30") * 86400
default_archive_policy = true
max_archive_query_results = 200
log = { info = "*console" }  -- không log nội dung stanza ở mức info
VirtualHost (env("YC_DOMAIN") or "localhost")
  authentication = "appsvc"
  appsvc_token_secret = env("YC_XMPP_TOKEN_SECRET")
  yc_appsvc_user = "appsvc"
