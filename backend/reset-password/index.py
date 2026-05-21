import json
import os
import hmac
import hashlib
import secrets
import smtplib
import ssl
import psycopg2
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timezone, timedelta


def get_db():
    return psycopg2.connect(
        os.environ["DATABASE_URL"],
        options=f"-c search_path={os.environ.get('MAIN_DB_SCHEMA', 'public')}",
    )


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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}


def resp(status: int, body: dict) -> dict:
    return {"statusCode": status, "headers": CORS, "body": json.dumps(body, ensure_ascii=False)}


def send_reset_email(to_email: str, to_name: str, reset_url: str) -> None:
    smtp_host = os.environ.get("SMTP_HOST", "")
    smtp_port = int(os.environ.get("SMTP_PORT", "465"))
    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_pass = os.environ.get("SMTP_PASSWORD", "")
    from_name = "FlowBox"

    if not smtp_host or not smtp_user or not smtp_pass:
        raise RuntimeError("SMTP не настроен. Добавьте SMTP_HOST, SMTP_USER, SMTP_PASSWORD в секреты.")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Сброс пароля FlowBox"
    msg["From"] = f"{from_name} <{smtp_user}>"
    msg["To"] = to_email

    text_body = f"""Здравствуйте, {to_name}!

Вы запросили сброс пароля для аккаунта FlowBox.

Ссылка для сброса пароля (действительна 1 час):
{reset_url}

Если вы не запрашивали сброс пароля — просто проигнорируйте это письмо.

С уважением,
Команда FlowBox
"""

    html_body = f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: 'IBM Plex Sans', Arial, sans-serif; background: #0e1117; color: #e2e8f0; margin: 0; padding: 0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background: #0e1117; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background: #131920; border: 1px solid #1e2a35; border-radius: 12px; overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="background: #131920; padding: 28px 32px 20px; border-bottom: 1px solid #1e2a35;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background: #0ea5c8; width: 36px; height: 36px; border-radius: 8px; text-align: center; vertical-align: middle;">
                    <span style="font-family: monospace; font-size: 16px; font-weight: bold; color: #0e1117;">F</span>
                  </td>
                  <td style="padding-left: 12px;">
                    <span style="font-size: 16px; font-weight: 600; color: #f1f5f9;">FlowBox</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin: 0 0 8px; font-size: 18px; color: #f1f5f9;">Сброс пароля</h2>
              <p style="margin: 0 0 24px; color: #94a3b8; font-size: 14px;">Здравствуйте, {to_name}!</p>
              <p style="margin: 0 0 28px; color: #94a3b8; font-size: 14px; line-height: 1.6;">
                Вы запросили сброс пароля для вашего аккаунта FlowBox.<br>
                Ссылка действительна <strong style="color: #f1f5f9;">1 час</strong>.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin: 0 auto 28px;">
                <tr>
                  <td style="background: #0ea5c8; border-radius: 8px;">
                    <a href="{reset_url}" style="display: inline-block; padding: 13px 28px; font-size: 14px; font-weight: 600; color: #0e1117; text-decoration: none;">
                      Установить новый пароль →
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0; color: #64748b; font-size: 12px; line-height: 1.6;">
                Если кнопка не работает, скопируйте ссылку:<br>
                <a href="{reset_url}" style="color: #0ea5c8; word-break: break-all;">{reset_url}</a>
              </p>
              <hr style="margin: 24px 0; border: none; border-top: 1px solid #1e2a35;">
              <p style="margin: 0; color: #64748b; font-size: 12px;">
                Если вы не запрашивали сброс пароля — просто проигнорируйте это письмо.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

    msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    ctx = ssl.create_default_context()
    if smtp_port == 465:
        with smtplib.SMTP_SSL(smtp_host, smtp_port, context=ctx) as server:
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_user, to_email, msg.as_string())
    else:
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.ehlo()
            server.starttls(context=ctx)
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_user, to_email, msg.as_string())


