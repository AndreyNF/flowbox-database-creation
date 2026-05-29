import json
import os
import psycopg2
from decimal import Decimal

from crypto import mask_key


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
    """Менеджерский дашборд: агрегированные данные по всем клиентам и операциям."""
    cors = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    }
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors, "body": ""}

    method = event.get("httpMethod", "GET")
    params = event.get("queryStringParameters") or {}
    section = params.get("section", "overview")
    body = json.loads(event.get("body") or "{}") if method in ("POST", "PUT") else {}

    conn = get_db()
    cur = conn.cursor()
    result = {}

    try:
        if section == "overview":
            from datetime import date
            today = date.today().isoformat()

            cur.execute("SELECT COUNT(*) FROM \"order\" WHERE created_at::date = %s AND archived_at IS NULL", (today,))
            result["orders_today"] = cur.fetchone()[0]

            cur.execute("SELECT COUNT(*) FROM \"order\" WHERE order_status = 'confirmed' AND archived_at IS NULL")
            result["to_ship"] = cur.fetchone()[0]

            cur.execute("SELECT COUNT(*) FROM invoice WHERE status = 'overdue'")
            result["overdue_invoices"] = cur.fetchone()[0]

            cur.execute("SELECT COUNT(*) FROM claim WHERE status NOT IN ('closed','agreed')")
            result["open_claims"] = cur.fetchone()[0]

            # Underpayments
            cur.execute(
                "SELECT id, bank_operation_id, counterparty_inn, amount, payment_purpose FROM bank_transaction WHERE match_status = 'underpayment' ORDER BY received_at DESC LIMIT 10"
            )
            result["underpayments"] = [
                {"id": str(r[0]), "bank_operation_id": r[1], "counterparty_inn": r[2], "amount": r[3], "payment_purpose": r[4]}
                for r in cur.fetchall()
            ]

            # Unmatched payments
            cur.execute(
                "SELECT id, bank_operation_id, counterparty_inn, amount, payment_purpose FROM bank_transaction WHERE match_status IN ('unmatched','needs_distribution') ORDER BY received_at DESC LIMIT 10"
            )
            result["unmatched"] = [
                {"id": str(r[0]), "bank_operation_id": r[1], "counterparty_inn": r[2], "amount": r[3], "payment_purpose": r[4]}
                for r in cur.fetchall()
            ]

            # Claims without reply > 24h
            cur.execute(
                "SELECT c.id, c.claim_number, co.name, c.type, c.created_at FROM claim c JOIN company co ON co.id = c.company_id WHERE c.status = 'new' AND c.created_at < NOW() - INTERVAL '24 hours'"
            )
            result["stale_claims"] = [
                {"id": str(r[0]), "claim_number": r[1], "company_name": r[2], "type": r[3], "created_at": r[4].isoformat() if r[4] else None}
                for r in cur.fetchall()
            ]

            # Clients with overdue invoices
            cur.execute(
                "SELECT DISTINCT co.id, co.name, COUNT(i.id) FROM invoice i JOIN company co ON co.id = i.company_id WHERE i.status = 'overdue' GROUP BY co.id, co.name ORDER BY COUNT(i.id) DESC LIMIT 10"
            )
            result["overdue_clients"] = [
                {"id": str(r[0]), "name": r[1], "count": r[2]}
                for r in cur.fetchall()
            ]

        elif section == "clients":
            status_filter = params.get("status", "")
            search = params.get("search", "")
            offset = int(params.get("offset", 0))
            limit_q = min(int(params.get("limit", 20)), 100)

            where = ["1=1"]
            args = []
            if status_filter:
                where.append("c.status = %s"); args.append(status_filter)
            if search:
                where.append("(c.name ILIKE %s OR c.inn ILIKE %s)")
                args += [f"%{search}%", f"%{search}%"]

            where_sql = " AND ".join(where)
            cur.execute(
                f"""SELECT c.id, c.name, c.inn, c.status, c.purchase_limit, c.created_at,
                           COALESCE(SUM(CASE WHEN t.type='compensation_accrued' THEN t.amount WHEN t.type='compensation_paid' THEN -t.amount ELSE 0 END),0) as balance,
                           COALESCE((SELECT SUM(o.total_amount) FROM "order" o WHERE o.company_id=c.id AND o.order_status NOT IN ('delivered','cancelled') AND o.archived_at IS NULL),0) as active_orders_sum
                    FROM company c
                    LEFT JOIN transaction t ON t.company_id = c.id AND t.status = 'completed'
                    WHERE {where_sql}
                    GROUP BY c.id ORDER BY c.created_at DESC
                    LIMIT %s OFFSET %s""",
                args + [limit_q, offset],
            )
            rows = cur.fetchall()
            cur.execute(f"SELECT COUNT(*) FROM company c WHERE {where_sql}", args)
            total = cur.fetchone()[0]
            result["clients"] = [
                {"id": str(r[0]), "name": r[1], "inn": r[2], "status": r[3],
                 "purchase_limit": r[4], "created_at": r[5].isoformat() if r[5] else None,
                 "balance": r[6], "active_orders_sum": r[7]}
                for r in rows
            ]
            result["total"] = total

        elif section == "client_detail":
            cid = params.get("company_id")
            cur.execute("SELECT id,name,short_name,full_name,inn,kpp,ogrn,legal_address,director_name,email,phone,contact_person,marketplace,ozon_api_key,edo_operator,delivery_method,status,purchase_limit,onboarding_step,activated_at FROM company WHERE id=%s", (cid,))
            row = cur.fetchone()
            if not row:
                return {"statusCode": 404, "headers": cors, "body": json.dumps({"error": "Не найдено"})}
            result["company"] = {
                "id": str(row[0]), "name": row[1], "short_name": row[2], "full_name": row[3],
                "inn": row[4], "kpp": row[5], "ogrn": row[6], "legal_address": row[7],
                "director_name": row[8], "email": row[9], "phone": row[10],
                "contact_person": row[11], "marketplace": row[12],
                "ozon_api_key_masked": mask_key(row[13] or ""),
                "edo_operator": row[14], "delivery_method": row[15], "status": row[16],
                "purchase_limit": row[17], "onboarding_step": row[18],
                "activated_at": row[19].isoformat() if row[19] else None,
            }
            cur.execute("SELECT COALESCE(SUM(CASE WHEN type='compensation_accrued' THEN amount WHEN type='compensation_paid' THEN -amount ELSE 0 END),0) FROM transaction WHERE company_id=%s AND status='completed'", (cid,))
            result["balance"] = cur.fetchone()[0]
            cur.execute('SELECT id,order_number,total_amount,order_status,created_at FROM "order" WHERE company_id=%s AND archived_at IS NULL ORDER BY created_at DESC LIMIT 20', (cid,))
            result["orders"] = [{"id": str(r[0]),"order_number":r[1],"total_amount":r[2],"order_status":r[3],"created_at":r[4].isoformat() if r[4] else None} for r in cur.fetchall()]
            cur.execute("SELECT id,invoice_number,total_vat+delivery_total,status,created_at FROM invoice WHERE company_id=%s ORDER BY created_at DESC LIMIT 20", (cid,))
            result["invoices"] = [{"id":str(r[0]),"invoice_number":r[1],"amount":r[2],"status":r[3],"created_at":r[4].isoformat() if r[4] else None} for r in cur.fetchall()]
            cur.execute("SELECT id,created_at,type,amount,balance_after FROM transaction WHERE company_id=%s ORDER BY created_at DESC LIMIT 30", (cid,))
            result["transactions"] = [{"id":str(r[0]),"created_at":r[1].isoformat() if r[1] else None,"type":r[2],"amount":r[3],"balance_after":r[4]} for r in cur.fetchall()]

        elif section == "client_update" and method == "POST":
            cid = body.get("company_id")
            action = body.get("action")
            if action == "block":
                cur.execute("UPDATE company SET status='blocked' WHERE id=%s", (cid,))
            elif action == "unblock":
                cur.execute("UPDATE company SET status='active' WHERE id=%s", (cid,))
            elif action == "set_limit":
                cur.execute("UPDATE company SET purchase_limit=%s WHERE id=%s", (body.get("limit", 0), cid))
            conn.commit()
            result["ok"] = True

        elif section == "catalog":
            search = params.get("search", "")
            status_f = params.get("stock_status", "")
            supplier_id = params.get("supplier_id", "")
            offset = int(params.get("offset", 0))
            lim = min(int(params.get("limit", 20)), 100)
            where = ["p.archived_at IS NULL"]
            args = []
            if search:
                where.append("(p.trade_name ILIKE %s OR p.supplier_article ILIKE %s)")
                args += [f"%{search}%", f"%{search}%"]
            if status_f:
                where.append("p.stock_status = %s"); args.append(status_f)
            if supplier_id:
                where.append("p.supplier_id = %s"); args.append(supplier_id)
            wsql = " AND ".join(where)
            cur.execute(
                f"""SELECT p.id,p.trade_name,p.supplier_article,p.stock_status,p.moderation_status_ozon,
                           p.our_price,p.purchase_price_vat,p.stock_available,p.stock_reserved,
                           s.name as supplier_name, p.category_ozon
                    FROM product p LEFT JOIN supplier s ON s.id=p.supplier_id
                    WHERE {wsql} ORDER BY p.trade_name LIMIT %s OFFSET %s""",
                args + [lim, offset],
            )
            rows = cur.fetchall()
            cur.execute(f"SELECT COUNT(*) FROM product p WHERE {wsql}", args)
            result["products"] = [
                {"id":str(r[0]),"trade_name":r[1],"supplier_article":r[2],"stock_status":r[3],
                 "moderation_status_ozon":r[4],"our_price":r[5],"purchase_price_vat":r[6],
                 "stock_available":r[7],"stock_reserved":r[8],"supplier_name":r[9],"category_ozon":r[10]}
                for r in rows
            ]
            result["total"] = cur.fetchone()[0]
            cur.execute("SELECT id, name FROM supplier WHERE archived_at IS NULL ORDER BY name")
            result["suppliers"] = [{"id": str(r[0]), "name": r[1]} for r in cur.fetchall()]
            cur.execute("SELECT DISTINCT category_name FROM marketplace_tariff ORDER BY category_name")
            result["categories"] = [r[0] for r in cur.fetchall()]

        elif section == "orders":
            cid_f = params.get("company_id", "")
            st_f = params.get("status", "")
            pay_f = params.get("payment_status", "")
            df = params.get("date_from", "")
            dt = params.get("date_to", "")
            offset = int(params.get("offset", 0))
            lim = min(int(params.get("limit", 20)), 100)
            where = ["o.archived_at IS NULL"]
            args = []
            if cid_f: where.append("o.company_id=%s"); args.append(cid_f)
            if st_f: where.append("o.order_status=%s"); args.append(st_f)
            if pay_f: where.append("o.payment_status=%s"); args.append(pay_f)
            if df: where.append("o.created_at>=%s"); args.append(df)
            if dt: where.append("o.created_at<=%s"); args.append(dt)
            wsql = " AND ".join(where)
            cur.execute(
                f"""SELECT o.id,o.order_number,co.name,p.trade_name,o.quantity,o.total_amount,
                           o.order_status,o.payment_status,o.created_at,o.confirmed_at
                    FROM "order" o
                    LEFT JOIN company co ON co.id=o.company_id
                    LEFT JOIN product p ON p.id=o.product_id
                    WHERE {wsql} ORDER BY o.created_at DESC LIMIT %s OFFSET %s""",
                args + [lim, offset],
            )
            rows = cur.fetchall()
            cur.execute(f'SELECT COUNT(*) FROM "order" o WHERE {wsql}', args)
            result["orders"] = [
                {"id":str(r[0]),"order_number":r[1],"company_name":r[2],"product_name":r[3],
                 "quantity":r[4],"total_amount":r[5],"order_status":r[6],"payment_status":r[7],
                 "created_at":r[8].isoformat() if r[8] else None,
                 "confirmed_at":r[9].isoformat() if r[9] else None}
                for r in rows
            ]
            result["total"] = cur.fetchone()[0]
            cur.execute("SELECT id, name FROM company ORDER BY name")
            result["companies"] = [{"id": str(r[0]), "name": r[1]} for r in cur.fetchall()]

        elif section == "order_action" and method == "POST":
            oid = body.get("order_id")
            action = body.get("action")
            if action == "confirm":
                cur.execute("UPDATE \"order\" SET order_status='confirmed', confirmed_at=NOW() WHERE id=%s", (oid,))
                cur.execute("UPDATE product p SET stock_reserved=stock_reserved+o.quantity FROM \"order\" o WHERE o.id=%s AND p.id=o.product_id", (oid,))
            elif action == "cancel":
                reason = body.get("reason", "")
                cur.execute("UPDATE \"order\" SET order_status='cancelled', cancel_reason=%s WHERE id=%s", (reason, oid))
            conn.commit()
            result["ok"] = True

        elif section == "finance":
            cur.execute("SELECT COALESCE(SUM(total_vat+delivery_total),0) FROM invoice WHERE status='pending'")
            result["total_receivable"] = cur.fetchone()[0]
            cur.execute("SELECT COALESCE(SUM(total_vat+delivery_total),0) FROM invoice WHERE status='overdue'")
            result["total_overdue"] = cur.fetchone()[0]
            cur.execute("SELECT COALESCE(SUM(compensation_amount),0) FROM claim WHERE status IN ('agreed','decision_made') AND compensation_type::text='money'")
            result["compensations_pending"] = cur.fetchone()[0]

            inv_st = params.get("inv_status", "")
            where_inv = ["1=1"]
            args_inv = []
            if inv_st: where_inv.append("i.status=%s"); args_inv.append(inv_st)
            cur.execute(
                f"""SELECT i.id,i.invoice_number,co.name,i.total_vat+i.delivery_total,i.status,i.due_date,i.created_at
                    FROM invoice i JOIN company co ON co.id=i.company_id
                    WHERE {" AND ".join(where_inv)} ORDER BY i.created_at DESC LIMIT 50""",
                args_inv
            )
            result["invoices"] = [
                {"id":str(r[0]),"invoice_number":r[1],"company_name":r[2],"amount":r[3],
                 "status":r[4],"due_date":r[5].isoformat() if r[5] else None,
                 "created_at":r[6].isoformat() if r[6] else None}
                for r in cur.fetchall()
            ]
            cur.execute(
                """SELECT bt.id,bt.bank_operation_id,bt.direction,bt.counterparty_inn,co.name,
                          bt.amount,bt.payment_purpose,bt.match_status,bt.received_at
                   FROM bank_transaction bt LEFT JOIN company co ON co.id=bt.company_id
                   ORDER BY bt.received_at DESC LIMIT 50"""
            )
            result["bank_transactions"] = [
                {"id":str(r[0]),"bank_operation_id":r[1],"direction":r[2],"counterparty_inn":r[3],
                 "company_name":r[4],"amount":r[5],"payment_purpose":r[6],"match_status":r[7],
                 "received_at":r[8].isoformat() if r[8] else None}
                for r in cur.fetchall()
            ]

        elif section == "bank_action" and method == "POST":
            btid = body.get("bank_transaction_id")
            action = body.get("action")
            if action == "match_invoice":
                cur.execute("UPDATE bank_transaction SET match_status='manual_matched', matched_by=NULL WHERE id=%s", (btid,))
                if body.get("invoice_id"):
                    cur.execute("UPDATE invoice SET status='paid', paid_at=NOW() WHERE id=%s", (body["invoice_id"],))
            elif action == "credit_balance":
                cur.execute("UPDATE bank_transaction SET match_status='manual_matched' WHERE id=%s", (btid,))
            conn.commit()
            result["ok"] = True

        elif section == "claims":
            st_f = params.get("status", "")
            cid_f = params.get("company_id", "")
            type_f = params.get("type", "")
            where = ["1=1"]
            args = []
            if st_f: where.append("c.status=%s"); args.append(st_f)
            if cid_f: where.append("c.company_id=%s"); args.append(cid_f)
            if type_f: where.append("c.type=%s"); args.append(type_f)
            wsql = " AND ".join(where)
            cur.execute(
                f"""SELECT c.id,c.claim_number,co.name,o.order_number,c.type,c.status,
                           c.created_at,c.compensation_amount
                    FROM claim c JOIN company co ON co.id=c.company_id
                    LEFT JOIN "order" o ON o.id=c.order_id
                    WHERE {wsql} ORDER BY c.created_at DESC LIMIT 50""",
                args
            )
            result["claims"] = [
                {"id":str(r[0]),"claim_number":r[1],"company_name":r[2],"order_number":r[3],
                 "type":r[4],"status":r[5],
                 "created_at":r[6].isoformat() if r[6] else None,"compensation_amount":r[7]}
                for r in cur.fetchall()
            ]
            cur.execute("SELECT id,name FROM company ORDER BY name")
            result["companies"] = [{"id":str(r[0]),"name":r[1]} for r in cur.fetchall()]

        elif section == "claim_detail":
            claim_id = params.get("claim_id")
            cur.execute(
                """SELECT c.id,c.claim_number,co.name,o.order_number,p.trade_name,
                          c.type,c.source,c.description,c.photos,c.decision,
                          c.compensation_amount,c.compensation_type,c.status,c.history,
                          c.created_at,c.closed_at
                   FROM claim c JOIN company co ON co.id=c.company_id
                   LEFT JOIN "order" o ON o.id=c.order_id
                   LEFT JOIN product p ON p.id=c.product_id
                   WHERE c.id=%s""",
                (claim_id,)
            )
            row = cur.fetchone()
            if not row:
                return {"statusCode":404,"headers":cors,"body":json.dumps({"error":"Не найдено"})}
            result["claim"] = {
                "id":str(row[0]),"claim_number":row[1],"company_name":row[2],"order_number":row[3],
                "product_name":row[4],"type":row[5],"source":row[6],"description":row[7],
                "photos":row[8],"decision":row[9],"compensation_amount":row[10],
                "compensation_type":row[11],"status":row[12],"history":row[13],
                "created_at":row[14].isoformat() if row[14] else None,
                "closed_at":row[15].isoformat() if row[15] else None,
            }

        elif section == "claim_update" and method == "POST":
            import datetime as _dt
            cid_cl = body.get("claim_id")
            action = body.get("action")

            def _add_history(status, comment=""):
                return json.dumps([{"date": _dt.datetime.utcnow().isoformat(),
                                     "status": status, "comment": comment}])

            if action == "send_decision":
                cur.execute(
                    """UPDATE claim SET decision=%s, compensation_amount=%s,
                          compensation_type=%s, status='decision_made',
                          history = history || %s::jsonb
                       WHERE id=%s""",
                    (body.get("decision"),
                     body.get("compensation_amount", 0),
                     body.get("compensation_type"),
                     _add_history("decision_made", "Решение отправлено клиенту"),
                     cid_cl)
                )
                # Уведомить клиента
                cur.execute("SELECT company_id FROM claim WHERE id=%s", (cid_cl,))
                cid_row = cur.fetchone()
                if cid_row:
                    cur.execute('SELECT id FROM "user" WHERE company_id=%s AND archived_at IS NULL', (str(cid_row[0]),))
                    for u in cur.fetchall():
                        cur.execute(
                            "INSERT INTO notification (user_id, event_type, channel, text, link_type, link_id) VALUES (%s,'claim_resolved','in_app',%s,'claim',%s)",
                            (str(u[0]), "По вашей рекламации вынесено решение. Проверьте и подтвердите.", cid_cl),
                        )
            elif action == "reviewing":
                cur.execute(
                    "UPDATE claim SET status='reviewing', history=history||%s::jsonb WHERE id=%s",
                    (_add_history("reviewing", "Рекламация принята в работу"), cid_cl)
                )
            elif action == "procedural":
                cur.execute(
                    "UPDATE claim SET status='procedural', history=history||%s::jsonb WHERE id=%s",
                    (_add_history("procedural", "Переведена в процессуальный статус"), cid_cl)
                )
            elif action == "close":
                cur.execute(
                    "UPDATE claim SET status='closed', closed_at=NOW(), history=history||%s::jsonb WHERE id=%s",
                    (_add_history("closed", "Закрыта менеджером"), cid_cl)
                )
            conn.commit()
            result["ok"] = True

        elif section == "claim_create" and method == "POST":
            # Ручное создание рекламации менеджером
            import datetime as _dt
            cur.execute("SELECT COUNT(*) FROM claim")
            n = cur.fetchone()[0] + 1
            claim_number = f"CLM-MAN-{str(n).zfill(6)}"
            cur.execute(
                """INSERT INTO claim
                   (claim_number, company_id, order_id, product_id,
                    type, source, description, status, history)
                   VALUES (%s,%s,%s,%s,%s,'manual',%s,'new',%s)
                   RETURNING id""",
                (
                    claim_number,
                    body.get("company_id"),
                    body.get("order_id") or None,
                    body.get("product_id") or None,
                    body.get("type", "defect"),
                    body.get("description", ""),
                    json.dumps([{"date": _dt.datetime.utcnow().isoformat(),
                                  "status": "new", "comment": "Создана менеджером вручную"}]),
                )
            )
            result["claim_id"] = str(cur.fetchone()[0])
            result["claim_number"] = claim_number
            conn.commit()
            result["ok"] = True

        elif section == "claim_photos" and method == "POST":
            # Сохранение URL фотографий (загруженных через S3) в рекламацию
            cid_cl = body.get("claim_id")
            photos = body.get("photos", [])
            if not cid_cl or not photos:
                cur.close(); conn.close()
                return {"statusCode": 400, "headers": cors, "body": json.dumps({"error": "claim_id и photos обязательны"}, ensure_ascii=False)}
            cur.execute(
                """UPDATE claim SET photos = COALESCE(photos, '[]'::jsonb) || %s::jsonb WHERE id=%s""",
                (json.dumps(photos), cid_cl)
            )
            conn.commit()
            result["ok"] = True

        elif section == "warehouse_items":
            # Список физических товаров на складе (возвраты)
            cid_f = params.get("company_id", "")
            st_f  = params.get("stock_status", "in_warehouse")
            where = ["1=1"]
            args  = []
            if cid_f:
                where.append("c.id=%s"); args.append(cid_f)
            if st_f:
                where.append("wi.stock_status=%s"); args.append(st_f)
            cur.execute(
                f"""SELECT wi.id, p.trade_name, p.supplier_article, wi.quantity,
                           wi.condition, wi.stock_status, wi.received_at,
                           cl.claim_number, co.name as company_name
                    FROM warehouse_item wi
                    JOIN product p ON p.id=wi.product_id
                    LEFT JOIN claim cl ON cl.id=wi.claim_id
                    LEFT JOIN "order" o ON o.id=cl.order_id
                    LEFT JOIN company co ON co.id=cl.company_id
                    WHERE {' AND '.join(where)}
                    ORDER BY wi.received_at DESC LIMIT 50""",
                args,
            )
            result["items"] = [
                {"id": str(r[0]), "trade_name": r[1], "supplier_article": r[2],
                 "quantity": r[3], "condition": r[4], "stock_status": r[5],
                 "received_at": r[6].isoformat() if r[6] else None,
                 "claim_number": r[7], "company_name": r[8]}
                for r in cur.fetchall()
            ]

        elif section == "warehouse_item_action" and method == "POST":
            # Менеджер принимает решение по физическому товару
            import datetime as _dt
            item_id = body.get("item_id")
            action  = body.get("action")  # return_to_sale | return_to_supplier | write_off
            if action == "return_to_sale":
                cur.execute(
                    "UPDATE warehouse_item SET stock_status='ready_for_sale', resolved_at=NOW() WHERE id=%s",
                    (item_id,)
                )
                cur.execute(
                    "UPDATE product SET stock_status='ready_for_sale' WHERE id=(SELECT product_id FROM warehouse_item WHERE id=%s)",
                    (item_id,)
                )
            elif action == "return_to_supplier":
                cur.execute(
                    "UPDATE warehouse_item SET stock_status='ready_for_return', resolved_at=NOW() WHERE id=%s",
                    (item_id,)
                )
                # Создать задание логисту
                cur.execute("SELECT product_id, claim_id FROM warehouse_item WHERE id=%s", (item_id,))
                wi = cur.fetchone()
                if wi:
                    cur.execute(
                        "INSERT INTO delivery (type, delivery_method, status, task_date, claim_id) VALUES ('return_to_supplier','our_delivery','new',CURRENT_DATE+1,%s) RETURNING id",
                        (str(wi[1]) if wi[1] else None,)
                    )
            elif action == "write_off":
                cur.execute(
                    "UPDATE warehouse_item SET stock_status='written_off', resolved_at=NOW() WHERE id=%s",
                    (item_id,)
                )
                cur.execute(
                    "UPDATE product SET stock_status='written_off' WHERE id=(SELECT product_id FROM warehouse_item WHERE id=%s)",
                    (item_id,)
                )
            conn.commit()
            result["ok"] = True

        elif section == "priority_stock_check":
            # Проверить наличие товара ready_for_sale для нового заказа
            product_id = params.get("product_id") or body.get("product_id")
            cur.execute(
                """SELECT wi.id, wi.quantity, p.trade_name
                   FROM warehouse_item wi
                   JOIN product p ON p.id=wi.product_id
                   WHERE wi.product_id=%s AND wi.stock_status='ready_for_sale'
                   LIMIT 1""",
                (product_id,)
            )
            row = cur.fetchone()
            if row:
                result["has_warehouse_stock"] = True
                result["item_id"]   = str(row[0])
                result["quantity"]  = row[1]
                result["trade_name"]= row[2]
            else:
                result["has_warehouse_stock"] = False

        elif section == "suppliers":
            cur.execute(
                """SELECT s.id,s.name,s.short_name,s.inn,s.status,s.email,s.phone,
                          s.warehouse_address,s.pickup_hours,s.created_at,
                          COUNT(p.id) as products_count
                   FROM supplier s LEFT JOIN product p ON p.supplier_id=s.id AND p.archived_at IS NULL
                   WHERE s.archived_at IS NULL
                   GROUP BY s.id ORDER BY s.name"""
            )
            result["suppliers"] = [
                {"id":str(r[0]),"name":r[1],"short_name":r[2],"inn":r[3],"status":r[4],
                 "email":r[5],"phone":r[6],"warehouse_address":r[7],"pickup_hours":r[8],
                 "created_at":r[9].isoformat() if r[9] else None,"products_count":r[10]}
                for r in cur.fetchall()
            ]

        elif section == "supplier_save" and method == "POST":
            s = body
            if s.get("id"):
                cur.execute(
                    """UPDATE supplier SET name=%s,short_name=%s,inn=%s,kpp=%s,ogrn=%s,
                       legal_address=%s,vat_payer=%s,contact_person=%s,email=%s,phone=%s,
                       warehouse_address=%s,pickup_hours=%s,working_days=%s WHERE id=%s""",
                    (s.get("name"),s.get("short_name"),s.get("inn"),s.get("kpp"),s.get("ogrn"),
                     s.get("legal_address"),s.get("vat_payer",True),s.get("contact_person"),
                     s.get("email"),s.get("phone"),s.get("warehouse_address"),
                     s.get("pickup_hours"),s.get("working_days"),s["id"])
                )
            else:
                cur.execute(
                    """INSERT INTO supplier (name,short_name,inn,kpp,ogrn,legal_address,vat_payer,
                       contact_person,email,phone,warehouse_address,pickup_hours,working_days)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                    (s.get("name",""),s.get("short_name"),s.get("inn"),s.get("kpp"),s.get("ogrn"),
                     s.get("legal_address"),s.get("vat_payer",True),s.get("contact_person"),
                     s.get("email"),s.get("phone"),s.get("warehouse_address"),
                     s.get("pickup_hours"),s.get("working_days"))
                )
                result["id"] = str(cur.fetchone()[0])
            conn.commit()
            result["ok"] = True

        elif section == "logistics":
            cur.execute(
                """SELECT id,city,region,status,min_rate,rate_per_kg,delivery_days,tc_partners
                   FROM delivery_zone ORDER BY city"""
            )
            result["zones"] = [
                {"id":str(r[0]),"city":r[1],"region":r[2],"status":r[3],
                 "min_rate":r[4],"rate_per_kg":r[5],"delivery_days":r[6],"tc_partners":r[7]}
                for r in cur.fetchall()
            ]
            from datetime import date
            today = date.today().isoformat()
            cur.execute(
                """SELECT d.id,d.type,d.status,d.task_date,d.total_boxes,
                          s.name as supplier_name,u.name as logist_name,d.tracking_number
                   FROM delivery d
                   LEFT JOIN supplier s ON s.id=d.supplier_id
                   LEFT JOIN "user" u ON u.id=d.logist_id
                   WHERE d.task_date=%s ORDER BY d.id""",
                (today,)
            )
            result["tasks_today"] = [
                {"id":str(r[0]),"type":r[1],"status":r[2],"task_date":r[3].isoformat() if r[3] else None,
                 "total_boxes":r[4],"supplier_name":r[5],"logist_name":r[6],"tracking_number":r[7]}
                for r in cur.fetchall()
            ]

        elif section == "zone_save" and method == "POST":
            z = body
            if z.get("id"):
                cur.execute(
                    "UPDATE delivery_zone SET city=%s,region=%s,status=%s,min_rate=%s,rate_per_kg=%s,delivery_days=%s,tc_partners=%s,updated_at=NOW() WHERE id=%s",
                    (z["city"],z["region"],z.get("status","active"),z.get("min_rate",0),z.get("rate_per_kg",0),z.get("delivery_days",1),json.dumps(z.get("tc_partners",[])),z["id"])
                )
            else:
                cur.execute(
                    "INSERT INTO delivery_zone (city,region,status,min_rate,rate_per_kg,delivery_days,tc_partners) VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id",
                    (z["city"],z["region"],z.get("status","active"),z.get("min_rate",0),z.get("rate_per_kg",0),z.get("delivery_days",1),json.dumps(z.get("tc_partners",[])))
                )
                result["id"] = str(cur.fetchone()[0])
            conn.commit()
            result["ok"] = True

        elif section == "support":
            cur.execute(
                """SELECT co.id,co.name,COUNT(sm.id) FILTER(WHERE sm.is_read=false AND sm.from_role='client') as unread,
                          MAX(sm.created_at) as last_msg
                   FROM company co
                   LEFT JOIN support_message sm ON sm.company_id=co.id
                   GROUP BY co.id ORDER BY last_msg DESC NULLS LAST LIMIT 50"""
            )
            result["chats"] = [
                {"company_id":str(r[0]),"company_name":r[1],"unread":r[2],
                 "last_msg":r[3].isoformat() if r[3] else None}
                for r in cur.fetchall()
            ]

        elif section == "support_messages":
            cid_s = params.get("company_id")
            cur.execute(
                "SELECT id,from_role,text,is_read,created_at FROM support_message WHERE company_id=%s ORDER BY created_at",
                (cid_s,)
            )
            result["messages"] = [
                {"id":str(r[0]),"from_role":r[1],"text":r[2],"is_read":r[3],
                 "created_at":r[4].isoformat() if r[4] else None}
                for r in cur.fetchall()
            ]
            cur.execute("UPDATE support_message SET is_read=true WHERE company_id=%s AND from_role='client'", (cid_s,))
            conn.commit()

        elif section == "support_send" and method == "POST":
            cur.execute(
                "INSERT INTO support_message (company_id,from_role,text) VALUES (%s,'manager',%s)",
                (body.get("company_id"), body.get("text",""))
            )
            conn.commit()
            result["ok"] = True

        # ── БАНКОВСКИЕ ТРАНЗАКЦИИ — список для менеджера ─────────────────────
        elif section == "bank_transactions":
            st_f  = params.get("match_status", "")
            df    = params.get("date_from", "")
            dt    = params.get("date_to", "")
            offset = int(params.get("offset", 0))
            lim   = min(int(params.get("limit", 50)), 200)

            where = ["1=1"]
            args  = []
            if st_f:
                where.append("bt.match_status = %s"); args.append(st_f)
            if df:
                where.append("bt.received_at >= %s"); args.append(df)
            if dt:
                where.append("bt.received_at <= %s"); args.append(dt)

            cur.execute(
                f"""SELECT bt.id, bt.bank_operation_id, bt.counterparty_inn,
                           co.name AS company_name, bt.amount, bt.payment_purpose,
                           bt.match_status, bt.received_at,
                           i.invoice_number, u.name AS matched_by_name
                    FROM bank_transaction bt
                    LEFT JOIN company co ON co.id = bt.company_id
                    LEFT JOIN invoice  i  ON i.id  = bt.matched_invoice_id
                    LEFT JOIN "user"   u  ON u.id  = bt.matched_by
                    WHERE {' AND '.join(where)}
                    ORDER BY bt.received_at DESC
                    LIMIT %s OFFSET %s""",
                args + [lim, offset],
            )
            result["transactions"] = [
                {"id": str(r[0]), "bank_operation_id": r[1], "counterparty_inn": r[2],
                 "company_name": r[3], "amount": r[4], "payment_purpose": r[5],
                 "match_status": r[6], "received_at": r[7].isoformat() if r[7] else None,
                 "invoice_number": r[8], "matched_by_name": r[9]}
                for r in cur.fetchall()
            ]
            cur.execute(
                f'SELECT COUNT(*) FROM bank_transaction bt WHERE {" AND ".join(where)}',
                args,
            )
            result["total"] = cur.fetchone()[0]

            # Открытые счета для выбора при ручной привязке
            cur.execute(
                """SELECT i.id, i.invoice_number, i.total_vat + i.delivery_total AS amount,
                          co.name AS company_name
                   FROM invoice i JOIN company co ON co.id = i.company_id
                   WHERE i.status = 'pending'
                   ORDER BY i.created_at DESC LIMIT 200"""
            )
            result["open_invoices"] = [
                {"id": str(r[0]), "invoice_number": r[1],
                 "amount": r[2], "company_name": r[3]}
                for r in cur.fetchall()
            ]
            cur.execute("SELECT id, name FROM company ORDER BY name")
            result["companies"] = [{"id": str(r[0]), "name": r[1]} for r in cur.fetchall()]

        # ── РУЧНОЕ СОПОСТАВЛЕНИЕ ПЛАТЕЖА ────────────────────────────────────
        elif section == "bank_match" and method == "POST":
            import sys, os as _os
            sys.path.insert(0, _os.path.dirname(__file__))

            from decimal import Decimal as _Dec

            bank_tx_id = body.get("bank_transaction_id")
            invoice_id = body.get("invoice_id")
            cid_match  = body.get("company_id")
            user_id    = body.get("user_id")  # менеджер, выполняющий привязку

            if not bank_tx_id:
                cur.close(); conn.close()
                return {"statusCode": 400, "headers": cors,
                        "body": json.dumps({"error": "bank_transaction_id обязателен"}, ensure_ascii=False)}

            # Получить данные транзакции
            cur.execute(
                "SELECT amount, payment_purpose, company_id FROM bank_transaction WHERE id = %s",
                (bank_tx_id,),
            )
            tx_row = cur.fetchone()
            if not tx_row:
                cur.close(); conn.close()
                return {"statusCode": 404, "headers": cors,
                        "body": json.dumps({"error": "Транзакция не найдена"}, ensure_ascii=False)}

            tx_amount  = _Dec(str(tx_row[0]))
            tx_purpose = tx_row[1] or ""
            company_id_resolved = cid_match or (str(tx_row[2]) if tx_row[2] else None)

            # Если явно указан счёт — привязываем к нему напрямую
            if invoice_id:
                cur.execute(
                    "SELECT id, invoice_number, total_vat, status FROM invoice WHERE id = %s",
                    (invoice_id,),
                )
                inv = cur.fetchone()
                if not inv:
                    cur.close(); conn.close()
                    return {"statusCode": 404, "headers": cors,
                            "body": json.dumps({"error": "Счёт не найден"}, ensure_ascii=False)}

                from datetime import datetime, timezone as _tz
                now = datetime.now(_tz.utc)
                inv_id_s    = str(inv[0])
                inv_number  = inv[1]
                inv_total   = _Dec(str(inv[2]))
                overpayment = max(_Dec("0"), tx_amount - inv_total)

                cur.execute(
                    """UPDATE invoice
                       SET status = 'paid', paid_at = %s,
                           bank_transaction_id = %s, overpayment_amount = %s
                       WHERE id = %s""",
                    (now, bank_tx_id, float(overpayment), inv_id_s),
                )
                cur.execute(
                    """UPDATE bank_transaction
                       SET match_status = 'manual_matched',
                           matched_invoice_id = %s,
                           matched_at = %s,
                           matched_by = %s,
                           company_id = %s
                       WHERE id = %s""",
                    (inv_id_s, now, user_id, company_id_resolved, bank_tx_id),
                )
                cur.execute(
                    "UPDATE \"order\" SET payment_status = 'paid' WHERE invoice_id = %s",
                    (inv_id_s,),
                )

                if company_id_resolved:
                    cur.execute("SELECT balance FROM company WHERE id = %s", (company_id_resolved,))
                    bal_row = cur.fetchone()
                    balance = _Dec(str(bal_row[0])) if bal_row else _Dec("0")

                    # Транзакция оплаты
                    cur.execute(
                        """INSERT INTO transaction
                           (company_id, type, amount, linked_doc_type, linked_doc_id,
                            status, created_by, comment, balance_after)
                           VALUES (%s,'payment_received',%s,'invoice',%s,'confirmed','manager',%s,%s)""",
                        (company_id_resolved, float(min(tx_amount, inv_total)),
                         inv_id_s,
                         f"Ручная привязка платежа к счёту {inv_number}",
                         float(balance)),
                    )

                    if overpayment > _Dec("0"):
                        new_bal = balance + overpayment
                        cur.execute(
                            "UPDATE company SET balance = %s WHERE id = %s",
                            (float(new_bal), company_id_resolved),
                        )
                        cur.execute(
                            """INSERT INTO transaction
                               (company_id,type,amount,linked_doc_type,linked_doc_id,
                                status,created_by,comment,balance_after)
                               VALUES (%s,'balance_used',%s,'invoice',%s,'confirmed','manager',%s,%s)""",
                            (company_id_resolved, float(overpayment),
                             inv_id_s,
                             f"Переплата по счёту {inv_number} на баланс",
                             float(new_bal)),
                        )

                    cur.execute(
                        """UPDATE company
                           SET status = 'active', blocked_system_at = NULL
                           WHERE id = %s AND status = 'blocked_system'""",
                        (company_id_resolved,),
                    )

                # Уведомить клиента
                cur.execute(
                    'SELECT id FROM "user" WHERE company_id = %s AND archived_at IS NULL',
                    (company_id_resolved,),
                )
                for u_row in cur.fetchall():
                    cur.execute(
                        """INSERT INTO notification (user_id, event_type, channel, text, link_type, link_id)
                           VALUES (%s, 'invoice_paid', 'in_app', %s, 'invoice', %s)""",
                        (str(u_row[0]),
                         f"Счёт {inv_number} отмечен оплаченным (ручная обработка).",
                         inv_id_s),
                    )

                result["match_status"] = "manual_matched"
                result["invoice_number"] = inv_number

            else:
                # Нет конкретного счёта — запускаем автоматику с флагом matched_by
                # Импортируем только нужные функции
                def _notify_by_role(role, text):
                    cur.execute(
                        'SELECT id FROM "user" WHERE role = %s AND archived_at IS NULL',
                        (role,),
                    )
                    for u_row in cur.fetchall():
                        cur.execute(
                            """INSERT INTO notification (user_id, event_type, channel, text, link_type, link_id)
                               VALUES (%s, 'payment_needs_distribution', 'in_app', %s, 'bank_transaction', %s)""",
                            (str(u_row[0]), text, bank_tx_id),
                        )

                if not company_id_resolved:
                    _notify_by_role("manager", f"Ручная обработка: компания не указана для транзакции {bank_tx_id[:8]}.")
                    cur.execute(
                        "UPDATE bank_transaction SET match_status = 'unmatched' WHERE id = %s",
                        (bank_tx_id,),
                    )
                    result["match_status"] = "unmatched"
                else:
                    cur.execute(
                        "UPDATE bank_transaction SET company_id = %s, match_status = 'needs_distribution' WHERE id = %s",
                        (company_id_resolved, bank_tx_id),
                    )
                    result["match_status"] = "needs_distribution"
                    result["hint"] = "Укажите invoice_id для полной привязки"

            conn.commit()
            result["ok"] = True

    finally:
        cur.close()
        conn.close()

    return {
        "statusCode": 200,
        "headers": cors,
        "body": json.dumps(result, default=serial, ensure_ascii=False),
    }