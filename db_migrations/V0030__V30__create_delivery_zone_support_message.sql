CREATE TABLE delivery_zone (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city           TEXT NOT NULL,
  region         TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'active',
  min_rate       NUMERIC(10,2) NOT NULL DEFAULT 0,
  rate_per_kg    NUMERIC(10,2) NOT NULL DEFAULT 0,
  delivery_days  INTEGER NOT NULL DEFAULT 1,
  tc_partners    JSONB NOT NULL DEFAULT '[]',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_delivery_zone_status ON delivery_zone(status);
CREATE INDEX idx_delivery_zone_city   ON delivery_zone(city);

CREATE TABLE support_message (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES company(id),
  user_id    UUID REFERENCES "user"(id),
  from_role  TEXT NOT NULL DEFAULT 'client',
  text       TEXT NOT NULL,
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_support_message_company_id ON support_message(company_id);
CREATE INDEX idx_support_message_created_at ON support_message(created_at);
