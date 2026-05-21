import json
import urllib.request
import urllib.error


def handler(event: dict, context) -> dict:
    """Проверка валидности API-ключа Ozon. Принимает client_id и api_key, возвращает список складов."""
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

    req = urllib.request.Request(
        "https://api-seller.ozon.ru/v1/warehouse/list",
        data=b"{}",
        headers={
            "Client-Id": client_id,
            "Api-Key": api_key,
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body_err = ""
        try:
            body_err = e.read().decode("utf-8")
        except Exception:
            pass

        if e.code in (400, 401):
            return {
                "statusCode": 401,
                "headers": cors,
                "body": json.dumps({"error": "Неверный Client ID или API-ключ"}, ensure_ascii=False),
            }
        if e.code == 403:
            return {
                "statusCode": 403,
                "headers": cors,
                "body": json.dumps({"error": "Доступ запрещён. Проверьте права API-ключа"}, ensure_ascii=False),
            }
        return {
            "statusCode": 502,
            "headers": cors,
            "body": json.dumps({"error": f"Ошибка Ozon API: {e.code}"}, ensure_ascii=False),
        }
    except Exception as e:
        return {
            "statusCode": 502,
            "headers": cors,
            "body": json.dumps({"error": f"Не удалось подключиться к Ozon: {str(e)}"}, ensure_ascii=False),
        }

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