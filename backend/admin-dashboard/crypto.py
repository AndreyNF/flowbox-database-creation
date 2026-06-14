"""AES-256-GCM шифрование API-ключей. Формат: enc:v1:<base64(nonce+ct+tag)>"""
import base64, os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

PREFIX = "enc:v1:"

def _get_key():
    raw = os.environ.get("ENCRYPTION_KEY", "")
    if not raw: raise RuntimeError("ENCRYPTION_KEY не задан")
    if len(raw) == 64: return bytes.fromhex(raw)
    if len(raw) == 32: return raw.encode()
    raise RuntimeError(f"ENCRYPTION_KEY: неверная длина ({len(raw)})")

def encrypt_key(plaintext: str) -> str:
    if not plaintext or plaintext.startswith(PREFIX): return plaintext
    nonce = os.urandom(12)
    ct_tag = AESGCM(_get_key()).encrypt(nonce, plaintext.encode(), None)
    return PREFIX + base64.b64encode(nonce + ct_tag).decode()

def decrypt_key(ciphertext: str) -> str:
    if not ciphertext or not ciphertext.startswith(PREFIX): return ciphertext
    payload = base64.b64decode(ciphertext[len(PREFIX):])
    return AESGCM(_get_key()).decrypt(payload[:12], payload[12:], None).decode()

def mask_key(raw: str) -> str:
    if not raw: return ""
    if raw.startswith(PREFIX):
        b = raw[len(PREFIX):]
        return b[:4] + "..." + b[-4:] if len(b) >= 8 else "****"
    return (raw[:4] + "..." + raw[-4:]) if len(raw) >= 8 else "*" * len(raw)
