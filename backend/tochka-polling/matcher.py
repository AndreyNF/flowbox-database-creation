from decimal import Decimal
from utils import (
    notify, notify_users_by_role, notify_company_users,
    extract_invoice_number, create_transaction,
)


def run_matching(cur, bank_tx_id, company_id, amount, payment_purpose, matched_by=None):
    """
    Автосопоставление банковской транзакции со счётом.
    matched_by — UUID пользователя при ручном сопоставлении.
    Возвращает match_status: auto_matched / overpayment / underpayment /
                              needs_distribution / unmatched / manual_matched
    """
    if not company_id:
        notify_users_by_role(
            cur, "admin", "payment_needs_distribution",
            f"Платёж {amount} ₽ не сопоставлен: компания не найдена по ИНН. "
            f"Назначение: {payment_purpose[:120]}",
            "bank_transaction", bank_tx_id,
        )
        notify_users_by_role(
            cur, "manager", "payment_needs_distribution",
            f"Платёж {amount} ₽ — неизвестный плательщик. Назначение: {payment_purpose[:120]}",
            "bank_transaction", bank_tx_id,
        )
        return "unmatched"

    invoice_number = extract_invoice_number(payment_purpose)
    invoice_row = None

    if invoice_number:
        cur.execute(
            """SELECT id, invoice_number, total_vat, status
               FROM invoice
               WHERE company_id = %s AND invoice_number = %s
               ORDER BY created_at DESC LIMIT 1""",
            (company_id, invoice_number),
        )
        invoice_row = cur.fetchone()

    if not invoice_row:
        cur.execute(
            """SELECT id, invoice_number, total_vat, status
               FROM invoice
               WHERE company_id = %s AND status = 'pending'
               ORDER BY created_at DESC""",
            (company_id,),
        )
        open_invoices = cur.fetchall()

        if len(open_invoices) == 0:
            _add_to_balance(cur, company_id, amount, bank_tx_id, payment_purpose)
            cur.execute(
                "UPDATE bank_transaction SET match_status = 'overpayment' WHERE id = %s",
                (bank_tx_id,),
            )
            return "overpayment"

        exact = [r for r in open_invoices if abs(float(r[2]) - float(amount)) < 0.01]

        if len(exact) == 1:
            invoice_row = exact[0]
        elif len(exact) > 1 or len(open_invoices) > 1:
            notify_users_by_role(
                cur, "manager", "payment_needs_distribution",
                f"Платёж {amount} ₽ от {_company_name(cur, company_id)} "
                f"требует ручного распределения: несколько открытых счетов.",
                "bank_transaction", bank_tx_id,
            )
            notify_users_by_role(
                cur, "admin", "payment_needs_distribution",
                f"Платёж {amount} ₽ — needs_distribution у клиента {_company_name(cur, company_id)}.",
                "bank_transaction", bank_tx_id,
            )
            return "needs_distribution"
        else:
            invoice_row = open_invoices[0]

    inv_id     = str(invoice_row[0])
    inv_number = invoice_row[1]
    inv_total  = Decimal(str(invoice_row[2]))
    inv_status = invoice_row[3]

    if inv_status == "paid":
        _add_to_balance(cur, company_id, amount, bank_tx_id, payment_purpose)
        return "overpayment"

    diff = amount - inv_total

    final_status = "manual_matched" if matched_by else "auto_matched"

    if abs(diff) < Decimal("0.01"):
        _pay_invoice(cur, inv_id, inv_number, company_id, amount,
                     bank_tx_id, Decimal("0"), matched_by)
        return final_status

    elif diff > 0:
        _pay_invoice(cur, inv_id, inv_number, company_id, inv_total,
                     bank_tx_id, diff, matched_by)
        return "overpayment"

    else:
        notify_users_by_role(
            cur, "manager", "payment_needs_distribution",
            f"Недоплата по счёту {inv_number} от {_company_name(cur, company_id)}: "
            f"получено {amount} ₽, ожидалось {inv_total} ₽.",
            "invoice", inv_id,
        )
        notify_users_by_role(
            cur, "admin", "payment_needs_distribution",
            f"Недоплата: счёт {inv_number}, получено {amount} ₽ из {inv_total} ₽.",
            "invoice", inv_id,
        )
        return "underpayment"


