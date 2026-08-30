from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

QuestionType = Literal["MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_ANSWER"]


class AliasModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class GenerateQuizInput(AliasModel):
    material_ids: list[str] = Field(alias="materialIds", min_length=1, max_length=50)
    language: Literal["en", "zh"] = "zh"
    difficulty: Literal["EASY", "MEDIUM", "HARD"] = "MEDIUM"
    question_count: int = Field(default=8, alias="questionCount", ge=2, le=20)
    question_types: list[QuestionType] = Field(
        default=["MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_ANSWER"],
        alias="questionTypes",
        min_length=1,
        max_length=3,
    )


class AnswerInput(AliasModel):
    question_id: str = Field(alias="questionId", min_length=1)
    answer: str = Field(max_length=2_000)


class SubmitQuizInput(AliasModel):
    answers: list[AnswerInput] = Field(min_length=1, max_length=20)


class GeneratedQuestion(AliasModel):
    question: str = Field(min_length=1, max_length=2_000)
    type: QuestionType
    options: list[str] | None = None
    correct_answer: str = Field(alias="correctAnswer", min_length=1, max_length=1_000)
    explanation: str = Field(min_length=1, max_length=2_000)
    source_reference: str = Field(alias="sourceReference", min_length=1, max_length=500)


class GeneratedQuiz(AliasModel):
    title: str = Field(min_length=1, max_length=120)
    questions: list[GeneratedQuestion] = Field(min_length=1, max_length=20)
