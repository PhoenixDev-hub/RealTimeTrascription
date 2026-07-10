try:
    from server.app.api.app import app
except ImportError:
    from app.api.app import app

if __name__ == "__main__":
    import os

    import uvicorn

    port = int(os.getenv("PORT", "5455"))
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level=os.getenv("LOG_LEVEL", "INFO").lower(),
    )
