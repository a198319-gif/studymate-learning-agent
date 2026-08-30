from __future__ import annotations

import json
import re
from typing import TypedDict

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.config import Settings
from backend.app.materials.vectors import VectorStore
from backend.app.models import (
    Conversation,
    GeneratedContent,
    Material,
    MaterialStatus,
    MessageRole,
)
from backend.app.study.provider import AIProvider

PROMPTS = {
    "SUMMARY": (
        "Smart summary",
        "Create a concise, well-structured summary of the selected materials. "
        "Use headings and explain the main relationships.",
    ),
    "KEY_POINTS": (
        "Key points",
        "Extract the most important key points. Prioritize facts worth remembering "
        "and use a numbered list.",
    ),
    "EXAM_REVIEW": (
        "Exam review guide",
        "Create an exam review guide with high-value concepts, common confusions, "
        "and a revision checklist.",
    ),
}


class StudyAnswer(TypedDict):
    answer: str
    sources: list[str]
    groundingStatus: str


def _ready_ids(session: Session, user_id: str, requested: list[str]) -> list[str]:
    unique = list(dict.fromkeys(requested))
    owned = set(
        session.scalars(
            select(Material.id).where(
                Material.user_id == user_id,
                Material.id.in_(unique),
                Material.status == MaterialStatus.READY,
            )
        ).all()
    )
    return [item for item in unique if item in owned]


def _parse_answer(raw: str, allowed_sources: list[str]) -> tuple[str, list[str]]:
    match = re.search(r"\nSOURCES_JSON\s*:?\s*(\[[^\n]*\])\s*$", raw)
    text = raw[: match.start()].strip() if match else raw.strip()
    sources: list[str] = []
    if match:
        try:
            parsed = json.loads(match.group(1))
            if isinstance(parsed, list):
                sources = [
                    item for item in parsed if isinstance(item, str) and item in allowed_sources
                ]
        except ValueError:
            pass
    return text, list(dict.fromkeys(sources or allowed_sources))


def ask(
    session: Session,
    vectors: VectorStore,
    provider: AIProvider,
    settings: Settings,
    *,
    user_id: str,
    question: str,
    material_ids: list[str],
    language: str,
    beginner_mode: bool,
    retrieval_mode: str,
    history: list[dict[str, str]] | None = None,
    json_schema: dict[str, object] | None = None,
) -> StudyAnswer:
    ready_ids = _ready_ids(session, user_id, material_ids)
    chunks = vectors.search(user_id, ready_ids, question, settings.retrieval_top_k)
    if retrieval_mode == "semantic":
        chunks = [
            item for item in chunks if float(item["score"]) >= settings.retrieval_score_threshold
        ]
    if not chunks:
        return {
            "answer": "上传的学习资料中没有足够的信息回答这个问题。"
            if language == "zh"
            else (
                "The uploaded materials do not contain enough information to answer this question."
            ),
            "sources": [],
            "groundingStatus": "INSUFFICIENT",
        }
    allowed_sources = list(dict.fromkeys(str(item["sourceName"]) for item in chunks))
    evidence = "\n\n".join(f"[{item['sourceName']}]\n{item['text']}" for item in chunks)
    prior = "\n".join(
        f"{item['role']}: {item['content'][:10000]}" for item in (history or [])[-12:]
    )
    system = (
        "You are StudyMate. Answer only from the supplied evidence; "
        "never use web search or unsupported general knowledge. "
    )
    system += "Reply in Chinese. " if language == "zh" else "Reply in English. "
    if beginner_mode:
        system += "Use plain beginner-friendly language and a short example. "
    system += (
        'End with one line SOURCES_JSON:["exact filename"] containing only supporting filenames.'
    )
    prompt = f"Conversation history:\n{prior}\n\nQuestion:\n{question}\n\nEvidence:\n{evidence}"
    text, sources = _parse_answer(
        provider.complete(system=system, prompt=prompt, json_schema=json_schema),
        allowed_sources,
    )
    return {"answer": text, "sources": sources, "groundingStatus": "GROUNDED"}


def artifact_dict(row: GeneratedContent) -> dict[str, object]:
    content = row.content if isinstance(row.content, dict) else {}
    return {
        "id": row.id,
        "type": row.type.value,
        "title": row.title,
        "materialIds": row.material_ids,
        "text": content.get("text", ""),
        "sources": content.get("sources", []),
        "groundingStatus": content.get("groundingStatus", "INSUFFICIENT"),
        "createdAt": row.created_at,
    }


def conversation_detail(row: Conversation) -> dict[str, object]:
    return {
        "id": row.id,
        "title": row.title,
        "updatedAt": row.updated_at,
        "messages": [
            {
                "id": message.id,
                "role": "user" if message.role == MessageRole.USER else "assistant",
                "content": message.content,
                "sources": message.sources or [],
                "groundingStatus": message.grounding_status.value,
                "createdAt": message.created_at,
            }
            for message in row.messages
        ],
    }
