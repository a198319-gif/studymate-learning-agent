# StudyMate Python Backend Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the active Express/Prisma backend with a FastAPI/SQLAlchemy backend without breaking the React client or StudyMate's grounded-learning behavior.

**Architecture:** A new `backend/app` package exposes the existing `/api` contract through FastAPI. SQLAlchemy repositories use MySQL in production and SQLite for tests/local use; DeepSeek and Qdrant remain behind adapters, with deterministic local adapters supporting offline development. The TypeScript server stays in `server/` as a temporary rollback reference while root commands switch to Python after parity verification.

**Tech Stack:** Python 3.11+, FastAPI, Uvicorn, Pydantic 2, SQLAlchemy 2, Alembic, PyMySQL, PyJWT, bcrypt, httpx, qdrant-client, pypdf, python-docx, python-pptx, pytest

**Spec:** `docs/superpowers/specs/2026-08-29-python-backend-migration-design.md`

## Global Constraints

- Preserve all client-visible endpoint paths, JSON field names, status codes, cookies, and stable error codes.
- Keep React 19, TypeScript, Vite, MySQL, Qdrant, and DeepSeek.
- Never send `DEEPSEEK_API_KEY`, JWT secrets, SQL errors, provider payloads, or stack traces to the browser.
- Never answer a material-specific request from model knowledge when retrieval evidence is insufficient.
- Do not delete `server/`, `.local-data`, uploaded files, or existing user-owned changes during the migration.

---

