import json
import os
import psycopg2
from decimal import Decimal
from datetime import datetime


def get_db():
    return psycopg2.connect(
        os.environ["DATABASE_URL"],
        options=f"-c search_path={os.environ.get('MAIN_DB_SCHEMA', 'public')}",
    )


def serial(obj):
    if isinstance(obj, Decimal): return float(obj)
    if isinstance(obj, datetime): return obj.isoformat()
    raise TypeError


CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-User-Id",
}


def resp(status: int, body: dict) -> dict:
    return {"statusCode": status, "headers": CORS, "body": json.dumps(body, default=serial, ensure_ascii=False)}


def handler(event: dict, context) -> dict:
    """
    Калькулятор цены карточки товара на Ozon.

    GET /?action=tariffs            → список категорий из marketplace_tariff (ozon)
    GET /?action=products&company_id=... → товары компании для выбора
    POST /?action=apply             → { product_id, price, user_id } → обновить our_price (менеджер)
    """
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    params = event.get("queryStringParameters") or {}
    action = params.get("action", "tariffs")

    conn = get_db()
    cur = conn.cursor()

    try:
        # ── TARIFFS ───────────────────────────────────────────────────────────
        if action == "tariffs":
            cur.execute(
                """SELECT id, category_name, product_type,
                          commission_lt_1500, commission_1500_5000,
                          commission_5000_10000, commission_gt_10000,
                          acquiring_percent, service_fee_fixed,
                          early_payout_standard, early_payout_ozon_bank
                   FROM marketplace_tariff
                   WHERE marketplace = 'ozon' AND category_name IS NOT NULL AND is_active = true
                   ORDER BY category_name""",
            )
            rows = cur.fetchall()
            tariffs = [
                {
                    "id": str(r[0]),
                    "category_name": r[1],
                    "product_type": r[2],
                    "commission_lt_1500":     float(r[3]),
                    "commission_1500_5000":   float(r[4]),
                    "commission_5000_10000":  float(r[5]),
                    "commission_gt_10000":    float(r[6]),
                    "acquiring_percent":      float(r[7]),
                    "service_fee_fixed":      float(r[8]),
                    "early_payout_standard":  float(r[9]),
                    "early_payout_ozon_bank": float(r[10]),
                }
                for r in rows
            ]
            return resp(200, {"tariffs": tariffs})

        # ── PRODUCTS ──────────────────────────────────────────────────────────
        elif action == "products":
            company_id = params.get("company_id")
            if not company_id:
                return resp(400, {"error": "company_id обязателен"})

            # Берём уникальные товары, которые компания заказывала
            cur.execute(
                """SELECT DISTINCT p.id, p.trade_name, p.purchase_price_vat,
                          p.dim_package_kg, p.our_price, p.category_ozon
                   FROM product p
                   JOIN "order" o ON o.product_id = p.id
                   WHERE o.company_id = %s AND p.archived_at IS NULL
                   ORDER BY p.trade_name
                   LIMIT 200""",
                (company_id,),
            )
            rows = cur.fetchall()
            products = [
                {
                    "id": str(r[0]),
                    "trade_name": r[1],
                    "purchase_price": float(r[2]) if r[2] else 0,
                    "package_kg":     float(r[3]) if r[3] else 0,
                    "our_price":      float(r[4]) if r[4] else None,
                    "category_ozon":  r[5],
                }
                for r in rows
            ]
            return resp(200, {"products": products})

        # ── DELIVERY RATES ────────────────────────────────────────────────────
        elif action == "delivery_rates":
            cur.execute(
                "SELECT price_from, price_to, cost FROM ozon_partner_delivery_rate ORDER BY price_from"
            )
            return resp(200, {
                "rates": [
                    {"price_from": float(r[0]), "price_to": float(r[1]) if r[1] else None, "cost": float(r[2])}
                    for r in cur.fetchall()
                ]
            })

        # ── APPLY PRICE ───────────────────────────────────────────────────────
        elif action == "apply" and event.get("httpMethod") == "POST":
            headers = event.get("headers") or {}
            user_id = (
                params.get("user_id")
                or headers.get("x-user-id")
                or headers.get("X-User-Id")
            )

            body = json.loads(event.get("body") or "{}")
            product_id = body.get("product_id")
            price = body.get("price")

            if not product_id or price is None:
                return resp(400, {"error": "product_id и price обязательны"})

            price = round(float(price), 2)
            if price <= 0:
                return resp(400, {"error": "Цена должна быть положительной"})

            cur.execute(
                "UPDATE product SET our_price = %s WHERE id = %s",
                (price, product_id),
            )
            conn.commit()

            return resp(200, {"ok": True, "product_id": product_id, "price": price})

        else:
            return resp(400, {"error": f"Неизвестное действие: {action}"})

    finally:
        cur.close()
        conn.close()