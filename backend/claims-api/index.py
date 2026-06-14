import json
import os
import psycopg2
from decimal import Decimal
import datetime as _dt


def get_db():
    return psycopg2.connect(
        os.environ["DATABASE_URL"],
        options=f"-c search_path={os.environ.get('MAIN_DB_SCHEMA', 'public')}",
    )


def serial(obj):
    if isinstance(obj, Decimal): return float(obj)
    if isinstance(obj, (_dt.date, _dt.datetime)): return obj.isoformat()
    raise TypeError


CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Company-Id",
}


def resp(status, body):
    return {"statusCode": status, "headers": CORS,
            "body": json.dumps(body, default=serial, ensure_ascii=False)}


def _now_iso():
    return _dt.datetime.utcnow().isoformat()


def _add_history(status, comment=""):
    return json.dumps([{"date": _now_iso(), "status": status, "comment": comment}])


def handler(event: dict, context) -> dict:
    """
    Клиентские операции с рекламациями.

    GET  /?section=list&company_id=...           → список рекламаций
    GET  /?section=detail&company_id=...&claim_id=...  → детали рекламации
    POST /?section=action  {claim_id, action: agree|dispute, comment?}
    POST /?section=create  {company_id, order_id?, product_id?, type, description}

    Менеджерские:
    POST /?section=mgr_create  {company_id, order_id?, product_id?, type, description}
    POST /?section=mgr_photos  {claim_id, photos: [...urls]}
    POST /?section=mgr_update  {claim_id, action: send_decision|reviewing|procedural|close, ...}
    GET  /?section=warehouse&stock_status=...    → физические товары на складе
    POST /?section=warehouse_action {item_id, action: return_to_sale|return_to_supplier|write_off}
    POST /?section=warehouse_receive {claim_id, product_id, quantity, condition, condition_photos}
    GET  /?section=priority_check&product_id=...  → есть ли товар ready_for_sale
    """
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    method  = event.get("httpMethod", "GET")
    params  = event.get("queryStringParameters") or {}
    headers = event.get("headers") or {}
    section = params.get("section", "list")

    company_id = (params.get("company_id")
                  or headers.get("x-company-id")
                  or headers.get("X-Company-Id"))

    body = json.loads(event.get("body") or "{}") if method in ("POST", "PUT") else {}

    conn = get_db()
    cur  = conn.cursor()
    result = {}

    try:
        # ── СПИСОК РЕКЛАМАЦИЙ КЛИЕНТА ──────────────────────────────────────────
        if section == "list":
            if not company_id:
                return resp(400, {"error": "company_id обязателен"})
            cur.execute(
                """SELECT c.id, c.claim_number, o.order_number, p.trade_name,
                          c.type, c.status, c.created_at, c.closed_at,
                          c.compensation_amount, c.compensation_type
                   FROM claim c
                   LEFT JOIN "order" o ON o.id = c.order_id
                   LEFT JOIN product p ON p.id = c.product_id
                   WHERE c.company_id = %s
                   ORDER BY c.created_at DESC""",
                (company_id,),
            )
            result["claims"] = [
                {"id": str(r[0]), "claim_number": r[1], "order_number": r[2],
                 "product_name": r[3], "type": r[4], "status": r[5],
                 "created_at": r[6], "closed_at": r[7],
                 "compensation_amount": r[8], "compensation_type": r[9]}
                for r in cur.fetchall()
            ]

        # ── ДЕТАЛИ РЕКЛАМАЦИИ ──────────────────────────────────────────────────
        elif section == "detail":
            claim_id = params.get("claim_id") or body.get("claim_id")
            if not claim_id:
                return resp(400, {"error": "claim_id обязателен"})
            cur.execute(
                """SELECT c.id, c.claim_number, o.order_number, p.trade_name,
                          c.type, c.source, c.description, c.photos,
                          c.decision, c.compensation_amount, c.compensation_type,
                          c.status, c.history, c.created_at, c.closed_at, c.client_comment
                   FROM claim c
                   LEFT JOIN "order" o ON o.id = c.order_id
                   LEFT JOIN product p ON p.id = c.product_id
                   WHERE c.id = %s AND c.company_id = %s""",
                (claim_id, company_id),
            )
            row = cur.fetchone()
            if not row:
                return resp(404, {"error": "Рекламация не найдена"})
            result["claim"] = {
                "id": str(row[0]), "claim_number": row[1], "order_number": row[2],
                "product_name": row[3], "type": row[4], "source": row[5],
                "description": row[6], "photos": row[7], "decision": row[8],
                "compensation_amount": row[9], "compensation_type": row[10],
                "status": row[11], "history": row[12],
                "created_at": row[13], "closed_at": row[14], "client_comment": row[15],
            }

        # ── ДЕЙСТВИЕ КЛИЕНТА: agree / dispute ─────────────────────────────────
        elif section == "action":
            claim_id = body.get("claim_id")
            action   = body.get("action")
            comment  = body.get("comment", "")

            if not company_id:
                company_id = body.get("company_id")
            if not claim_id or not action:
                return resp(400, {"error": "claim_id и action обязательны"})

            cur.execute(
                "SELECT id, status, compensation_type, compensation_amount, product_id FROM claim WHERE id=%s AND company_id=%s",
                (claim_id, company_id),
            )
            row = cur.fetchone()
            if not row:
                return resp(404, {"error": "Рекламация не найдена"})

            _, cur_status, comp_type, comp_amount, product_id = row
            if cur_status != "decision_made":
                return resp(422, {"error": "Действие недоступно — решение ещё не вынесено"})

            if action == "agree":
                cur.execute(
                    """UPDATE claim SET status='agreed', closed_at=NOW(),
                          history=history||%s::jsonb WHERE id=%s""",
                    (_add_history("agreed", "Клиент согласился с решением"), claim_id),
                )
                # Обработка типа компенсации
                if comp_type == "money" and comp_amount and float(comp_amount) > 0:
                    cur.execute("SELECT balance FROM company WHERE id=%s", (company_id,))
                    bal = float(cur.fetchone()[0] or 0)
                    new_bal = bal + float(comp_amount)
                    cur.execute("UPDATE company SET balance=%s WHERE id=%s", (new_bal, company_id))
                    cur.execute(
                        """INSERT INTO transaction
                           (company_id, type, amount, linked_doc_type, linked_doc_id,
                            status, created_by, comment, balance_after)
                           VALUES (%s,'compensation_accrued',%s,'claim',%s,'confirmed','system',%s,%s)""",
                        (company_id, float(comp_amount), claim_id,
                         "Компенсация по рекламации", new_bal),
                    )
                    # Уведомить клиента
                    cur.execute(
                        'SELECT id FROM "user" WHERE company_id=%s AND archived_at IS NULL', (company_id,)
                    )
                    for u in cur.fetchall():
                        cur.execute(
                            "INSERT INTO notification (user_id,event_type,channel,text,link_type,link_id) VALUES (%s,'claim_resolved','in_app',%s,'claim',%s)",
                            (str(u[0]), f"Компенсация {float(comp_amount):.2f} ₽ зачислена на ваш баланс.", claim_id),
                        )
                elif comp_type == "back_to_stock" and product_id:
                    cur.execute("UPDATE product SET stock_status='ready_for_sale' WHERE id=%s", (product_id,))
                elif comp_type == "write_off" and product_id:
                    cur.execute("UPDATE product SET stock_status='written_off' WHERE id=%s", (product_id,))
                elif comp_type == "return_to_supplier":
                    cur.execute(
                        "INSERT INTO delivery (type,delivery_method,status,task_date,claim_id) VALUES ('return_to_supplier','our_delivery','new',CURRENT_DATE+1,%s) RETURNING id",
                        (claim_id,),
                    )
                    ret_del = str(cur.fetchone()[0])
                    cur.execute("UPDATE claim SET return_delivery_id=%s WHERE id=%s", (ret_del, claim_id))
                result["ok"] = True

            elif action == "dispute":
                if not comment.strip():
                    return resp(400, {"error": "Комментарий обязателен при споре"})
                cur.execute(
                    """UPDATE claim SET status='disputed', client_comment=%s,
                          history=history||%s::jsonb WHERE id=%s""",
                    (comment, _add_history("disputed", f"Клиент оспорил: {comment}"), claim_id),
                )
                # Уведомить менеджера
                cur.execute("SELECT manager_id FROM company WHERE id=%s", (company_id,))
                mgr = cur.fetchone()
                if mgr and mgr[0]:
                    cur.execute(
                        "INSERT INTO notification (user_id,event_type,channel,text,link_type,link_id) VALUES (%s,'new_claim','in_app',%s,'claim',%s)",
                        (str(mgr[0]), f"Клиент оспорил решение. Комментарий: {comment[:120]}", claim_id),
                    )
                result["ok"] = True
            else:
                return resp(400, {"error": f"Неизвестное действие: {action}"})

            conn.commit()

        # ── СОЗДАНИЕ РЕКЛАМАЦИИ КЛИЕНТОМ ──────────────────────────────────────
        elif section == "create":
            if not company_id:
                company_id = body.get("company_id")
            cur.execute("SELECT COUNT(*) FROM claim")
            n = cur.fetchone()[0] + 1
            claim_number = f"CLM-{str(n).zfill(6)}"
            cur.execute(
                """INSERT INTO claim
                   (claim_number, company_id, order_id, product_id,
                    type, source, description, status, history)
                   VALUES (%s,%s,%s,%s,%s,'manual',%s,'new',%s)
                   RETURNING id""",
                (
                    claim_number, company_id,
                    body.get("order_id") or None,
                    body.get("product_id") or None,
                    body.get("type", "defect"),
                    body.get("description", ""),
                    _add_history("new", "Создана клиентом"),
                ),
            )
            new_id = str(cur.fetchone()[0])
            # Уведомить менеджера
            cur.execute("SELECT manager_id FROM company WHERE id=%s", (company_id,))
            mgr = cur.fetchone()
            if mgr and mgr[0]:
                cur.execute(
                    "INSERT INTO notification (user_id,event_type,channel,text,link_type,link_id) VALUES (%s,'new_claim','in_app',%s,'claim',%s)",
                    (str(mgr[0]), f"Новая рекламация от клиента: {claim_number}", new_id),
                )
            conn.commit()
            result["ok"] = True
            result["claim_id"] = new_id
            result["claim_number"] = claim_number

        # ── МЕНЕДЖЕР: создание вручную ─────────────────────────────────────────
        elif section == "mgr_create":
            cur.execute("SELECT COUNT(*) FROM claim")
            n = cur.fetchone()[0] + 1
            claim_number = f"CLM-MAN-{str(n).zfill(6)}"
            cur.execute(
                """INSERT INTO claim
                   (claim_number, company_id, order_id, product_id,
                    type, source, description, status, history)
                   VALUES (%s,%s,%s,%s,%s,'manual',%s,'new',%s)
                   RETURNING id""",
                (
                    claim_number,
                    body.get("company_id"),
                    body.get("order_id") or None,
                    body.get("product_id") or None,
                    body.get("type", "defect"),
                    body.get("description", ""),
                    _add_history("new", "Создана менеджером вручную"),
                ),
            )
            new_id = str(cur.fetchone()[0])
            conn.commit()
            result["ok"] = True
            result["claim_id"] = new_id
            result["claim_number"] = claim_number

        # ── ЗАГРУЗКА ОДНОГО ФОТО В S3 ─────────────────────────────────────────
        elif section == "upload_photo":
            import base64 as _b64, uuid as _uuid
            import boto3

            claim_id  = body.get("claim_id")
            b64_data  = body.get("data")        # base64 без data:...; префикса
            mime_type = body.get("mime_type", "image/jpeg")
            if not claim_id or not b64_data:
                return resp(400, {"error": "claim_id и data обязательны"})

            ext = "jpg"
            if "png"  in mime_type: ext = "png"
            elif "heic" in mime_type: ext = "heic"
            elif "webp" in mime_type: ext = "webp"

            key = f"claims/{claim_id}/{_uuid.uuid4().hex}.{ext}"
            file_bytes = _b64.b64decode(b64_data)

            s3 = boto3.client(
                "s3",
                endpoint_url="https://bucket.poehali.dev",
                aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
                aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
            )
            s3.put_object(Bucket="files", Key=key, Body=file_bytes, ContentType=mime_type)
            cdn_url = f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"

            cur.execute(
                "UPDATE claim SET photos=COALESCE(photos,'[]'::jsonb)||%s::jsonb WHERE id=%s",
                (json.dumps([cdn_url]), claim_id),
            )
            conn.commit()
            result["ok"] = True
            result["url"] = cdn_url

        # ── МЕНЕДЖЕР: добавление фото (legacy — список URL) ───────────────────
        elif section == "mgr_photos":
            claim_id = body.get("claim_id")
            photos   = body.get("photos", [])
            if not claim_id or not photos:
                return resp(400, {"error": "claim_id и photos обязательны"})
            cur.execute(
                "UPDATE claim SET photos=COALESCE(photos,'[]'::jsonb)||%s::jsonb WHERE id=%s",
                (json.dumps(photos), claim_id),
            )
            conn.commit()
            result["ok"] = True

        # ── МЕНЕДЖЕР: обновление статуса / решения ────────────────────────────
        elif section == "mgr_update":
            claim_id = body.get("claim_id")
            action   = body.get("action")
            if not claim_id or not action:
                return resp(400, {"error": "claim_id и action обязательны"})

            if action == "send_decision":
                cur.execute(
                    """UPDATE claim SET decision=%s, compensation_amount=%s,
                          compensation_type=%s, status='decision_made',
                          history=history||%s::jsonb WHERE id=%s""",
                    (
                        body.get("decision"),
                        body.get("compensation_amount", 0),
                        body.get("compensation_type"),
                        _add_history("decision_made", "Решение отправлено клиенту"),
                        claim_id,
                    ),
                )
                # Уведомить клиента
                cur.execute("SELECT company_id FROM claim WHERE id=%s", (claim_id,))
                cid_row = cur.fetchone()
                if cid_row:
                    cur.execute('SELECT id FROM "user" WHERE company_id=%s AND archived_at IS NULL', (str(cid_row[0]),))
                    for u in cur.fetchall():
                        cur.execute(
                            "INSERT INTO notification (user_id,event_type,channel,text,link_type,link_id) VALUES (%s,'claim_resolved','in_app',%s,'claim',%s)",
                            (str(u[0]), "По вашей рекламации вынесено решение. Проверьте и подтвердите.", claim_id),
                        )
            elif action == "reviewing":
                cur.execute(
                    "UPDATE claim SET status='reviewing',history=history||%s::jsonb WHERE id=%s",
                    (_add_history("reviewing", "Рекламация принята в работу"), claim_id),
                )
            elif action == "procedural":
                cur.execute(
                    "UPDATE claim SET status='procedural',history=history||%s::jsonb WHERE id=%s",
                    (_add_history("procedural", "Переведена в процессуальный статус"), claim_id),
                )
            elif action == "close":
                cur.execute(
                    "UPDATE claim SET status='closed',closed_at=NOW(),history=history||%s::jsonb WHERE id=%s",
                    (_add_history("closed", "Закрыта менеджером"), claim_id),
                )
            conn.commit()
            result["ok"] = True

        # ── СКЛАД: список физических товаров ──────────────────────────────────
        elif section == "warehouse":
            st_f = params.get("stock_status", "in_warehouse")
            cid_f = params.get("company_id", "")
            where = ["1=1"]
            args  = []
            if st_f and st_f != "all":
                where.append("wi.stock_status=%s"); args.append(st_f)
            if cid_f:
                where.append("cl.company_id=%s"); args.append(cid_f)
            cur.execute(
                f"""SELECT wi.id, p.trade_name, p.supplier_article, wi.quantity,
                           wi.condition, wi.stock_status, wi.received_at,
                           cl.claim_number, co.name, wi.condition_photos, wi.notes
                    FROM warehouse_item wi
                    JOIN product p ON p.id=wi.product_id
                    LEFT JOIN claim cl ON cl.id=wi.claim_id
                    LEFT JOIN company co ON co.id=cl.company_id
                    WHERE {' AND '.join(where)}
                    ORDER BY wi.received_at DESC LIMIT 100""",
                args,
            )
            result["items"] = [
                {"id": str(r[0]), "trade_name": r[1], "supplier_article": r[2],
                 "quantity": r[3], "condition": r[4], "stock_status": r[5],
                 "received_at": r[6], "claim_number": r[7], "company_name": r[8],
                 "condition_photos": r[9], "notes": r[10]}
                for r in cur.fetchall()
            ]

        # ── СКЛАД: приёмка физического товара логистом ────────────────────────
        elif section == "warehouse_receive":
            cur.execute(
                """INSERT INTO warehouse_item
                   (product_id, claim_id, delivery_id, quantity, condition, condition_photos, notes)
                   VALUES (%s,%s,%s,%s,%s,%s,%s)
                   RETURNING id""",
                (
                    body.get("product_id"),
                    body.get("claim_id") or None,
                    body.get("delivery_id") or None,
                    body.get("quantity", 1),
                    body.get("condition", "unknown"),
                    json.dumps(body.get("condition_photos", [])),
                    body.get("notes", ""),
                ),
            )
            item_id = str(cur.fetchone()[0])
            cond = body.get("condition", "unknown")
            if cond == "damaged":
                cur.execute("UPDATE product SET stock_status='written_off' WHERE id=%s", (body.get("product_id"),))
            else:
                cur.execute("UPDATE product SET stock_status='in_warehouse' WHERE id=%s", (body.get("product_id"),))
            conn.commit()
            result["ok"] = True
            result["item_id"] = item_id

        # ── СКЛАД: решение менеджера по товару ────────────────────────────────
        elif section == "warehouse_action":
            item_id = body.get("item_id")
            action  = body.get("action")
            if not item_id or not action:
                return resp(400, {"error": "item_id и action обязательны"})

            cur.execute("SELECT product_id, claim_id FROM warehouse_item WHERE id=%s", (item_id,))
            wi = cur.fetchone()
            if not wi:
                return resp(404, {"error": "Запись не найдена"})
            prod_id, cl_id = str(wi[0]), str(wi[1]) if wi[1] else None

            if action == "return_to_sale":
                cur.execute("UPDATE warehouse_item SET stock_status='ready_for_sale',resolved_at=NOW() WHERE id=%s", (item_id,))
                cur.execute("UPDATE product SET stock_status='ready_for_sale' WHERE id=%s", (prod_id,))
            elif action == "return_to_supplier":
                cur.execute("UPDATE warehouse_item SET stock_status='ready_for_return',resolved_at=NOW() WHERE id=%s", (item_id,))
                cur.execute(
                    "INSERT INTO delivery (type,delivery_method,status,task_date,claim_id) VALUES ('return_to_supplier','our_delivery','new',CURRENT_DATE+1,%s)",
                    (cl_id,),
                )
            elif action == "write_off":
                cur.execute("UPDATE warehouse_item SET stock_status='written_off',resolved_at=NOW() WHERE id=%s", (item_id,))
                cur.execute("UPDATE product SET stock_status='written_off' WHERE id=%s", (prod_id,))
            conn.commit()
            result["ok"] = True

        # ── ПРИОРИТЕТ СКЛАДА: есть ли ready_for_sale для товара ──────────────
        elif section == "priority_check":
            product_id = params.get("product_id") or body.get("product_id")
            if not product_id:
                return resp(400, {"error": "product_id обязателен"})
            cur.execute(
                """SELECT wi.id, wi.quantity, p.trade_name
                   FROM warehouse_item wi JOIN product p ON p.id=wi.product_id
                   WHERE wi.product_id=%s AND wi.stock_status='ready_for_sale' LIMIT 1""",
                (product_id,),
            )
            row = cur.fetchone()
            if row:
                result["has_warehouse_stock"] = True
                result["item_id"]    = str(row[0])
                result["quantity"]   = row[1]
                result["trade_name"] = row[2]
            else:
                result["has_warehouse_stock"] = False

        else:
            return resp(400, {"error": f"Неизвестный раздел: {section}"})

    finally:
        cur.close()
        conn.close()

    return resp(200, result)