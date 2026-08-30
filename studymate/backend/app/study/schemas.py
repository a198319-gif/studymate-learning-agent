from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class StudyModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class ChatInput(StudyModel):
    question: str = Field(min_length=1, max_length=10_000)
    material_ids: list[str] = Field(alias="materialIds", min_length=1, max_length=50)
    conversation_id: str | None = Field(default=None, alias="conversationId")
    language: Literal["en", "zh"] = "zh"
    beginner_mode: bool = Field(default=False, alias="beginnerMode")
    retrieval_mode: Literal["semantic", "selected"] = Field(
        default="semantic", alias="retrievalMode"
    )


class GenerationInput(StudyModel):
    type: Literal["SUMMARY", "KEY_POINTS", "EXAM_REVIEW"]
    material_ids: list[str] = Field(alias="materialIds", min_length=1, max_length=50)
    language: Literal["en", "zh"] = "zh"
