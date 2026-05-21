CREATE INDEX idx_claim_created_at       ON claim(created_at);
CREATE INDEX idx_transaction_created_at ON transaction(created_at);
CREATE INDEX idx_bank_transaction_created_at ON bank_transaction(received_at);
