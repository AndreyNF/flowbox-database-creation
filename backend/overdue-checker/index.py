import json
import os
import urllib.request
from datetime import date, datetime, timezone

import psycopg2

from utils import (
    get_db, business_days_diff,
    notify_company_users, notify_users_by_role, notify,
    send_email,
)
from crypto import decrypt_key

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}


def resp(status: int, body: dict) -> dict:
    return {"statusCode": status, "headers": CORS,
            "body": json.dumps(body, ensure_ascii=False, default=str)}


def zero_ozon_stock(ozon_api_key: str, warehouse_id: str, product_ids: list[str]):
    """Обнулить остатки на складе Ozon для клиента."""
    if not ozon_api_key or not warehouse_id or not product_ids:
        return
    stocks = [{"offer_id": pid, "warehouse_id": warehouse_id, "stock": 0}
              for pid in product_ids[:100]]
    body   = json.dumps({"stocks": stocks}).encode()
    req    = urllib.request.Request(
        "https://api-seller.ozon.ru/v2/products/stocks",
        data=body,
        headers={
            "Client-Id": warehouse_id,
            "Api-Key": ozon_api_key,
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=10)
    except Exception:
        pass


def handler(event: dict, context) -> dict:
    """
    Ежедневный планировщик просрочки счетов (запускать в 09:00).
    Проверяет все pending-счета и применяет бизнес-логику:
    +3 дня — предупреждение клиенту
    0 дней — уведомление о срочной оплате
    -1 день — перевод в overdue, блокировка, обнуление остатков Ozon
    """
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    today = date.today()
    conn  = get_db()
    cur   = conn.cursor()

    warned       = []
    overdue_list = []

    try:
        # Все pending-счета
        cur.execute(
            """SELECT i.id, i.invoice_number, i.due_date, i.total_vat,
                      i.company_id,
                      c.name, c.email, c.ozon_api_key, c.ozon_warehouse_id,
                      c.status, c.manager_id
               FROM invoice i
               JOIN company c ON c.id = i.company_id
               WHERE i.status = 'pending'
               ORDER BY i.due_date""",
        )
        invoices = cur.fetchall()

        for row in invoices:
            (inv_id, inv_number, due_date_raw, total_vat,
             company_id, company_name, company_email,
             ozon_api_key_enc, ozon_warehouse_id, company_status,
             manager_id) = row
            ozon_api_key = decrypt_key(ozon_api_key_enc) if ozon_api_key_enc else None

            due_date = due_date_raw if isinstance(due_date_raw, date) else date.fromisoformat(str(due_date_raw))
            diff     = business_days_diff(due_date, today)  # рабочих дней до срока

            if diff == 3:
                # ── Предупреждение за 3 дня ───────────────────────────────
                notify_company_users(
                    cur, company_id, "payment_overdue",
                    f"Счёт {inv_number} на {total_vat:.2f} ₽ необходимо оплатить "
                    f"до {due_date}. Осталось 3 рабочих дня.",
                    "invoice", inv_id,
                )
                if company_email:
                    send_email(
                        company_email,
                        f"Напоминание об оплате счёта {inv_number}",
                        f"<p>Уважаемый клиент!</p>"
                        f"<p>Счёт <strong>{inv_number}</strong> на сумму "
                        f"<strong>{total_vat:.2f} ₽</strong> необходимо оплатить "
                        f"до <strong>{due_date}</strong>.</p>"
                        f"<p>В назначении платежа укажите: {inv_number}</p>",
                    )
                warned.append(inv_number)

            elif diff == 0:
                # ── Срок сегодня ──────────────────────────────────────────
                notify_company_users(
                    cur, company_id, "payment_overdue",
                    f"Сегодня последний день оплаты счёта {inv_number} "
                    f"на {total_vat:.2f} ₽!",
                    "invoice", inv_id,
                )
                warned.append(inv_number)

            elif diff < 0:
                # ── Просрочен ─────────────────────────────────────────────
                # Перевести счёт в overdue
                cur.execute(
                    "UPDATE invoice SET status = 'overdue' WHERE id = %s AND status = 'pending'",
                    (inv_id,),
                )

                # Заблокировать компанию (если ещё не заблокирована)
                if company_status != "blocked":
                    cur.execute(
                        """UPDATE company SET status = 'blocked', blocked_system_at = %s
                           WHERE id = %s""",
                        (datetime.now(timezone.utc), company_id),
                    )

                    # Обнуление остатков на Ozon
                    if ozon_api_key and ozon_warehouse_id:
                        cur.execute(
                            """SELECT p.supplier_article
                               FROM "order" o
                               JOIN product p ON p.id = o.product_id
                               WHERE o.invoice_id = %s AND p.supplier_article IS NOT NULL""",
                            (inv_id,),
                        )
                        offer_ids = [r[0] for r in cur.fetchall() if r[0]]
                        zero_ozon_stock(ozon_api_key, ozon_warehouse_id, offer_ids)

                # Уведомления клиенту
                notify_company_users(
                    cur, company_id, "auto_blocked",
                    f"Счёт {inv_number} просрочен. Ваш аккаунт заблокирован "
                    f"до получения оплаты {total_vat:.2f} ₽.",
                    "invoice", inv_id,
                )
                if company_email:
                    send_email(
                        company_email,
                        f"Ваш аккаунт заблокирован — счёт {inv_number} просрочен",
                        f"<p>Счёт <strong>{inv_number}</strong> на "
                        f"<strong>{total_vat:.2f} ₽</strong> не оплачен в срок.</p>"
                        f"<p>Ваш аккаунт <strong>заблокирован</strong> до получения оплаты.</p>"
                        f"<p>Срочно оплатите счёт. В назначении платежа укажите: {inv_number}</p>",
                    )

                # Уведомить менеджера
                if manager_id:
                    notify(
                        cur, str(manager_id), "payment_overdue",
                        f"Клиент {company_name}: счёт {inv_number} просрочен на "
                        f"{abs(diff)} р.д. Аккаунт заблокирован.",
                        "invoice", inv_id,
                    )

                # Уведомить администраторов
                notify_users_by_role(
                    cur, "admin", "auto_blocked",
                    f"Автоблокировка: {company_name}. "
                    f"Счёт {inv_number} просрочен на {abs(diff)} р.д. ({total_vat:.2f} ₽).",
                    "company", company_id,
                )

                overdue_list.append(inv_number)

        conn.commit()

    finally:
        cur.close()
        conn.close()

    return resp(200, {
        "ok": True,
        "date": today.isoformat(),
        "warned": warned,
        "overdue": overdue_list,
    })