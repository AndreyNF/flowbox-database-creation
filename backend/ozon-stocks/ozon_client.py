"""
Общий HTTP-клиент для Ozon Seller API.
Используется во всех ozon-* функциях (копируется в каждую папку).
"""
import json
import time
import urllib.request
import urllib.error
import os
import psycopg2
from datetime import datetime, timezone

from crypto import decrypt_key

OZON_BASE = "https://api-seller.ozon.ru"


def get_db():
    return psycopg2.connect(
        os.environ["DATABASE_URL"],
        options=f"-c search_path={os.environ.get('MAIN_DB_SCHEMA', 'public')}",
    )


def get_company_credentials(company_id):
    """Возвращает (client_id, api_key) для компании или (None, None)."""
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT ozon_api_key, ozon_warehouse_id FROM company WHERE id = %s",
            (company_id,)
        )
        row = cur.fetchone()
        if not row or not row[0]:
            return None, None
        cur.execute(
            "SELECT ozon_client_id FROM company WHERE id = %s",
            (company_id,)
        )
        row2 = cur.fetchone()
        client_id = str(row2[0]) if row2 and row2[0] else None
        api_key = decrypt_key(row[0])  # расшифровываем AES-256-GCM
        return client_id, api_key
    finally:
        cur.close()
        conn.close()


def ozon_post(client_id, api_key, endpoint, body, company_id=None, log=True):
    """
    Выполняет POST-запрос к Ozon Seller API.
    Возвращает (status_code, response_dict).
    Логирует в ozon_api_log если log=True и company_id задан.
    """
    url = OZON_BASE + endpoint
    payload = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        method="POST",
        headers={
            "Client-Id":    str(client_id),
            "Api-Key":      str(api_key),
            "Content-Type": "application/json",
            "Accept":       "application/json",
        },
    )
    t0 = time.time()
    status_code = 0
    error_text  = None
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            status_code = resp.status
            data = json.loads(resp.read().decode("utf-8"))
            return status_code, data
    except urllib.error.HTTPError as e:
        status_code = e.code
        try:
            error_body = json.loads(e.read().decode("utf-8"))
            error_text = json.dumps(error_body, ensure_ascii=False)
        except Exception:
            error_text = str(e)
        return status_code, {"error": error_text, "code": status_code}
    except Exception as ex:
        error_text = str(ex)
        return 0, {"error": error_text}
    finally:
        if log and company_id:
            duration = int((time.time() - t0) * 1000)
            _log_api_call(company_id, endpoint, status_code, error_text, duration)


def _log_api_call(company_id, endpoint, status_code, error, duration_ms):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO ozon_api_log (company_id, endpoint, status_code, error, duration_ms)
               VALUES (%s, %s, %s, %s, %s)""",
            (company_id, endpoint, status_code, error, duration_ms)
        )
        conn.commit()
        cur.close()
        conn.close()
    except Exception:
        pass


def notify_users_by_role(cur, role, event_type, text, link_type=None, link_id=None):
    cur.execute('SELECT id FROM "user" WHERE role = %s AND archived_at IS NULL', (role,))
    for row in cur.fetchall():
        cur.execute(
            """INSERT INTO notification (user_id, event_type, channel, text, link_type, link_id)
               VALUES (%s, %s, 'in_app', %s, %s, %s)""",
            (str(row[0]), event_type, text, link_type, link_id),
        )


def notify_company_users(cur, company_id, event_type, text, link_type=None, link_id=None):
    cur.execute(
        'SELECT id FROM "user" WHERE company_id = %s AND archived_at IS NULL',
        (company_id,)
    )
    for row in cur.fetchall():
        cur.execute(
            """INSERT INTO notification (user_id, event_type, channel, text, link_type, link_id)
               VALUES (%s, %s, 'in_app', %s, %s, %s)""",
            (str(row[0]), event_type, text, link_type, link_id),
        )


def notify_manager(cur, company_id, event_type, text, link_type=None, link_id=None):
    cur.execute("SELECT manager_id FROM company WHERE id = %s", (company_id,))
    row = cur.fetchone()
    if row and row[0]:
        cur.execute(
            """INSERT INTO notification (user_id, event_type, channel, text, link_type, link_id)
               VALUES (%s, %s, 'in_app', %s, %s, %s)""",
            (str(row[0]), event_type, text, link_type, link_id),
        )
