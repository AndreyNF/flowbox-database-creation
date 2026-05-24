import json
import os
from datetime import datetime, timezone
# v2 — ozon_client_id field added

import psycopg2

from ozon_client import (
    get_db, get_company_credentials, ozon_post,
    notify_users_by_role, notify_manager,
)

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-User-Id",
}


def resp(status, body):
    return {"statusCode": status, "headers": CORS,
            "body": json.dumps(body, ensure_ascii=False, default=str)}


def handler(event, context):
    """
    Ozon API — склады, категории, карточки товаров, статус модерации.

    GET  /?action=warehouses&company_id=...      → список складов
    POST /?action=sync_categories                → синхронизация дерева категорий
    GET  /?action=attributes&category_id=...     → атрибуты категории из БД
    POST /?action=import_product&company_id=...  → отправить товар на Ozon
    POST /?action=check_moderation               → проверить статус модерации pending-товаров
    POST /?action=import/info body={task_id,product_id,company_id} → разовая проверка
    """
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    params = event.get("queryStringParameters") or {}
    action = params.get("action", "")

    conn = get_db()
    cur = conn.cursor()

    try:
        # ── WAREHOUSES ────────────────────────────────────────────────────────
        if action == "warehouses":
            company_id = params.get("company_id")
            if not company_id:
                return resp(400, {"error": "company_id обязателен"})

            body_raw = event.get("body") or "{}"
            creds = json.loads(body_raw) if event.get("httpMethod") == "POST" else {}
            client_id = creds.get("client_id")
            api_key   = creds.get("api_key")

            if not client_id or not api_key:
                client_id, api_key = get_company_credentials(company_id)

            if not client_id or not api_key:
                return resp(400, {"error": "API-ключи не настроены для компании"})

            status, data = ozon_post(client_id, api_key, "/v2/warehouse/list", {}, company_id)
            if status != 200:
                return resp(status, {"error": data.get("error", "Ошибка Ozon API")})

            warehouses = data.get("result", [])
            return resp(200, {"warehouses": warehouses})

        # ── SYNC CATEGORIES ───────────────────────────────────────────────────
        elif action == "sync_categories":
            body = json.loads(event.get("body") or "{}")
            company_id = body.get("company_id") or params.get("company_id")
            client_id, api_key = get_company_credentials(company_id)
            if not client_id or not api_key:
                return resp(400, {"error": "API-ключи не настроены"})

            # Получаем дерево категорий
            status, data = ozon_post(
                client_id, api_key,
                "/v1/description-category/tree",
                {"language": "RU"},
                company_id,
            )
            if status != 200:
                return resp(status, {"error": data.get("error", "Ошибка получения категорий")})

            categories = data.get("result", [])
            synced = _sync_categories_flat(cur, categories)
            conn.commit()
            return resp(200, {"ok": True, "synced_categories": synced})

        # ── GET ATTRIBUTES ────────────────────────────────────────────────────
        elif action == "attributes":
            cat_id = params.get("category_id")
            if not cat_id:
                return resp(400, {"error": "category_id обязателен"})

            cur.execute(
                """SELECT id, name, description, type, is_required, is_collection, group_name
                   FROM ozon_category_attribute
                   WHERE description_category_id = %s
                   ORDER BY is_required DESC, name""",
                (cat_id,),
            )
            attrs = [
                {"id": r[0], "name": r[1], "description": r[2], "type": r[3],
                 "is_required": r[4], "is_collection": r[5], "group_name": r[6]}
                for r in cur.fetchall()
            ]
            return resp(200, {"attributes": attrs})

        # ── SYNC ATTRIBUTES FOR CATEGORY ──────────────────────────────────────
        elif action == "sync_attributes":
            body = json.loads(event.get("body") or "{}")
            company_id  = body.get("company_id")
            category_id = body.get("category_id")
            type_id     = body.get("type_id", 0)

            client_id, api_key = get_company_credentials(company_id)
            if not client_id or not api_key:
                return resp(400, {"error": "API-ключи не настроены"})

            # Атрибуты категории
            status, data = ozon_post(
                client_id, api_key,
                "/v1/description-category/attribute",
                {
                    "description_category_id": int(category_id),
                    "type_id": int(type_id),
                    "language": "RU",
                },
                company_id,
            )
            if status != 200:
                return resp(status, {"error": data.get("error", "Ошибка")})

            attrs = data.get("result", [])
            saved = 0
            for attr in attrs:
                cur.execute(
                    """INSERT INTO ozon_category_attribute
                       (id, description_category_id, category_name, name, description,
                        type, is_required, is_collection, group_name)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                       ON CONFLICT (id) DO UPDATE SET
                         name = EXCLUDED.name,
                         description = EXCLUDED.description,
                         type = EXCLUDED.type,
                         is_required = EXCLUDED.is_required,
                         is_collection = EXCLUDED.is_collection,
                         updated_at = now()""",
                    (
                        attr["id"], int(category_id),
                        body.get("category_name", ""),
                        attr["name"], attr.get("description", ""),
                        attr.get("type", ""), attr.get("is_required", False),
                        attr.get("is_collection", False), attr.get("group_name", ""),
                    )
                )
                saved += 1

                # Синхронизируем справочные значения если есть
                if attr.get("dictionary_id", 0) > 0:
                    _sync_attribute_values(
                        client_id, api_key, company_id,
                        int(category_id), int(type_id), attr["id"],
                        attr["dictionary_id"], cur,
                    )

            conn.commit()
            return resp(200, {"ok": True, "attributes_saved": saved})

        # ── IMPORT PRODUCT ────────────────────────────────────────────────────
        elif action == "import_product":
            body = json.loads(event.get("body") or "{}")
            company_id = body.get("company_id") or params.get("company_id")
            product_id = body.get("product_id")

            if not product_id:
                return resp(400, {"error": "product_id обязателен"})

            client_id, api_key = get_company_credentials(company_id)
            if not client_id or not api_key:
                return resp(400, {"error": "API-ключи не настроены"})

            # Получаем данные товара
            cur.execute(
                """SELECT trade_name, accounting_name, category_ozon, attributes,
                          dim_assembled_l, dim_assembled_w, dim_assembled_h, dim_assembled_kg,
                          dim_package_l, dim_package_w, dim_package_h, dim_package_kg,
                          photos, brand, our_price, supplier_article
                   FROM product WHERE id = %s""",
                (product_id,),
            )
            p = cur.fetchone()
            if not p:
                return resp(404, {"error": "Товар не найден"})

            (trade_name, acct_name, cat_ozon, attributes,
             asm_l, asm_w, asm_h, asm_kg,
             pkg_l, pkg_w, pkg_h, pkg_kg,
             photos, brand, our_price, supplier_article) = p

            photos_list = []
            if photos:
                ph = photos if isinstance(photos, list) else json.loads(photos)
                photos_list = ph[:15]

            attrs_list = []
            if attributes:
                raw = attributes if isinstance(attributes, dict) else json.loads(attributes)
                for attr_id, val in raw.items():
                    attrs_list.append({
                        "id": int(attr_id),
                        "complex_id": 0,
                        "values": [{"value": str(val), "dictionary_value_id": 0}]
                    })

            item = {
                "attributes":       attrs_list,
                "barcode":          supplier_article or "",
                "category_id":      0,
                "color_image":      "",
                "complex_attributes": [],
                "currency_code":    "RUB",
                "depth":            int(pkg_h or 0),
                "dimension_unit":   "mm",
                "height":           int(pkg_l or 0),
                "images":           photos_list,
                "images360":        [],
                "name":             trade_name,
                "offer_id":         supplier_article or product_id[:20],
                "old_price":        str(int(our_price or 0)),
                "pdf_list":         [],
                "price":            str(int(our_price or 0)),
                "primary_image":    photos_list[0] if photos_list else "",
                "vat":              "0.22",
                "weight":           int((pkg_kg or 0) * 1000),
                "weight_unit":      "g",
                "width":            int(pkg_w or 0),
            }

            if cat_ozon:
                # Попробуем найти category_id по имени
                cur.execute(
                    "SELECT description_category_id FROM ozon_category_attribute WHERE category_name = %s LIMIT 1",
                    (cat_ozon,)
                )
                row = cur.fetchone()
                if row:
                    item["category_id"] = row[0]

            status, data = ozon_post(
                client_id, api_key,
                "/v3/product/import",
                {"items": [item]},
                company_id,
            )
            if status != 200:
                return resp(status, {"error": data.get("error", "Ошибка импорта")})

            task_id = data.get("result", {}).get("task_id")
            cur.execute(
                """UPDATE product SET ozon_task_id = %s, moderation_status_ozon = 'pending'
                   WHERE id = %s""",
                (str(task_id) if task_id else None, product_id)
            )
            conn.commit()
            return resp(200, {"ok": True, "task_id": task_id})

        # ── CHECK MODERATION ──────────────────────────────────────────────────
        elif action == "check_moderation":
            # Проверяем все pending товары
            cur.execute(
                """SELECT p.id, p.ozon_task_id, o.ozon_api_key, o.ozon_client_id,
                          p.our_price, p.stock_available, p.stock_reserved,
                          o.ozon_warehouse_id, o.id as company_id
                   FROM product p
                   JOIN company o ON true
                   WHERE p.moderation_status_ozon = 'pending'
                     AND p.ozon_task_id IS NOT NULL
                     AND o.ozon_api_key IS NOT NULL
                   LIMIT 50"""
            )
            rows = cur.fetchall()
            results = []
            for row in rows:
                (prod_id, task_id, api_key, cli_id,
                 our_price, stock_avail, stock_res,
                 warehouse_id, company_id) = row

                if not cli_id or not api_key:
                    continue

                s, d = ozon_post(
                    cli_id, api_key,
                    "/v1/product/import/info",
                    {"task_id": int(task_id)},
                    str(company_id),
                )
                if s != 200:
                    continue

                items = d.get("result", {}).get("items", [])
                for item in items:
                    item_status = item.get("status", "")
                    if item_status == "imported":
                        ozon_product_id = item.get("product_id")
                        cur.execute(
                            """UPDATE product SET moderation_status_ozon = 'approved',
                                  ozon_product_id = %s WHERE id = %s""",
                            (ozon_product_id, prod_id)
                        )
                        # Выгружаем остатки и цену
                        stock = max(0, (stock_avail or 0) - (stock_res or 0))
                        _push_stock(cli_id, api_key, str(company_id),
                                    warehouse_id, prod_id, stock, cur)
                        if our_price:
                            _push_price(cli_id, api_key, str(company_id),
                                        prod_id, float(our_price), cur)
                        results.append({"product_id": prod_id, "status": "approved"})

                    elif item_status in ("failed", "declined"):
                        errors = item.get("errors", [])
                        err_text = "; ".join(e.get("message", "") for e in errors)
                        cur.execute(
                            "UPDATE product SET moderation_status_ozon = 'rejected' WHERE id = %s",
                            (prod_id,)
                        )
                        notify_users_by_role(
                            cur, "manager", "stock_zero",
                            f"Товар {prod_id[:8]} отклонён Ozon: {err_text}",
                            "product", prod_id,
                        )
                        results.append({"product_id": prod_id, "status": "rejected", "error": err_text})

            conn.commit()
            return resp(200, {"ok": True, "checked": len(rows), "results": results})

        else:
            return resp(400, {"error": f"Неизвестное действие: {action}"})

    finally:
        cur.close()
        conn.close()


