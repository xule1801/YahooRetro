-- Schema app — YahooChat MVP. Mọi mốc thời gian là timestamptz (UTC) do API gán.
CREATE TABLE app.users (
  id uuid PRIMARY KEY,
  nick text NOT NULL,
  email text UNIQUE,
  phone text UNIQUE,
  password_hash text NOT NULL,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL,
  password_changed_at timestamptz NOT NULL,
  CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

-- Một nick (chữ thường) chỉ có một dòng: đang dùng (active) hoặc đang giữ (held) tới released_at.
-- Khóa chính bảo đảm hai giao dịch đồng thời không thể cùng nhận một nick.
CREATE TABLE app.nick_claims (
  nick_lower text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('active','held')),
  released_at timestamptz,
  CHECK ((kind = 'held') = (released_at IS NOT NULL))
);
CREATE UNIQUE INDEX nick_claims_one_active ON app.nick_claims(user_id) WHERE kind = 'active';

CREATE TABLE app.invites (
  id uuid PRIMARY KEY,
  code_hash text NOT NULL UNIQUE,
  code_last4 text NOT NULL,
  max_uses int NOT NULL CHECK (max_uses > 0),
  uses int NOT NULL DEFAULT 0 CHECK (uses >= 0 AND uses <= max_uses),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  note text,
  created_at timestamptz NOT NULL
);

CREATE TABLE app.registrations (
  id uuid PRIMARY KEY,
  invite_id uuid NOT NULL REFERENCES app.invites(id),
  channel text NOT NULL CHECK (channel IN ('email','phone')),
  address text NOT NULL,
  otp_hash text,                -- NULL: địa chỉ đã có tài khoản → không bao giờ xác minh được
  otp_expires_at timestamptz NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  verified_at timestamptz,
  verification_token_hash text UNIQUE,
  completed_at timestamptz,
  created_at timestamptz NOT NULL
);

CREATE TABLE app.otp_sends (address text NOT NULL, purpose text NOT NULL, sent_at timestamptz NOT NULL);
CREATE INDEX otp_sends_addr ON app.otp_sends(address, sent_at);

CREATE TABLE app.recoveries (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES app.users(id) ON DELETE CASCADE,
  otp_hash text,
  otp_expires_at timestamptz NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  used_at timestamptz,
  created_at timestamptz NOT NULL
);

CREATE TABLE app.sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX sessions_user ON app.sessions(user_id);

CREATE TABLE app.login_failures (key text NOT NULL, at timestamptz NOT NULL);
CREATE INDEX login_failures_key ON app.login_failures(key, at);

CREATE TABLE app.contact_groups (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX contact_groups_name ON app.contact_groups(user_id, lower(name));
CREATE UNIQUE INDEX contact_groups_default ON app.contact_groups(user_id) WHERE is_default;

CREATE TABLE app.friend_requests (
  id uuid PRIMARY KEY,
  from_user uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  to_user uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending','accepted','declined','cancelled')),
  suppressed boolean NOT NULL DEFAULT false, -- người nhận đã chặn người gửi: ẩn với người nhận, không tiết lộ cho người gửi
  created_at timestamptz NOT NULL,
  decided_at timestamptz,
  CHECK (from_user <> to_user)
);
CREATE UNIQUE INDEX friend_requests_pending ON app.friend_requests(from_user, to_user) WHERE status = 'pending';

-- Hai dòng cho mỗi quan hệ (mỗi phía có nhóm riêng).
CREATE TABLE app.friendships (
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  friend_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES app.contact_groups(id),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, friend_id)
);

CREATE TABLE app.blocks (
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, blocked_id)
);

CREATE TABLE app.buzz_rate (
  from_user uuid NOT NULL, to_user uuid NOT NULL, last_at timestamptz NOT NULL,
  PRIMARY KEY (from_user, to_user)
);

CREATE TABLE app.idempotency (
  user_id uuid NOT NULL, key text NOT NULL, route text NOT NULL,
  status int NOT NULL, body jsonb NOT NULL, created_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, key)
);

-- Lệnh tới Prosody ghi trong cùng giao dịch, gửi sau commit, retry tới khi thành công.
CREATE TABLE app.xmpp_outbox (
  id bigserial PRIMARY KEY,
  action text NOT NULL, attrs jsonb NOT NULL,
  attempts int NOT NULL DEFAULT 0, last_error text,
  created_at timestamptz NOT NULL, done_at timestamptz
);
CREATE INDEX xmpp_outbox_pending ON app.xmpp_outbox(id) WHERE done_at IS NULL;

-- Chỉ dùng khi YC_SMS_PROVIDER=fake (môi trường thử).
CREATE TABLE app.fake_sms_outbox (id bigserial PRIMARY KEY, phone text NOT NULL, body text NOT NULL, created_at timestamptz NOT NULL);

CREATE TABLE app.job_runs (
  id bigserial PRIMARY KEY, job text NOT NULL, ran_at timestamptz NOT NULL,
  ok boolean NOT NULL, deleted bigint NOT NULL DEFAULT 0, error text
);
