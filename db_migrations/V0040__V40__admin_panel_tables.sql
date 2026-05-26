ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS phone              text,
  ADD COLUMN IF NOT EXISTS access_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS blocked_at        timestamptz,
  ADD COLUMN IF NOT EXISTS blocked_reason    text;

CREATE TABLE IF NOT EXISTS login_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES "user"(id),
  email      text,
  ip         text,
  user_agent text,
  success    boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_log_user ON login_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_log_created ON login_log(created_at DESC);

CREATE TABLE IF NOT EXISTS admin_action_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    uuid REFERENCES "user"(id),
  action      text NOT NULL,
  target_type text,
  target_id   text,
  details     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_log_created ON admin_action_log(created_at DESC);
