# StudyMate Python Backend Migration Design

**Date:** 2026-08-29

**Status:** Approved in chat

## Goal

Replace the active Node.js/Express backend with a Python backend while preserving the current React client, public REST contract, DeepSeek grounding rules, MySQL/Qdrant production architecture, and local single-command experience.

## Approved Architecture

- Keep `client/` unchanged except for configuration or contract fixes proven necessary by parity tests.
- Add a FastAPI application under `backend/` and make it the default backend in root scripts.
- Use SQLAlchemy 2.0 models and Alembic migrations. Production uses MySQL through `PyMySQL`; tests and the zero-infrastructure local runtime use SQLite.
- Keep Qdrant as the production vector store and provide a deterministic JSON vector store for local/offline use.
- Call DeepSeek through its OpenAI-compatible HTTP API with `httpx`; no OpenAI runtime dependency is required.
- Preserve the current cookie JWT, double-submit CSRF, ownership filtering, safe error envelope, upload validation, grounded refusal, generation, quiz, history, dashboard, and static-client routes.
- Keep `server/` temporarily as a legacy reference until the Python backend passes contract, client, lint, and build checks. Do not delete user data or the existing TypeScript implementation during this migration.

## Compatibility Contract

The Python backend must continue to serve these client-facing endpoints:

- `GET /api/health`
- `GET /api/auth/csrf`
- `POST /api/auth/register`, `/api/auth/login`, `/api/auth/logout`
- `GET /api/auth/me`
- `GET|POST /api/materials`, `GET|DELETE /api/materials/{id}`
- `POST /api/study/chat`, `POST /api/study/generate`
- `GET /api/study/history`, `/api/study/artifacts/{id}`
- `GET /api/study/conversations`, `/api/study/conversations/{id}`
- `GET|POST /api/quizzes`, `GET /api/quizzes/{id}`, `POST /api/quizzes/{id}/submit`
- `GET /api/dashboard`

Responses retain existing JSON field names and ISO date strings so the React client does not need a rewrite.

## Verification

- Python tests cover authentication, CSRF, ownership, materials, grounded chat, generation, quiz scoring, history, dashboard, persistence, and static SPA fallback.
- Existing React tests, lint, type checking, and production build remain green.
- A local smoke test starts FastAPI, registers a user, uploads a TXT fixture, waits for processing, asks a grounded question through a deterministic provider, and restores the created history after restart.

