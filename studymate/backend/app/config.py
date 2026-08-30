from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(PROJECT_ROOT / ".env", PROJECT_ROOT / "backend" / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    environment: str = Field(default="development", validation_alias="NODE_ENV")
    database_url: str = Field(
        default=f"sqlite:///{(PROJECT_ROOT / '.local-data' / 'studymate.db').as_posix()}",
        validation_alias="DATABASE_URL",
    )
    jwt_secret: str = Field(
        default="local-development-secret-change-me-123456",
        min_length=32,
        validation_alias="JWT_SECRET",
    )
    client_url: str = Field(default="http://localhost:5173", validation_alias="CLIENT_URL")
    port: int = Field(default=5000, ge=1, le=65535, validation_alias="PORT")
    local_port: int = Field(default=4173, ge=1, le=65535, validation_alias="LOCAL_PORT")
    data_directory: Path = Field(
        default=PROJECT_ROOT / ".local-data",
        validation_alias=AliasChoices("DATA_DIRECTORY", "LOCAL_DATA_DIR"),
    )
    local_client_directory: Path = Field(
        default=PROJECT_ROOT / "client" / "dist",
        validation_alias="LOCAL_CLIENT_DIR",
    )
    max_upload_bytes: int = Field(
        default=25 * 1024 * 1024,
        ge=1,
        validation_alias="MAX_UPLOAD_BYTES",
    )
    deepseek_api_key: str | None = Field(default=None, validation_alias="DEEPSEEK_API_KEY")
    deepseek_base_url: str = Field(
        default="https://api.deepseek.com", validation_alias="DEEPSEEK_BASE_URL"
    )
    deepseek_model: str = Field(default="deepseek-chat", validation_alias="DEEPSEEK_MODEL")
    retrieval_top_k: int = Field(default=8, ge=1, le=20, validation_alias="RETRIEVAL_TOP_K")
    retrieval_score_threshold: float = Field(
        default=0.35,
        ge=0,
        le=1,
        validation_alias="RETRIEVAL_SCORE_THRESHOLD",
    )
    vector_backend: Literal["local", "qdrant"] = Field(
        default="local", validation_alias="VECTOR_BACKEND"
    )
    qdrant_url: str = Field(default="http://localhost:6333", validation_alias="QDRANT_URL")
    qdrant_collection: str = Field(default="studymate_chunks", validation_alias="QDRANT_COLLECTION")
    secure_cookies: bool = False
    auto_create_schema: bool = False

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_driver(cls, value: object) -> object:
        if isinstance(value, str) and value.startswith("mysql://"):
            return value.replace("mysql://", "mysql+pymysql://", 1)
        return value


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
