import json
import os
from datetime import datetime, timezone, date
# v2

import psycopg2

from ozon_client import (
    get_db, get_company_credentials, ozon_post,
    notify_users_by_role, notify_manager, notify_company_users,
)

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}


def resp(status, body):
    return {"statusCode": status, "headers": CORS,
            "body": json.dumps(body, ensure_ascii=False, default=str)}


def handler(event, context):
    """
    Ozon Orders — опрос, подтверждение, смена статусов.

    POST /?action=poll                    — опрос новых заказов (каждые 5 мин)
    POST /?action=confirm body={posting_number, company_id}  — подтвердить заказ
    POST /?action=status  body={delivery_id, status, company_id} — сменить статус
    """
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    params = event.get("queryStringParameters") or {}
    action = params.get("action", "poll")
    body   = json.loads(event.get("body") or "{}")

    conn = get_db()
    cur  = conn.cursor()

    try:
        # ── POLL NEW ORDERS ───────────────────────────────────────────────────
        if action == "poll":
            company_id = body.get("company_id")
            if company_id:
                companies = _get_one_company(cur, company_id)
            else:
                cur.execute(
                    """SELECT id, ozon_client_id, ozon_api_key, ozon_warehouse_id
                       FROM company
                       WHERE status = 'active'
                         AND ozon_api_key IS NOT NULL
                         AND ozon_warehouse_id IS NOT NULL"""
                )
                companies = cur.fetchall()

            total_new = 0
            for cid, cli_id, api_key, wh_id in companies:
                if not cli_id or not api_key:
                    continue
                new_count = _poll_company_orders(
                    cur, conn, str(cid), cli_id, api_key, wh_id
                )
                total_new += new_count

            return resp(200, {"ok": True, "new_orders": total_new})

        # ── CONFIRM ORDER (отправить на Ozon) ────────────────────────────────
        elif action == "confirm":
            posting_number = body.get("posting_number")
            company_id     = body.get("company_id")
            if not posting_number or not company_id:
                return resp(400, {"error": "posting_number и company_id обязательны"})

            client_id, api_key = get_company_credentials(company_id)
            if not client_id or not api_key:
                return resp(400, {"error": "API-ключи не настроены"})

            # Получаем данные posting для ship
            cur.execute(
                """SELECT o.id, o.product_id, o.quantity, p.supplier_article
                   FROM "order" o
                   LEFT JOIN product p ON p.id = o.product_id
                   WHERE o.ozon_posting_number = %s AND o.company_id = %s""",
                (posting_number, company_id)
            )
            order_rows = cur.fetchall()
            if not order_rows:
                return resp(404, {"error": "Заказ не найден"})

            # Формируем список products для ship
            products = [
                {"offer_id":   row[3] or str(row[1])[:20], "quantity": row[2]}
                for row in order_rows
            ]

            cur.execute(
                "SELECT ozon_warehouse_id FROM company WHERE id = %s", (company_id,)
            )
            row = cur.fetchone()
            warehouse_id = row[0] if row else None

            s, d = ozon_post(
                client_id, api_key,
                "/v4/posting/fbs/ship",
                {
                    "posting_number": posting_number,
                    "packages":       [{"products": products}],
                    "with":           {"additional_data": False},
                },
                company_id,
            )

            if s != 200:
                return resp(s, {"error": d.get("error", "Ошибка подтверждения")})

            # Обновляем статус заказов
            order_ids = [str(r[0]) for r in order_rows]
            cur.execute(
                """UPDATE "order"
                   SET order_status = 'confirmed', confirmed_at = now(),
                       ozon_posting_status = 'awaiting_deliver'
                   WHERE ozon_posting_number = %s""",
                (posting_number,)
            )
            conn.commit()
            return resp(200, {"ok": True, "posting_number": posting_number})

        # ── STATUS CHANGE (логист) ────────────────────────────────────────────
        elif action == "status":
            delivery_id = body.get("delivery_id")
            new_status  = body.get("status")     # picking, delivering, last_mile, delivered
            company_id  = body.get("company_id")

            STATUS_MAP = {
                "picked_from_supplier": "/v2/fbs/posting/delivering",
                "in_transit":           "/v2/fbs/posting/last-mile",
                "delivered":            "/v2/fbs/posting/delivered",
            }
            endpoint = STATUS_MAP.get(new_status)
            if not endpoint:
                return resp(400, {"error": f"Статус {new_status} не поддерживается"})

            # Получаем posting_number из заказов доставки
            cur.execute(
                """SELECT DISTINCT o.ozon_posting_number, o.company_id
                   FROM "order" o
                   WHERE o.delivery_id = %s
                     AND o.ozon_posting_number IS NOT NULL""",
                (delivery_id,)
            )
            postings = cur.fetchall()
            if not postings:
                return resp(200, {"ok": True, "skipped": "no_ozon_postings"})

            results = []
            for posting_number, cid in postings:
                cid_str = str(cid)
                client_id, api_key = get_company_credentials(cid_str)
                if not client_id or not api_key:
                    continue

                s, d = ozon_post(
                    client_id, api_key,
                    endpoint,
                    {"posting_number": [posting_number]},
                    cid_str,
                )
                results.append({"posting": posting_number, "status": s, "ok": s == 200})

                # При доставке — триггер формирования УПД
                if new_status == "delivered" and s == 200:
                    _trigger_export_1c(delivery_id)

            conn.commit()
            return resp(200, {"ok": True, "results": results})

        else:
            return resp(400, {"error": f"Неизвестное действие: {action}"})

    finally:
        cur.close()
        conn.close()


