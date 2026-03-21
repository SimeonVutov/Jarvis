import os
import sys
import json
import tempfile
import pytest
from pathlib import Path

# Make sure the project root is on the path
sys.path.insert(0, str(Path(__file__).parent.parent))


@pytest.fixture(scope="session")
def tmp_project_dir(tmp_path_factory):
    """Temporary project directory with a config.json and data/ folder."""
    base = tmp_path_factory.mktemp("jarvis")
    config = {
        "models": {
            "study":   "mock-model",
            "coding":  "mock-model",
            "general": "mock-model",
            "embed":   "mock-model",
        },
        "user": {
            "name":     "TestUser",
            "brief":    "A user running automated tests.",
            "city":     "Amsterdam",
            "timezone": "Europe/Amsterdam",
        },
        "news":   {"sources": []},
        "server": {"host": "127.0.0.1", "port": 17777},
        "data_dir": str(base / "data"),
    }
    (base / "config.json").write_text(json.dumps(config, indent=2))
    (base / "data").mkdir()
    return base


@pytest.fixture
def test_password():
    return "test-password-123"


@pytest.fixture
def unlocked_state(tmp_project_dir, test_password):
    """
    Sets up backend state as if the user has unlocked with test_password.
    Tears down after the test by resetting state.
    """
    import backend.state as state
    from backend import config as cfg_module
    from backend.crypto import load_or_create_salt, derive_key
    from backend.database import get_connection, ensure_tables

    # Point config loader at the temp directory
    original_config_path = cfg_module.CONFIG_PATH
    original_project_root = cfg_module.PROJECT_ROOT
    cfg_module.CONFIG_PATH  = tmp_project_dir / "config.json"
    cfg_module.PROJECT_ROOT = tmp_project_dir

    salt = load_or_create_salt()
    key  = derive_key(test_password, salt)
    state.KEY      = key
    state.UNLOCKED = True
    state.MODELS   = cfg_module.load_config()["models"]

    con = get_connection()
    ensure_tables(con)
    con.close()

    yield state

    # Teardown
    state.KEY      = b""
    state.UNLOCKED = False
    cfg_module.CONFIG_PATH  = original_config_path
    cfg_module.PROJECT_ROOT = original_project_root
