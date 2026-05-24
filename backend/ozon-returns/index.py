import json
import os
from datetime import datetime, timezone
# v2

import psycopg2

from ozon_client import (
    get_db, get_company_credentials, ozon_post, notify_manager,
)

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}


def resp(status, body):
    return {"statusCode": status, "headers": CORS,
            "body": json.dumps(body, ensure_ascii=False, default=str)}


def handler(event, context):
    """
    Возвраты rFBS — опрос и принятие решения.

    POST /?action=poll               — опрос новых возвратов (каждые 15 мин)
    POST /?action=set_action body={return_id, company_id, action_type, ...}
      — принять решение по рекламации (approve/reject)
    """
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    params = event.get("queryStringParameters") or {}
    action = params.get("action", "poll")
    body   = json.loads(event.get("body") or "{}")

    conn = get_db()
    cur  = conn.cursor()

    try:
        # ── POLL RETURNS ──────────────────────────────────────────────────────
        if action == "poll":
            company_id = body.get("company_id")
            if company_id:
                companies = _get_one_company(cur, company_id)
            else:
                cur.execute(
                    """SELECT id, ozon_client_id, ozon_api_key
                       FROM company
                       WHERE status = 'active'
                         AND ozon_api_key IS NOT NULL"""
                )
                companies = cur.fetchall()

            new_returns = 0
            for row in companies:
                cid      = str(row[0])
                cli_id   = row[1]
                api_key  = row[2]
                if not cli_id or not api_key:
                    continue
                new_returns += _poll_returns(cur, conn, cid, cli_id, api_key)

            return resp(200, {"ok": True, "new_returns": new_returns})

        # ── SET ACTION (решение по возврату) ──────────────────────────────────
        elif action == "set_action":
            return_id   = body.get("return_id")
            company_id  = body.get("company_id")
            action_type = body.get("action_type")  # approve / reject
            comment     = body.get("comment", "")

            if not return_id or not company_id or not action_type:
                return resp(400, {"error": "return_id, company_id, action_type обязательны"})

            client_id, api_key = get_company_credentials(company_id)
            if not client_id or not api_key:
                return resp(400, {"error": "API-ключи не настроены"})

            s, d = ozon_post(
                client_id, api_key,
                "/v1/returns/rfbs/action/set",
                {
                    "return_id":   int(return_id),
                    "action_type": action_type,
                    "comment":     comment,
                },
                company_id,
            )

            if s != 200:
                return resp(s, {"error": d.get("error", "Ошибка Ozon API")})

            # Обновляем claim
            cur.execute(
                """UPDATE claim SET status = %s
                   WHERE id IN (
                     SELECT id FROM claim
                     WHERE type = 'return'
                       AND source = 'ozon_api'
                     ORDER BY created_at DESC LIMIT 1
                   )""",
                ("resolved" if action_type == "approve" else "rejected",)
            )
            conn.commit()
            return resp(200, {"ok": True})

        else:
            return resp(400, {"error": f"Неизвестное действие: {action}"})

    finally:
        cur.close()
        conn.close()


def _get_one_company(cur, company_id):
    cur.execute(
        "SELECT id, ozon_client_id, ozon_api_key FROM company WHERE id = %s",
        (company_id,)
    )
    row = cur.fetchone()
    return [row] if row else []


def _poll_returns(cur, conn, company_id, client_id, api_key):
    s, d = ozon_post(
        client_id, api_key,
        "/v2/returns/rfbs/list",
        {"filter": {}, "limit": 100, "offset": 0},
        company_id,
    )
    if s != 200:
        return 0

    returns = d.get("returns", [])
    new_count = 0

    for ret in returns:
        return_id      = ret.get("return_id") or ret.get("id")
        posting_number = ret.get("posting_number", "")
        reason         = ret.get("return_reason_name") or ret.get("reason", "Возврат от покупателя")
        status         = ret.get("status", "")

        if not return_id:
            continue

        # Проверяем, не создавали ли уже
        claim_number = f"RTN-OZ-{return_id}"
        cur.execute(
            "SELECT id FROM claim WHERE claim_number = %s", (claim_number,)
        )
        if cur.fetchone():
            continue

        # Находим заказ по posting_number
        order_id    = None
        product_id  = None
        if posting_number:
            cur.execute(
                'SELECT id, product_id FROM "order" WHERE ozon_posting_number = %s LIMIT 1',
                (posting_number,)
            )
            order_row = cur.fetchone()
            if order_row:
                order_id   = str(order_row[0])
                product_id = str(order_row[1]) if order_row[1] else None

        # Создаём claim
        cur.execute(
            """INSERT INTO claim
               (claim_number, company_id, order_id, product_id,
                type, source, description, status)
               VALUES (%s, %s, %s, %s, 'return', 'ozon_api', %s, 'new')""",
            (
                claim_number, company_id, order_id, product_id,
                f"Возврат rFBS {posting_number}. Причина: {reason}",
            )
        )

        notify_manager(
            cur, company_id, "new_claim",
            f"Новый возврат Ozon: {posting_number}. Причина: {reason[:80]}",
            "claim", None,
        )
        new_count += 1

    conn.commit()
    return new_count