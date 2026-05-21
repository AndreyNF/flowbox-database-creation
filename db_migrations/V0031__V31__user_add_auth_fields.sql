CREATE TYPE user_role_enum AS ENUM ('admin', 'manager', 'client');

ALTER TABLE "user"
  ADD COLUMN role            user_role_enum NOT NULL DEFAULT 'manager',
  ADD COLUMN password_hash   TEXT,
  ADD COLUMN company_id      UUID REFERENCES company(id),
  ADD COLUMN is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN last_login_at   TIMESTAMPTZ,
  ADD COLUMN refresh_token   TEXT,
  ADD COLUMN refresh_expires TIMESTAMPTZ,
  ADD COLUMN archived_at     TIMESTAMPTZ;

CREATE INDEX idx_user_email      ON "user"(email);
CREATE INDEX idx_user_role       ON "user"(role);
CREATE INDEX idx_user_company_id ON "user"(company_id);
