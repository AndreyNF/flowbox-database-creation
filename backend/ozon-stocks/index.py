import json
import os
from datetime import datetime, timezone, timedelta
# v2

import psycopg2

from ozon_client import get_db, get_company_credentials, ozon_post, notify_manager

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}


def resp(status, body):
    return {"statusCode": status, "headers": CORS,
            "body": json.dumps(body, ensure_ascii=False, default=str)}


def handler(event, context):
    """
    Синхронизация остатков и цен с Ozon.

    POST /?action=sync_stocks&company_id=...
      — синхронизировать все изменившиеся остатки компании

    POST /?action=sync_product&company_id=...&product_id=...
      — немедленно синхронизировать один товар (после резерва/отмены)

    POST /?action=flush_price_queue
      — отправить накопившиеся обновления цен (запускается планировщиком)

    POST /?action=update_price body={product_id, company_id, price}
      — поставить обновление цены в очередь
    """
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    params = event.get("queryStringParameters") or {}
    action = params.get("action", "sync_stocks")
    body   = json.loads(event.get("body") or "{}")

    company_id = body.get("company_id") or params.get("company_id")
    conn = get_db()
    cur  = conn.cursor()

    try:
        # ── SYNC STOCKS (batch, все изменившиеся) ────────────────────────────
        if action == "sync_stocks":
            if not company_id:
                return _sync_all_companies(cur, conn)

            client_id, api_key = get_company_credentials(company_id)
            if not client_id or not api_key:
                return resp(200, {"ok": True, "skipped": "no_credentials"})

            cur.execute(
                "SELECT ozon_warehouse_id FROM company WHERE id = %s", (company_id,)
            )
            row = cur.fetchone()
            warehouse_id = row[0] if row else None
            if not warehouse_id:
                return resp(200, {"ok": True, "skipped": "no_warehouse"})

            synced = _sync_company_stocks(
                cur, conn, client_id, api_key, company_id, warehouse_id
            )
            return resp(200, {"ok": True, "synced": synced})

        # ── SYNC ONE PRODUCT (немедленно после резерва/отмены) ───────────────
        elif action == "sync_product":
            product_id = body.get("product_id") or params.get("product_id")
            if not company_id or not product_id:
                return resp(400, {"error": "company_id и product_id обязательны"})

            client_id, api_key = get_company_credentials(company_id)
            if not client_id or not api_key:
                return resp(200, {"ok": True, "skipped": "no_credentials"})

            cur.execute(
                "SELECT ozon_warehouse_id FROM company WHERE id = %s", (company_id,)
            )
            row = cur.fetchone()
            warehouse_id = row[0] if row else None

            cur.execute(
                """SELECT supplier_article, stock_available, stock_reserved,
                          moderation_status_ozon
                   FROM product WHERE id = %s""",
                (product_id,),
            )
            p = cur.fetchone()
            if not p or p[3] != "approved":
                return resp(200, {"ok": True, "skipped": "not_approved"})

            offer_id = p[0] or product_id[:20]
            stock    = max(0, (p[1] or 0) - (p[2] or 0))

            s, d = ozon_post(
                client_id, api_key,
                "/v2/products/stocks",
                {"stocks": [{"offer_id": offer_id,
                             "warehouse_id": warehouse_id,
                             "stock": stock}]},
                company_id,
            )

            if stock == 0:
                notify_manager(cur, company_id, "stock_zero",
                               f"Товар {offer_id} — остаток на Ozon обнулён.",
                               "product", product_id)

            cur.execute(
                "UPDATE product SET stock_synced_at = now() WHERE id = %s", (product_id,)
            )
            conn.commit()
            return resp(200, {"ok": True, "stock": stock, "ozon_status": s})

        # ── UPDATE PRICE (добавить в очередь) ────────────────────────────────
        elif action == "update_price":
            product_id = body.get("product_id")
            new_price  = body.get("price")

            if not company_id or not product_id or new_price is None:
                return resp(400, {"error": "company_id, product_id, price обязательны"})

            now = datetime.now(timezone.utc)
            # Проверяем, не слишком ли часто (8 минут)
            cur.execute(
                "SELECT price_updated_at FROM product WHERE id = %s", (product_id,)
            )
            row = cur.fetchone()
            last_updated = row[0] if row else None

            if last_updated and (now - last_updated).total_seconds() < 480:
                # Ставим в очередь
                cur.execute(
                    """INSERT INTO ozon_price_queue (product_id, company_id, new_price, scheduled_at)
                       VALUES (%s, %s, %s, %s)
                       ON CONFLICT (product_id) WHERE status = 'pending'
                       DO UPDATE SET new_price = EXCLUDED.new_price, scheduled_at = EXCLUDED.scheduled_at""",
                    (product_id, company_id, float(new_price),
                     last_updated + timedelta(seconds=480))
                )
                conn.commit()
                return resp(200, {"ok": True, "queued": True,
                                  "send_at": (last_updated + timedelta(seconds=480)).isoformat()})

            # Отправляем сразу
            client_id, api_key = get_company_credentials(company_id)
            if client_id and api_key:
                cur.execute("SELECT supplier_article FROM product WHERE id = %s", (product_id,))
                row = cur.fetchone()
                offer_id = row[0] if row and row[0] else product_id[:20]

                ozon_post(
                    client_id, api_key,
                    "/v1/product/import/prices",
                    {"prices": [{
                        "auto_action_enabled": "UNKNOWN",
                        "currency_code":       "RUB",
                        "min_price":           str(int(float(new_price) * 0.8)),
                        "offer_id":            offer_id,
                        "old_price":           "0",
                        "price":               str(int(float(new_price))),
                    }]},
                    company_id,
                )

            cur.execute(
                "UPDATE product SET our_price = %s, price_updated_at = now() WHERE id = %s",
                (float(new_price), product_id)
            )
            conn.commit()
            return resp(200, {"ok": True, "queued": False, "sent": True})

        # ── FLUSH PRICE QUEUE (планировщик, каждые 2 мин) ────────────────────
        elif action == "flush_price_queue":
            now = datetime.now(timezone.utc)
            cur.execute(
                """SELECT q.id, q.product_id, q.company_id, q.new_price,
                          p.supplier_article
                   FROM ozon_price_queue q
                   JOIN product p ON p.id = q.product_id
                   WHERE q.status = 'pending' AND q.scheduled_at <= %s
                   ORDER BY q.scheduled_at
                   LIMIT 50""",
                (now,)
            )
            rows = cur.fetchall()
            sent = 0
            for qid, prod_id, cid, price, offer_id in rows:
                client_id, api_key = get_company_credentials(str(cid))
                if not client_id or not api_key:
                    continue
                offer = offer_id or str(prod_id)[:20]
                ozon_post(
                    client_id, api_key,
                    "/v1/product/import/prices",
                    {"prices": [{
                        "auto_action_enabled": "UNKNOWN",
                        "currency_code":       "RUB",
                        "min_price":           str(int(float(price) * 0.8)),
                        "offer_id":            offer,
                        "old_price":           "0",
                        "price":               str(int(float(price))),
                    }]},
                    str(cid),
                )
                cur.execute(
                    """UPDATE ozon_price_queue SET status = 'sent', sent_at = now()
                       WHERE id = %s""",
                    (str(qid),)
                )
                cur.execute(
                    "UPDATE product SET price_updated_at = now(), our_price = %s WHERE id = %s",
                    (float(price), str(prod_id))
                )
                sent += 1

            conn.commit()
            return resp(200, {"ok": True, "sent": sent})

        else:
            return resp(400, {"error": f"Неизвестное действие: {action}"})

    finally:
        cur.close()
        conn.close()


