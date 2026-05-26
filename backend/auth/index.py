import json
import os
import hmac
import hashlib
import base64
import time
import psycopg2

# v3 — login_log + access_expires check


def get_db():
    return psycopg2.connect(
        os.environ["DATABASE_URL"],
        options=f"-c search_path={os.environ.get('MAIN_DB_SCHEMA', 'public')}",
    )


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(s: str) -> bytes:
    pad = 4 - len(s) % 4
    return base64.urlsafe_b64decode(s + "=" * (pad % 4))


def make_jwt(payload: dict, secret: str, ttl: int = 3600) -> str:
    header = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload["exp"] = int(time.time()) + ttl
    body = _b64url(json.dumps(payload).encode())
    sig = _b64url(hmac.new(secret.encode(), f"{header}.{body}".encode(), hashlib.sha256).digest())
    return f"{header}.{body}.{sig}"


def verify_jwt(token: str, secret: str) -> dict | None:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        header, body, sig = parts
        expected = _b64url(hmac.new(secret.encode(), f"{header}.{body}".encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected):
            return None
        payload = json.loads(_b64url_decode(body))
        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except Exception:
        return None


def hash_password(password: str) -> str:
    salt = os.urandom(16).hex()
    h = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000)
    return f"{salt}:{h.hex()}"


def check_password(password: str, stored: str) -> bool:
    try:
        salt, h = stored.split(":", 1)
        expected = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000).hex()
        return hmac.compare_digest(h, expected)
    except Exception:
        return False


CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
}


def resp(status: int, body: dict) -> dict:
    return {"statusCode": status, "headers": CORS, "body": json.dumps(body, ensure_ascii=False)}


def _log_login(cur, conn, user_id, email, ip, success):
    try:
        cur.execute(
            "INSERT INTO login_log (user_id,email,ip,success) VALUES (%s,%s,%s,%s)",
            (str(user_id), email, ip, success),
        )
        conn.commit()
    except Exception:
        pass