# ── helpers ───────────────────────────────────────────────────────────────────

def _sync_categories_flat(cur, categories, depth=0):
    """Рекурсивно обходит дерево и сохраняет в marketplace_tariff."""
    count = 0
    for cat in categories:
        name = cat.get("title") or cat.get("category_name", "")
        cat_id = cat.get("description_category_id") or cat.get("id")
        if name and cat_id:
            # Сохраняем как tariff-запись с нулевыми комиссиями если не существует
            cur.execute(
                """INSERT INTO marketplace_tariff
                   (marketplace, category_name, product_type)
                   VALUES ('ozon', %s, 'standard')
                   ON CONFLICT DO NOTHING""",
                (name,)
            )
            count += 1
        children = cat.get("children", [])
        if children:
            count += _sync_categories_flat(cur, children, depth + 1)
    return count


def _push_stock(client_id, api_key, company_id, warehouse_id, product_id, stock, cur):
    cur.execute("SELECT supplier_article FROM product WHERE id = %s", (product_id,))
    row = cur.fetchone()
    offer_id = row[0] if row and row[0] else product_id[:20]

    ozon_post(
        client_id, api_key,
        "/v2/products/stocks",
        {"stocks": [{"offer_id": offer_id, "warehouse_id": warehouse_id, "stock": stock}]},
        company_id,
    )
    cur.execute(
        "UPDATE product SET stock_synced_at = now() WHERE id = %s",
        (product_id,)
    )


