from __future__ import annotations

from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from qdrant_client import QdrantClient
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.app.auth.router import router as auth_router
from backend.app.config import Settings, get_settings
from backend.app.dashboard import router as dashboard_router
from backend.app.db import Database
from backend.app.errors import AppError
from backend.app.materials.router import router as materials_router
from backend.app.materials.vectors import LocalVectorStore, QdrantVectorStore
from backend.app.models import Base
from backend.app.quiz.router import router as quiz_router
from backend.app.study.provider import DeepSeekProvider
from backend.app.study.router import router as study_router


def _request_id(request: Request) -> str:
    return str(getattr(request.state, "request_id", uuid4().hex))


def _error_response(request: Request, status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "code": code,
                "message": message,
                "requestId": _request_id(request),
            }
        },
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved_settings = settings or get_settings()
    app = FastAPI(title="StudyMate API", docs_url=None, redoc_url=None)
    app.state.settings = resolved_settings
    app.state.database = Database(resolved_settings.database_url)
    app.state.vector_store = (
        QdrantVectorStore(
            QdrantClient(url=resolved_settings.qdrant_url),
            resolved_settings.qdrant_collection,
        )
        if resolved_settings.vector_backend == "qdrant"
        else LocalVectorStore(resolved_settings.data_directory / "vectors.json")
    )
    app.state.ai_provider = DeepSeekProvider(
        resolved_settings.deepseek_api_key,
        resolved_settings.deepseek_base_url,
        resolved_settings.deepseek_model,
    )
    if resolved_settings.auto_create_schema or resolved_settings.database_url.startswith("sqlite"):
        Base.metadata.create_all(app.state.database.engine)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[resolved_settings.client_url],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "X-CSRF-Token", "X-Request-ID"],
    )

    @app.middleware("http")
    async def add_request_context(request: Request, call_next):  # type: ignore[no-untyped-def]
        request.state.request_id = request.headers.get("x-request-id") or uuid4().hex
        response = await call_next(request)
        response.headers["X-Request-ID"] = request.state.request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        return response

    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, error: AppError) -> JSONResponse:
        return _error_response(request, error.status_code, error.code, error.message)

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request, _error: RequestValidationError
    ) -> JSONResponse:
        return _error_response(
            request, 400, "VALIDATION_ERROR", "Please check the submitted fields."
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_error(request: Request, error: StarletteHTTPException) -> JSONResponse:
        if error.status_code == 404:
            return _error_response(request, 404, "NOT_FOUND", "Route not found.")
        return _error_response(request, error.status_code, "HTTP_ERROR", "Request failed.")

    @app.get("/api/health")
    async def health(request: Request) -> dict[str, str]:
        return {"status": "ok", "requestId": _request_id(request)}

    app.include_router(auth_router)
    app.include_router(materials_router)
    app.include_router(study_router)
    app.include_router(quiz_router)
    app.include_router(dashboard_router)

    return app


app = create_app()
