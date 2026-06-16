import json
import os
import psycopg2
from datetime import date, datetime, timezone
from decimal import Decimal
from jwt_auth import check_role


def get_db():
    return psycopg2.connect(
        os.environ["DATABASE_URL"],
        options=f"-c search_path={os.environ.get('MAIN_DB_SCHEMA', 'public')}",
    )


def serial(obj):
    if isinstance(obj, Decimal): return float(obj)
    if isinstance(obj, (date, datetime)): return obj.isoformat()
    raise TypeError


CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-User-Id, Authorization",
}


def resp(status: int, body: dict) -> dict:
    return {"statusCode": status, "headers": CORS, "body": json.dumps(body, default=serial, ensure_ascii=False)}


def delivery_row_to_dict(row) -> dict:
    """Конвертирует строку delivery с joined полями в dict."""
    return {
        "id": str(row[0]),
        "type": row[1],
        "delivery_method": row[2],
        "fulfillment_scheme": row[3],
        "rfbs_subtype": row[4],
        "route_points": row[5],
        "total_boxes": row[6],
        "labels_pdf": row[7],
        "act_pdf": row[8],
        "transfer_act_pdf": row[9],
        "ttn_id": row[10],
        "tracking_number": row[11],
        "status": row[12],
        "reject_reason": row[13],
        "task_date": row[14],
        "shipped_at": row[15],
        "delivered_at": row[16],
        "status_updated_at": row[17],
        # supplier
        "supplier_name": row[18],
        "supplier_warehouse_address": row[19],
        "supplier_pickup_hours": row[20],
        # orders
        "orders": [],
    }


