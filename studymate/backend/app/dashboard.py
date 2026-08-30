from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from backend.app.db import get_session
from backend.app.models import (
    Conversation,
    GeneratedContent,
    GeneratedContentType,
    Material,
    Quiz,
    User,
)
from backend.app.security import get_current_user

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("")
def dashboard(
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, object]:
    material_count = (
        session.scalar(select(func.count(Material.id)).where(Material.user_id == user.id)) or 0
    )
    conversation_count = (
        session.scalar(select(func.count(Conversation.id)).where(Conversation.user_id == user.id))
        or 0
    )
    question_count, average_score = session.execute(
        select(func.sum(Quiz.question_count), func.avg(Quiz.score)).where(Quiz.user_id == user.id)
    ).one()
    exam_review_count = (
        session.scalar(
            select(func.count(GeneratedContent.id)).where(
                GeneratedContent.user_id == user.id,
                GeneratedContent.type == GeneratedContentType.EXAM_REVIEW,
            )
        )
        or 0
    )
    materials = session.scalars(
        select(Material)
        .where(Material.user_id == user.id)
        .order_by(Material.updated_at.desc(), Material.id.desc())
        .limit(4)
    ).all()
    conversations = session.scalars(
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .where(Conversation.user_id == user.id)
        .order_by(Conversation.updated_at.desc(), Conversation.id.desc())
        .limit(4)
    ).all()
    return {
        "materialCount": material_count,
        "conversationCount": conversation_count,
        "practiceQuestionCount": question_count or 0,
        "examReviewCount": exam_review_count,
        "quizAccuracy": round(average_score) if average_score is not None else None,
        "recentMaterials": [
            {
                "id": row.id,
                "originalName": row.original_name,
                "status": row.status.value,
                "size": row.size,
                "createdAt": row.created_at,
                "updatedAt": row.updated_at,
            }
            for row in materials
        ],
        "recentConversations": [
            {
                "id": row.id,
                "title": row.title,
                "updatedAt": row.updated_at,
                "messageCount": len(row.messages),
                "preview": row.messages[-1].content[:180] if row.messages else "",
            }
            for row in conversations
        ],
    }
