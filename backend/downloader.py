import time
import threading
import ollama

# Registry of all model pulls: name -> status dict.
# Persists for the server lifetime so navigating away doesn't kill downloads.
_registry: dict[str, dict] = {}


def get_all() -> dict:
    return _registry


def start(name: str) -> str:
    if _registry.get(name, {}).get("status") == "downloading":
        return "already_downloading"
    _registry[name] = {
        "status": "queued",
        "pct": 0,
        "completed": 0,
        "total": 0,
        "status_text": "Queued…",
        "error": None,
        "paused": False,
        "cancelled": False,
    }
    t = threading.Thread(target=_pull_worker, args=(name,), daemon=True)
    t.start()
    return "started"


def toggle_pause(name: str) -> bool:
    if name in _registry:
        _registry[name]["paused"] = not _registry[name].get("paused", False)
    return _registry.get(name, {}).get("paused", False)


def cancel(name: str) -> None:
    if name in _registry:
        _registry[name]["cancelled"] = True


def _pull_worker(name: str) -> None:
    """Blocking Ollama pull — must run in a daemon thread, not the async event loop."""
    _registry[name].update(status="downloading", pct=0, completed=0, total=0,
                            status_text="Connecting…", error=None)
    try:
        for chunk in ollama.pull(name, stream=True):
            entry = _registry[name]
            if entry.get("cancelled"):
                entry["status"] = "cancelled"
                return
            while entry.get("paused") and not entry.get("cancelled"):
                time.sleep(0.25)

            total     = chunk.get("total") or 0
            completed = chunk.get("completed") or 0
            if total > 0:
                entry.update(pct=int(completed / total * 100),
                             completed=completed, total=total)
            entry["status_text"] = chunk.get("status", "")

        _registry[name].update(status="done", pct=100)
    except Exception as e:
        _registry[name].update(status="error", error=str(e))
