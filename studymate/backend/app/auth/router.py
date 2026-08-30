from __future__ import annotations

import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from backend.app.auth.schemas import LoginInput, RegisterInput
from backend.app.auth.service import AuthService, public_user
from backend.app.config import Settings
from backend.app.db import get_session
from backend.app.models import User
from backend.app.security import (
    CSRF_COOKIE,
    CSRF_MAX_AGE,
    SESSION_COOKIE,
    SESSION_MAX_AGE,
    get_current_user,
    require_csrf,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _set_session_cookie(response: Response, token: str, settings: Settings) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=SESSION_MAX_AGE,
        httponly=True,
        secure=settings.secure_cookies or settings.environment == "production",
        samesite="lax",
        path="/",
    )


@router.get("/csrf")
def csrf(request: Request, response: Response) -> dict[str, str]:
    settings: Settings = request.app.state.settings
    token = secrets.token_urlsafe(32)
    response.set_cookie(
        CSRF_COOKIE,
        token,
        max_age=CSRF_MAX_AGE,
        httponly=False,
        secure=settings.secure_cookies or settings.environment == "production",
        samesite="lax",
        path="/",
    )
    return {"csrfToken": token}


@router.post("/register", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_csrf)])
def register(
    input_data: RegisterInput,
    request: Request,
    response: Response,
    session: Annotated[Session, Depends(get_session)],
) -> dict[str, dict[str, str]]:
    settings: Settings = request.app.state.settings
    user, token = AuthService(session, settings.jwt_secret).register(
        input_data.name, str(input_data.email), input_data.password
    )
    _set_session_cookie(response, token, settings)
    return {"user": user}


@router.post("/login", dependencies=[Depends(require_csrf)])
def login(
    input_data: LoginInput,
    request: Request,
    response: Response,
    session: Annotated[Session, Depends(get_session)],
) -> dict[str, dict[str, str]]:
    settings: Settings = request.app.state.settings
    user, token = AuthService(session, settings.jwt_secret).login(
        str(input_data.email), input_data.password
    )
    _set_session_cookie(response, token, settings)
    return {"user": user}


@router.get("/me")
def me(user: Annotated[User, Depends(get_current_user)]) -> dict[str, dict[str, str]]:
    return {"user": public_user(user)}


@router.post(
    "/logout", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_csrf)]
)
def logout(request: Request, response: Response) -> Response:
    settings: Settings = request.app.state.settings
    response.delete_cookie(
        SESSION_COOKIE,
        path="/",
        httponly=True,
        secure=settings.secure_cookies or settings.environment == "production",
        samesite="lax",
    )
    response.status_code = status.HTTP_204_NO_CONTENT
    return response
