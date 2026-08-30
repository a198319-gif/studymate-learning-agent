from __future__ import annotations

import json
from collections.abc import Sequence
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.app.db import get_session
from backend.app.errors import AppError
from backend.app.models import Quiz, QuizQuestion, QuizQuestionType, User
from backend.app.quiz.schemas import GeneratedQuiz, GenerateQuizInput, SubmitQuizInput
from backend.app.security import get_current_user, require_csrf
from backend.app.study.service import ask

router = APIRouter(prefix="/api/quizzes", tags=["quizzes"])


def _get_owned(session: Session, user_id: str, quiz_id: str) -> Quiz:
    quiz = session.scalar(
        select(Quiz)
        .options(selectinload(Quiz.questions))
        .where(Quiz.id == quiz_id, Quiz.user_id == user_id)
    )
    if quiz is None:
        raise AppError(404, "QUIZ_NOT_FOUND", "Quiz not found.")
    return quiz


def _public(quiz: Quiz) -> dict[str, object]:
    submitted = quiz.score is not None
    questions = []
    for item in quiz.questions:
        question: dict[str, object] = {
            "id": item.id,
            "question": item.question,
            "type": item.type.value,
            "options": item.options,
            "userAnswer": item.user_answer,
            "sourceReference": item.source_reference,
        }
        if submitted:
            question.update(correctAnswer=item.correct_answer, explanation=item.explanation)
        questions.append(question)
    return {
        "id": quiz.id,
        "title": quiz.title,
        "difficulty": quiz.difficulty,
        "questionCount": quiz.question_count,
        "score": quiz.score,
        "materialIds": quiz.material_ids,
        "createdAt": quiz.created_at,
        "questions": questions,
    }


def _schema(count: int, types: Sequence[str]) -> dict[str, object]:
    return {
        "type": "object",
        "required": ["title", "questions"],
        "properties": {
            "title": {"type": "string"},
            "questions": {
                "type": "array",
                "minItems": count,
                "maxItems": count,
                "items": {
                    "type": "object",
                    "required": [
                        "question",
                        "type",
                        "options",
                        "correctAnswer",
                        "explanation",
                        "sourceReference",
                    ],
                    "properties": {"type": {"type": "string", "enum": types}},
                },
            },
        },
    }


@router.post("", status_code=201, dependencies=[Depends(require_csrf)])
def generate_quiz(
    request: Request,
    data: GenerateQuizInput,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, object]:
    types = list(dict.fromkeys(data.question_types))
    prompt = (
        f"Create exactly {data.question_count} {data.difficulty.lower()} practice questions "
        "using only the selected materials. "
        f"Use only these types: {', '.join(types)}. Return JSON only with title and questions. "
        "Each question needs question, type, options, correctAnswer, explanation, "
        "and exact filename sourceReference."
    )
    invalid = ""
    for _attempt in range(3):
        result = ask(
            session,
            request.app.state.vector_store,
            request.app.state.ai_provider,
            request.app.state.settings,
            user_id=user.id,
            question=f"{prompt} {invalid}",
            material_ids=data.material_ids,
            language=data.language,
            beginner_mode=False,
            retrieval_mode="selected",
            json_schema=_schema(data.question_count, types),
        )
        if result["groundingStatus"] == "INSUFFICIENT":
            raise AppError(
                422,
                "QUIZ_EVIDENCE_INSUFFICIENT",
                "The selected materials do not contain enough information for a quiz.",
            )
        try:
            raw = str(result["answer"])
            start, end = raw.find("{"), raw.rfind("}")
            generated = GeneratedQuiz.model_validate(json.loads(raw[start : end + 1]))
            sources = set(result["sources"])
            valid = len(generated.questions) == data.question_count and all(
                item.type in types and item.source_reference in sources
                for item in generated.questions
            )
            if not valid:
                raise ValueError("Generated quiz does not match the request")
        except (ValueError, ValidationError, json.JSONDecodeError):
            invalid = (
                "Previous output was invalid; correct it and return JSON only: "
                f"{str(result['answer'])[:8000]}"
            )
            continue
        quiz = Quiz(
            user_id=user.id,
            title=generated.title,
            difficulty=data.difficulty,
            question_count=len(generated.questions),
            material_ids=list(dict.fromkeys(data.material_ids)),
        )
        session.add(quiz)
        session.flush()
        session.add_all(
            [
                QuizQuestion(
                    quiz_id=quiz.id,
                    question=item.question,
                    type=QuizQuestionType(item.type),
                    options=item.options,
                    correct_answer=item.correct_answer,
                    explanation=item.explanation,
                    source_reference=item.source_reference,
                )
                for item in generated.questions
            ]
        )
        session.commit()
        return {"quiz": _public(_get_owned(session, user.id, quiz.id))}
    raise AppError(
        502, "QUIZ_GENERATION_INVALID", "The quiz could not be generated in a valid format."
    )


@router.get("")
def list_quizzes(
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, object]:
    rows = session.scalars(
        select(Quiz)
        .options(selectinload(Quiz.questions))
        .where(Quiz.user_id == user.id)
        .order_by(Quiz.created_at.desc())
        .limit(100)
    ).all()
    return {"quizzes": [_public(row) for row in rows]}


@router.get("/{quiz_id}")
def get_quiz(
    quiz_id: str,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, object]:
    return {"quiz": _public(_get_owned(session, user.id, quiz_id))}


@router.post("/{quiz_id}/submit", dependencies=[Depends(require_csrf)])
def submit_quiz(
    quiz_id: str,
    data: SubmitQuizInput,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, object]:
    quiz = _get_owned(session, user.id, quiz_id)
    if quiz.score is not None:
        raise AppError(409, "QUIZ_ALREADY_SUBMITTED", "This quiz has already been submitted.")
    submitted = {item.question_id: item.answer for item in data.answers}
    correct = 0
    for question in quiz.questions:
        question.user_answer = submitted.get(question.id, "")
        if question.user_answer.strip().lower() == question.correct_answer.strip().lower():
            correct += 1
    quiz.score = round(correct / len(quiz.questions) * 100)
    session.commit()
    return {"quiz": _public(quiz)}
