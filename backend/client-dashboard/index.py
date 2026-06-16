import json
import os
import psycopg2
# v2 — claim_action agree/dispute
from decimal import Decimal
from jwt_auth import check_role


def get_db():
    return psycopg2.connect(
        os.environ["DATABASE_URL"],
        options=f"-c search_path={os.environ.get('MAIN_DB_SCHEMA', 'public')}",
    )


def serial(obj):
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError


def handler(event: dict, context) -> dict:
    """Агрегированные данные личного кабинета клиента. company_id передаётся в query или header X-Company-Id."""
    cors = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Company-Id, Authorization",
    }

    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors, "body": ""}

    token_payload, err = check_role(event, ["client", "manager", "admin"], cors)
    if err:
        return err

    role = token_payload["role"]

    method = event.get("httpMethod", "GET")
    params = event.get("queryStringParameters") or {}
    headers = event.get("headers") or {}

    # client всегда привязан к своей компании из токена
    if role == "client":
        company_id = token_payload.get("company_id")
    else:
        company_id = params.get("company_id") or headers.get("x-company-id") or headers.get("X-Company-Id")

    if not company_id:
        return {
            "statusCode": 400,
            "headers": cors,
            "body": json.dumps({"error": "company_id обязателен"}, ensure_ascii=False),
        }

    section = params.get("section", "overview")

    conn = get_db()
    cur = conn.cursor()

    result = {}

    if section == "overview":
        # Active orders count
        cur.execute(
            "SELECT COUNT(*) FROM \"order\" WHERE company_id = %s AND order_status NOT IN ('delivered','cancelled') AND archived_at IS NULL",
            (company_id,),
        )
        result["active_orders"] = cur.fetchone()[0]

        # Pending invoices sum
        cur.execute(
            "SELECT COALESCE(SUM(total_vat + delivery_total), 0) FROM invoice WHERE company_id = %s AND status = 'pending'",
            (company_id,),
        )
        result["pending_amount"] = cur.fetchone()[0]

        # Balance (sum of compensation_accrued - compensation_paid)
        cur.execute(
            "SELECT COALESCE(SUM(CASE WHEN type = 'compensation_accrued' THEN amount WHEN type = 'compensation_paid' THEN -amount ELSE 0 END), 0) FROM transaction WHERE company_id = %s AND status = 'completed'",
            (company_id,),
        )
        result["balance"] = cur.fetchone()[0]

        # Active products count
        cur.execute("SELECT COUNT(*) FROM product WHERE stock_status = 'active' AND archived_at IS NULL")
        result["products_count"] = cur.fetchone()[0]

        # Last 5 orders
        cur.execute(
            """SELECT o.id, o.order_number, p.trade_name, o.order_status, o.total_amount, o.created_at
               FROM "order" o
               LEFT JOIN product p ON p.id = o.product_id
               WHERE o.company_id = %s AND o.archived_at IS NULL
               ORDER BY o.created_at DESC LIMIT 5""",
            (company_id,),
        )
        rows = cur.fetchall()
        result["recent_orders"] = [
            {
                "id": str(r[0]), "order_number": r[1], "product_name": r[2],
                "status": r[3], "total_amount": r[4],
                "created_at": r[5].isoformat() if r[5] else None,
            }
            for r in rows
        ]

        # Profile completeness — для баннера о незаполненных данных
        cur.execute(
            "SELECT marketplace, edo_operator, delivery_method FROM company WHERE id = %s",
            (company_id,),
        )
        row = cur.fetchone()
        if row:
            result["profile"] = {
                "marketplace": row[0],
                "edo_operator": row[1],
                "delivery_method": row[2],
            }

    elif section == "catalog":
        search = params.get("search", "")
        category = params.get("category", "")
        supplier_id = params.get("supplier_id", "")
        in_stock = params.get("in_stock", "")
        offset = int(params.get("offset", 0))
        limit = min(int(params.get("limit", 20)), 100)

        where = ["p.stock_status = 'active'", "p.archived_at IS NULL"]
        args = []
        if search:
            where.append("(p.trade_name ILIKE %s OR p.supplier_article ILIKE %s)")
            args += [f"%{search}%", f"%{search}%"]
        if category:
            where.append("p.category_ozon = %s")
            args.append(category)
        if supplier_id:
            where.append("p.supplier_id = %s")
            args.append(supplier_id)
        if in_stock == "true":
            where.append("(p.stock_available - p.stock_reserved) > 0")

        where_sql = " AND ".join(where)
        cur.execute(
            f"""SELECT p.id, p.trade_name, p.supplier_article, p.category_ozon,
                       p.our_price, p.stock_available, p.stock_reserved, p.photos,
                       s.name as supplier_name
                FROM product p LEFT JOIN supplier s ON s.id = p.supplier_id
                WHERE {where_sql}
                ORDER BY p.trade_name
                LIMIT %s OFFSET %s""",
            args + [limit, offset],
        )
        rows = cur.fetchall()

        cur.execute(f"SELECT COUNT(*) FROM product p WHERE {where_sql}", args)
        total = cur.fetchone()[0]

        result["products"] = [
            {
                "id": str(r[0]), "trade_name": r[1], "supplier_article": r[2],
                "category_ozon": r[3], "our_price": r[4],
                "stock_available": r[5], "stock_reserved": r[6],
                "stock_free": (r[5] or 0) - (r[6] or 0),
                "photos": r[7], "supplier_name": r[8],
            }
            for r in rows
        ]
        result["total"] = total

        # Categories list
        cur.execute(
            "SELECT DISTINCT category_ozon FROM product WHERE stock_status='active' AND archived_at IS NULL AND category_ozon IS NOT NULL ORDER BY category_ozon"
        )
        result["categories"] = [r[0] for r in cur.fetchall()]

    elif section == "orders":
        status_filter = params.get("status", "")
        date_from = params.get("date_from", "")
        date_to = params.get("date_to", "")
        offset = int(params.get("offset", 0))
        limit = min(int(params.get("limit", 20)), 100)

        where = ["o.company_id = %s", "o.archived_at IS NULL"]
        args = [company_id]
        if status_filter:
            where.append("o.order_status = %s")
            args.append(status_filter)
        if date_from:
            where.append("o.created_at >= %s")
            args.append(date_from)
        if date_to:
            where.append("o.created_at <= %s")
            args.append(date_to)

        where_sql = " AND ".join(where)
        cur.execute(
            f"""SELECT o.id, o.order_number, p.trade_name, o.quantity, o.total_amount,
                       o.order_status, o.created_at, o.confirmed_at,
                       d.tracking_number, d.status as delivery_status
                FROM "order" o
                LEFT JOIN product p ON p.id = o.product_id
                LEFT JOIN delivery d ON d.id = o.delivery_id
                WHERE {where_sql}
                ORDER BY o.created_at DESC
                LIMIT %s OFFSET %s""",
            args + [limit, offset],
        )
        rows = cur.fetchall()

        cur.execute(f'SELECT COUNT(*) FROM "order" o WHERE {where_sql}', args)
        total = cur.fetchone()[0]

        result["orders"] = [
            {
                "id": str(r[0]), "order_number": r[1], "product_name": r[2],
                "quantity": r[3], "total_amount": r[4], "order_status": r[5],
                "created_at": r[6].isoformat() if r[6] else None,
                "confirmed_at": r[7].isoformat() if r[7] else None,
                "tracking_number": r[8], "delivery_status": r[9],
            }
            for r in rows
        ]
        result["total"] = total

    elif section == "order_detail":
        order_id = params.get("order_id")
        if not order_id:
            cur.close(); conn.close()
            return {"statusCode": 400, "headers": cors, "body": json.dumps({"error": "order_id обязателен"}, ensure_ascii=False)}

        cur.execute(
            """SELECT o.id, o.order_number, p.trade_name, p.supplier_article,
                      o.quantity, o.unit_price, o.delivery_cost, o.total_amount,
                      o.order_status, o.payment_status, o.fulfillment_scheme,
                      o.created_at, o.confirmed_at, o.cancel_reason,
                      d.tracking_number, d.status as delivery_status,
                      d.type as delivery_type, i.invoice_number, i.status as invoice_status
               FROM "order" o
               LEFT JOIN product p ON p.id = o.product_id
               LEFT JOIN delivery d ON d.id = o.delivery_id
               LEFT JOIN invoice i ON i.id = o.invoice_id
               WHERE o.id = %s AND o.company_id = %s AND o.archived_at IS NULL""",
            (order_id, company_id),
        )
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return {"statusCode": 404, "headers": cors, "body": json.dumps({"error": "Заказ не найден"}, ensure_ascii=False)}

        result["order"] = {
            "id": str(row[0]), "order_number": row[1], "product_name": row[2],
            "supplier_article": row[3], "quantity": row[4],
            "unit_price": row[5], "delivery_cost": row[6], "total_amount": row[7],
            "order_status": row[8], "payment_status": row[9], "fulfillment_scheme": row[10],
            "created_at": row[11].isoformat() if row[11] else None,
            "confirmed_at": row[12].isoformat() if row[12] else None,
            "cancel_reason": row[13], "tracking_number": row[14],
            "delivery_status": row[15], "delivery_type": row[16],
            "invoice_number": row[17], "invoice_status": row[18],
        }

    elif section == "finance":
        # Summary
        cur.execute(
            "SELECT COALESCE(SUM(total_vat + delivery_total), 0) FROM invoice WHERE company_id = %s AND status = 'pending'",
            (company_id,),
        )
        result["pending_amount"] = cur.fetchone()[0]

        cur.execute(
            "SELECT COALESCE(SUM(total_vat + delivery_total), 0) FROM invoice WHERE company_id = %s AND status = 'paid' AND paid_at >= date_trunc('month', NOW())",
            (company_id,),
        )
        result["paid_this_month"] = cur.fetchone()[0]

        cur.execute(
            "SELECT COALESCE(SUM(CASE WHEN type='compensation_accrued' THEN amount WHEN type='compensation_paid' THEN -amount ELSE 0 END), 0) FROM transaction WHERE company_id = %s AND status = 'completed'",
            (company_id,),
        )
        result["balance"] = cur.fetchone()[0]

        # Company limits
        cur.execute(
            "SELECT purchase_limit FROM company WHERE id = %s",
            (company_id,),
        )
        row = cur.fetchone()
        result["purchase_limit"] = row[0] if row else 0

        cur.execute(
            "SELECT COALESCE(SUM(total_amount), 0) FROM \"order\" WHERE company_id = %s AND order_status NOT IN ('delivered','cancelled') AND archived_at IS NULL",
            (company_id,),
        )
        result["limit_used"] = cur.fetchone()[0]

        # Invoices
        cur.execute(
            "SELECT id, invoice_number, created_at, total_vat + delivery_total, status, due_date, pdf_url FROM invoice WHERE company_id = %s ORDER BY created_at DESC LIMIT 20",
            (company_id,),
        )
        result["invoices"] = [
            {
                "id": str(r[0]), "invoice_number": r[1],
                "created_at": r[2].isoformat() if r[2] else None,
                "amount": r[3], "status": r[4],
                "due_date": r[5].isoformat() if r[5] else None,
                "pdf_url": r[6],
            }
            for r in cur.fetchall()
        ]

        # Transactions
        cur.execute(
            "SELECT id, created_at, type, amount, balance_after, comment FROM transaction WHERE company_id = %s ORDER BY created_at DESC LIMIT 30",
            (company_id,),
        )
        result["transactions"] = [
            {
                "id": str(r[0]),
                "created_at": r[1].isoformat() if r[1] else None,
                "type": r[2], "amount": r[3], "balance_after": r[4], "comment": r[5],
            }
            for r in cur.fetchall()
        ]

    elif section == "claims":
        cur.execute(
            """SELECT c.id, c.claim_number, o.order_number, c.type, c.status,
                      c.created_at, c.closed_at, c.compensation_amount, c.compensation_type
               FROM claim c
               LEFT JOIN "order" o ON o.id = c.order_id
               WHERE c.company_id = %s
               ORDER BY c.created_at DESC""",
            (company_id,),
        )
        result["claims"] = [
            {
                "id": str(r[0]), "claim_number": r[1], "order_number": r[2],
                "type": r[3], "status": r[4],
                "created_at": r[5].isoformat() if r[5] else None,
                "closed_at": r[6].isoformat() if r[6] else None,
                "compensation_amount": r[7], "compensation_type": r[8],
            }
            for r in cur.fetchall()
        ]

    elif section == "claim_detail":
        claim_id = params.get("claim_id")
        if not claim_id:
            cur.close(); conn.close()
            return {"statusCode": 400, "headers": cors, "body": json.dumps({"error": "claim_id обязателен"}, ensure_ascii=False)}

        cur.execute(
            """SELECT c.id, c.claim_number, o.order_number, p.trade_name,
                      c.type, c.source, c.description, c.photos,
                      c.decision, c.compensation_amount, c.compensation_type,
                      c.status, c.history, c.created_at, c.closed_at
               FROM claim c
               LEFT JOIN "order" o ON o.id = c.order_id
               LEFT JOIN product p ON p.id = c.product_id
               WHERE c.id = %s AND c.company_id = %s""",
            (claim_id, company_id),
        )
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return {"statusCode": 404, "headers": cors, "body": json.dumps({"error": "Рекламация не найдена"}, ensure_ascii=False)}

        result["claim"] = {
            "id": str(row[0]), "claim_number": row[1], "order_number": row[2],
            "product_name": row[3], "type": row[4], "source": row[5],
            "description": row[6], "photos": row[7], "decision": row[8],
            "compensation_amount": row[9], "compensation_type": row[10],
            "status": row[11], "history": row[12],
            "created_at": row[13].isoformat() if row[13] else None,
            "closed_at": row[14].isoformat() if row[14] else None,
        }

    elif section == "settings":
        cur.execute(
            """SELECT id, name, short_name, full_name, inn, kpp, ogrn, legal_address,
                      director_name, email, phone, contact_person,
                      marketplace, ozon_api_key, edo_operator, delivery_method, status
               FROM company WHERE id = %s""",
            (company_id,),
        )
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return {"statusCode": 404, "headers": cors, "body": json.dumps({"error": "Компания не найдена"}, ensure_ascii=False)}

        api_key = row[13] or ""
        masked = (api_key[:4] + "..." + api_key[-4:]) if len(api_key) >= 8 else ("*" * len(api_key))

        result["company"] = {
            "id": str(row[0]), "name": row[1], "short_name": row[2], "full_name": row[3],
            "inn": row[4], "kpp": row[5], "ogrn": row[6], "legal_address": row[7],
            "director_name": row[8], "email": row[9], "phone": row[10],
            "contact_person": row[11], "marketplace": row[12],
            "ozon_api_key_masked": masked,
            "edo_operator": row[14], "delivery_method": row[15], "status": row[16],
        }

    # ── ПЛАТЕЖИ ──────────────────────────────────────────────────────────────
    elif section == "payments":
        import datetime as _dt

        # Итоги
        cur.execute(
            "SELECT COALESCE(balance, 0) FROM company WHERE id = %s",
            (company_id,),
        )
        r = cur.fetchone()
        result["balance"] = float(r[0]) if r else 0.0

        cur.execute(
            """SELECT COALESCE(SUM(total_vat + delivery_total), 0)
               FROM invoice WHERE company_id = %s AND status = 'pending'""",
            (company_id,),
        )
        result["pending_amount"] = float(cur.fetchone()[0])

        cur.execute(
            """SELECT COALESCE(SUM(total_vat + delivery_total), 0)
               FROM invoice WHERE company_id = %s AND status = 'overdue'""",
            (company_id,),
        )
        result["overdue_amount"] = float(cur.fetchone()[0])

        cur.execute(
            """SELECT COALESCE(SUM(total_vat + delivery_total), 0)
               FROM invoice WHERE company_id = %s AND status = 'paid'
               AND paid_at >= date_trunc('month', NOW())""",
            (company_id,),
        )
        result["paid_this_month"] = float(cur.fetchone()[0])

        cur.execute(
            """SELECT COALESCE(SUM(total_vat + delivery_total), 0)
               FROM invoice WHERE company_id = %s AND status = 'paid'""",
            (company_id,),
        )
        result["paid_total"] = float(cur.fetchone()[0])

        # Банковские поступления этой компании
        cur.execute(
            """SELECT bt.id, bt.bank_operation_id, bt.amount, bt.payment_purpose,
                      bt.match_status, bt.operation_date, bt.received_at,
                      bt.invoice_number,
                      i.overpayment_amount
               FROM bank_transaction bt
               LEFT JOIN invoice i ON i.id = bt.matched_invoice_id
               WHERE bt.company_id = %s
               ORDER BY bt.received_at DESC NULLS LAST
               LIMIT 50""",
            (company_id,),
        )
        bank_rows = cur.fetchall()

        MATCH_LABELS = {
            "auto_matched":       "Автоматически",
            "manual_matched":     "Вручную",
            "overpayment":        "Переплата",
            "underpayment":       "Недоплата",
            "needs_distribution": "Ожидает разбивки",
            "unmatched":          "Не сопоставлен",
        }

        result["bank_payments"] = [
            {
                "id": str(r[0]),
                "bank_operation_id": r[1],
                "amount": float(r[2]),
                "payment_purpose": r[3] or "",
                "match_status": r[4] or "unmatched",
                "match_label": MATCH_LABELS.get(r[4] or "", r[4] or ""),
                "operation_date": r[5].isoformat() if r[5] else None,
                "received_at": r[6].isoformat() if r[6] else None,
                "invoice_number": r[7],
                "overpayment_amount": float(r[8]) if r[8] else 0,
            }
            for r in bank_rows
        ]

        # Счета (все статусы)
        cur.execute(
            """SELECT id, invoice_number, created_at, due_date,
                      total_vat + delivery_total, status, paid_at,
                      pdf_url, overpayment_amount
               FROM invoice WHERE company_id = %s
               ORDER BY created_at DESC
               LIMIT 50""",
            (company_id,),
        )
        result["invoices"] = [
            {
                "id": str(r[0]), "invoice_number": r[1],
                "created_at": r[2].isoformat() if r[2] else None,
                "due_date": r[3].isoformat() if r[3] else None,
                "amount": float(r[4]),
                "status": r[5],
                "paid_at": r[6].isoformat() if r[6] else None,
                "pdf_url": r[7],
                "overpayment_amount": float(r[8]) if r[8] else 0,
            }
            for r in cur.fetchall()
        ]

        # История транзакций (все типы)
        cur.execute(
            """SELECT id, created_at, type, amount, balance_after, comment
               FROM transaction WHERE company_id = %s
               ORDER BY created_at DESC
               LIMIT 100""",
            (company_id,),
        )
        result["transactions"] = [
            {
                "id": str(r[0]),
                "created_at": r[1].isoformat() if r[1] else None,
                "type": r[2], "amount": float(r[3]),
                "balance_after": float(r[4]) if r[4] is not None else 0,
                "comment": r[5] or "",
            }
            for r in cur.fetchall()
        ]

    cur.close()
    conn.close()

    return {
        "statusCode": 200,
        "headers": cors,
        "body": json.dumps(result, default=serial, ensure_ascii=False),
    }