"""
App Settings Routes

GET  /api/apps        — list all apps with enabled/core status
PUT  /api/apps/{id}   — enable or disable an optional app
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend import state
from backend.config import load_config, save_config
from backend.app_registry import REGISTRY, get_app


router = APIRouter()


class AppToggle(BaseModel):
    enabled: bool


def _require_auth():
    if not state.UNLOCKED:
        raise HTTPException(401, "Not authenticated")


def get_enabled_app_ids(cfg: dict | None = None) -> set[str]:
    """
    Returns the set of enabled optional app IDs.
    Core apps are always considered enabled regardless of config.
    """
    if cfg is None:
        cfg = load_config()
    stored = cfg.get("apps", {})
    enabled = set()
    for app in REGISTRY:
        if app.core:
            enabled.add(app.id)
        elif stored.get(app.id, {}).get("enabled", True):
            # Default to enabled if not explicitly configured
            enabled.add(app.id)
    return enabled


@router.get("/api/apps")
async def list_apps():
    cfg     = load_config()
    stored  = cfg.get("apps", {})
    enabled = get_enabled_app_ids(cfg)
    return [
        {
            "id":          app.id,
            "name":        app.name,
            "description": app.description,
            "icon":        app.icon,
            "nav_id":      app.nav_id,
            "core":        app.core,
            "enabled":     app.id in enabled,
        }
        for app in REGISTRY
    ]


@router.put("/api/apps/{app_id}")
async def toggle_app(app_id: str, body: AppToggle):
    _require_auth()

    app = get_app(app_id)
    if not app:
        raise HTTPException(404, f"App '{app_id}' not found")
    if app.core:
        raise HTTPException(400, f"'{app.name}' is a core app and cannot be disabled")

    cfg = load_config()
    cfg.setdefault("apps", {})[app_id] = {"enabled": body.enabled}
    save_config(cfg)

    return {
        "id":      app_id,
        "enabled": body.enabled,
        "name":    app.name,
    }
