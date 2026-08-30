from __future__ import annotations

from fastapi import FastAPI
from fastapi.responses import FileResponse
from starlette.exceptions import HTTPException

from backend.app.config import Settings, get_settings
from backend.app.main import create_app


def create_local_app(settings: Settings | None = None) -> FastAPI:
    if settings is None:
        configured = get_settings()
        local_database = configured.data_directory / "studymate.db"
        settings = configured.model_copy(
            update={
                "database_url": f"sqlite:///{local_database.as_posix()}",
                "auto_create_schema": True,
                "secure_cookies": False,
                "vector_backend": "local",
            }
        )
    app = create_app(settings)
    static_directory = app.state.settings.local_client_directory.resolve()
    index_path = static_directory / "index.html"
    if not index_path.is_file():
        raise RuntimeError("Built frontend not found. Run `npm run local:build` first.")

    @app.get("/{full_path:path}", include_in_schema=False)
    def frontend(full_path: str) -> FileResponse:
        if full_path == "api" or full_path.startswith("api/"):
            raise HTTPException(status_code=404)
        requested = (static_directory / full_path).resolve()
        try:
            requested.relative_to(static_directory)
        except ValueError as error:
            raise HTTPException(status_code=404) from error
        if requested.is_file():
            return FileResponse(requested)
        return FileResponse(index_path)

    return app
