ALTER TABLE delivery
  ADD COLUMN status_updated_at TIMESTAMPTZ,
  ADD COLUMN claimed_at        TIMESTAMPTZ,
  ADD COLUMN claim_id          UUID;

CREATE INDEX idx_delivery_logist_task ON delivery(logist_id, task_date);
