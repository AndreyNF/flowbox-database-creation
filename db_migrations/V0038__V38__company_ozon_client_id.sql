-- Добавляем ozon_client_id в company (отдельно от ozon_api_key)
ALTER TABLE company
  ADD COLUMN IF NOT EXISTS ozon_client_id text;
