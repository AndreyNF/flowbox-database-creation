import json
import os
import psycopg2
from decimal import Decimal


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
            ak = row[13] or ""
            result["company"] = {
                "id": str(row[0]), "name": row[1], "short_name": row[2], "full_name": row[3],
                "inn": row[4], "kpp": row[5], "ogrn": row[6], "legal_address": row[7],
                "director_name": row[8], "email": row[9], "phone": row[10],
                "contact_person": row[11], "marketplace": row[12],
                "ozon_api_key_masked": (ak[:4]+"..."+ak[-4:]) if len(ak)>=8 else "*"*len(ak),
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
            cid_cl = body.get("claim_id")
            action = body.get("action")
            if action == "send_decision":
                cur.execute(
                    "UPDATE claim SET decision=%s, compensation_amount=%s, compensation_type=%s, status='decision_made' WHERE id=%s",
                    (body.get("decision"), body.get("compensation_amount", 0), body.get("compensation_type"), cid_cl)
                )
            elif action == "procedural":
                cur.execute("UPDATE claim SET status='procedural' WHERE id=%s", (cid_cl,))
            elif action == "close":
                cur.execute("UPDATE claim SET status='closed', closed_at=NOW() WHERE id=%s", (cid_cl,))
            conn.commit()
            result["ok"] = True

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

    finally:
        cur.close()
        conn.close()

    return {
        "statusCode": 200,
        "headers": cors,
        "body": json.dumps(result, default=serial, ensure_ascii=False),
    }