def _sync_all_companies(cur, conn):
    """Синхронизирует остатки всех активных компаний с Ozon."""
    cur.execute(
        """SELECT id, ozon_client_id, ozon_api_key, ozon_warehouse_id
           FROM company
           WHERE status = 'active'
             AND ozon_api_key IS NOT NULL
             AND ozon_warehouse_id IS NOT NULL"""
    )
    companies = cur.fetchall()
    total = 0
    for cid, cli_id, api_key, wh_id in companies:
        if not cli_id or not api_key:
            continue
        try:
            synced = _sync_company_stocks(cur, conn, cli_id, api_key, str(cid), wh_id)
            total += synced
        except Exception:
            pass
    return resp(200, {"ok": True, "companies": len(companies), "synced": total})


def _sync_company_stocks(cur, conn, client_id, api_key, company_id, warehouse_id):
    """Синхронизирует остатки для одной компании. Возвращает кол-во обновлённых."""
    cur.execute(
        """SELECT p.id, p.supplier_article, p.stock_available, p.stock_reserved,
                  p.moderation_status_ozon
           FROM product p
           JOIN "order" o ON o.product_id = p.id
           WHERE o.company_id = %s
             AND p.moderation_status_ozon = 'approved'
             AND p.archived_at IS NULL
           GROUP BY p.id""",
        (company_id,),
    )
    products = cur.fetchall()
    if not products:
        return 0

    # Группируем по 100
    batch_size = 100
    sent = 0
    for i in range(0, len(products), batch_size):
        batch = products[i:i + batch_size]
        stocks = []
        for prod_id, offer_id, avail, reserved, mod_status in batch:
            stock = max(0, (avail or 0) - (reserved or 0))
            stocks.append({
                "offer_id":     offer_id or str(prod_id)[:20],
                "warehouse_id": warehouse_id,
                "stock":        stock,
            })
            if stock == 0:
                notify_manager(cur, company_id, "stock_zero",
                               f"Товар {offer_id or str(prod_id)[:12]} — остаток 0.",
                               "product", str(prod_id))

        s, d = ozon_post(client_id, api_key, "/v2/products/stocks",
                         {"stocks": stocks}, company_id)
        if s == 200:
            ids = [str(r[0]) for r in batch]
            cur.execute(
                "UPDATE product SET stock_synced_at = now() WHERE id = ANY(%s::uuid[])",
                (ids,)
            )
            sent += len(batch)

    conn.commit()
    return sent