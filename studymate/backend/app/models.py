from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from uuid import uuid4

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utc_now() -> datetime:
    return datetime.now(UTC)


def new_id() -> str:
    return uuid4().hex


class Base(DeclarativeBase):
    pass


class MaterialStatus(StrEnum):
    UPLOADING = "UPLOADING"
    PROCESSING = "PROCESSING"
    READY = "READY"
    FAILED = "FAILED"


class ProcessingStage(StrEnum):
    QUEUED = "QUEUED"
    EXTRACTING = "EXTRACTING"
    CHUNKING = "CHUNKING"
    EMBEDDING = "EMBEDDING"
    INDEXING = "INDEXING"
    COMPLETE = "COMPLETE"
    FAILED = "FAILED"


class MessageRole(StrEnum):
    USER = "USER"
    ASSISTANT = "ASSISTANT"


class GroundingStatus(StrEnum):
    GROUNDED = "GROUNDED"
    INSUFFICIENT = "INSUFFICIENT"
    NOT_APPLICABLE = "NOT_APPLICABLE"


class GeneratedContentType(StrEnum):
    SUMMARY = "SUMMARY"
    KEY_POINTS = "KEY_POINTS"
    QUIZ = "QUIZ"
    EXAM_REVIEW = "EXAM_REVIEW"


class QuizQuestionType(StrEnum):
    MULTIPLE_CHOICE = "MULTIPLE_CHOICE"
    TRUE_FALSE = "TRUE_FALSE"
    SHORT_ANSWER = "SHORT_ANSWER"


