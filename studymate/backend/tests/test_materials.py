from fastapi.testclient import TestClient


def test_upload_txt_is_processed_and_listed(
    registered_client: TestClient, csrf_headers: dict[str, str]
) -> None:
    response = registered_client.post(
        "/api/materials",
        headers=csrf_headers,
        files={
            "file": (
                "notes.txt",
                "牛顿第二定律说明力、质量与加速度之间的关系。".encode(),
                "text/plain",
            )
        },
    )

    assert response.status_code == 201
    uploaded = response.json()["material"]
    assert uploaded["originalName"] == "notes.txt"
    assert uploaded["status"] == "PROCESSING"

    listing = registered_client.get("/api/materials")
    assert listing.status_code == 200
    material = listing.json()["materials"][0]
    assert material["status"] == "READY"
    assert material["chunkCount"] == 1

    detail = registered_client.get(f"/api/materials/{material['id']}")
    assert detail.status_code == 200
    assert detail.json()["material"]["id"] == material["id"]


def test_upload_rejects_unsupported_and_spoofed_files(
    registered_client: TestClient, csrf_headers: dict[str, str]
) -> None:
    unsupported = registered_client.post(
        "/api/materials",
        headers=csrf_headers,
        files={"file": ("notes.md", b"hello", "text/markdown")},
    )
    assert unsupported.status_code == 400
    assert unsupported.json()["error"]["code"] == "MATERIAL_TYPE_UNSUPPORTED"

    spoofed = registered_client.post(
        "/api/materials",
        headers=csrf_headers,
        files={"file": ("notes.pdf", b"not really a pdf", "application/pdf")},
    )
    assert spoofed.status_code == 400
    assert spoofed.json()["error"]["code"] == "MATERIAL_SIGNATURE_INVALID"


def test_materials_are_owned_and_delete_removes_them(
    registered_client: TestClient, csrf_headers: dict[str, str]
) -> None:
    upload = registered_client.post(
        "/api/materials",
        headers=csrf_headers,
        files={"file": ("private.txt", b"private course notes", "text/plain")},
    )
    material_id = upload.json()["material"]["id"]
    assert registered_client.post("/api/auth/logout", headers=csrf_headers).status_code == 204
    second = registered_client.post(
        "/api/auth/register",
        headers=csrf_headers,
        json={"name": "黄蓉", "email": "huangrong@example.com", "password": "password123"},
    )
    assert second.status_code == 201
    assert registered_client.get(f"/api/materials/{material_id}").status_code == 404
    assert (
        registered_client.delete(f"/api/materials/{material_id}", headers=csrf_headers).status_code
        == 404
    )

    assert registered_client.post("/api/auth/logout", headers=csrf_headers).status_code == 204
    login = registered_client.post(
        "/api/auth/login",
        headers=csrf_headers,
        json={"email": "guojing@example.com", "password": "password123"},
    )
    assert login.status_code == 200
    assert (
        registered_client.delete(f"/api/materials/{material_id}", headers=csrf_headers).status_code
        == 204
    )
    assert registered_client.get(f"/api/materials/{material_id}").status_code == 404
