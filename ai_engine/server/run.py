"""Entry point: python -m ai_engine.server.run (or invoke uvicorn directly)."""
from __future__ import annotations

import os

import uvicorn


def main():
    host = os.environ.get("ZH_HOST", "127.0.0.1")
    port = int(os.environ.get("ZH_PORT", "8001"))
    reload_flag = os.environ.get("ZH_RELOAD", "0") == "1"
    uvicorn.run(
        "ai_engine.server.main:app",
        host=host,
        port=port,
        reload=reload_flag,
        log_level="info",
    )


if __name__ == "__main__":
    main()
