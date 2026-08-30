from backend.app.main import create_app
from fastapi.testclient import TestClient


def test_health_returns_request_id() -> None:
    client = TestClient(create_app())

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["requestId"]
    assert response.headers["x-request-id"] == response.json()["requestId"]


def test_unknown_api_route_uses_safe_error_contract() -> None:
    client = TestClient(create_app())

    response = client.get("/api/missing")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"
    assert response.json()["error"]["message"] == "Route not found."
    assert response.json()["error"]["requestId"]
