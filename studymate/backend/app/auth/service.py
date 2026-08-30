from __future__ import annotations

from datetime import UTC, datetime, timedelta

import bcrypt
import jwt
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.errors import AppError
from backend.app.models import User


def public_user(user: User) -> dict[str, str]:
    return {"id": user.id, "name": user.name, "email": user.email}


class AuthService:
    def __init__(self, session: Session, jwt_secret: str) -> None:
        self.session = session
        self.jwt_secret = jwt_secret

    def register(self, name: str, email: str, password: str) -> tuple[dict[str, str], str]:
        normalized_email = email.strip().lower()
        if self.session.scalar(select(User).where(User.email == normalized_email)) is not None:
            raise AppError(409, "AUTH_EMAIL_EXISTS", "An account with this email already exists.")

        password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode(
            "ascii"
        )
        user = User(name=name.strip(), email=normalized_email, password_hash=password_hash)
        self.session.add(user)
        try:
            self.session.commit()
        except IntegrityError as error:
            self.session.rollback()
            raise AppError(
                409, "AUTH_EMAIL_EXISTS", "An account with this email already exists."
            ) from error
        self.session.refresh(user)
        return public_user(user), self._token(user)

    def login(self, email: str, password: str) -> tuple[dict[str, str], str]:
        normalized_email = email.strip().lower()
        user = self.session.scalar(select(User).where(User.email == normalized_email))
        valid = user is not None and bcrypt.checkpw(
            password.encode("utf-8"), user.password_hash.encode("ascii")
        )
        if not valid or user is None:
            raise AppError(401, "AUTH_INVALID_CREDENTIALS", "Email or password is incorrect.")
        return public_user(user), self._token(user)

    def _token(self, user: User) -> str:
        return jwt.encode(
            {
                "sub": user.id,
                "email": user.email,
                "exp": datetime.now(UTC) + timedelta(days=7),
            },
            self.jwt_secret,
            algorithm="HS256",
            headers={"typ": "JWT"},
        )
