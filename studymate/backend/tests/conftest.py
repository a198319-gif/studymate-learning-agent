from collections.abc import Iterator
from pathlib import Path

import pytest
from backend.app.config import Settings
from backend.app.main import create_app
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path: Path) -> Iterator[TestClient]:
    settings = Settings(
        NODE_ENV="test",
        DATABASE_URL=f"sqlite:///{(tmp_path / 'test.db').as_posix()}",
        JWT_SECRET="test-secret-that-is-at-least-thirty-two-characters",
        CLIENT_URL="http://localhost:5173",
        DATA_DIRECTORY=tmp_path / "data",
        VECTOR_BACKEND="local",
    )
    with TestClient(create_app(settings)) as test_client:
        yield test_client


@pytest.fixture
def csrf_headers(client: TestClient) -> dict[str, str]:
    response = client.get("/api/auth/csrf")
    assert response.status_code == 200
    return {"X-CSRF-Token": response.json()["csrfToken"]}


@pytest.fixture
def registered_client(client: TestClient, csrf_headers: dict[str, str]) -> TestClient:
    response = client.post(
        "/api/auth/register",
        headers=csrf_headers,
        json={"name": "郭靖", "email": "GUOJING@example.com", "password": "password123"},
    )
    assert response.status_code == 201
    return client
