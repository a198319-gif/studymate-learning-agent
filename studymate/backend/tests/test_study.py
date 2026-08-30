from typing import Any

from fastapi.testclient import TestClient


class FakeProvider:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    def complete(
        self, *, system: str, prompt: str, json_schema: dict[str, object] | None = None
    ) -> str:
        self.calls.append({"system": system, "prompt": prompt, "json_schema": json_schema})
        return '牛顿第二定律说明力等于质量乘以加速度。\nSOURCES_JSON:["physics.txt"]'


def upload_ready_material(client: TestClient, csrf_headers: dict[str, str]) -> str:
    response = client.post(
        "/api/materials",
        headers=csrf_headers,
        files={
            "file": ("physics.txt", "牛顿第二定律：力等于质量乘以加速度。".encode(), "text/plain")
        },
    )
    assert response.status_code == 201
    return response.json()["material"]["id"]


def test_grounded_chat_saves_and_restores_conversation(
    registered_client: TestClient, csrf_headers: dict[str, str]
) -> None:
    provider = FakeProvider()
    registered_client.app.state.ai_provider = provider
    material_id = upload_ready_material(registered_client, csrf_headers)

    response = registered_client.post(
        "/api/study/chat",
        headers=csrf_headers,
        json={
            "question": "牛顿第二定律是什么？",
            "materialIds": [material_id],
            "language": "zh",
            "beginnerMode": True,
            "retrievalMode": "selected",
        },
    )

    assert response.status_code == 201
    answer = response.json()
    assert answer["groundingStatus"] == "GROUNDED"
    assert answer["sources"] == ["physics.txt"]
    assert provider.calls and "牛顿第二定律" in provider.calls[0]["prompt"]

    listing = registered_client.get("/api/study/conversations")
    assert listing.status_code == 200
    assert listing.json()["conversations"][0]["messageCount"] == 2
    detail = registered_client.get(f"/api/study/conversations/{answer['conversationId']}")
    assert [item["role"] for item in detail.json()["conversation"]["messages"]] == [
        "user",
        "assistant",
    ]


def test_summary_uses_selected_chunks_and_history_is_owned(
    registered_client: TestClient, csrf_headers: dict[str, str]
) -> None:
    registered_client.app.state.ai_provider = FakeProvider()
    material_id = upload_ready_material(registered_client, csrf_headers)
    response = registered_client.post(
        "/api/study/generate",
        headers=csrf_headers,
        json={"type": "SUMMARY", "materialIds": [material_id], "language": "zh"},
    )
    assert response.status_code == 201
    artifact = response.json()["artifact"]
    assert artifact["type"] == "SUMMARY"
    assert artifact["groundingStatus"] == "GROUNDED"

    history = registered_client.get("/api/study/history")
    assert history.json()["artifacts"][0]["id"] == artifact["id"]
    assert registered_client.get(f"/api/study/artifacts/{artifact['id']}").status_code == 200


def test_chat_without_ready_owned_evidence_returns_insufficient_without_ai_call(
    registered_client: TestClient, csrf_headers: dict[str, str]
) -> None:
    provider = FakeProvider()
    registered_client.app.state.ai_provider = provider
    response = registered_client.post(
        "/api/study/chat",
        headers=csrf_headers,
        json={
            "question": "总结资料",
            "materialIds": ["not-owned"],
            "language": "zh",
            "beginnerMode": False,
            "retrievalMode": "semantic",
        },
    )
    assert response.status_code == 201
    assert response.json()["groundingStatus"] == "INSUFFICIENT"
    assert provider.calls == []