def handler(event: dict, context) -> dict:
    """
    Кабинет логиста. logist_id = текущий пользователь (из X-User-Id header или query param).

    GET /?section=today          → задания на сегодня
    GET /?section=history        → история за 30 дней
    GET /?section=detail&id=...  → детали одного задания
    POST /?section=status        → { delivery_id, status, reject_reason? }
    """
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    token_payload, err = check_role(event, ["logist", "admin"], CORS)
    if err:
        return err

    params = event.get("queryStringParameters") or {}
    headers = event.get("headers") or {}
    section = params.get("section", "today")

    role = token_payload["role"]
    if role == "logist":
        logist_id = token_payload.get("sub")
    elif role == "admin":
        # admin видит все задания, может фильтровать по logist_id опционально
        logist_id = params.get("logist_id") or headers.get("x-user-id") or headers.get("X-User-Id") or None
    else:
        logist_id = (
            params.get("logist_id")
            or headers.get("x-user-id")
            or headers.get("X-User-Id")
        )
    if not logist_id and role != "admin":
        return resp(400, {"error": "logist_id обязателен"})

    conn = get_db()
    cur = conn.cursor()
    result = {}

    try:
        DELIVERY_SELECT = """
            SELECT
                d.id, d.type, d.delivery_method, d.fulfillment_scheme, d.rfbs_subtype,
                d.route_points, d.total_boxes, d.labels_pdf, d.act_pdf, d.transfer_act_pdf,
                d.ttn_id, d.tracking_number, d.status, d.reject_reason, d.task_date,
                d.shipped_at, d.delivered_at, d.status_updated_at,
                s.name, s.warehouse_address, s.pickup_hours
            FROM delivery d
            LEFT JOIN supplier s ON s.id = d.supplier_id
        """

        if section == "today":
            today = date.today().isoformat()
            if logist_id:
                cur.execute(
                    DELIVERY_SELECT + " WHERE d.logist_id = %s AND d.task_date = %s ORDER BY d.id",
                    (logist_id, today),
                )
            else:
                cur.execute(
                    DELIVERY_SELECT + " WHERE d.task_date = %s ORDER BY d.id",
                    (today,),
                )
            rows = cur.fetchall()
            deliveries = [delivery_row_to_dict(r) for r in rows]

            # Подгружаем заказы для каждой доставки
            for d in deliveries:
                cur.execute(
                    """SELECT o.id, o.order_number, p.trade_name, o.quantity, o.total_amount
                       FROM "order" o
                       LEFT JOIN product p ON p.id = o.product_id
                       WHERE o.delivery_id = %s AND o.archived_at IS NULL""",
                    (d["id"],),
                )
                d["orders"] = [
                    {"id": str(r[0]), "order_number": r[1], "product_name": r[2], "quantity": r[3], "total_amount": r[4]}
                    for r in cur.fetchall()
                ]

            result["deliveries"] = deliveries
            result["today"] = today

        elif section == "history":
            if logist_id:
                cur.execute(
                    DELIVERY_SELECT +
                    " WHERE d.logist_id = %s AND d.task_date >= CURRENT_DATE - INTERVAL '30 days'"
                    " ORDER BY d.task_date DESC, d.id",
                    (logist_id,),
                )
            else:
                cur.execute(
                    DELIVERY_SELECT +
                    " WHERE d.task_date >= CURRENT_DATE - INTERVAL '30 days'"
                    " ORDER BY d.task_date DESC, d.id",
                )
            rows = cur.fetchall()
            deliveries = [delivery_row_to_dict(r) for r in rows]

            for d in deliveries:
                cur.execute(
                    "SELECT COUNT(*) FROM \"order\" WHERE delivery_id = %s AND archived_at IS NULL",
                    (d["id"],),
                )
                d["orders_count"] = cur.fetchone()[0]

            result["deliveries"] = deliveries

        elif section == "detail":
            did = params.get("id")
            if not did:
                return resp(400, {"error": "id обязателен"})

            cur.execute(
                DELIVERY_SELECT + " WHERE d.id = %s AND d.logist_id = %s",
                (did, logist_id),
            )
            row = cur.fetchone()
            if not row:
                return resp(404, {"error": "Задание не найдено"})

            d = delivery_row_to_dict(row)
            cur.execute(
                """SELECT o.id, o.order_number, p.trade_name, o.quantity, o.total_amount,
                          co.name as company_name, p.photos
                   FROM "order" o
                   LEFT JOIN product p ON p.id = o.product_id
                   LEFT JOIN company co ON co.id = o.company_id
                   WHERE o.delivery_id = %s AND o.archived_at IS NULL""",
                (did,),
            )
            d["orders"] = [
                {"id": str(r[0]), "order_number": r[1], "product_name": r[2],
                 "quantity": r[3], "total_amount": r[4], "company_name": r[5], "photos": r[6]}
                for r in cur.fetchall()
            ]
            result["delivery"] = d

        elif section == "status" and event.get("httpMethod") == "POST":
            body = json.loads(event.get("body") or "{}")
            did = body.get("delivery_id")
            new_status = body.get("status")
            reject_reason = body.get("reject_reason", "")

            VALID_TRANSITIONS = {
                "new":                 ["picked_from_supplier", "refused"],
                "picked_from_supplier":["in_transit", "refused"],
                "in_transit":          ["handed_to_tc", "delivered", "refused"],
                "handed_to_tc":        ["delivered"],
                "delivered":           [],
                "refused":             [],
            }

            cur.execute(
                "SELECT status, delivery_method FROM delivery WHERE id = %s AND logist_id = %s",
                (did, logist_id),
            )
            row = cur.fetchone()
            if not row:
                return resp(404, {"error": "Задание не найдено"})

            current_status, method = row
            allowed = VALID_TRANSITIONS.get(current_status, [])
            if new_status not in allowed:
                return resp(422, {"error": f"Переход {current_status} → {new_status} недопустим"})

            now = datetime.now(timezone.utc)
            update_extra = ""
            args = [new_status, now]

            if new_status == "picked_from_supplier":
                update_extra = ", shipped_at = %s"
                args.append(now)
            elif new_status in ("delivered", "handed_to_tc"):
                update_extra = ", delivered_at = %s"
                args.append(now)

            if reject_reason and new_status == "refused":
                update_extra += ", reject_reason = %s"
                args.append(reject_reason)

            args.append(did)
            cur.execute(
                f"UPDATE delivery SET status = %s, status_updated_at = %s{update_extra} WHERE id = %s",
                args,
            )

            # Если отказ — автоматически создаём Claim
            if new_status == "refused":
                cur.execute(
                    """SELECT o.id, o.company_id, o.product_id FROM "order" o
                       WHERE o.delivery_id = %s AND o.archived_at IS NULL LIMIT 1""",
                    (did,),
                )
                order_row = cur.fetchone()
                if order_row:
                    claim_number = f"CLM-REF-{did[:8].upper()}"
                    cur.execute(
                        """INSERT INTO claim
                           (claim_number, company_id, order_id, product_id, type, source,
                            description, reject_reason, status)
                           VALUES (%s, %s, %s, %s, 'delivery_refusal', 'ozon_api',
                                   %s, %s, 'new')
                           ON CONFLICT DO NOTHING
                           RETURNING id""",
                        (
                            claim_number,
                            str(order_row[1]),
                            str(order_row[0]),
                            str(order_row[2]) if order_row[2] else None,
                            f"Отказ при доставке. Причина: {reject_reason}",
                            reject_reason,
                        ),
                    )
                    inserted = cur.fetchone()
                    claim_id = str(inserted[0]) if inserted else None
                    # Уведомить менеджера компании
                    cur.execute("SELECT manager_id FROM company WHERE id = %s", (str(order_row[1]),))
                    mgr = cur.fetchone()
                    if mgr and mgr[0]:
                        cur.execute(
                            """INSERT INTO notification (user_id, event_type, channel, text, link_type, link_id)
                               VALUES (%s, 'new_claim', 'in_app', %s, 'claim', %s)""",
                            (str(mgr[0]),
                             f"Отказ от доставки. Причина: {reject_reason or '—'}",
                             claim_id),
                        )

            conn.commit()
            result["ok"] = True
            result["new_status"] = new_status

        elif section == "route_points":
            # Все точки на сегодня для построения маршрута
            today = date.today().isoformat()
            cur.execute(
                "SELECT id, route_points, type FROM delivery WHERE logist_id = %s AND task_date = %s AND status != 'refused'",
                (logist_id, today),
            )
            points = []
            for row in cur.fetchall():
                rp = row[1] or []
                if isinstance(rp, str):
                    try: rp = json.loads(rp)
                    except Exception: rp = []
                for p in rp:
                    p["delivery_id"] = str(row[0])
                    p["delivery_type"] = row[2]
                    points.append(p)
            result["points"] = points

    finally:
        cur.close()
        conn.close()

    return resp(200, result)