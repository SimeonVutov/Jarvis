import json, sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.resolve()
CONFIG_PATH  = PROJECT_ROOT / "config.json"
FRONTEND_DIR = PROJECT_ROOT / "frontend"


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        print(f"ERROR: config.json not found at {CONFIG_PATH}")
        print("Run install.sh first.")
        sys.exit(1)
    with open(CONFIG_PATH) as f:
        return json.load(f)


def save_config(cfg: dict) -> None:
    with open(CONFIG_PATH, "w") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)


def get_data_dir() -> Path:
    return PROJECT_ROOT / load_config().get("data_dir", "data")


def get_db_path() -> Path:
    return get_data_dir() / "jarvis.db"


def get_chroma_dir() -> Path:
    return get_data_dir() / "chroma"


def get_salt_path() -> Path:
    return get_data_dir() / ".salt"


def get_server_cfg() -> dict:
    return load_config().get("server", {"host": "127.0.0.1", "port": 7777})
