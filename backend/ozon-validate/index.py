import json
import urllib.request
import urllib.error


def _ozon_post(path: str, client_id: str, api_key: str, data: bytes = b"{}"):
    req = urllib.request.Request(
        f"https://api-seller.ozon.ru{path}",
        data=data,
        headers={
            "Client-Id": client_id,
            "Api-Key": api_key,
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8")), resp.status


def handler(event: dict, context) -> dict:
    """Проверка валидности API-ключа Ozon через /v2/seller/info. Возвращает склады если есть права."""
    cors = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    }

    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors, "body": ""}

    body = json.loads(event.get("body") or "{}")
    client_id = str(body.get("client_id", "")).strip()
    api_key = str(body.get("api_key", "")).strip()

    if not client_id or not api_key:
        return {
            "statusCode": 400,
            "headers": cors,
            "body": json.dumps({"error": "Укажите Client ID и API-ключ"}, ensure_ascii=False),
        }

    # Шаг 1: проверяем ключ через /v1/warehouse/list
    try:
        _ozon_post("/v1/warehouse/list", client_id, api_key)
    except urllib.error.HTTPError as e:
        err_body = ""
        try: err_body = e.read().decode("utf-8")
        except Exception: pass
        print(f"warehouse/list error {e.code}: {err_body}")

        # Парсим тело ошибки от Ozon
        ozon_msg = ""
        try:
            ozon_data = json.loads(err_body)
            ozon_msg = ozon_data.get("message", "") or str(ozon_data.get("code", ""))
        except Exception:
            pass

        if e.code == 401:
            return {"statusCode": 401, "headers": cors,
                    "body": json.dumps({"error": "Неверный Client ID или API-ключ. Проверьте данные в Ozon Seller → Настройки → API ключи."}, ensure_ascii=False)}
        if e.code == 403 or (e.code == 400 and "permission" in err_body.lower()):
            return {"statusCode": 403, "headers": cors,
                    "body": json.dumps({"error": "Нет прав для работы со складами. При создании API-ключа включите разрешение «Склад» (Warehouses)."}, ensure_ascii=False)}
        if e.code == 400:
            hint = f" Ответ Ozon: {ozon_msg}" if ozon_msg else ""
            return {"statusCode": 401, "headers": cors,
                    "body": json.dumps({"error": f"Неверный Client ID или API-ключ.{hint}"}, ensure_ascii=False)}
        return {"statusCode": 502, "headers": cors,
                "body": json.dumps({"error": f"Ошибка Ozon API: {e.code}. Попробуйте позже."}, ensure_ascii=False)}
    except Exception as e:
        return {"statusCode": 502, "headers": cors,
                "body": json.dumps({"error": f"Не удалось подключиться к Ozon: {str(e)}"}, ensure_ascii=False)}

    warehouses = []
    try:
        data, _ = _ozon_post("/v1/warehouse/list", client_id, api_key)
        warehouses = [
            {"id": str(w.get("warehouse_id", "")), "name": w.get("name", ""), "is_rfbs": w.get("is_rfbs", False)}
            for w in data.get("result", [])
        ]
    except Exception:
        pass

    warehouses = data.get("result", [])
    warehouse_list = [
        {
            "id": str(w.get("warehouse_id", "")),
            "name": w.get("name", ""),
            "is_rfbs": w.get("is_rfbs", False),
        }
        for w in warehouses
    ]

    return {
        "statusCode": 200,
        "headers": cors,
        "body": json.dumps({"valid": True, "warehouses": warehouse_list}, ensure_ascii=False),
    }