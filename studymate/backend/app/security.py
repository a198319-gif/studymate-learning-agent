from __future__ import annotations

import secrets
from typing import Annotated

import jwt
from fastapi import Cookie, Depends, Header, Request
from sqlalchemy.orm import Session

from backend.app.config import Settings
from backend.app.db import get_session
from backend.app.errors import AppError
from backend.app.models import User

SESSION_COOKIE = "studymate_session"
CSRF_COOKIE = "studymate_csrf"
SESSION_MAX_AGE = 7 * 24 * 60 * 60
CSRF_MAX_AGE = 24 * 60 * 60


def require_csrf(
    csrf_cookie: Annotated[str | None, Cookie(alias=CSRF_COOKIE)] = None,
    csrf_header: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> None:
    if not csrf_cookie or not csrf_header or not secrets.compare_digest(csrf_cookie, csrf_header):
        raise AppError(403, "CSRF_INVALID", "The security token is missing or invalid.")


def get_current_user(
    request: Request,
    session: Annotated[Session, Depends(get_session)],
    token: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
) -> User:
    if not token:
        raise AppError(401, "AUTH_REQUIRED", "Authentication is required.")
    settings: Settings = request.app.state.settings
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        user_id = payload.get("sub")
        email = payload.get("email")
        if not isinstance(user_id, str) or not isinstance(email, str):
            raise ValueError("Malformed session payload")
    except (jwt.PyJWTError, ValueError) as error:
        raise AppError(
            401, "AUTH_SESSION_INVALID", "Your session is invalid or expired."
        ) from error

    user = session.get(User, user_id)
    if user is None or user.email != email:
        raise AppError(401, "AUTH_SESSION_INVALID", "Your session is invalid or expired.")
    return user
