from backend.app.materials.vectors import QdrantVectorStore
from qdrant_client import QdrantClient


def test_qdrant_vector_store_preserves_user_and_material_boundaries() -> None:
    store = QdrantVectorStore(QdrantClient(":memory:"), "studymate_test")
    store.replace_material("user-1", "material-1", "notes.txt", ["spacing improves memory"])
    store.replace_material("user-2", "material-2", "private.txt", ["private evidence"])

    results = store.search("user-1", ["material-1", "material-2"], "spacing memory", 8)
    assert [item["sourceName"] for item in results] == ["notes.txt"]

    store.delete_material("user-1", "material-1")
    assert store.search("user-1", ["material-1"], "spacing memory", 8) == []
