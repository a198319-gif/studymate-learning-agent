from __future__ import annotations

import json
import math
import os
import threading
from pathlib import Path
from typing import Protocol, TypedDict, cast
from uuid import NAMESPACE_URL, uuid5

from qdrant_client import QdrantClient, models

DIMENSIONS = 384


class StoredChunk(TypedDict):
    userId: str
    materialId: str
    sourceName: str
    chunkIndex: int
    text: str
    vector: list[float]


class VectorState(TypedDict):
    version: int
    dimensions: int
    chunks: list[StoredChunk]


class SearchResult(StoredChunk):
    score: float


class VectorStore(Protocol):
    def replace_material(
        self, user_id: str, material_id: str, source_name: str, chunks: list[str]
    ) -> None: ...

    def delete_material(self, user_id: str, material_id: str) -> None: ...

    def search(
        self, user_id: str, material_ids: list[str], query: str, limit: int = 6
    ) -> list[SearchResult]: ...


def _features(text: str) -> list[str]:
    words = [
        item.lower()
        for item in __import__("re").findall(r"[\w]+", text, flags=__import__("re").UNICODE)
    ]
    return [
        feature
        for word in words
        for feature in (
            [word] if len(word) < 3 else [word, *(word[i : i + 2] for i in range(len(word) - 1))]
        )
    ]


def embed(text: str) -> list[float]:
    vector = [0.0] * DIMENSIONS
    for token in _features(text):
        value = 2_166_136_261
        for character in token:
            value ^= ord(character)
            value = (value * 16_777_619) & 0xFFFFFFFF
        vector[value % DIMENSIONS] += 1.0 if value & 1 == 0 else -1.0
    magnitude = math.sqrt(sum(value * value for value in vector))
    return vector if magnitude == 0 else [value / magnitude for value in vector]


class LocalVectorStore:
    def __init__(self, path: Path) -> None:
        self.path = path
        self._lock = threading.RLock()

    def _load(self) -> VectorState:
        if not self.path.exists():
            return {"version": 1, "dimensions": DIMENSIONS, "chunks": []}
        return cast(VectorState, json.loads(self.path.read_text(encoding="utf-8")))

    def _write(self, state: VectorState) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(f".tmp-{os.getpid()}")
        temporary.write_text(json.dumps(state, ensure_ascii=False), encoding="utf-8")
        temporary.replace(self.path)

    def replace_material(
        self, user_id: str, material_id: str, source_name: str, chunks: list[str]
    ) -> None:
        with self._lock:
            state = self._load()
            stored = [
                item
                for item in state["chunks"]
                if item["userId"] != user_id or item["materialId"] != material_id
            ]
            stored.extend(
                StoredChunk(
                    userId=user_id,
                    materialId=material_id,
                    sourceName=source_name,
                    chunkIndex=index,
                    text=chunk,
                    vector=embed(f"passage: {chunk}"),
                )
                for index, chunk in enumerate(chunks)
            )
            state["chunks"] = stored
            self._write(state)

    def delete_material(self, user_id: str, material_id: str) -> None:
        with self._lock:
            state = self._load()
            state["chunks"] = [
                item
                for item in state["chunks"]
                if item["userId"] != user_id or item["materialId"] != material_id
            ]
            self._write(state)

    def search(
        self, user_id: str, material_ids: list[str], query: str, limit: int = 6
    ) -> list[SearchResult]:
        selected = set(material_ids)
        query_vector = embed(f"query: {query}")
        with self._lock:
            chunks = self._load()["chunks"]
        results = []
        for item in chunks:
            if item["userId"] != user_id or item["materialId"] not in selected:
                continue
            score = sum(
                left * right for left, right in zip(query_vector, item["vector"], strict=True)
            )
            results.append(SearchResult(**item, score=score))
        return sorted(results, key=lambda item: item["score"], reverse=True)[:limit]


class QdrantVectorStore:
    def __init__(self, client: QdrantClient, collection_name: str) -> None:
        self.client = client
        self.collection_name = collection_name

    def _ensure_collection(self) -> None:
        if self.client.collection_exists(self.collection_name):
            return
        self.client.create_collection(
            self.collection_name,
            vectors_config=models.VectorParams(size=DIMENSIONS, distance=models.Distance.COSINE),
        )

    @staticmethod
    def _filter(user_id: str, material_ids: list[str]) -> models.Filter:
        return models.Filter(
            must=[
                models.FieldCondition(key="userId", match=models.MatchValue(value=user_id)),
                models.FieldCondition(key="materialId", match=models.MatchAny(any=material_ids)),
            ]
        )

    def replace_material(
        self, user_id: str, material_id: str, source_name: str, chunks: list[str]
    ) -> None:
        self._ensure_collection()
        self.delete_material(user_id, material_id)
        self.client.upsert(
            self.collection_name,
            points=[
                models.PointStruct(
                    id=str(uuid5(NAMESPACE_URL, f"{user_id}:{material_id}:{index}")),
                    vector=embed(f"passage: {chunk}"),
                    payload={
                        "userId": user_id,
                        "materialId": material_id,
                        "sourceName": source_name,
                        "chunkIndex": index,
                        "text": chunk,
                    },
                )
                for index, chunk in enumerate(chunks)
            ],
            wait=True,
        )

    def delete_material(self, user_id: str, material_id: str) -> None:
        self._ensure_collection()
        self.client.delete(
            self.collection_name,
            points_selector=self._filter(user_id, [material_id]),
            wait=True,
        )

    def search(
        self, user_id: str, material_ids: list[str], query: str, limit: int = 6
    ) -> list[SearchResult]:
        if not material_ids:
            return []
        self._ensure_collection()
        response = self.client.query_points(
            self.collection_name,
            query=embed(f"query: {query}"),
            query_filter=self._filter(user_id, material_ids),
            limit=limit,
            with_payload=True,
        )
        results: list[SearchResult] = []
        for point in response.points:
            payload = point.payload or {}
            if not all(
                isinstance(payload.get(key), expected)
                for key, expected in {
                    "userId": str,
                    "materialId": str,
                    "sourceName": str,
                    "chunkIndex": int,
                    "text": str,
                }.items()
            ):
                continue
            results.append(
                SearchResult(
                    userId=str(payload["userId"]),
                    materialId=str(payload["materialId"]),
                    sourceName=str(payload["sourceName"]),
                    chunkIndex=int(payload["chunkIndex"]),
                    text=str(payload["text"]),
                    vector=[],
                    score=float(point.score),
                )
            )
        return results
