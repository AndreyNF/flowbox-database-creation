import json
import os
import psycopg2
from decimal import Decimal
import datetime as _dt


def get_db():
    return psycopg2.connect(
        os.environ["DATABASE_URL"],
        options=f"-c search_path={os.environ.get('MAIN_DB_SCHEMA', 'public')}",
    )


def serial(obj):
    if isinstance(obj, Decimal): return float(obj)
    if isinstance(obj, (_dt.date, _dt.datetime)): return obj.isoformat()
    raise TypeError


CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
}


def resp(status, body):
    return {"statusCode": status, "headers": CORS,
            "body": json.dumps(body, default=serial, ensure_ascii=False)}


def handler(event: dict, context) -> dict:
    """
    Админ-панель FlowBox. Все разделы через ?section=...

    GET  overview / users / settings / bank / tariffs / zones /
         archive / security / login_log / api_log
    POST users_action / settings_save / bank_action / tariff_save /
         zone_save / zone_toggle / force_logout / delete_claim_photos
    """
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    method  = event.get("httpMethod", "GET")
    params  = event.get("queryStringParameters") or {}
    section = params.get("section", "overview")
    body    = json.loads(event.get("body") or "{}") if method in ("POST", "PUT", "DELETE") else {}

    conn = get_db()
    cur  = conn.cursor()
    result = {}

    try:
        # ══════════════════════════════════════════════════════════════════════
        # ОБЗОР
        # ══════════════════════════════════════════════════════════════════════
        if section == "overview":
            today = _dt.date.today().isoformat()
            month_start = _dt.date.today().replace(day=1).isoformat()

            cur.execute("SELECT COUNT(*), SUM(CASE WHEN NOT is_active OR archived_at IS NOT NULL THEN 1 ELSE 0 END) FROM \"user\" WHERE role='client'")
            r = cur.fetchone(); result["clients_total"] = r[0]; result["clients_blocked"] = r[1] or 0

            cur.execute("SELECT COALESCE(SUM(total_amount),0) FROM \"order\" WHERE created_at::date=%s AND archived_at IS NULL", (today,))
            result["revenue_today"] = cur.fetchone()[0]
            cur.execute("SELECT COALESCE(SUM(total_amount),0) FROM \"order\" WHERE created_at>=%s AND archived_at IS NULL", (month_start,))
            result["revenue_month"] = cur.fetchone()[0]
            cur.execute("SELECT COALESCE(SUM(total_amount),0) FROM \"order\" WHERE archived_at IS NULL")
            result["revenue_total"] = cur.fetchone()[0]

            cur.execute("SELECT COUNT(*) FROM \"order\" WHERE created_at::date=%s AND archived_at IS NULL", (today,))
            result["orders_today"] = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM \"order\" WHERE created_at>=%s AND archived_at IS NULL", (month_start,))
            result["orders_month"] = cur.fetchone()[0]

            cur.execute("SELECT COUNT(*) FROM claim WHERE status NOT IN ('closed','agreed')")
            result["open_claims"] = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM bank_transaction WHERE match_status IN ('needs_distribution','unmatched','underpayment')")
            result["unmatched_payments"] = cur.fetchone()[0]
            cur.execute("SELECT COUNT(DISTINCT company_id) FROM invoice WHERE status='overdue'")
            result["overdue_clients"] = cur.fetchone()[0]

            # График оборота по дням (30 дней)
            cur.execute("""
                SELECT created_at::date as d, COALESCE(SUM(total_amount),0)
                FROM "order" WHERE created_at >= NOW()-INTERVAL '30 days' AND archived_at IS NULL
                GROUP BY d ORDER BY d
            """)
            result["revenue_chart"] = [{"date": str(r[0]), "amount": float(r[1])} for r in cur.fetchall()]

            # График новых клиентов по месяцам (12 мес)
            cur.execute("""
                SELECT TO_CHAR(created_at,'YYYY-MM') as m, COUNT(*)
                FROM "user" WHERE role='client' AND created_at >= NOW()-INTERVAL '12 months'
                GROUP BY m ORDER BY m
            """)
            result["clients_chart"] = [{"month": r[0], "count": r[1]} for r in cur.fetchall()]

        # ══════════════════════════════════════════════════════════════════════
        # ПОЛЬЗОВАТЕЛИ
        # ══════════════════════════════════════════════════════════════════════
        elif section == "users":
            role_f   = params.get("role", "")
            search_f = params.get("search", "")
            offset   = int(params.get("offset", 0))
            limit    = min(int(params.get("limit", 50)), 200)

            where = ["u.archived_at IS NULL"]
            args  = []
            if role_f:
                where.append("u.role=%s"); args.append(role_f)
            if search_f:
                where.append("(u.name ILIKE %s OR u.email ILIKE %s)")
                args += [f"%{search_f}%", f"%{search_f}%"]

            cur.execute(
                f"""SELECT u.id,u.name,u.email,u.role,u.phone,u.is_active,
                           u.created_at,u.last_login_at,u.access_expires_at,
                           u.blocked_at,co.name as company_name
                    FROM "user" u LEFT JOIN company co ON co.id=u.company_id
                    WHERE {' AND '.join(where)}
                    ORDER BY u.created_at DESC LIMIT %s OFFSET %s""",
                args + [limit, offset],
            )
            result["users"] = [
                {"id": str(r[0]), "name": r[1], "email": r[2], "role": r[3],
                 "phone": r[4], "is_active": r[5],
                 "created_at": r[6], "last_login_at": r[7],
                 "access_expires_at": r[8], "blocked_at": r[9],
                 "company_name": r[10]}
                for r in cur.fetchall()
            ]
            cur.execute(f'SELECT COUNT(*) FROM "user" u WHERE {" AND ".join(where)}', args)
            result["total"] = cur.fetchone()[0]
            cur.execute("SELECT id, name FROM company ORDER BY name")
            result["companies"] = [{"id": str(r[0]), "name": r[1]} for r in cur.fetchall()]

        elif section == "users_action" and method == "POST":
            action  = body.get("action")
            user_id = body.get("user_id")

            if action == "block":
                cur.execute("UPDATE \"user\" SET is_active=false, blocked_at=NOW(), blocked_reason=%s WHERE id=%s",
                            (body.get("reason", ""), user_id))
                # Инвалидируем refresh_token
                cur.execute("UPDATE \"user\" SET refresh_token=NULL, refresh_expires=NULL WHERE id=%s", (user_id,))

            elif action == "unblock":
                cur.execute("UPDATE \"user\" SET is_active=true, blocked_at=NULL, blocked_reason=NULL WHERE id=%s", (user_id,))

            elif action == "reset_password":
                import hashlib, os as _os
                new_pw = body.get("new_password") or _os.urandom(6).hex()
                salt = _os.urandom(16).hex()
                h = hashlib.pbkdf2_hmac("sha256", new_pw.encode(), salt.encode(), 100_000).hex()
                pw_hash = f"{salt}:{h}"
                cur.execute("UPDATE \"user\" SET password_hash=%s, refresh_token=NULL WHERE id=%s", (pw_hash, user_id))
                result["temp_password"] = new_pw

            elif action == "delete":
                cur.execute("UPDATE \"user\" SET archived_at=NOW(), refresh_token=NULL WHERE id=%s", (user_id,))

            elif action == "create":
                import hashlib, os as _os
                email    = (body.get("email") or "").strip().lower()
                name     = body.get("name", "")
                role     = body.get("role", "manager")
                phone    = body.get("phone", "")
                cid      = body.get("company_id") or None
                expires  = body.get("access_expires_at") or None
                temp_pw  = body.get("password") or _os.urandom(6).hex()
                salt     = _os.urandom(16).hex()
                h        = hashlib.pbkdf2_hmac("sha256", temp_pw.encode(), salt.encode(), 100_000).hex()
                pw_hash  = f"{salt}:{h}"

                cur.execute('SELECT id FROM "user" WHERE email=%s AND archived_at IS NULL', (email,))
                if cur.fetchone():
                    cur.close(); conn.close()
                    return resp(409, {"error": "Email уже занят"})

                cur.execute(
                    """INSERT INTO "user" (name,email,role,password_hash,company_id,phone,access_expires_at)
                       VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                    (name, email, role, pw_hash, cid, phone, expires),
                )
                result["id"] = str(cur.fetchone()[0])
                result["temp_password"] = temp_pw

            elif action == "set_expires":
                cur.execute("UPDATE \"user\" SET access_expires_at=%s WHERE id=%s",
                            (body.get("access_expires_at"), user_id))

            conn.commit()
            result["ok"] = True

        # ══════════════════════════════════════════════════════════════════════
        # НАСТРОЙКИ ПЛАТФОРМЫ
        # ══════════════════════════════════════════════════════════════════════
        elif section == "settings":
            cur.execute("SELECT key, value FROM platform_setting ORDER BY key")
            result["settings"] = {r[0]: r[1] for r in cur.fetchall()}

        elif section == "settings_save" and method == "POST":
            for key, value in body.items():
                cur.execute(
                    """INSERT INTO platform_setting (key, value) VALUES (%s,%s)
                       ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()""",
                    (key, str(value)),
                )
            conn.commit()
            result["ok"] = True

        # ══════════════════════════════════════════════════════════════════════
        # БАНК
        # ══════════════════════════════════════════════════════════════════════
        elif section == "bank":
            direction_f = params.get("direction", "")
            status_f    = params.get("match_status", "")
            date_from   = params.get("date_from", "")
            date_to     = params.get("date_to", "")
            offset      = int(params.get("offset", 0))
            limit       = min(int(params.get("limit", 50)), 200)

            where = ["1=1"]
            args  = []
            if direction_f: where.append("bt.direction=%s"); args.append(direction_f)
            if status_f:    where.append("bt.match_status=%s"); args.append(status_f)
            if date_from:   where.append("bt.received_at>=%s"); args.append(date_from)
            if date_to:     where.append("bt.received_at<=%s"); args.append(date_to)

            cur.execute(
                f"""SELECT bt.id,bt.bank_operation_id,bt.direction,bt.counterparty_inn,
                           co.name,bt.amount,bt.payment_purpose,bt.match_status,bt.received_at,
                           i.invoice_number
                    FROM bank_transaction bt
                    LEFT JOIN company co ON co.id=bt.company_id
                    LEFT JOIN invoice i ON i.id=bt.matched_invoice_id
                    WHERE {' AND '.join(where)}
                    ORDER BY bt.received_at DESC LIMIT %s OFFSET %s""",
                args + [limit, offset],
            )
            result["transactions"] = [
                {"id": str(r[0]), "bank_operation_id": r[1], "direction": r[2],
                 "counterparty_inn": r[3], "company_name": r[4], "amount": r[5],
                 "payment_purpose": r[6], "match_status": r[7], "received_at": r[8],
                 "invoice_number": r[9]}
                for r in cur.fetchall()
            ]
            cur.execute(f'SELECT COUNT(*) FROM bank_transaction bt WHERE {" AND ".join(where)}', args)
            result["total"] = cur.fetchone()[0]
            cur.execute("SELECT id, name FROM company ORDER BY name")
            result["companies"] = [{"id": str(r[0]), "name": r[1]} for r in cur.fetchall()]
            cur.execute("SELECT id, invoice_number, total_vat+delivery_total, status FROM invoice WHERE status IN ('pending','overdue') ORDER BY created_at DESC LIMIT 200")
            result["invoices"] = [{"id": str(r[0]), "invoice_number": r[1], "amount": r[2], "status": r[3]} for r in cur.fetchall()]

            # Статус интеграции Точка
            cur.execute("SELECT value FROM platform_setting WHERE key='tochka_webhook_url'")
            row = cur.fetchone()
            result["webhook_url"] = row[0] if row else ""

        elif section == "bank_action" and method == "POST":
            action = body.get("action")
            bt_id  = body.get("bank_transaction_id")

            if action == "match_invoice":
                inv_id = body.get("invoice_id")
                cur.execute("UPDATE bank_transaction SET match_status='manual_matched', company_id=%s WHERE id=%s",
                            (body.get("company_id"), bt_id))
                if inv_id:
                    cur.execute("UPDATE invoice SET status='paid', paid_at=NOW() WHERE id=%s", (inv_id,))

            elif action == "credit_balance":
                cid = body.get("company_id")
                cur.execute("SELECT amount FROM bank_transaction WHERE id=%s", (bt_id,))
                row = cur.fetchone()
                if row and cid:
                    amt = float(row[0])
                    cur.execute("SELECT balance FROM company WHERE id=%s", (cid,))
                    bal = float(cur.fetchone()[0] or 0)
                    cur.execute("UPDATE company SET balance=%s WHERE id=%s", (bal + amt, cid))
                    cur.execute(
                        "INSERT INTO transaction (company_id,type,amount,status,comment,balance_after) VALUES (%s,'payment_received',%s,'confirmed',%s,%s)",
                        (cid, amt, f"Зачислено на баланс из банковской транзакции {bt_id[:8]}", bal + amt),
                    )
                cur.execute("UPDATE bank_transaction SET match_status='manual_matched', company_id=%s WHERE id=%s",
                            (cid, bt_id))

            elif action == "reject":
                cur.execute("UPDATE bank_transaction SET match_status='unmatched' WHERE id=%s", (bt_id,))

            elif action == "poll":
                # Запустить ручной опрос — вызываем tochka-polling
                import urllib.request
                url = "https://functions.poehali.dev/cfd77472-16b2-4166-a9c2-fc91e9740c43"
                req = urllib.request.Request(url, data=b"{}", method="POST",
                                              headers={"Content-Type": "application/json"})
                try:
                    urllib.request.urlopen(req, timeout=10)
                    result["polled"] = True
                except Exception as e:
                    result["polled"] = False
                    result["error"] = str(e)

            conn.commit()
            result["ok"] = True

        # ══════════════════════════════════════════════════════════════════════
        # ТАРИФЫ
        # ══════════════════════════════════════════════════════════════════════
        elif section == "tariffs":
            mp_f = params.get("marketplace", "")
            where = ["1=1"]
            args  = []
            if mp_f: where.append("t.marketplace=%s"); args.append(mp_f)
            cur.execute(
                f"""SELECT t.id,t.marketplace,t.category_name,t.product_type,
                           t.commission_lt_1500,t.commission_1500_5000,
                           t.commission_5000_10000,t.commission_gt_10000,
                           t.acquiring_percent,t.service_fee_fixed,
                           t.early_payout_standard,t.early_payout_ozon_bank,
                           t.updated_at,u.name as updated_by_name
                    FROM marketplace_tariff t
                    LEFT JOIN "user" u ON u.id=t.updated_by
                    WHERE {' AND '.join(where)}
                    ORDER BY t.marketplace,t.category_name""",
                args,
            )
            result["tariffs"] = [
                {"id": str(r[0]), "marketplace": r[1], "category_name": r[2], "product_type": r[3],
                 "commission_lt_1500": r[4], "commission_1500_5000": r[5],
                 "commission_5000_10000": r[6], "commission_gt_10000": r[7],
                 "acquiring_percent": r[8], "service_fee_fixed": r[9],
                 "early_payout_standard": r[10], "early_payout_ozon_bank": r[11],
                 "updated_at": r[12], "updated_by_name": r[13]}
                for r in cur.fetchall()
            ]

        elif section == "tariff_save" and method == "POST":
            t = body
            admin_id = body.get("admin_id")
            if t.get("id"):
                cur.execute(
                    """UPDATE marketplace_tariff SET
                       category_name=%s,product_type=%s,
                       commission_lt_1500=%s,commission_1500_5000=%s,
                       commission_5000_10000=%s,commission_gt_10000=%s,
                       acquiring_percent=%s,service_fee_fixed=%s,
                       early_payout_standard=%s,early_payout_ozon_bank=%s,
                       updated_at=NOW(),updated_by=%s
                       WHERE id=%s""",
                    (t["category_name"], t.get("product_type","standard"),
                     t.get("commission_lt_1500",0), t.get("commission_1500_5000",0),
                     t.get("commission_5000_10000",0), t.get("commission_gt_10000",0),
                     t.get("acquiring_percent",0.019), t.get("service_fee_fixed",20),
                     t.get("early_payout_standard",0.049), t.get("early_payout_ozon_bank",0.0339),
                     admin_id, t["id"])
                )
            else:
                cur.execute(
                    """INSERT INTO marketplace_tariff
                       (marketplace,category_name,product_type,commission_lt_1500,
                        commission_1500_5000,commission_5000_10000,commission_gt_10000,
                        acquiring_percent,service_fee_fixed,early_payout_standard,
                        early_payout_ozon_bank,updated_by)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                    (t.get("marketplace","ozon"), t["category_name"],
                     t.get("product_type","standard"),
                     t.get("commission_lt_1500",0), t.get("commission_1500_5000",0),
                     t.get("commission_5000_10000",0), t.get("commission_gt_10000",0),
                     t.get("acquiring_percent",0.019), t.get("service_fee_fixed",20),
                     t.get("early_payout_standard",0.049), t.get("early_payout_ozon_bank",0.0339),
                     admin_id)
                )
                result["id"] = str(cur.fetchone()[0])
            conn.commit()
            result["ok"] = True

        # ══════════════════════════════════════════════════════════════════════
        # ЗОНЫ ДОСТАВКИ
        # ══════════════════════════════════════════════════════════════════════
        elif section == "zones":
            cur.execute("SELECT id,city,region,status,min_rate,rate_per_kg,delivery_days,tc_partners,updated_at FROM delivery_zone ORDER BY city")
            result["zones"] = [
                {"id": str(r[0]), "city": r[1], "region": r[2], "status": r[3],
                 "min_rate": r[4], "rate_per_kg": r[5], "delivery_days": r[6],
                 "tc_partners": r[7], "updated_at": r[8]}
                for r in cur.fetchall()
            ]

        elif section == "zone_save" and method == "POST":
            z = body
            if z.get("id"):
                cur.execute(
                    "UPDATE delivery_zone SET city=%s,region=%s,min_rate=%s,rate_per_kg=%s,delivery_days=%s,tc_partners=%s,updated_at=NOW() WHERE id=%s",
                    (z["city"], z.get("region",""), z.get("min_rate",0), z.get("rate_per_kg",0),
                     z.get("delivery_days",1), json.dumps(z.get("tc_partners",[])), z["id"])
                )
            else:
                cur.execute(
                    "INSERT INTO delivery_zone (city,region,status,min_rate,rate_per_kg,delivery_days,tc_partners) VALUES (%s,%s,'active',%s,%s,%s,%s) RETURNING id",
                    (z["city"], z.get("region",""), z.get("min_rate",0), z.get("rate_per_kg",0),
                     z.get("delivery_days",1), json.dumps(z.get("tc_partners",[])))
                )
                result["id"] = str(cur.fetchone()[0])
            conn.commit()
            result["ok"] = True

        elif section == "zone_toggle" and method == "POST":
            zone_id = body.get("zone_id")
            new_status = body.get("status")
            if new_status == "inactive":
                # Предупреждение: сколько клиентов затронуто
                cur.execute("SELECT COUNT(*) FROM company WHERE delivery_city=(SELECT city FROM delivery_zone WHERE id=%s) AND archived_at IS NULL", (zone_id,))
                result["affected_clients"] = cur.fetchone()[0]
            cur.execute("UPDATE delivery_zone SET status=%s, updated_at=NOW() WHERE id=%s", (new_status, zone_id))
            conn.commit()
            result["ok"] = True

        # ══════════════════════════════════════════════════════════════════════
        # АРХИВ
        # ══════════════════════════════════════════════════════════════════════
        elif section == "archive":
            cutoff = (_dt.date.today() - _dt.timedelta(days=180)).isoformat()
            cid_f  = params.get("company_id", "")
            df     = params.get("date_from", cutoff)
            dt     = params.get("date_to", "")
            offset = int(params.get("offset", 0))
            limit  = min(int(params.get("limit", 100)), 500)
            what   = params.get("what", "orders")  # orders | transactions

            if what == "orders":
                where = ["o.created_at<=%s", "o.archived_at IS NULL"]
                args  = [cutoff]
                if cid_f: where.append("o.company_id=%s"); args.append(cid_f)
                if df:    where.append("o.created_at>=%s"); args.append(df)
                if dt:    where.append("o.created_at<=%s"); args.append(dt)
                cur.execute(
                    f"""SELECT o.id,o.order_number,co.name,p.trade_name,o.quantity,
                               o.total_amount,o.order_status,o.created_at
                        FROM "order" o
                        LEFT JOIN company co ON co.id=o.company_id
                        LEFT JOIN product p ON p.id=o.product_id
                        WHERE {' AND '.join(where)}
                        ORDER BY o.created_at DESC LIMIT %s OFFSET %s""",
                    args + [limit, offset],
                )
                result["rows"] = [
                    {"id": str(r[0]), "order_number": r[1], "company_name": r[2],
                     "product_name": r[3], "quantity": r[4], "total_amount": r[5],
                     "order_status": r[6], "created_at": r[7]}
                    for r in cur.fetchall()
                ]
            else:
                where = ["t.created_at<=%s"]
                args  = [cutoff]
                if cid_f: where.append("t.company_id=%s"); args.append(cid_f)
                if df:    where.append("t.created_at>=%s"); args.append(df)
                if dt:    where.append("t.created_at<=%s"); args.append(dt)
                cur.execute(
                    f"""SELECT t.id,co.name,t.type,t.amount,t.status,t.created_at
                        FROM transaction t LEFT JOIN company co ON co.id=t.company_id
                        WHERE {' AND '.join(where)}
                        ORDER BY t.created_at DESC LIMIT %s OFFSET %s""",
                    args + [limit, offset],
                )
                result["rows"] = [
                    {"id": str(r[0]), "company_name": r[1], "type": r[2],
                     "amount": r[3], "status": r[4], "created_at": r[5]}
                    for r in cur.fetchall()
                ]

            cur.execute("SELECT id, name FROM company ORDER BY name")
            result["companies"] = [{"id": str(r[0]), "name": r[1]} for r in cur.fetchall()]

            # Старые рекламации с фото (1+ год)
            old_cutoff = (_dt.date.today() - _dt.timedelta(days=365)).isoformat()
            cur.execute(
                """SELECT c.id,c.claim_number,co.name,c.photos,c.closed_at
                   FROM claim c LEFT JOIN company co ON co.id=c.company_id
                   WHERE c.status IN ('closed','agreed')
                     AND c.closed_at<=%s
                     AND c.photos IS NOT NULL
                     AND jsonb_array_length(c.photos)>0""",
                (old_cutoff,),
            )
            result["old_claims_with_photos"] = [
                {"id": str(r[0]), "claim_number": r[1], "company_name": r[2],
                 "photos_count": len(r[3]) if r[3] else 0, "closed_at": r[4]}
                for r in cur.fetchall()
            ]

        elif section == "delete_claim_photos" and method == "POST":
            claim_id = body.get("claim_id")
            cur.execute("UPDATE claim SET photos='[]'::jsonb WHERE id=%s", (claim_id,))
            conn.commit()
            result["ok"] = True

        # ══════════════════════════════════════════════════════════════════════
        # БЕЗОПАСНОСТЬ
        # ══════════════════════════════════════════════════════════════════════
        elif section == "security":
            # Лог входов
            cur.execute(
                """SELECT ll.id,ll.email,u.name,ll.ip,ll.success,ll.created_at
                   FROM login_log ll LEFT JOIN "user" u ON u.id=ll.user_id
                   ORDER BY ll.created_at DESC LIMIT 200"""
            )
            result["login_log"] = [
                {"id": str(r[0]), "email": r[1], "name": r[2], "ip": r[3],
                 "success": r[4], "created_at": r[5]}
                for r in cur.fetchall()
            ]

            # Лог Ozon API
            cur.execute(
                """SELECT al.id,al.company_id,co.name,al.endpoint,al.status_code,
                          al.duration_ms,al.created_at
                   FROM ozon_api_log al LEFT JOIN company co ON co.id=al.company_id
                   ORDER BY al.created_at DESC LIMIT 500"""
            )
            api_rows = cur.fetchall()

            # Аномалии: >100 запросов в минуту по company_id
            cur.execute(
                """SELECT company_id, COUNT(*) as cnt,
                          DATE_TRUNC('minute', created_at) as minute
                   FROM ozon_api_log
                   WHERE created_at >= NOW()-INTERVAL '1 hour'
                   GROUP BY company_id, minute
                   HAVING COUNT(*) > 100
                   ORDER BY cnt DESC"""
            )
            result["anomalies"] = [
                {"company_id": str(r[0]), "count": r[1], "minute": r[2]}
                for r in cur.fetchall()
            ]
            result["api_log"] = [
                {"id": str(r[0]), "company_id": str(r[1]) if r[1] else None,
                 "company_name": r[2], "endpoint": r[3], "status_code": r[4],
                 "duration_ms": r[5], "created_at": r[6]}
                for r in api_rows
            ]

        elif section == "force_logout" and method == "POST":
            cur.execute("UPDATE \"user\" SET refresh_token=NULL, refresh_expires=NULL WHERE archived_at IS NULL")
            cur.execute(
                "INSERT INTO admin_action_log (admin_id,action,details) VALUES (%s,'force_logout_all',%s)",
                (body.get("admin_id"), json.dumps({"reason": body.get("reason","")}))
            )
            conn.commit()
            result["ok"] = True
            result["count"] = cur.rowcount

        # ══════════════════════════════════════════════════════════════════════
        # СОЗДАНИЕ КЛИЕНТА ВРУЧНУЮ (без онбординга)
        # ══════════════════════════════════════════════════════════════════════
        elif section == "create_client" and method == "POST":
            import hashlib, os as _os
            from crypto import encrypt_key

            co  = body.get("company", {})
            usr = body.get("user", {})

            email = (usr.get("email") or "").strip().lower()
            if not email:
                cur.close(); conn.close()
                return resp(400, {"error": "Email пользователя обязателен"})
            if not co.get("name") or not co.get("inn"):
                cur.close(); conn.close()
                return resp(400, {"error": "Название и ИНН компании обязательны"})

            # Проверка уникальности email
            cur.execute('SELECT id FROM "user" WHERE email=%s AND archived_at IS NULL', (email,))
            if cur.fetchone():
                cur.close(); conn.close()
                return resp(409, {"error": "Пользователь с таким email уже существует"})

            # Зашифровать API-ключи
            ozon_api_key = encrypt_key(co.get("ozon_api_key") or "")
            ym_api_key   = encrypt_key(co.get("ym_api_key") or "")

            # Создать компанию (статус active — пропускаем онбординг)
            cur.execute(
                """INSERT INTO company
                   (name, inn, kpp, legal_address, director_name, phone, email,
                    contact_person, marketplace, ozon_client_id, ozon_api_key,
                    ozon_warehouse_id, ym_api_key, edo_operator, delivery_method,
                    purchase_limit, status, onboarding_step, activated_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                           'active', 7, NOW())
                   RETURNING id""",
                (
                    co.get("name"), co.get("inn"), co.get("kpp") or None,
                    co.get("legal_address") or None, co.get("director_name") or None,
                    co.get("phone") or None, co.get("email") or None,
                    co.get("contact_person") or None, co.get("marketplace", "ozon"),
                    co.get("ozon_client_id") or None,
                    ozon_api_key or None,
                    co.get("ozon_warehouse_id") or None,
                    ym_api_key or None,
                    co.get("edo_operator") or None,
                    co.get("delivery_method", "own"),
                    float(co.get("purchase_limit") or 0),
                ),
            )
            company_id = str(cur.fetchone()[0])

            # Создать пользователя с ролью client
            temp_pw = _os.urandom(5).hex()  # 10 символов hex
            salt    = _os.urandom(16).hex()
            h       = hashlib.pbkdf2_hmac("sha256", temp_pw.encode(), salt.encode(), 100_000).hex()
            pw_hash = f"{salt}:{h}"

            cur.execute(
                """INSERT INTO "user" (name, email, phone, role, password_hash, company_id)
                   VALUES (%s, %s, %s, 'client', %s, %s)
                   RETURNING id""",
                (
                    usr.get("name", ""), email,
                    usr.get("phone") or None,
                    pw_hash, company_id,
                ),
            )
            user_id = str(cur.fetchone()[0])

            conn.commit()
            result["ok"] = True
            result["company_id"] = company_id
            result["user_id"]    = user_id
            result["temp_password"] = temp_pw

        else:
            return resp(400, {"error": f"Неизвестный раздел: {section}"})

    finally:
        cur.close()
        conn.close()

    return resp(200, result)