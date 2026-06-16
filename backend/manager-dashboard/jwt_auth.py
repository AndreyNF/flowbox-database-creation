import base64
import hashlib
import hmac
import json
import os
import time


def _b64url_decode(s: str) -> bytes:
    pad = 4 - len(s) % 4
    return base64.urlsafe_b64decode(s + "=" * (pad % 4))


def verify_jwt(token: str) -> dict | None:
    secret = os.environ.get("JWT_SECRET", "")
    if not secret or not token:
        return None
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        header, body, sig = parts
        expected = base64.urlsafe_b64encode(
            hmac.new(secret.encode(), f"{header}.{body}".encode(), hashlib.sha256).digest()
        ).rstrip(b"=").decode()
        if not hmac.compare_digest(sig, expected):
            return None
        payload = json.loads(_b64url_decode(body))
        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except Exception:
        return None


def get_token(event: dict) -> str:
    headers = event.get("headers") or {}
    auth = headers.get("x-authorization") or headers.get("X-Authorization") or ""
    if auth.startswith("Bearer "):
        return auth[7:]
    return auth


def check_role(event: dict, allowed_roles: list, cors: dict) -> tuple:
    token = get_token(event)
    if not token:
        return None, {"statusCode": 401, "headers": cors,
                      "body": json.dumps({"error": "Требуется авторизация"}, ensure_ascii=False)}
    payload = verify_jwt(token)
    if not payload:
        return None, {"statusCode": 401, "headers": cors,
                      "body": json.dumps({"error": "Токен недействителен или истёк"}, ensure_ascii=False)}
    if payload.get("role") not in allowed_roles:
        return None, {"statusCode": 403, "headers": cors,
                      "body": json.dumps({"error": "Доступ запрещён"}, ensure_ascii=False)}
    return payload, None
