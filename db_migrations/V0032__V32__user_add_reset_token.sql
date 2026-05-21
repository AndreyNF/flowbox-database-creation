ALTER TABLE "user"
  ADD COLUMN reset_token         TEXT,
  ADD COLUMN reset_token_expires TIMESTAMPTZ;

CREATE INDEX idx_user_reset_token ON "user"(reset_token) WHERE reset_token IS NOT NULL;
