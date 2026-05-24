import json
import os
import psycopg2


def get_db():
    return psycopg2.connect(
        os.environ["DATABASE_URL"],
        options=f"-c search_path={os.environ.get('MAIN_DB_SCHEMA', 'public')}",
    )


def handler(event: dict, context) -> dict:
    """Сохранение прогресса онбординга компании. Принимает company_id и данные шага."""
    cors = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    }

    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors, "body": ""}

    body = json.loads(event.get("body") or "{}")
    step = body.get("step")
    company_id = body.get("company_id")

    ALLOWED_STEPS = {1, 2, 3, 4, 5, 6, 7}
    if step not in ALLOWED_STEPS:
        return {
            "statusCode": 400,
            "headers": cors,
            "body": json.dumps({"error": "Некорректный шаг"}, ensure_ascii=False),
        }

    conn = get_db()
    cur = conn.cursor()

    if step == 1:
        if not body.get("consents_accepted"):
            return {
                "statusCode": 400,
                "headers": cors,
                "body": json.dumps({"error": "Необходимо принять оба согласия"}, ensure_ascii=False),
            }
        if not company_id:
            cur.execute(
                "INSERT INTO company (name, status, onboarding_step, consents_accepted_at) VALUES (%s, 'onboarding', 1, NOW()) RETURNING id",
                ("Новая компания",),
            )
            company_id = str(cur.fetchone()[0])
        else:
            cur.execute(
                "UPDATE company SET consents_accepted_at = NOW(), onboarding_step = GREATEST(onboarding_step, 1) WHERE id = %s",
                (company_id,),
            )
        conn.commit()
        cur.close(); conn.close()
        return {
            "statusCode": 200,
            "headers": cors,
            "body": json.dumps({"company_id": company_id, "step": 1}, ensure_ascii=False),
        }

    if not company_id:
        cur.close(); conn.close()
        return {
            "statusCode": 400,
            "headers": cors,
            "body": json.dumps({"error": "company_id обязателен"}, ensure_ascii=False),
        }

    if step == 2:
        required = ["inn", "full_name", "short_name"]
        for f in required:
            if not body.get(f):
                cur.close(); conn.close()
                return {
                    "statusCode": 400,
                    "headers": cors,
                    "body": json.dumps({"error": f"Поле {f} обязательно"}, ensure_ascii=False),
                }
        cur.execute(
            """UPDATE company SET
               inn = %s, full_name = %s, short_name = %s, name = %s,
               kpp = %s, ogrn = %s, legal_address = %s, director_name = %s,
               entity_type = %s, onboarding_step = GREATEST(onboarding_step, 2)
               WHERE id = %s""",
            (
                body["inn"], body["full_name"], body["short_name"],
                body.get("short_name") or body["full_name"],
                body.get("kpp"), body.get("ogrn"),
                body.get("legal_address"), body.get("director_name"),
                body.get("entity_type", "legal"), company_id,
            ),
        )

    elif step == 3:
        required = ["email", "phone", "contact_person"]
        for f in required:
            if not body.get(f):
                cur.close(); conn.close()
                return {
                    "statusCode": 400,
                    "headers": cors,
                    "body": json.dumps({"error": f"Поле {f} обязательно"}, ensure_ascii=False),
                }
        cur.execute(
            "UPDATE company SET email = %s, phone = %s, contact_person = %s, onboarding_step = GREATEST(onboarding_step, 3) WHERE id = %s",
            (body["email"], body["phone"], body["contact_person"], company_id),
        )

    elif step == 4:
        if not body.get("marketplace"):
            cur.close(); conn.close()
            return {
                "statusCode": 400,
                "headers": cors,
                "body": json.dumps({"error": "Выберите маркетплейс"}, ensure_ascii=False),
            }
        cur.execute(
            """UPDATE company SET
               marketplace = %s, ozon_client_id = %s, ozon_api_key = %s, ozon_warehouse_id = %s,
               ym_api_key = %s, ym_warehouse_id = %s,
               onboarding_step = GREATEST(onboarding_step, 4)
               WHERE id = %s""",
            (
                body["marketplace"],
                body.get("ozon_client_id"),
                body.get("ozon_api_key"), body.get("ozon_warehouse_id"),
                body.get("ym_api_key"), body.get("ym_warehouse_id"),
                company_id,
            ),
        )

    elif step == 5:
        cur.execute(
            "UPDATE company SET edo_operator = %s, onboarding_step = GREATEST(onboarding_step, 5) WHERE id = %s",
            (body.get("edo_operator"), company_id),
        )

    elif step == 6:
        if not body.get("delivery_method"):
            cur.close(); conn.close()
            return {
                "statusCode": 400,
                "headers": cors,
                "body": json.dumps({"error": "Выберите способ доставки"}, ensure_ascii=False),
            }
        cur.execute(
            """UPDATE company SET
               delivery_method = %s, delivery_city = %s, delivery_zone_id = %s,
               onboarding_step = GREATEST(onboarding_step, 6)
               WHERE id = %s""",
            (
                body["delivery_method"],
                body.get("delivery_city"),
                body.get("delivery_zone_id") or None,
                company_id,
            ),
        )

    elif step == 7:
        cur.execute(
            "UPDATE company SET purchase_limit = %s, onboarding_step = GREATEST(onboarding_step, 7) WHERE id = %s",
            (body.get("purchase_limit", 0), company_id),
        )

    conn.commit()
    cur.close(); conn.close()

    return {
        "statusCode": 200,
        "headers": cors,
        "body": json.dumps({"company_id": company_id, "step": step, "ok": True}, ensure_ascii=False),
    }