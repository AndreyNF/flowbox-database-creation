"""
AES-256-GCM шифрование для API-ключей.
ENCRYPTION_KEY — 64-символьная hex-строка (32 байта) из secrets проекта.

Формат зашифрованного значения в БД:
  enc:v1:<base64(nonce + ciphertext + tag)>

Если значение не начинается с 'enc:v1:' — считается открытым текстом
(обратная совместимость со старыми записями).
"""
import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


PREFIX = "enc:v1:"


def _get_key() -> bytes:
    raw = os.environ.get("ENCRYPTION_KEY", "")
    if not raw:
        raise RuntimeError("ENCRYPTION_KEY не задан в secrets")
    if len(raw) == 64:
        return bytes.fromhex(raw)
    if len(raw) == 32:
        return raw.encode()
    raise RuntimeError(f"ENCRYPTION_KEY: неверная длина ({len(raw)}), ожидается 64 hex-символа")


def encrypt_key(plaintext: str) -> str:
    if not plaintext:
        return plaintext
    if plaintext.startswith(PREFIX):
        return plaintext
    key   = _get_key()
    nonce = os.urandom(12)
    aesgcm = AESGCM(key)
    ct_tag = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    payload = base64.b64encode(nonce + ct_tag).decode("ascii")
    return PREFIX + payload


def decrypt_key(ciphertext: str) -> str:
    if not ciphertext:
        return ciphertext
    if not ciphertext.startswith(PREFIX):
        return ciphertext
    key    = _get_key()
    payload = base64.b64decode(ciphertext[len(PREFIX):])
    nonce   = payload[:12]
    ct_tag  = payload[12:]
    aesgcm  = AESGCM(key)
    return aesgcm.decrypt(nonce, ct_tag, None).decode("utf-8")


def mask_key(raw: str) -> str:
    if not raw:
        return ""
    if raw.startswith(PREFIX):
        b64 = raw[len(PREFIX):]
        return b64[:4] + "..." + b64[-4:] if len(b64) >= 8 else "****"
    return (raw[:4] + "..." + raw[-4:]) if len(raw) >= 8 else "*" * len(raw)
