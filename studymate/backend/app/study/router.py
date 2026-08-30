from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.app.db import get_session
from backend.app.errors import AppError
from backend.app.models import (
    Conversation,
    GeneratedContent,
    GeneratedContentType,
    GroundingStatus,
    Message,
    MessageRole,
    User,
    utc_now,
)
from backend.app.security import get_current_user, require_csrf
from backend.app.study.schemas import ChatInput, GenerationInput
from backend.app.study.service import PROMPTS, artifact_dict, ask, conversation_detail

router = APIRouter(prefix="/api/study", tags=["study"])


@router.post("/chat", status_code=201, dependencies=[Depends(require_csrf)])
def chat(
    request: Request,
    data: ChatInput,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, object]:
    history: list[dict[str, str]] = []
    conversation = None
    if data.conversation_id:
        conversation = session.scalar(
            select(Conversation)
            .options(selectinload(Conversation.messages))
            .where(Conversation.id == data.conversation_id, Conversation.user_id == user.id)
        )
        if conversation is None:
            raise AppError(404, "CONVERSATION_NOT_FOUND", "Conversation not found.")
        history = [
            {
                "role": "user" if item.role == MessageRole.USER else "assistant",
                "content": item.content,
            }
            for item in conversation.messages[-12:]
        ]
    result = ask(
        session,
        request.app.state.vector_store,
        request.app.state.ai_provider,
        request.app.state.settings,
        user_id=user.id,
        question=data.question.strip(),
        material_ids=data.material_ids,
        language=data.language,
        beginner_mode=data.beginner_mode,
        retrieval_mode=data.retrieval_mode,
        history=history,
    )
    if conversation is None:
        conversation = Conversation(user_id=user.id, title=data.question.strip()[:80])
        session.add(conversation)
        session.flush()
    session.add(
        Message(
            conversation_id=conversation.id,
            role=MessageRole.USER,
            content=data.question.strip(),
            grounding_status=GroundingStatus.NOT_APPLICABLE,
        )
    )
    session.add(
        Message(
            conversation_id=conversation.id,
            role=MessageRole.ASSISTANT,
            content=str(result["answer"]),
            sources=result["sources"],
            grounding_status=GroundingStatus(str(result["groundingStatus"])),
        )
    )
    conversation.updated_at = utc_now()
    session.commit()
    return {"conversationId": conversation.id, **result}


@router.post("/generate", status_code=201, dependencies=[Depends(require_csrf)])
def generate(
    request: Request,
    data: GenerationInput,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, object]:
    title, instruction = PROMPTS[data.type]
    result = ask(
        session,
        request.app.state.vector_store,
        request.app.state.ai_provider,
        request.app.state.settings,
        user_id=user.id,
        question=instruction,
        material_ids=data.material_ids,
        language=data.language,
        beginner_mode=False,
        retrieval_mode="selected",
    )
    row = GeneratedContent(
        user_id=user.id,
        type=GeneratedContentType(data.type),
        title=title,
        material_ids=list(dict.fromkeys(data.material_ids)),
        content={
            "text": result["answer"],
            "sources": result["sources"],
            "groundingStatus": result["groundingStatus"],
        },
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return {"artifact": artifact_dict(row)}


@router.get("/history")
def history(
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, object]:
    rows = session.scalars(
        select(GeneratedContent)
        .where(GeneratedContent.user_id == user.id)
        .order_by(GeneratedContent.created_at.desc())
        .limit(100)
    ).all()
    return {"artifacts": [artifact_dict(row) for row in rows]}


@router.get("/artifacts/{artifact_id}")
def get_artifact(
    artifact_id: str,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, object]:
    row = session.scalar(
        select(GeneratedContent).where(
            GeneratedContent.id == artifact_id, GeneratedContent.user_id == user.id
        )
    )
    if row is None:
        raise AppError(404, "ARTIFACT_NOT_FOUND", "Generated artifact not found.")
    return {"artifact": artifact_dict(row)}


@router.get("/conversations")
def conversations(
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
    cursor: str | None = None,
) -> dict[str, object]:
    query = (
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .where(Conversation.user_id == user.id)
    )
    if cursor:
        anchor = session.scalar(
            select(Conversation).where(Conversation.id == cursor, Conversation.user_id == user.id)
        )
        if anchor:
            query = query.where(
                Conversation.updated_at <= anchor.updated_at, Conversation.id != anchor.id
            )
    rows = session.scalars(
        query.order_by(Conversation.updated_at.desc(), Conversation.id.desc()).limit(21)
    ).all()
    page = rows[:20]
    return {
        "conversations": [
            {
                "id": row.id,
                "title": row.title,
                "updatedAt": row.updated_at,
                "messageCount": len(row.messages),
                "preview": row.messages[-1].content[:180] if row.messages else "",
            }
            for row in page
        ],
        "nextCursor": page[-1].id if len(rows) > 20 else None,
    }


@router.get("/conversations/{conversation_id}")
def get_conversation(
    conversation_id: str,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, object]:
    row = session.scalar(
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .where(Conversation.id == conversation_id, Conversation.user_id == user.id)
    )
    if row is None:
        raise AppError(404, "CONVERSATION_NOT_FOUND", "Conversation not found.")
    return {"conversation": conversation_detail(row)}