def _push_price(client_id, api_key, company_id, product_id, price, cur):
    cur.execute("SELECT supplier_article FROM product WHERE id = %s", (product_id,))
    row = cur.fetchone()
    offer_id = row[0] if row and row[0] else product_id[:20]

    ozon_post(
        client_id, api_key,
        "/v1/product/import/prices",
        {"prices": [{
            "auto_action_enabled": "UNKNOWN",
            "currency_code":       "RUB",
            "min_price":           str(int(price * 0.8)),
            "offer_id":            offer_id,
            "old_price":           str(int(price * 1.1)),
            "price":               str(int(price)),
        }]},
        company_id,
    )
    cur.execute(
        "UPDATE product SET price_updated_at = now() WHERE id = %s",
        (product_id,)
    )


def _sync_attribute_values(client_id, api_key, company_id,
                            category_id, type_id, attribute_id, dictionary_id, cur):
    last_value_id = 0
    while True:
        s, d = ozon_post(
            client_id, api_key,
            "/v1/description-category/attribute/values",
            {
                "attribute_id":             attribute_id,
                "description_category_id":  category_id,
                "language":                 "RU",
                "last_value_id":            last_value_id,
                "limit":                    100,
                "type_id":                  type_id,
            },
            company_id,
            log=False,
        )
        if s != 200:
            break
        values = d.get("result", [])
        for v in values:
            cur.execute(
                """INSERT INTO ozon_attribute_value (id, attribute_id, value, info)
                   VALUES (%s, %s, %s, %s)
                   ON CONFLICT (id, attribute_id) DO UPDATE SET value = EXCLUDED.value""",
                (v["id"], attribute_id, v.get("value", ""), v.get("info", ""))
            )
        if not d.get("has_next") or not values:
            break
        last_value_id = values[-1]["id"]