def handler(event: dict, context) -> dict:
    """
    Авторизация: login / logout / me / register / refresh / change_password.
    POST /  с JSON { action: "...", ... }
    """
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    body   = json.loads(event.get("body") or "{}")
    action = body.get("action", "")
    secret = os.environ.get("JWT_SECRET", "fallback-secret-change-me")
    hdrs   = event.get("headers") or {}
    ip     = hdrs.get("x-forwarded-for") or hdrs.get("X-Forwarded-For") or ""

    conn = get_db()
    cur  = conn.cursor()

    try:
        # ── LOGIN ──────────────────────────────────────────────────────────────
        if action == "login":
            email    = (body.get("email") or "").strip().lower()
            password = body.get("password", "")

            if not email or not password:
                return resp(400, {"error": "Email и пароль обязательны"})

            cur.execute(
                """SELECT id, name, email, role, password_hash, company_id,
                          is_active, access_expires_at
                   FROM "user" WHERE email = %s AND archived_at IS NULL""",
                (email,),
            )
            row = cur.fetchone()
            if not row:
                return resp(401, {"error": "Неверный email или пароль"})

            uid, name, uemail, role, pw_hash, company_id, is_active, access_exp = row

            if not is_active:
                return resp(403, {"error": "Аккаунт деактивирован. Обратитесь к администратору."})

            if not pw_hash or not check_password(password, pw_hash):
                _log_login(cur, conn, uid, email, ip, False)
                return resp(401, {"error": "Неверный email или пароль"})

            # Проверка срока доступа (product_manager)
            if access_exp:
                import datetime as _dt
                if access_exp < _dt.datetime.now(_dt.timezone.utc):
                    cur.execute("UPDATE \"user\" SET is_active=false WHERE id=%s", (str(uid),))
                    conn.commit()
                    return resp(403, {"error": "Срок доступа истёк. Обратитесь к администратору."})

            access_token  = make_jwt(
                {"sub": str(uid), "role": role, "company_id": str(company_id) if company_id else None},
                secret, ttl=3600,
            )
            refresh_token = make_jwt({"sub": str(uid), "type": "refresh"}, secret, ttl=86400 * 30)

            cur.execute(
                """UPDATE "user"
                   SET last_login_at=NOW(), refresh_token=%s,
                       refresh_expires=NOW()+INTERVAL '30 days'
                   WHERE id=%s""",
                (refresh_token, str(uid)),
            )
            _log_login(cur, conn, uid, uemail, ip, True)

            return resp(200, {
                "access_token":  access_token,
                "refresh_token": refresh_token,
                "user": {
                    "id": str(uid), "name": name, "email": uemail,
                    "role": role,
                    "company_id": str(company_id) if company_id else None,
                },
            })

        # ── ME ─────────────────────────────────────────────────────────────────
        elif action == "me":
            token = body.get("token", "")
            if not token:
                auth  = hdrs.get("authorization") or hdrs.get("Authorization", "")
                token = auth.removeprefix("Bearer ").strip()

            payload = verify_jwt(token, secret)
            if not payload:
                return resp(401, {"error": "Токен недействителен или истёк"})

            cur.execute(
                """SELECT id, name, email, role, company_id, is_active, last_login_at
                   FROM "user" WHERE id=%s AND archived_at IS NULL""",
                (payload["sub"],),
            )
            row = cur.fetchone()
            if not row or not row[5]:
                return resp(401, {"error": "Пользователь не найден или деактивирован"})

            return resp(200, {
                "user": {
                    "id": str(row[0]), "name": row[1], "email": row[2],
                    "role": row[3], "company_id": str(row[4]) if row[4] else None,
                    "last_login_at": row[6].isoformat() if row[6] else None,
                }
            })

        # ── REFRESH ────────────────────────────────────────────────────────────
        elif action == "refresh":
            rt      = body.get("refresh_token", "")
            payload = verify_jwt(rt, secret)
            if not payload or payload.get("type") != "refresh":
                return resp(401, {"error": "Refresh-токен недействителен"})

            cur.execute(
                """SELECT id, name, email, role, company_id, is_active, refresh_token
                   FROM "user" WHERE id=%s AND archived_at IS NULL""",
                (payload["sub"],),
            )
            row = cur.fetchone()
            if not row or not row[5] or row[6] != rt:
                return resp(401, {"error": "Refresh-токен отозван"})

            uid, name, email, role, cid = row[0], row[1], row[2], row[3], row[4]
            new_access = make_jwt(
                {"sub": str(uid), "role": role, "company_id": str(cid) if cid else None},
                secret, ttl=3600,
            )
            return resp(200, {
                "access_token": new_access,
                "user": {"id": str(uid), "name": name, "email": email,
                         "role": role, "company_id": str(cid) if cid else None},
            })

        # ── LOGOUT ─────────────────────────────────────────────────────────────
        elif action == "logout":
            token   = body.get("token", "")
            payload = verify_jwt(token, secret)
            if payload:
                cur.execute(
                    "UPDATE \"user\" SET refresh_token=NULL, refresh_expires=NULL WHERE id=%s",
                    (payload["sub"],),
                )
                conn.commit()
            return resp(200, {"ok": True})

        # ── REGISTER (admin only) ──────────────────────────────────────────────
        elif action == "register":
            token   = body.get("admin_token", "")
            payload = verify_jwt(token, secret)
            if not payload or payload.get("role") != "admin":
                return resp(403, {"error": "Только администратор может создавать пользователей"})

            email      = (body.get("email") or "").strip().lower()
            password   = body.get("password", "")
            name       = body.get("name", "")
            role       = body.get("role", "manager")
            company_id = body.get("company_id") or None

            if not email or not password or not name:
                return resp(400, {"error": "email, password и name обязательны"})
            if role not in ("admin", "manager", "client", "logist", "product_manager"):
                return resp(400, {"error": "Недопустимая роль"})

            cur.execute('SELECT id FROM "user" WHERE email=%s', (email,))
            if cur.fetchone():
                return resp(409, {"error": "Пользователь с таким email уже существует"})

            pw_hash = hash_password(password)
            cur.execute(
                """INSERT INTO "user" (name, email, role, password_hash, company_id)
                   VALUES (%s, %s, %s, %s, %s) RETURNING id""",
                (name, email, role, pw_hash, company_id),
            )
            new_id = str(cur.fetchone()[0])
            conn.commit()
            return resp(201, {"ok": True, "id": new_id})

        # ── CHANGE PASSWORD ────────────────────────────────────────────────────
        elif action == "change_password":
            token   = body.get("token", "")
            payload = verify_jwt(token, secret)
            if not payload:
                return resp(401, {"error": "Токен недействителен"})

            old_pw = body.get("old_password", "")
            new_pw = body.get("new_password", "")
            if len(new_pw) < 8:
                return resp(400, {"error": "Пароль должен быть минимум 8 символов"})

            cur.execute('SELECT password_hash FROM "user" WHERE id=%s', (payload["sub"],))
            row = cur.fetchone()
            if not row or not check_password(old_pw, row[0] or ""):
                return resp(401, {"error": "Неверный текущий пароль"})

            cur.execute(
                "UPDATE \"user\" SET password_hash=%s WHERE id=%s",
                (hash_password(new_pw), payload["sub"]),
            )
            conn.commit()
            return resp(200, {"ok": True})

        else:
            return resp(400, {"error": f"Неизвестное действие: {action}"})

    finally:
        cur.close()
        conn.close()
