import json
import os
import hmac
import hashlib
import psycopg2


def get_db():
    return psycopg2.connect(
        os.environ["DATABASE_URL"],
        options=f"-c search_path={os.environ.get('MAIN_DB_SCHEMA', 'public')}",
    )


def hash_password(password: str) -> str:
    salt = os.urandom(16).hex()
    h = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000)
    return f"{salt}:{h.hex()}"


CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}


def resp(status: int, body: dict) -> dict:
    return {"statusCode": status, "headers": CORS, "body": json.dumps(body, ensure_ascii=False)}


def handler(event: dict, context) -> dict:
    """
    Создание первого администратора FlowBox.
    Защищён SEED_SECRET. Работает только если admin-пользователей ещё нет.

    GET  / → проверка статуса (нужен ли seed)
    POST / → { seed_secret, name, email, password } → создаёт admin
    """
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    seed_secret = os.environ.get("SEED_SECRET", "")
    conn = get_db()
    cur = conn.cursor()

    try:
        # Проверяем: есть ли уже хоть один admin
        cur.execute("SELECT COUNT(*) FROM \"user\" WHERE role = 'admin' AND archived_at IS NULL")
        admin_count = cur.fetchone()[0]

        method = event.get("httpMethod", "GET")

        # GET — просто статус
        if method == "GET":
            return resp(200, {
                "needs_seed": admin_count == 0,
                "admin_exists": admin_count > 0,
                "message": "Seed не нужен — администратор уже существует" if admin_count > 0 else "Готово к созданию первого администратора",
            })

        # POST — создать
        body = json.loads(event.get("body") or "{}")
        provided_secret = body.get("seed_secret", "")

        # Проверка seed_secret
        if not seed_secret:
            return resp(500, {"error": "SEED_SECRET не настроен. Добавьте его в секреты проекта."})

        if not hmac.compare_digest(provided_secret, seed_secret):
            return resp(403, {"error": "Неверный seed_secret"})

        # Если admin уже есть — блокируем
        if admin_count > 0:
            return resp(409, {
                "error": "Администратор уже существует. Seed запрещён повторно.",
                "tip": "Для сброса пароля обратитесь к базе данных напрямую.",
            })

        name = (body.get("name") or "").strip()
        email = (body.get("email") or "").strip().lower()
        password = body.get("password", "")

        if not name or not email or not password:
            return resp(400, {"error": "Обязательные поля: name, email, password"})

        if len(password) < 8:
            return resp(400, {"error": "Пароль должен быть минимум 8 символов"})

        if "@" not in email:
            return resp(400, {"error": "Некорректный email"})

        # Проверка дубликата email
        cur.execute("SELECT id FROM \"user\" WHERE email = %s", (email,))
        if cur.fetchone():
            return resp(409, {"error": f"Пользователь с email {email} уже существует"})

        pw_hash = hash_password(password)
        cur.execute(
            """INSERT INTO "user" (name, email, role, password_hash, is_active)
               VALUES (%s, %s, 'admin', %s, true)
               RETURNING id""",
            (name, email, pw_hash),
        )
        new_id = str(cur.fetchone()[0])
        conn.commit()

        return resp(201, {
            "ok": True,
            "id": new_id,
            "message": f"Администратор {email} успешно создан. Теперь вы можете войти на /login.",
        })

    finally:
        cur.close()
        conn.close()