### Task 1: FastAPI foundation and error contract

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/requirements.txt`
- Create: `backend/app/__init__.py`
- Create: `backend/app/config.py`
- Create: `backend/app/errors.py`
- Create: `backend/app/main.py`
- Test: `backend/tests/test_health.py`

**Interfaces:**
- Produces: `create_app(settings: Settings | None = None) -> FastAPI`
- Produces: `AppError(status_code: int, code: str, message: str)` and the JSON envelope `{error:{code,message,requestId}}`

- [ ] **Step 1: Write the failing health and not-found tests**

```python
def test_health_returns_request_id(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["requestId"]

def test_unknown_api_route_uses_safe_error(client):
    response = client.get("/api/missing")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"
```

- [ ] **Step 2: Run `pytest backend/tests/test_health.py -q` and confirm failure because `backend.app.main` does not exist**
- [ ] **Step 3: Implement settings loading, request IDs, CORS, security headers, health, and exception handlers**
- [ ] **Step 4: Run the health tests and confirm both pass**
- [ ] **Step 5: Commit foundation files if the repository baseline has been committed by the user**

### Task 2: SQLAlchemy schema and Alembic migration

**Files:**
- Create: `backend/app/db.py`
- Create: `backend/app/models.py`
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`
- Create: `backend/alembic/versions/20260829_01_initial.py`
- Test: `backend/tests/test_database.py`

**Interfaces:**
- Produces: `Database`, `get_session()`, and models `User`, `Material`, `ProcessingJob`, `Conversation`, `Message`, `GeneratedContent`, `Quiz`, `QuizQuestion`
- Consumes: `Settings.database_url`

- [ ] **Step 1: Write a failing SQLite round-trip test for a user, owned material, and cascade delete**
- [ ] **Step 2: Run the database test and confirm failure because models are missing**
- [ ] **Step 3: Implement typed SQLAlchemy 2.0 models mirroring `server/prisma/schema.prisma` and a session factory**
- [ ] **Step 4: Add an Alembic migration with MySQL-compatible JSON, indexes, unique email, and foreign-key cascades**
- [ ] **Step 5: Run the database test and an Alembic SQLite upgrade smoke test**

### Task 3: Cookie authentication and CSRF parity

**Files:**
- Create: `backend/app/auth/schemas.py`
- Create: `backend/app/auth/service.py`
- Create: `backend/app/auth/router.py`
- Create: `backend/app/security.py`
- Test: `backend/tests/test_auth.py`

**Interfaces:**
- Produces: `get_current_user() -> User`, `require_csrf()`, `AuthService.register`, `AuthService.login`
- Preserves: `studymate_session`, `studymate_csrf`, `X-CSRF-Token`

- [ ] **Step 1: Write failing tests for CSRF issuance, registration, duplicate email, login, `/me`, logout, and unauthenticated access**
- [ ] **Step 2: Run the auth tests and confirm expected route failures**
- [ ] **Step 3: Implement normalized email, bcrypt hashing, PyJWT cookies, double-submit CSRF, and stable errors**
- [ ] **Step 4: Run auth tests and confirm all pass without logging secrets**

### Task 4: Materials, extraction, and vector indexing

**Files:**
- Create: `backend/app/materials/schemas.py`
- Create: `backend/app/materials/service.py`
- Create: `backend/app/materials/router.py`
- Create: `backend/app/materials/extraction.py`
- Create: `backend/app/materials/embeddings.py`
- Create: `backend/app/materials/vector_store.py`
- Create: `backend/app/materials/worker.py`
- Test: `backend/tests/test_materials.py`
- Test: `backend/tests/test_extraction.py`

**Interfaces:**
- Produces: `MaterialService.upload/list/get/remove`, `extract_text`, `chunk_text`, `EmbeddingProvider`, `VectorStore`, and lifespan-managed `MaterialWorker`
- Consumes: authenticated user ID and SQLAlchemy sessions

- [ ] **Step 1: Write failing tests for TXT upload, invalid extension/signature, ownership, list/get/delete, empty text, and chunk overlap**
- [ ] **Step 2: Run targeted tests and confirm failures because material routes are absent**
- [ ] **Step 3: Implement safe filenames, 25 MB limit, PDF/DOCX/PPTX/TXT extraction, normalized chunks, and processing state transitions**
- [ ] **Step 4: Implement deterministic local embeddings, JSON local vectors, and Qdrant filtering by both user and selected material IDs**
- [ ] **Step 5: Run material and extraction tests, including worker completion and cleanup retry behavior**

### Task 5: DeepSeek grounded agent and generated artifacts

**Files:**
- Create: `backend/app/study/deepseek.py`
- Create: `backend/app/study/retrieval.py`
- Create: `backend/app/study/agent.py`
- Create: `backend/app/study/service.py`
- Create: `backend/app/study/router.py`
- Test: `backend/tests/test_agent.py`
- Test: `backend/tests/test_study.py`

**Interfaces:**
- Produces: `DeepSeekProvider.create`, `GroundedStudyAgent.run`, `ChatService`, `GenerationService`
- Preserves: fixed Chinese/English refusal, source filename intersection, `conversationId`, artifact response fields

- [ ] **Step 1: Write failing tests for forced `search_materials`, ownership-filtered retrieval, insufficient refusal, source allowlisting, provider failure, chat persistence, and generation persistence**
- [ ] **Step 2: Run agent/study tests and confirm expected failures**
- [ ] **Step 3: Implement `httpx` DeepSeek adapter and tool-call loop without registering web search**
- [ ] **Step 4: Implement the grounding gate, recent conversation context, safe provider errors, and summary/key-point/exam-review schemas**
- [ ] **Step 5: Run agent and study tests and confirm all pass with deterministic fakes**

### Task 6: Quizzes, history, and dashboard

**Files:**
- Create: `backend/app/quizzes/service.py`
- Create: `backend/app/quizzes/router.py`
- Create: `backend/app/dashboard/router.py`
- Test: `backend/tests/test_quizzes.py`
- Test: `backend/tests/test_dashboard.py`

**Interfaces:**
- Produces: quiz generation/submission/list/get and dashboard aggregate responses matching `client/src/features/study/api.ts` and `client/src/features/dashboard/api.ts`
- Consumes: `GroundedStudyAgent`, SQLAlchemy session, authenticated user

- [ ] **Step 1: Write failing tests for quiz validation, hidden answers before submit, scoring, duplicate submission, user isolation, history, and dashboard counts**
- [ ] **Step 2: Run targeted tests and confirm route failures**
- [ ] **Step 3: Implement quiz persistence and normalized case-insensitive scoring**
- [ ] **Step 4: Implement conversation/artifact history pagination and dashboard aggregates**
- [ ] **Step 5: Run quiz and dashboard tests and confirm all pass**

### Task 7: Local runtime, scripts, and client compatibility

**Files:**
- Create: `backend/app/local.py`
- Create: `backend/tests/test_local_runtime.py`
- Modify: `package.json`
- Modify: `.env.example`
- Modify: `docker-compose.yml`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `python -m backend.app.local` serving `/api` and `client/dist` on `127.0.0.1:4173`
- Preserves: root `npm run local`, `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`

- [ ] **Step 1: Write a failing local-runtime acceptance test covering register → upload → process → history → restart**
- [ ] **Step 2: Run it and confirm failure because the local runner is absent**
- [ ] **Step 3: Implement SQLite local storage, JSON local vectors, FastAPI lifespan worker, and SPA fallback**
- [ ] **Step 4: Switch root scripts and CI to Python while retaining explicit `legacy:*` Express scripts**
- [ ] **Step 5: Run Python tests plus existing React tests, lint, type checking, and production build**

### Task 8: Documentation and final parity verification

**Files:**
- Modify: `README.md`
- Create: `backend/README.md`
- Create: `scripts/python-live-check.py`

**Interfaces:**
- Documents: local setup, MySQL/Alembic deployment, Qdrant, DeepSeek configuration, test commands, and rollback to the legacy server

- [ ] **Step 1: Add runnable setup instructions using a workspace `.venv` and exact commands for Windows and Unix shells**
- [ ] **Step 2: Add a redacted live check that reads but never prints the DeepSeek key**
- [ ] **Step 3: Run `pytest`, React tests, lint, type checks, builds, migration smoke test, and local HTTP smoke test**
- [ ] **Step 4: Compare every endpoint and response field against the compatibility contract and fix any gap through a failing test first**
- [ ] **Step 5: Report the retained legacy directory and the exact command used to launch the Python application**

