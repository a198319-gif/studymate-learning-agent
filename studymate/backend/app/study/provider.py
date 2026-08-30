from __future__ import annotations

from typing import Protocol

import httpx

from backend.app.errors import AppError


class AIProvider(Protocol):
    def complete(
        self, *, system: str, prompt: str, json_schema: dict[str, object] | None = None
    ) -> str: ...


class DeepSeekProvider:
    def __init__(self, api_key: str | None, base_url: str, model: str) -> None:
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model

    def complete(
        self, *, system: str, prompt: str, json_schema: dict[str, object] | None = None
    ) -> str:
        if not self.api_key:
            raise AppError(
                503, "AI_PROVIDER_NOT_CONFIGURED", "Add DEEPSEEK_API_KEY to use AI Study."
            )
        payload: dict[str, object] = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.2,
            "max_tokens": 2000,
        }
        if json_schema is not None:
            payload["response_format"] = {"type": "json_object"}
        try:
            response = httpx.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json=payload,
                timeout=30,
            )
        except httpx.HTTPError as error:
            raise AppError(
                503, "AI_PROVIDER_UNAVAILABLE", "The study assistant is temporarily unavailable."
            ) from error
        if not response.is_success:
            raise AppError(
                503, "AI_PROVIDER_UNAVAILABLE", "The study assistant is temporarily unavailable."
            )
        try:
            content = response.json()["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError, ValueError) as error:
            raise AppError(
                502,
                "AI_PROVIDER_RESPONSE_INVALID",
                "The study assistant returned an invalid response.",
            ) from error
        if not isinstance(content, str) or not content.strip():
            raise AppError(
                502,
                "AI_PROVIDER_RESPONSE_INVALID",
                "The study assistant returned an invalid response.",
            )
        return content.strip()
