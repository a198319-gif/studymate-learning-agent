from pathlib import Path

from backend.app.db import Database
from backend.app.models import Base, Material, MaterialStatus, User
from sqlalchemy import inspect, select


def test_database_round_trip_and_user_cascade(tmp_path: Path) -> None:
    database = Database(f"sqlite:///{(tmp_path / 'studymate.db').as_posix()}")
    Base.metadata.create_all(database.engine)

    with database.session() as session:
        user = User(name="郭靖", email="guojing@example.com", password_hash="hash")
        material = Material(
            user=user,
            original_name="notes.txt",
            stored_name="notes.txt",
            storage_path="uploads/notes.txt",
            mime_type="text/plain",
            extension="txt",
            size=12,
            checksum="abc",
            status=MaterialStatus.READY,
        )
        session.add_all([user, material])
        session.commit()
        user_id = user.id

    with database.session() as session:
        stored = session.scalar(select(User).where(User.email == "guojing@example.com"))
        assert stored is not None
        assert stored.id == user_id
        session.delete(stored)
        session.commit()

    with database.session() as session:
        assert session.scalar(select(Material)) is None


def test_all_authoritative_tables_are_created(tmp_path: Path) -> None:
    database = Database(f"sqlite:///{(tmp_path / 'schema.db').as_posix()}")
    Base.metadata.create_all(database.engine)

    assert set(inspect(database.engine).get_table_names()) == {
        "users",
        "materials",
        "processing_jobs",
        "conversations",
        "messages",
        "generated_content",
        "quizzes",
        "quiz_questions",
    }
