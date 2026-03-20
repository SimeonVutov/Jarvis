from fastapi import APIRouter, HTTPException
import ollama
from backend import state
from backend.config import load_config, save_config
from backend import downloader
from backend.schemas import PullRequest, ModelAssignment

router = APIRouter()


def _require_auth():
    if not state.UNLOCKED:
        raise HTTPException(401, "Not authenticated")


@router.get("/api/models")
async def list_models():
    try:
        result = ollama.list()
        return {
            "models": [
                {
                    "name":   m["model"],
                    "size":   m.get("size", 0),
                    "family": m.get("details", {}).get("family", ""),
                }
                for m in result.get("models", [])
            ],
            "configured": state.MODELS,
        }
    except Exception as e:
        return {"error": str(e), "models": [], "configured": state.MODELS}


@router.put("/api/models/assign")
async def assign_models(body: ModelAssignment):
    _require_auth()
    cfg = load_config()
    if body.study:   cfg["models"]["study"]   = body.study
    if body.coding:  cfg["models"]["coding"]  = body.coding
    if body.general: cfg["models"]["general"] = body.general
    save_config(cfg)
    state.MODELS = cfg["models"]
    return {"success": True, "models": state.MODELS}


@router.post("/api/models/pull")
async def start_pull(body: PullRequest):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "name required")
    status = downloader.start(name)
    return {"status": status, "name": name}


@router.get("/api/models/pull/all")
async def all_pull_statuses():
    return downloader.get_all()


@router.post("/api/models/pull/pause/{name:path}")
async def pause_pull(name: str):
    paused = downloader.toggle_pause(name)
    return {"paused": paused}


@router.post("/api/models/pull/cancel/{name:path}")
async def cancel_pull(name: str):
    downloader.cancel(name)
    return {"cancelled": True}


@router.delete("/api/models/{name:path}")
async def delete_model(name: str):
    try:
        ollama.delete(name)
        return {"deleted": name}
    except Exception as e:
        raise HTTPException(500, str(e))