def handler(event: dict, context) -> dict:
    """
    Сброс пароля FlowBox.

    POST / { action: "request", email }
      → генерирует токен, отправляет письмо

    POST / { action: "verify", token }
      → проверяет токен (не сбрасывает), возвращает email

    POST / { action: "reset", token, new_password }
      → устанавливает новый пароль, инвалидирует токен
    """
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    body = json.loads(event.get("body") or "{}")
    action = body.get("action", "")

    conn = get_db()
    cur = conn.cursor()

    try:
        # ── REQUEST ───────────────────────────────────────────────────────────
        if action == "request":
            email = (body.get("email") or "").strip().lower()
            if not email:
                return resp(400, {"error": "Email обязателен"})

            cur.execute(
                "SELECT id, name, is_active FROM \"user\" WHERE email = %s AND archived_at IS NULL",
                (email,),
            )
            row = cur.fetchone()

            # Намеренно не раскрываем существование email
            if not row or not row[2]:
                return resp(200, {"ok": True, "message": "Если такой email зарегистрирован, письмо отправлено."})

            uid, name = str(row[0]), row[1]
            token = secrets.token_urlsafe(32)
            expires = datetime.now(timezone.utc) + timedelta(hours=1)

            cur.execute(
                "UPDATE \"user\" SET reset_token = %s, reset_token_expires = %s WHERE id = %s",
                (token, expires, uid),
            )
            conn.commit()

            # Формируем URL — берём origin из заголовков или хардкодим путь
            headers = event.get("headers") or {}
            origin = headers.get("origin") or headers.get("Origin") or "https://flowbox.ru"
            reset_url = f"{origin}/login?reset_token={token}"

            send_reset_email(email, name, reset_url)

            return resp(200, {"ok": True, "message": "Если такой email зарегистрирован, письмо отправлено."})

        # ── VERIFY ────────────────────────────────────────────────────────────
        elif action == "verify":
            token = (body.get("token") or "").strip()
            if not token:
                return resp(400, {"error": "Токен обязателен"})

            cur.execute(
                "SELECT id, email, reset_token_expires FROM \"user\" WHERE reset_token = %s AND archived_at IS NULL",
                (token,),
            )
            row = cur.fetchone()

            if not row:
                return resp(404, {"error": "Токен недействителен или уже использован"})

            expires = row[2]
            if expires and expires < datetime.now(timezone.utc):
                return resp(410, {"error": "Ссылка истекла. Запросите сброс повторно."})

            return resp(200, {"ok": True, "email": row[1]})

        # ── RESET ─────────────────────────────────────────────────────────────
        elif action == "reset":
            token = (body.get("token") or "").strip()
            new_password = body.get("new_password", "")

            if not token:
                return resp(400, {"error": "Токен обязателен"})
            if len(new_password) < 8:
                return resp(400, {"error": "Пароль должен быть минимум 8 символов"})

            cur.execute(
                "SELECT id, email, reset_token_expires FROM \"user\" WHERE reset_token = %s AND archived_at IS NULL",
                (token,),
            )
            row = cur.fetchone()

            if not row:
                return resp(404, {"error": "Токен недействителен или уже использован"})

            expires = row[2]
            if expires and expires < datetime.now(timezone.utc):
                return resp(410, {"error": "Ссылка истекла. Запросите сброс повторно."})

            uid, email = str(row[0]), row[1]
            pw_hash = hash_password(new_password)

            cur.execute(
                "UPDATE \"user\" SET password_hash = %s, reset_token = NULL, reset_token_expires = NULL, refresh_token = NULL WHERE id = %s",
                (pw_hash, uid),
            )
            conn.commit()

            return resp(200, {"ok": True, "email": email, "message": "Пароль успешно изменён. Войдите с новым паролем."})

        else:
            return resp(400, {"error": f"Неизвестное действие: {action}"})

    finally:
        cur.close()
        conn.close()
