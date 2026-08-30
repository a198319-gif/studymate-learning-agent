from pathlib import Path

from backend.app.config import Settings
from backend.app.local import create_local_app
from fastapi.testclient import TestClient


def test_local_app_serves_built_frontend_and_spa_routes(tmp_path: Path) -> None:
    static = tmp_path / "dist"
    static.mkdir()
    (static / "index.html").write_text("<main>StudyMate Python</main>", encoding="utf-8")
    (static / "app.js").write_text("window.studymate=true", encoding="utf-8")
    settings = Settings(
        NODE_ENV="test",
        DATABASE_URL=f"sqlite:///{(tmp_path / 'local.db').as_posix()}",
        JWT_SECRET="test-secret-that-is-at-least-thirty-two-characters",
        DATA_DIRECTORY=tmp_path / "data",
        LOCAL_CLIENT_DIR=static,
    )
    with TestClient(create_local_app(settings)) as client:
        assert "StudyMate Python" in client.get("/dashboard").text
        assert client.get("/app.js").text == "window.studymate=true"
        assert client.get("/api/unknown").status_code == 404