def _company_name(cur, company_id):
    cur.execute("SELECT name FROM company WHERE id = %s", (company_id,))
    row = cur.fetchone()
    return row[0] if row else company_id


def _pay_invoice(cur, inv_id, inv_number, company_id, amount,
                 bank_tx_id, overpayment, matched_by=None):
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)

    cur.execute(
        """UPDATE invoice
           SET status = 'paid', paid_at = %s,
               bank_transaction_id = %s, overpayment_amount = %s
           WHERE id = %s""",
        (now, bank_tx_id, float(overpayment), inv_id),
    )
    cur.execute(
        """UPDATE bank_transaction
           SET matched_invoice_id = %s, matched_at = %s, matched_by = %s
           WHERE id = %s""",
        (inv_id, now, matched_by, bank_tx_id),
    )
    cur.execute(
        "UPDATE \"order\" SET payment_status = 'paid' WHERE invoice_id = %s",
        (inv_id,),
    )

    cur.execute("SELECT balance FROM company WHERE id = %s", (company_id,))
    balance = Decimal(str(cur.fetchone()[0]))

    create_transaction(
        cur, company_id, "payment_received", float(amount),
        "invoice", inv_id, float(balance),
        comment=f"Оплата счёта {inv_number}",
    )

    if overpayment > Decimal("0"):
        new_balance = balance + overpayment
        cur.execute(
            "UPDATE company SET balance = %s WHERE id = %s",
            (float(new_balance), company_id),
        )
        create_transaction(
            cur, company_id, "balance_used", float(overpayment),
            "invoice", inv_id, float(new_balance),
            comment=f"Переплата по счёту {inv_number} зачислена на баланс",
        )
        notify_company_users(
            cur, company_id, "invoice_paid",
            f"Счёт {inv_number} оплачен. Переплата {overpayment} ₽ зачислена на баланс.",
            "invoice", inv_id,
        )
        notify_users_by_role(
            cur, "manager", "invoice_paid",
            f"Счёт {inv_number} оплачен. Переплата {overpayment} ₽ → баланс клиента.",
            "invoice", inv_id,
        )
    else:
        notify_company_users(
            cur, company_id, "invoice_paid",
            f"Счёт {inv_number} оплачен. Спасибо!",
            "invoice", inv_id,
        )
        cur.execute("SELECT manager_id FROM company WHERE id = %s", (company_id,))
        row = cur.fetchone()
        if row and row[0]:
            notify(
                cur, str(row[0]), "invoice_paid",
                f"Счёт {inv_number} оплачен клиентом на сумму {amount} ₽.",
                "invoice", inv_id,
            )

    cur.execute(
        """UPDATE company
           SET status = 'active', blocked_system_at = NULL
           WHERE id = %s AND status = 'blocked_system'""",
        (company_id,),
    )

    cur.execute(
        """SELECT DISTINCT d.logist_id FROM delivery d
           JOIN "order" o ON o.delivery_id = d.id
           WHERE o.invoice_id = %s
             AND d.logist_id IS NOT NULL
             AND d.status = 'new'
           LIMIT 1""",
        (inv_id,),
    )
    logist_row = cur.fetchone()
    if logist_row and logist_row[0]:
        notify(
            cur, str(logist_row[0]), "logist_task",
            f"Счёт {inv_number} оплачен — можно отгружать заказы.",
            "invoice", inv_id,
        )


def _add_to_balance(cur, company_id, amount, bank_tx_id, payment_purpose):
    cur.execute("SELECT balance FROM company WHERE id = %s", (company_id,))
    row = cur.fetchone()
    if not row:
        return
    old_balance = Decimal(str(row[0]))
    new_balance  = old_balance + amount
    cur.execute(
        "UPDATE company SET balance = %s WHERE id = %s",
        (float(new_balance), company_id),
    )
    create_transaction(
        cur, company_id, "payment_received", float(amount),
        "bank_transaction", bank_tx_id, float(new_balance),
        comment="Входящий платёж зачислен на баланс",
    )
    notify_company_users(
        cur, company_id, "invoice_paid",
        f"Платёж {amount} ₽ зачислен на ваш баланс.",
    )
