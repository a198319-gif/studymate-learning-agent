import json

from backend.tests.test_study import upload_ready_material
from fastapi.testclient import TestClient


class QuizProvider:
    def complete(
        self, *, system: str, prompt: str, json_schema: dict[str, object] | None = None
    ) -> str:
        if json_schema:
            return json.dumps(
                {
                    "title": "力学练习",
                    "questions": [
                        {
                            "question": "牛顿第二定律的公式是什么？",
                            "type": "SHORT_ANSWER",
                            "options": None,
                            "correctAnswer": "F=ma",
                            "explanation": "力等于质量乘以加速度。",
                            "sourceReference": "physics.txt",
                        },
                        {
                            "question": "质量不变时，力越大加速度越大。",
                            "type": "TRUE_FALSE",
                            "options": ["True", "False"],
                            "correctAnswer": "True",
                            "explanation": "由 F=ma 可知。",
                            "sourceReference": "physics.txt",
                        },
                    ],
                },
                ensure_ascii=False,
            )
        return '复习牛顿第二定律 F=ma。\nSOURCES_JSON:["physics.txt"]'


def test_generate_submit_and_restore_quiz(
    registered_client: TestClient, csrf_headers: dict[str, str]
) -> None:
    registered_client.app.state.ai_provider = QuizProvider()
    material_id = upload_ready_material(registered_client, csrf_headers)
    generated = registered_client.post(
        "/api/quizzes",
        headers=csrf_headers,
        json={
            "materialIds": [material_id],
            "language": "zh",
            "difficulty": "MEDIUM",
            "questionCount": 2,
            "questionTypes": ["SHORT_ANSWER", "TRUE_FALSE"],
        },
    )
    assert generated.status_code == 201
    quiz = generated.json()["quiz"]
    assert quiz["questionCount"] == 2
    assert "correctAnswer" not in quiz["questions"][0]

    submitted = registered_client.post(
        f"/api/quizzes/{quiz['id']}/submit",
        headers=csrf_headers,
        json={
            "answers": [
                {"questionId": quiz["questions"][0]["id"], "answer": "F=ma"},
                {"questionId": quiz["questions"][1]["id"], "answer": "False"},
            ]
        },
    )
    assert submitted.status_code == 200
    assert submitted.json()["quiz"]["score"] == 50
    assert submitted.json()["quiz"]["questions"][0]["correctAnswer"] == "F=ma"
    assert (
        registered_client.post(
            f"/api/quizzes/{quiz['id']}/submit",
            headers=csrf_headers,
            json={"answers": [{"questionId": quiz["questions"][0]["id"], "answer": "F=ma"}]},
        ).status_code
        == 409
    )
    assert registered_client.get(f"/api/quizzes/{quiz['id']}").status_code == 200
    assert registered_client.get("/api/quizzes").json()["quizzes"][0]["id"] == quiz["id"]


def test_dashboard_aggregates_python_backend_data(
    registered_client: TestClient, csrf_headers: dict[str, str]
) -> None:
    registered_client.app.state.ai_provider = QuizProvider()
    material_id = upload_ready_material(registered_client, csrf_headers)
    chat = registered_client.post(
        "/api/study/chat",
        headers=csrf_headers,
        json={
            "question": "解释定律",
            "materialIds": [material_id],
            "language": "zh",
            "beginnerMode": False,
            "retrievalMode": "selected",
        },
    )
    assert chat.status_code == 201
    review = registered_client.post(
        "/api/study/generate",
        headers=csrf_headers,
        json={"type": "EXAM_REVIEW", "materialIds": [material_id], "language": "zh"},
    )
    assert review.status_code == 201

    dashboard = registered_client.get("/api/dashboard")
    assert dashboard.status_code == 200
    data = dashboard.json()
    assert data["materialCount"] == 1
    assert data["conversationCount"] == 1
    assert data["examReviewCount"] == 1
    assert data["recentMaterials"][0]["originalName"] == "physics.txt"
