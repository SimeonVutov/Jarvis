#!/usr/bin/env python3
"""
Jarvis — Server entry point.
Run: python server.py   (or via start-dashboard.sh)
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.resolve()))

import uvicorn
from backend.app import create_app
from backend.config import get_server_cfg

app = create_app()

if __name__ == "__main__":
    cfg = get_server_cfg()
    uvicorn.run(
        "server:app",
        host=cfg.get("host", "127.0.0.1"),
        port=int(cfg.get("port", 7777)),
        log_level="warning",
        reload=False,
    )
