-- Cấu hình spike: KHÔNG dùng cho môi trường thật.
plugin_paths = { "/etc/prosody/spike_plugins" }
admins = { }
modules_disabled = { "offline" }
modules_enabled = {
  "roster"; "saslauth"; "tls"; "disco"; "carbons"; "pep";
  "mam"; "ping"; "websocket"; "spike_policy";
}
c2s_require_encryption = false     -- chỉ localhost
allow_unencrypted_plain_auth = true -- chỉ localhost
consider_websocket_secure = true
archive_expires_after = 60          -- mô phỏng 30 ngày bằng 60 giây (tiêu chí 2)
default_archive_policy = true
storage = "internal"
log = { debug = "*console" }
VirtualHost "localhost"
  authentication = "appsvc"
  appsvc_token_secret = "spike-only-not-a-real-secret"
