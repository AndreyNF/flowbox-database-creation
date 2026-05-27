import hashlib
import hmac
import json
import os
from datetime import datetime, timezone
from decimal import Decimal

import psycopg2

from utils import get_db
from matcher import run_matching

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Tochka-Signature",
}


def resp(status: int, body: dict) -> dict:
    return {"statusCode": status, "headers": CORS,
            "body": json.dumps(body, ensure_ascii=False)}


def verify_signature(payload: str, signature: str) -> bool:
    secret = os.environ.get("TOCHKA_WEBHOOK_SECRET", "")
    if not secret:
        return True  # dev mode — пропускаем
    expected = hmac.HMAC(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature or "")


def handler(event: dict, context) -> dict:
    """
    Вебхук от банка Точка. POST /webhooks/tochka/payment
    Принимает входящий платёж, записывает в BankTransaction,
    запускает автосопоставление со счётом.
    """
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    if event.get("httpMethod") != "POST":
        return resp(405, {"error": "Method not allowed"})

    # Проверка подписи
    headers   = event.get("headers") or {}
    signature = headers.get("x-tochka-signature") or headers.get("X-Tochka-Signature", "")
    raw_body  = event.get("body") or ""

    if not verify_signature(raw_body, signature):
        return resp(401, {"error": "Invalid signature"})

    try:
        data = json.loads(raw_body)
    except Exception:
        return resp(400, {"error": "Invalid JSON"})

    # Извлекаем поля (Точка присылает разные форматы — пробуем оба)
    payment = data.get("payment") or data
    bank_operation_id = (
        str(payment.get("operationId") or payment.get("bank_operation_id") or "")
    )
    counterparty_inn = str(
        payment.get("counterpartyInn") or payment.get("counterparty_inn") or ""
    )
    amount_raw = payment.get("amount") or payment.get("sum") or "0"
    amount = Decimal(str(amount_raw))

    payment_purpose = str(
        payment.get("paymentPurpose") or payment.get("payment_purpose") or ""
    )
    direction = str(
        payment.get("direction") or payment.get("operationType") or "credit"
    ).lower()
    operation_date_raw = (
        payment.get("operationDate") or payment.get("datetime") or
        datetime.now(timezone.utc).isoformat()
    )

    if not bank_operation_id or amount <= 0:
        return resp(400, {"error": "Недостаточно данных в вебхуке"})

    # Только входящие (credit)
    if "debit" in direction or direction == "out":
        return resp(200, {"ok": True, "skipped": "outgoing"})

    conn = get_db()
    cur  = conn.cursor()
    try:
        # Проверка дубликата
        cur.execute(
            "SELECT id FROM bank_transaction WHERE bank_operation_id = %s",
            (bank_operation_id,),
        )
        if cur.fetchone():
            return resp(200, {"ok": True, "duplicate": True})

        # Найти company по ИНН
        cur.execute(
            "SELECT id FROM company WHERE inn = %s LIMIT 1",
            (counterparty_inn,),
        )
        row = cur.fetchone()
        company_id = str(row[0]) if row else None

        # Записать в bank_transaction
        cur.execute(
            """INSERT INTO bank_transaction
               (bank_operation_id, direction, counterparty_inn, company_id,
                amount, payment_purpose, source, operation_date)
               VALUES (%s, 'incoming', %s, %s, %s, %s, 'webhook', %s)
               RETURNING id""",
            (bank_operation_id, counterparty_inn, company_id,
             float(amount), payment_purpose, operation_date_raw),
        )
        bank_tx_id = str(cur.fetchone()[0])

        # Автосопоставление
        match_status = run_matching(cur, bank_tx_id, company_id, amount, payment_purpose)

        # Обновить статус сопоставления
        cur.execute(
            "UPDATE bank_transaction SET match_status = %s WHERE id = %s",
            (match_status, bank_tx_id),
        )

        conn.commit()
        return resp(200, {"ok": True, "bank_tx_id": bank_tx_id,
                          "match_status": match_status})

    except Exception as e:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()