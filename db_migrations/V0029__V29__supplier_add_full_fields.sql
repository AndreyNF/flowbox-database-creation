ALTER TABLE supplier
  ADD COLUMN short_name      TEXT,
  ADD COLUMN inn             TEXT,
  ADD COLUMN kpp             TEXT,
  ADD COLUMN ogrn            TEXT,
  ADD COLUMN legal_address   TEXT,
  ADD COLUMN vat_payer       BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN contact_person  TEXT,
  ADD COLUMN email           TEXT,
  ADD COLUMN phone           TEXT,
  ADD COLUMN warehouse_address TEXT,
  ADD COLUMN pickup_hours    TEXT,
  ADD COLUMN working_days    TEXT,
  ADD COLUMN status          TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN legal_history   JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN archived_at     TIMESTAMPTZ;

CREATE INDEX idx_supplier_status ON supplier(status);
CREATE INDEX idx_supplier_inn    ON supplier(inn);