enum_args = {"native_enum": False, "length": 32}


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(191), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(191))
    email: Mapped[str] = mapped_column(String(191), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column("passwordHash", String(191))

    materials: Mapped[list[Material]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    jobs: Mapped[list[ProcessingJob]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    conversations: Mapped[list[Conversation]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    generated_content: Mapped[list[GeneratedContent]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    quizzes: Mapped[list[Quiz]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Material(TimestampMixin, Base):
    __tablename__ = "materials"
    __table_args__ = (Index("ix_materials_user_status_created", "userId", "status", "createdAt"),)

    id: Mapped[str] = mapped_column(String(191), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(
        "userId", ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    original_name: Mapped[str] = mapped_column("originalName", String(512))
    stored_name: Mapped[str] = mapped_column("storedName", String(512))
    storage_path: Mapped[str] = mapped_column("storagePath", String(1024))
    mime_type: Mapped[str] = mapped_column("mimeType", String(191))
    extension: Mapped[str] = mapped_column(String(32))
    size: Mapped[int] = mapped_column(Integer)
    checksum: Mapped[str] = mapped_column(String(128))
    status: Mapped[MaterialStatus] = mapped_column(
        Enum(MaterialStatus, **enum_args), default=MaterialStatus.PROCESSING
    )
    chunk_count: Mapped[int] = mapped_column("chunkCount", Integer, default=0)
    processing_error: Mapped[str | None] = mapped_column(
        "processingError", String(191), nullable=True
    )

    user: Mapped[User] = relationship(back_populates="materials")
    job: Mapped[ProcessingJob | None] = relationship(
        back_populates="material", cascade="all, delete-orphan", uselist=False
    )


class ProcessingJob(TimestampMixin, Base):
    __tablename__ = "processing_jobs"
    __table_args__ = (
        Index("ix_processing_jobs_stage_locked_created", "stage", "lockedAt", "createdAt"),
        Index("ix_processing_jobs_user", "userId"),
    )

    id: Mapped[str] = mapped_column(String(191), primary_key=True, default=new_id)
    material_id: Mapped[str] = mapped_column(
        "materialId", ForeignKey("materials.id", ondelete="CASCADE"), unique=True
    )
    user_id: Mapped[str] = mapped_column("userId", ForeignKey("users.id", ondelete="CASCADE"))
    stage: Mapped[ProcessingStage] = mapped_column(
        Enum(ProcessingStage, **enum_args), default=ProcessingStage.QUEUED
    )
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    max_attempts: Mapped[int] = mapped_column("maxAttempts", Integer, default=3)
    locked_at: Mapped[datetime | None] = mapped_column(
        "lockedAt", DateTime(timezone=True), nullable=True
    )
    locked_by: Mapped[str | None] = mapped_column("lockedBy", String(191), nullable=True)
    error_code: Mapped[str | None] = mapped_column("errorCode", String(191), nullable=True)

    material: Mapped[Material] = relationship(back_populates="job")
    user: Mapped[User] = relationship(back_populates="jobs")


class Conversation(TimestampMixin, Base):
    __tablename__ = "conversations"
    __table_args__ = (Index("ix_conversations_user_updated", "userId", "updatedAt"),)

    id: Mapped[str] = mapped_column(String(191), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column("userId", ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(512))

    user: Mapped[User] = relationship(back_populates="conversations")
    messages: Mapped[list[Message]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan"
    )


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (Index("ix_messages_conversation_created", "conversationId", "createdAt"),)

    id: Mapped[str] = mapped_column(String(191), primary_key=True, default=new_id)
    conversation_id: Mapped[str] = mapped_column(
        "conversationId", ForeignKey("conversations.id", ondelete="CASCADE")
    )
    role: Mapped[MessageRole] = mapped_column(Enum(MessageRole, **enum_args))
    content: Mapped[str] = mapped_column(Text)
    sources: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    grounding_status: Mapped[GroundingStatus] = mapped_column(
        "groundingStatus", Enum(GroundingStatus, **enum_args)
    )
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), default=utc_now
    )

    conversation: Mapped[Conversation] = relationship(back_populates="messages")


class GeneratedContent(TimestampMixin, Base):
    __tablename__ = "generated_content"
    __table_args__ = (
        Index("ix_generated_content_user_type_created", "userId", "type", "createdAt"),
    )

    id: Mapped[str] = mapped_column(String(191), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column("userId", ForeignKey("users.id", ondelete="CASCADE"))
    type: Mapped[GeneratedContentType] = mapped_column(Enum(GeneratedContentType, **enum_args))
    title: Mapped[str] = mapped_column(String(512))
    material_ids: Mapped[list[str]] = mapped_column("materialIds", JSON)
    content: Mapped[dict[str, object]] = mapped_column(JSON)

    user: Mapped[User] = relationship(back_populates="generated_content")


class Quiz(TimestampMixin, Base):
    __tablename__ = "quizzes"
    __table_args__ = (Index("ix_quizzes_user_created", "userId", "createdAt"),)

    id: Mapped[str] = mapped_column(String(191), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column("userId", ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(512))
    difficulty: Mapped[str] = mapped_column(String(32))
    question_count: Mapped[int] = mapped_column("questionCount", Integer)
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    material_ids: Mapped[list[str]] = mapped_column("materialIds", JSON)

    user: Mapped[User] = relationship(back_populates="quizzes")
    questions: Mapped[list[QuizQuestion]] = relationship(
        back_populates="quiz", cascade="all, delete-orphan"
    )


class QuizQuestion(TimestampMixin, Base):
    __tablename__ = "quiz_questions"
    __table_args__ = (Index("ix_quiz_questions_quiz", "quizId"),)

    id: Mapped[str] = mapped_column(String(191), primary_key=True, default=new_id)
    quiz_id: Mapped[str] = mapped_column("quizId", ForeignKey("quizzes.id", ondelete="CASCADE"))
    question: Mapped[str] = mapped_column(Text)
    type: Mapped[QuizQuestionType] = mapped_column(Enum(QuizQuestionType, **enum_args))
    options: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    correct_answer: Mapped[str] = mapped_column("correctAnswer", String(2048))
    user_answer: Mapped[str | None] = mapped_column("userAnswer", String(2048), nullable=True)
    explanation: Mapped[str] = mapped_column(Text)
    source_reference: Mapped[str] = mapped_column("sourceReference", String(512))

    quiz: Mapped[Quiz] = relationship(back_populates="questions")