# ── helpers ───────────────────────────────────────────────────────────────────

def _get_one_company(cur, company_id):
    cur.execute(
        """SELECT id, ozon_client_id, ozon_api_key, ozon_warehouse_id
           FROM company WHERE id = %s""",
        (company_id,)
    )
    row = cur.fetchone()
    return [row] if row else []


def _poll_company_orders(cur, conn, company_id, client_id, api_key, warehouse_id):
    """Опрашивает Ozon API и создаёт новые заказы. Возвращает кол-во новых."""
    s, d = ozon_post(
        client_id, api_key,
        "/v3/posting/fbs/unfulfilled/list",
        {
            "dir":          "asc",
            "filter":       {
                "warehouse_id": [warehouse_id],
                "status":       "awaiting_packaging",
            },
            "limit":        50,
            "offset":       0,
            "with": {
                "analytics_data": False,
                "barcodes":       False,
                "financial_data": True,
                "translit":       False,
            },
        },
        company_id,
    )

    if s != 200:
        return 0

    postings = d.get("result", {}).get("postings", [])
    new_count = 0

    for posting in postings:
        posting_number = posting.get("posting_number", "")
        if not posting_number:
            continue

        # Проверяем дубликат
        cur.execute(
            'SELECT id FROM "order" WHERE ozon_posting_number = %s LIMIT 1',
            (posting_number,)
        )
        if cur.fetchone():
            continue

        # Создаём заказы по каждому продукту в posting
        products_in = posting.get("products", [])
        today = date.today().isoformat()

        for prod in products_in:
            offer_id = prod.get("offer_id", "")
            quantity = prod.get("quantity", 1)

            # Найти product_id по offer_id (supplier_article)
            cur.execute(
                "SELECT id, our_price FROM product WHERE supplier_article = %s LIMIT 1",
                (offer_id,)
            )
            prod_row = cur.fetchone()
            product_id = str(prod_row[0]) if prod_row else None
            unit_price = float(prod_row[1]) if prod_row and prod_row[1] else float(
                prod.get("price", 0)
            )

            # Порядковый номер заказа
            cur.execute('SELECT COUNT(*) FROM "order"')
            n = cur.fetchone()[0] + 1
            order_number = f"ORD-OZ-{str(n).zfill(6)}"

            cur.execute(
                """INSERT INTO "order"
                   (order_number, company_id, product_id, quantity, unit_price,
                    delivery_cost, total_amount, payment_status, fulfillment_scheme,
                    rfbs_subtype, order_status, operational_day,
                    ozon_posting_number, ozon_posting_status)
                   VALUES (%s, %s, %s, %s, %s, 0, %s, 'unpaid', 'rfbs_standard',
                           'express', 'new', %s, %s, 'awaiting_packaging')""",
                (
                    order_number, company_id, product_id, quantity, unit_price,
                    unit_price * quantity, today, posting_number,
                )
            )

        # Резервируем остатки
        if product_id:
            cur.execute(
                """UPDATE product
                   SET stock_reserved = COALESCE(stock_reserved, 0) + %s
                   WHERE id = %s""",
                (sum(p.get("quantity", 1) for p in products_in), product_id)
            )

        new_count += 1
        notify_users_by_role(
            cur, "manager", "new_order",
            f"Новый заказ Ozon: {posting_number} ({len(products_in)} поз.)",
        )

    conn.commit()
    return new_count


def _trigger_export_1c(delivery_id):
    """Вызывает export-1c для формирования УПД после доставки."""
    import urllib.request
    try:
        url = "https://functions.poehali.dev/f7e9559d-122f-44c1-b350-3b0c43700fb3"
        # Находим invoice_id через delivery
        payload = json.dumps({"delivery_id": delivery_id}).encode()
        req = urllib.request.Request(url, data=payload, method="POST",
                                      headers={"Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=5)
    except Exception:
        pass