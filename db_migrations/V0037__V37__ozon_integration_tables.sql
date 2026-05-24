-- Атрибуты категорий Ozon (description-category/attribute)
CREATE TABLE ozon_category_attribute (
  id                      bigint PRIMARY KEY,
  description_category_id bigint NOT NULL,
  category_name           text NOT NULL,
  name                    text NOT NULL,
  description             text,
  type                    text,
  is_required             boolean NOT NULL DEFAULT false,
  is_collection           boolean NOT NULL DEFAULT false,
  group_name              text,
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Справочные значения атрибутов
CREATE TABLE ozon_attribute_value (
  id           bigint NOT NULL,
  attribute_id bigint NOT NULL,
  value        text NOT NULL,
  info         text,
  picture      text,
  PRIMARY KEY (id, attribute_id)
);

-- Очередь обновления цен (не чаще 1 раза в 8 минут на товар)
CREATE TABLE ozon_price_queue (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid NOT NULL REFERENCES product(id),
  company_id   uuid NOT NULL REFERENCES company(id),
  new_price    numeric(14,2) NOT NULL,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  sent_at      timestamptz,
  status       text NOT NULL DEFAULT 'pending',
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_price_queue_product ON ozon_price_queue(product_id) WHERE status = 'pending';

-- Лог вызовов Ozon API
CREATE TABLE ozon_api_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid REFERENCES company(id),
  endpoint    text NOT NULL,
  method      text NOT NULL DEFAULT 'POST',
  status_code int,
  error       text,
  duration_ms int,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ozon_api_log_company ON ozon_api_log(company_id, created_at DESC);

-- Привязка Ozon posting к нашему order
ALTER TABLE "order"
  ADD COLUMN IF NOT EXISTS ozon_posting_number text,
  ADD COLUMN IF NOT EXISTS ozon_posting_status  text;
CREATE INDEX IF NOT EXISTS idx_order_posting ON "order"(ozon_posting_number) WHERE ozon_posting_number IS NOT NULL;

-- Дополнительные поля product для Ozon
ALTER TABLE product
  ADD COLUMN IF NOT EXISTS ozon_product_id  bigint,
  ADD COLUMN IF NOT EXISTS ozon_sku         bigint,
  ADD COLUMN IF NOT EXISTS price_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS stock_synced_at  timestamptz;
CREATE INDEX IF NOT EXISTS idx_product_ozon_id ON product(ozon_product_id) WHERE ozon_product_id IS NOT NULL;
