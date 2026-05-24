import json
import os
import time
import base64
from datetime import datetime, timezone

import psycopg2
import boto3

from ozon_client import get_db, get_company_credentials, ozon_post

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
    Этикетки и акт передачи в ТК (только rFBS Express).

    POST /?action=get_labels body={delivery_id, company_id}
      — запрос и сохранение PDF этикеток

    POST /?action=get_act body={delivery_id, company_id}
      — запрос и сохранение акта передачи в ТК
    """
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    params = event.get("queryStringParameters") or {}
    action = params.get("action", "get_labels")
    body   = json.loads(event.get("body") or "{}")

    delivery_id = body.get("delivery_id")
    company_id  = body.get("company_id")

    if not delivery_id or not company_id:
        return resp(400, {"error": "delivery_id и company_id обязательны"})

    conn = get_db()
    cur  = conn.cursor()

    try:
        client_id, api_key = get_company_credentials(company_id)
        if not client_id or not api_key:
            return resp(400, {"error": "API-ключи не настроены"})

        # Получаем posting_number'ы из доставки
        cur.execute(
            """SELECT DISTINCT o.ozon_posting_number, d.rfbs_subtype
               FROM "order" o
               JOIN delivery d ON d.id = o.delivery_id
               WHERE o.delivery_id = %s
                 AND o.ozon_posting_number IS NOT NULL""",
            (delivery_id,)
        )
        rows = cur.fetchall()
        if not rows:
            return resp(404, {"error": "Posting'и не найдены для доставки"})

        rfbs_subtype = rows[0][1] if rows else ""
        posting_numbers = [r[0] for r in rows if r[0]]

        if action == "get_labels":
            if rfbs_subtype != "express":
                return resp(400, {"error": "Этикетки доступны только для rFBS Express"})

            pdf_url = _get_labels(
                client_id, api_key, company_id,
                posting_numbers, delivery_id, cur
            )
            conn.commit()
            return resp(200, {"ok": True, "pdf_url": pdf_url})

        elif action == "get_act":
            pdf_url = _get_act(
                client_id, api_key, company_id,
                posting_numbers, delivery_id, cur
            )
            conn.commit()
            return resp(200, {"ok": True, "pdf_url": pdf_url})

        else:
            return resp(400, {"error": f"Неизвестное действие: {action}"})

    finally:
        cur.close()
        conn.close()


def _get_labels(client_id, api_key, company_id, posting_numbers, delivery_id, cur):
    """Получает PDF этикеток, при необходимости ожидает готовности."""
    attempts = 3
    for attempt in range(attempts):
        s, d = ozon_post(
            client_id, api_key,
            "/v2/posting/fbs/package-label",
            {"posting_number": posting_numbers[:20]},
            company_id,
        )
        if s == 200:
            content = d.get("content") or d.get("file_name") or ""
            if content:
                pdf_url = _save_pdf_to_s3(
                    base64.b64decode(content) if _is_base64(content) else content.encode(),
                    f"labels_{delivery_id[:8]}.pdf"
                )
                cur.execute(
                    "UPDATE delivery SET labels_pdf = %s WHERE id = %s",
                    (pdf_url, delivery_id)
                )
                return pdf_url

        # Проверяем ошибку "not ready"
        error_str = json.dumps(d)
        if "aren't ready" in error_str or "not ready" in error_str.lower():
            if attempt < attempts - 1:
                time.sleep(60)
                continue

        break
    return None


def _get_act(client_id, api_key, company_id, posting_numbers, delivery_id, cur):
    """Получает акт передачи в ТК."""
    s, d = ozon_post(
        client_id, api_key,
        "/v2/posting/fbs/act/create",
        {"departure_date": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
         "posting_number": posting_numbers[:100]},
        company_id,
    )

    if s != 200:
        return None

    content = d.get("content") or d.get("file_name") or ""
    if not content:
        return None

    pdf_url = _save_pdf_to_s3(
        base64.b64decode(content) if _is_base64(content) else content.encode(),
        f"act_{delivery_id[:8]}.pdf"
    )
    cur.execute(
        "UPDATE delivery SET act_pdf = %s WHERE id = %s",
        (pdf_url, delivery_id)
    )
    return pdf_url


def _is_base64(s):
    try:
        base64.b64decode(s, validate=True)
        return True
    except Exception:
        return False


def _save_pdf_to_s3(content, filename):
    s3 = boto3.client(
        "s3",
        endpoint_url="https://bucket.poehali.dev",
        aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
    )
    key = f"ozon_docs/{filename}"
    s3.put_object(
        Bucket="files", Key=key,
        Body=content,
        ContentType="application/pdf",
    )
    project_id = os.environ["AWS_ACCESS_KEY_ID"]
    return f"https://cdn.poehali.dev/projects/{project_id}/bucket/{key}"
