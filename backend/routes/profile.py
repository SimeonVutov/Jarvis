from fastapi import APIRouter, HTTPException
from backend import state
from backend.config import load_config, save_config
from backend.schemas import ProfileUpdate, NewsSourcesReplace, NewsSourceAdd
import time

router = APIRouter()


def _require_auth():
    if not state.UNLOCKED:
        raise HTTPException(401, "Not authenticated")


@router.get("/api/profile")
async def get_profile():
    return load_config()["user"]


@router.put("/api/profile")
async def update_profile(body: ProfileUpdate):
    _require_auth()
    cfg = load_config()
    u   = cfg["user"]
    if body.name     is not None: u["name"]     = body.name
    if body.brief    is not None: u["brief"]    = body.brief
    if body.city     is not None: u["city"]     = body.city
    if body.timezone is not None: u["timezone"] = body.timezone
    cfg["user"] = u
    save_config(cfg)
    return {"success": True, "user": u}


@router.get("/api/news-sources")
async def get_news_sources():
    return load_config().get("news", {}).get("sources", [])


@router.put("/api/news-sources")
async def replace_news_sources(body: NewsSourcesReplace):
    _require_auth()
    cfg = load_config()
    cfg.setdefault("news", {})["sources"] = body.sources
    save_config(cfg)
    return {"success": True}


@router.post("/api/news-sources")
async def add_news_source(body: NewsSourceAdd):
    _require_auth()
    cfg     = load_config()
    sources = cfg.setdefault("news", {}).setdefault("sources", [])
    sid     = body.id
    if any(s.get("id") == sid for s in sources):
        sid = f"{sid}_{int(time.time())}"
    sources.append({
        "id": sid, "name": body.name, "country": body.country,
        "url": body.url, "enabled": body.enabled,
    })
    save_config(cfg)
    return {"success": True, "sources": sources}


@router.delete("/api/news-sources/{source_id}")
async def delete_news_source(source_id: str):
    _require_auth()
    cfg = load_config()
    cfg["news"]["sources"] = [
        s for s in cfg.get("news", {}).get("sources", []) if s.get("id") != source_id
    ]
    save_config(cfg)
    return {"success": True}
