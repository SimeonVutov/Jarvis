import os, base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from backend import state
from backend.config import get_salt_path


def load_or_create_salt() -> bytes:
    path = get_salt_path()
    if path.exists():
        return bytes.fromhex(path.read_text().strip())
    salt = os.urandom(32)
    path.write_text(salt.hex())
    path.chmod(0o600)
    return salt


def derive_key(password: str, salt: bytes) -> bytes:
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=600_000)
    return kdf.derive(password.encode())


def encrypt(text: str) -> str:
    nonce = os.urandom(12)
    ciphertext = AESGCM(state.KEY).encrypt(nonce, text.encode(), None)
    return base64.b64encode(nonce + ciphertext).decode()


def encrypt_bytes(data: bytes) -> str:
    nonce = os.urandom(12)
    ciphertext = AESGCM(state.KEY).encrypt(nonce, data, None)
    return base64.b64encode(nonce + ciphertext).decode()


def decrypt(token: str) -> str:
    raw = base64.b64decode(token.encode())
    return AESGCM(state.KEY).decrypt(raw[:12], raw[12:], None).decode()


def decrypt_bytes(token: str) -> bytes:
    raw = base64.b64decode(token.encode())
    return AESGCM(state.KEY).decrypt(raw[:12], raw[12:], None)


def safe_decrypt(token: str, fallback: str = "") -> str:
    if not token:
        return fallback
    try:
        return decrypt(token)
    except Exception:
        return fallback or token
