from fastapi.testclient import TestClient


def test_csrf_endpoint_sets_readable_cookie(client: TestClient) -> None:
    response = client.get("/api/auth/csrf")

    assert response.status_code == 200
    token = response.json()["csrfToken"]
    assert token
    assert client.cookies.get("studymate_csrf") == token
    assert "HttpOnly" not in response.headers["set-cookie"]


def test_register_requires_matching_csrf(client: TestClient) -> None:
    response = client.post(
        "/api/auth/register",
        json={"name": "郭靖", "email": "guojing@example.com", "password": "password123"},
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "CSRF_INVALID"


def test_register_normalizes_email_and_sets_http_only_session(
    client: TestClient, csrf_headers: dict[str, str]
) -> None:
    response = client.post(
        "/api/auth/register",
        headers=csrf_headers,
        json={"name": " 郭靖 ", "email": "GUOJING@Example.COM", "password": "password123"},
    )

    assert response.status_code == 201
    assert response.json()["user"]["email"] == "guojing@example.com"
    assert response.json()["user"]["name"] == "郭靖"
    session_cookie = response.headers["set-cookie"]
    assert "studymate_session=" in session_cookie
    assert "HttpOnly" in session_cookie
    assert "SameSite=lax" in session_cookie

    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["user"] == response.json()["user"]


def test_duplicate_email_and_invalid_password_use_stable_errors(
    client: TestClient, csrf_headers: dict[str, str]
) -> None:
    payload = {"name": "郭靖", "email": "guojing@example.com", "password": "password123"}
    assert client.post("/api/auth/register", headers=csrf_headers, json=payload).status_code == 201

    duplicate = client.post("/api/auth/register", headers=csrf_headers, json=payload)
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "AUTH_EMAIL_EXISTS"

    logout = client.post("/api/auth/logout", headers=csrf_headers)
    assert logout.status_code == 204

    invalid = client.post(
        "/api/auth/login",
        headers=csrf_headers,
        json={"email": payload["email"], "password": "wrong-password"},
    )
    assert invalid.status_code == 401
    assert invalid.json()["error"]["code"] == "AUTH_INVALID_CREDENTIALS"


def test_login_logout_and_unauthenticated_me(
    client: TestClient, csrf_headers: dict[str, str]
) -> None:
    payload = {"name": "郭靖", "email": "guojing@example.com", "password": "password123"}
    assert client.post("/api/auth/register", headers=csrf_headers, json=payload).status_code == 201
    assert client.post("/api/auth/logout", headers=csrf_headers).status_code == 204
    assert client.get("/api/auth/me").status_code == 401

    login = client.post(
        "/api/auth/login",
        headers=csrf_headers,
        json={"email": " GUOJING@example.com ", "password": payload["password"]},
    )
    assert login.status_code == 200
    assert login.json()["user"]["email"] == "guojing@example.com"
    assert client.get("/api/auth/me").status_code == 200


def test_registration_accepts_frontend_valid_reserved_test_domain(
    client: TestClient, csrf_headers: dict[str, str]
) -> None:
    response = client.post(
        "/api/auth/register",
        headers=csrf_headers,
        json={"name": "测试用户", "email": "codex.qa@example.test", "password": "password123"},
    )
    assert response.status_code == 201
