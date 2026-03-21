"""
Tests for the encryption layer.
These run without any database or Ollama — pure crypto logic.
"""
import pytest
import backend.state as state
from backend.crypto import derive_key, encrypt, decrypt, encrypt_bytes, decrypt_bytes, safe_decrypt


SALT = b"\x00" * 32


@pytest.fixture(autouse=True)
def set_key():
    """Give state.KEY a known value before each test and clean up after."""
    state.KEY = derive_key("test-password", SALT)
    yield
    state.KEY = b""


class TestKeyDerivation:
    def test_same_password_same_salt_gives_same_key(self):
        k1 = derive_key("password", SALT)
        k2 = derive_key("password", SALT)
        assert k1 == k2

    def test_different_passwords_give_different_keys(self):
        k1 = derive_key("password1", SALT)
        k2 = derive_key("password2", SALT)
        assert k1 != k2

    def test_different_salts_give_different_keys(self):
        k1 = derive_key("password", b"\x00" * 32)
        k2 = derive_key("password", b"\xff" * 32)
        assert k1 != k2

    def test_key_is_32_bytes(self):
        key = derive_key("password", SALT)
        assert len(key) == 32


class TestEncryptDecrypt:
    def test_roundtrip_short_text(self):
        original = "Hello, world!"
        assert decrypt(encrypt(original)) == original

    def test_roundtrip_long_text(self):
        original = "A" * 10_000
        assert decrypt(encrypt(original)) == original

    def test_roundtrip_unicode(self):
        original = "Здравей, свят! 🌍"
        assert decrypt(encrypt(original)) == original

    def test_roundtrip_empty_string(self):
        assert decrypt(encrypt("")) == ""

    def test_each_encryption_is_unique(self):
        # Different nonces mean same plaintext encrypts differently each time
        t1 = encrypt("same text")
        t2 = encrypt("same text")
        assert t1 != t2

    def test_wrong_key_raises(self):
        token = encrypt("secret")
        state.KEY = derive_key("wrong-password", SALT)
        with pytest.raises(Exception):
            decrypt(token)


class TestEncryptDecryptBytes:
    def test_roundtrip_bytes(self):
        data = b"\x00\x01\x02\xff\xfe\xfd"
        assert decrypt_bytes(encrypt_bytes(data)) == data

    def test_roundtrip_empty_bytes(self):
        assert decrypt_bytes(encrypt_bytes(b"")) == b""


class TestSafeDecrypt:
    def test_returns_decrypted_value_on_valid_token(self):
        token = encrypt("hello")
        assert safe_decrypt(token) == "hello"

    def test_returns_fallback_on_garbage_input(self):
        assert safe_decrypt("not-valid-base64!!!", fallback="fallback") == "fallback"

    def test_returns_empty_string_on_empty_input(self):
        assert safe_decrypt("") == ""

    def test_returns_original_on_non_encrypted_if_no_fallback(self):
        # When fallback is empty, safe_decrypt returns the raw value rather than crashing
        result = safe_decrypt("plain text")
        assert isinstance(result, str)
