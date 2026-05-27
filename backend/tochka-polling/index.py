import json
import os
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta
from decimal import Decimal

import psycopg2

from utils import get_db
from matcher import run_matching

TOCHKA_API_BASE = "https://enter.tochka.com/uapi/v1"

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}


def resp(status: int, body: dict) -> dict:
    return {"statusCode": status, "headers": CORS,
            "body": json.dumps(body, ensure_ascii=False)}


def fetch_tochka_operations(account_id: str, api_key: str,
                             date_from: str, date_to: str) -> list[dict]:
    """Запрос выписки из API Точки за период."""
    url = (
        f"{TOCHKA_API_BASE}/bank-accounts/{account_id}/statements"
        f"?dateFrom={date_from}&dateTo={date_to}&operationType=credit"
    )
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read().decode())
            return data.get("operations", data.get("data", []))
    except Exception:
        return []


def handler(event: dict, context) -> dict:
    """
    Резервный опрос API Точки за последние 24 часа.
    Запускается планировщиком раз в час.
    Для каждой новой операции: записывает в BankTransaction и сопоставляет.
    """
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    api_key    = os.environ.get("TOCHKA_API_KEY", "")
    account_id = os.environ.get("TOCHKA_ACCOUNT_ID", "")

    if not api_key or not account_id:
        return resp(503, {"error": "TOCHKA_API_KEY или TOCHKA_ACCOUNT_ID не настроены"})

    now       = datetime.now(timezone.utc)
    date_from = (now - timedelta(hours=24)).strftime("%Y-%m-%d")
    date_to   = now.strftime("%Y-%m-%d")

    operations = fetch_tochka_operations(account_id, api_key, date_from, date_to)

    processed = 0
    skipped   = 0
    errors    = 0

    conn = get_db()
    cur  = conn.cursor()

    try:
        for op in operations:
            bank_operation_id = str(op.get("operationId") or op.get("id") or "")
            if not bank_operation_id:
                continue

            # Пропустить исходящие
            direction = str(op.get("direction") or op.get("operationType") or "credit").lower()
            if "debit" in direction:
                skipped += 1
                continue

            # Проверка дубликата
            cur.execute(
                "SELECT id FROM bank_transaction WHERE bank_operation_id = %s",
                (bank_operation_id,),
            )
            if cur.fetchone():
                skipped += 1
                continue

            amount_raw = op.get("amount") or op.get("sum") or "0"
            amount = Decimal(str(amount_raw))
            if amount <= 0:
                skipped += 1
                continue

            counterparty_inn = str(op.get("counterpartyInn") or op.get("inn") or "")
            payment_purpose  = str(op.get("paymentPurpose") or op.get("purpose") or "")
            operation_date   = op.get("operationDate") or op.get("date") or now.isoformat()

            # Найти компанию по ИНН
            cur.execute("SELECT id FROM company WHERE inn = %s LIMIT 1", (counterparty_inn,))
            row = cur.fetchone()
            company_id = str(row[0]) if row else None

            try:
                cur.execute(
                    """INSERT INTO bank_transaction
                       (bank_operation_id, direction, counterparty_inn, company_id,
                        amount, payment_purpose, source, operation_date)
                       VALUES (%s, 'incoming', %s, %s, %s, %s, 'polling', %s)
                       RETURNING id""",
                    (bank_operation_id, counterparty_inn, company_id,
                     float(amount), payment_purpose, operation_date),
                )
                bank_tx_id = str(cur.fetchone()[0])

                match_status = run_matching(cur, bank_tx_id, company_id, amount, payment_purpose)

                cur.execute(
                    "UPDATE bank_transaction SET match_status = %s WHERE id = %s",
                    (match_status, bank_tx_id),
                )
                conn.commit()
                processed += 1

            except Exception:
                conn.rollback()
                errors += 1
                continue

    finally:
        cur.close()
        conn.close()

    return resp(200, {
        "ok": True,
        "period": f"{date_from} — {date_to}",
        "total": len(operations),
        "processed": processed,
        "skipped": skipped,
        "errors": errors,
    })