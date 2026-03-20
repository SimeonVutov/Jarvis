from pathlib import Path
from fastapi import FastAPI
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.routes import (
    auth, profile, dashboard, news, chat,
    conversations, fitness, reminders, journal,
    memories, stats, models, projects,
)

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"


def create_app() -> FastAPI:
    app = FastAPI(title="Jarvis", docs_url=None)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    for router in [
        auth.router, profile.router, dashboard.router, news.router,
        chat.router, conversations.router, fitness.router, reminders.router,
        journal.router, memories.router, stats.router, models.router,
        projects.router,
    ]:
        app.include_router(router)

    # Serve static frontend assets (CSS, JS components)
    if (FRONTEND_DIR / "css").exists():
        app.mount("/css", StaticFiles(directory=str(FRONTEND_DIR / "css")), name="css")
    if (FRONTEND_DIR / "src").exists():
        app.mount("/src", StaticFiles(directory=str(FRONTEND_DIR / "src")), name="src")

    @app.get("/")
    async def serve_index():
        index = FRONTEND_DIR / "index.html"
        if index.exists():
            return FileResponse(str(index))
        return HTMLResponse("<h1>frontend/index.html not found</h1>")

    @app.on_event("startup")
    async def on_startup():
        from backend.config import load_config, get_data_dir
        from backend.database import get_connection, ensure_tables
        cfg = load_config()
        get_data_dir().mkdir(parents=True, exist_ok=True)
        db  = get_data_dir() / "jarvis.db"
        if db.exists():
            con = get_connection()
            ensure_tables(con)
            con.close()
        srv = cfg.get("server", {})
        print(f"✓ Jarvis  http://{srv.get('host','127.0.0.1')}:{srv.get('port',7777)}")

    return app
