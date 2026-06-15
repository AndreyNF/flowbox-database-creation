import json
import os
import hashlib
import psycopg2  # noqa

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}

def resp(status: int, body: dict) -> dict:
    return {"statusCode": status, "headers": CORS, "body": json.dumps(body, ensure_ascii=False, default=str)}

def get_db():
    return psycopg2.connect(
        os.environ["DATABASE_URL"],
        options=f"-c search_path={os.environ.get('MAIN_DB_SCHEMA', 'public')}",
    )

def hash_password(password: str) -> str:
    import os as _os
    salt = _os.urandom(16).hex()
    h = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000)
    return f"{salt}:{h.hex()}"

def handler(event: dict, context) -> dict:
    """Создаёт тестовые данные: компанию, менеджера, клиента, логиста, поставщика, продукты, заказ.
    GET ?action=reset_passwords — только обновляет пароли тестовых пользователей."""
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    action = (event.get("queryStringParameters") or {}).get("action", "")

    if action == "reset_passwords":
        conn = get_db()
        cur = conn.cursor()
        try:
            pw_hash = hash_password("Test1234!")
            emails = ["manager@test.flowbox", "client@test.flowbox", "logist@test.flowbox"]
            updated = []
            for email in emails:
                cur.execute('UPDATE "user" SET password_hash = %s WHERE email = %s', (pw_hash, email))
                if cur.rowcount:
                    updated.append(email)
            conn.commit()
            return resp(200, {"ok": True, "updated": updated, "password": "Test1234!"})
        except Exception as e:
            conn.rollback()
            return resp(500, {"error": str(e)})
        finally:
            cur.close()
            conn.close()

    conn = get_db()
    cur = conn.cursor()
    created = []

    try:
        pw_hash = hash_password("Test1234!")

        # ── Менеджер ──────────────────────────────────────────────────────────
        cur.execute('SELECT id FROM "user" WHERE email = %s', ("manager@test.flowbox",))
        row = cur.fetchone()
        if row:
            manager_id = str(row[0])
            cur.execute('UPDATE "user" SET password_hash = %s WHERE id = %s', (pw_hash, manager_id))
        else:
            cur.execute(
                '''INSERT INTO "user" (name, email, role, password_hash, is_active)
                   VALUES (%s, %s, %s, %s, true) RETURNING id''',
                ("Менеджер Тест", "manager@test.flowbox", "manager", pw_hash),
            )
            manager_id = str(cur.fetchone()[0])
            created.append("user:manager")

        # ── Логист ────────────────────────────────────────────────────────────
        cur.execute('SELECT id FROM "user" WHERE email = %s', ("logist@test.flowbox",))
        row = cur.fetchone()
        if row:
            logist_id = str(row[0])
            cur.execute('UPDATE "user" SET password_hash = %s WHERE id = %s', (pw_hash, logist_id))
        else:
            cur.execute(
                '''INSERT INTO "user" (name, email, role, password_hash, is_active)
                   VALUES (%s, %s, %s, %s, true) RETURNING id''',
                ("Логист Тест", "logist@test.flowbox", "logist", pw_hash),
            )
            logist_id = str(cur.fetchone()[0])
            created.append("user:logist")

        # ── Тестовая компания ─────────────────────────────────────────────────
        cur.execute('SELECT id FROM company WHERE name = %s', ("ООО Тестовый Клиент",))
        row = cur.fetchone()
        if row:
            company_id = str(row[0])
        else:
            cur.execute(
                '''INSERT INTO company (
                    name, short_name, full_name, inn, kpp, ogrn,
                    legal_address, director_name, email, phone,
                    marketplace, delivery_method, status,
                    ozon_api_key, ozon_warehouse_id, ozon_client_id,
                    manager_id, purchase_limit, balance,
                    onboarding_step, activated_at
                ) VALUES (
                    %s,%s,%s,%s,%s,%s,
                    %s,%s,%s,%s,
                    %s,%s,%s,
                    %s,%s,%s,
                    %s,%s,%s,
                    %s, now()
                ) RETURNING id''',
                (
                    "ООО Тестовый Клиент",
                    "Тест Клиент",
                    "Общество с ограниченной ответственностью Тестовый Клиент",
                    "7712345678", "771201001", "1207700123456",
                    "г. Москва, ул. Тестовая, д. 1",
                    "Иванов Иван Иванович",
                    "client@test.flowbox",
                    "+7 999 000-00-01",
                    "ozon", "our_service", "active",
                    "test-api-key-fake-000000000001",
                    "12345678",
                    "987654",
                    manager_id, 500000, 0,
                    8,
                ),
            )
            company_id = str(cur.fetchone()[0])
            created.append("company")

        # ── Клиентский пользователь ───────────────────────────────────────────
        cur.execute('SELECT id FROM "user" WHERE email = %s', ("client@test.flowbox",))
        row = cur.fetchone()
        if row:
            client_user_id = str(row[0])
            cur.execute('UPDATE "user" SET password_hash = %s WHERE id = %s', (pw_hash, client_user_id))
        else:
            cur.execute(
                '''INSERT INTO "user" (name, email, role, password_hash, is_active, company_id)
                   VALUES (%s, %s, %s, %s, true, %s) RETURNING id''',
                ("Клиент Тестов", "client@test.flowbox", "client", pw_hash, company_id),
            )
            client_user_id = str(cur.fetchone()[0])
            created.append("user:client")

        # ── Поставщик ─────────────────────────────────────────────────────────
        cur.execute('SELECT id FROM supplier WHERE inn = %s', ("5001234567",))
        row = cur.fetchone()
        if row:
            supplier_id = str(row[0])
        else:
            cur.execute(
                '''INSERT INTO supplier (name, short_name, inn, vat_payer, email, phone, status)
                   VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id''',
                (
                    "ООО Тест-Поставщик",
                    "Тест-Поставщик",
                    "5001234567",
                    True,
                    "supplier@test.flowbox",
                    "+7 999 000-00-02",
                    "active",
                ),
            )
            supplier_id = str(cur.fetchone()[0])
            created.append("supplier")

        # ── Продукты ──────────────────────────────────────────────────────────
        products = [
            {
                "trade_name": "Кресло офисное ErgoMax Pro",
                "accounting_name": "Кресло офисное ErgoMax Pro черное",
                "supplier_article": "EMP-001-BLK",
                "category_ozon": "Кресла и стулья",
                "brand": "ErgoMax",
                "purchase_price_vat": 8500.00,
                "stock_available": 15,
                "dim_package_kg": 18.5,
            },
            {
                "trade_name": "Стол компьютерный Desk 120",
                "accounting_name": "Стол компьютерный Desk 120 белый",
                "supplier_article": "DSK-120-WHT",
                "category_ozon": "Компьютерные столы",
                "brand": "DeskPro",
                "purchase_price_vat": 5200.00,
                "stock_available": 8,
                "dim_package_kg": 32.0,
            },
            {
                "trade_name": "Лампа настольная LED SmartLight",
                "accounting_name": "Лампа настольная LED SmartLight белая",
                "supplier_article": "SML-LED-001",
                "category_ozon": "Настольные лампы",
                "brand": "SmartLight",
                "purchase_price_vat": 1800.00,
                "stock_available": 42,
                "dim_package_kg": 1.2,
            },
        ]

        product_ids = []
        for p in products:
            cur.execute("SELECT id FROM product WHERE supplier_article = %s", (p["supplier_article"],))
            row = cur.fetchone()
            if row:
                product_ids.append(str(row[0]))
            else:
                cur.execute(
                    '''INSERT INTO product (
                        trade_name, accounting_name, supplier_id, supplier_article,
                        category_ozon, brand,
                        purchase_price_vat,
                        stock_available, dim_package_kg,
                        stock_status, moderation_status_ozon
                    ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id''',
                    (
                        p["trade_name"], p["accounting_name"],
                        supplier_id, p["supplier_article"],
                        p["category_ozon"], p["brand"],
                        p["purchase_price_vat"],
                        p["stock_available"], p["dim_package_kg"],
                        "active", "draft",
                    ),
                )
                pid = str(cur.fetchone()[0])
                product_ids.append(pid)
                created.append(f"product:{p['supplier_article']}")

        # ── Тестовый заказ ────────────────────────────────────────────────────
        cur.execute("SELECT id FROM \"order\" WHERE order_number = %s", ("TEST-0001",))
        if not cur.fetchone():
            cur.execute(
                '''INSERT INTO "order" (
                    order_number, company_id, product_id,
                    quantity, unit_price, delivery_cost, total_amount,
                    payment_status, order_status, operational_day
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s, CURRENT_DATE) RETURNING id''',
                (
                    "TEST-0001", company_id, product_ids[0],
                    2, 12900.00, 600.00, 26400.00,
                    "unpaid", "new",
                ),
            )
            created.append("order:TEST-0001")

        conn.commit()

        return resp(200, {
            "ok": True,
            "created": created,
            "logins": {
                "manager":  {"email": "manager@test.flowbox",  "password": "Test1234!", "role": "manager", "url": "/manager"},
                "client":   {"email": "client@test.flowbox",   "password": "Test1234!", "role": "client",  "url": "/client"},
                "logist":   {"email": "logist@test.flowbox",   "password": "Test1234!", "role": "logist",  "url": "/logist"},
            },
            "ids": {
                "company_id":  company_id,
                "manager_id":  manager_id,
                "logist_id":   logist_id,
                "client_user_id": client_user_id,
                "supplier_id": supplier_id,
                "product_ids": product_ids,
            },
        })

    except Exception as e:
        conn.rollback()
        return resp(500, {"error": str(e)})
    finally:
        cur.close()
        conn.close()