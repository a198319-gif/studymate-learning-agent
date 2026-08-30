# StudyMate Learning Agent — Approved Design

**Date:** 2026-08-25

**Status:** Approved for implementation planning

**Project type:** Full-stack university AI project

## 1. Product Summary

StudyMate is a responsive web application for university students. Students register, upload course materials, select one or more ready materials, and use a grounded AI study assistant for questions, summaries, key points, quizzes, explanations, and exam review.

The primary product rule is that material-specific output must be supported by the selected uploaded materials. If retrieval does not provide enough evidence, StudyMate returns the fixed refusal message instead of relying on general knowledge:

> The uploaded materials do not contain enough information to answer this question.

The Chinese equivalent is returned for Chinese interactions:

> 上传的学习资料中没有足够的信息回答这个问题。

The first release does not use web search, invent page numbers, or claim support from files that were not selected.

## 2. Approved Product Decisions

- The application runs locally first and remains deployable later.
- MySQL 8 and Qdrant run through Docker Compose with persistent volumes.
- The frontend uses React, Vite, TypeScript, Tailwind CSS, React Router, Axios, and Lucide React.
- The backend uses Node.js, Express, TypeScript, Prisma, MySQL, JWT, bcrypt, and Multer.
- DeepSeek replaces OpenAI as the model provider.
- The model integration uses the DeepSeek Responses API through a provider adapter.
- Retrieval is self-managed because DeepSeek does not execute the Responses API `file_search` tool.
- Embeddings are generated locally and stored in Qdrant.
- The approved visual direction is the “Modern Campus Notebook” concept: navy navigation, warm paper surfaces, colored index tabs, exam-tip annotations, and common-mistake callouts.
- GitHub provides version control and continuous integration after a remote repository is selected.
- Outside Agent may validate persona and refusal behavior during development, but it is not a production runtime dependency.
- Lovable informed the visual direction but does not replace the required React, Express, MySQL, and Qdrant architecture.

## 3. Scope

### Included

- Registration, login, logout, and authenticated routes.
- PDF, DOCX, PPTX, and TXT upload.
- Upload progress, validation, asynchronous processing, and processing status.
- Material listing, search, filtering, study selection, and deletion.
- Grounded AI chat over one or more selected materials.
- Beginner Mode and language-aware replies.
- Summary, key-point, quiz, and exam-review generation.
- Quiz answering, scoring, correct answers, explanations, and source filenames.
- Conversation and generated-content history.
- Responsive layouts, accessibility states, skeletons, toasts, empty states, and safe errors.
- Automated linting, type checks, unit tests, integration tests, end-to-end tests, and production builds.

### Excluded from the MVP

- Payments, social networking, voice chat, video generation, teacher/admin portals, native mobile apps, marketplaces, and web search.
- Automatic OCR for image-only scans.
- Claims of page-level sourcing. MVP citations show filenames only.
- Cloud object storage and distributed job queues.

## 4. System Architecture

```text
React / Vite / TypeScript
          │ REST + JWT cookie
          ▼
Express API
  ├── Auth module
  ├── Materials module
  ├── Study module
  ├── History module
  └── Agent orchestrator
          │
          ├── search_materials tool
          │      └── Qdrant vector retrieval
          │
          └── DeepSeek Responses API

Material-processing worker
  ├── File extraction
  ├── Text normalization
  ├── Token-aware chunking
  ├── Local embedding generation
  └── Qdrant upsert

MySQL 8
  └── Application records and processing jobs
```

The API and processing worker share service modules but run as separate processes. In development, `npm run dev` launches both through `concurrently`. This keeps uploads responsive while preserving the requested single backend startup command.

## 5. Repository Structure

```text
studymate/
├── client/
│   ├── src/
│   │   ├── components/
│   │   ├── features/
│   │   ├── hooks/
│   │   ├── layouts/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── types/
│   │   └── utils/
│   └── tests/
├── server/
│   ├── prisma/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── schemas/
│   │   ├── services/
│   │   ├── workers/
│   │   └── utils/
│   ├── storage/
│   └── tests/
├── docs/
├── .github/workflows/
├── docker-compose.yml
├── README.md
├── .env.example
└── .gitignore
```

Controllers translate HTTP input and output. Services own business rules. Provider adapters isolate DeepSeek, embedding, Qdrant, file extraction, and storage implementations. Express routes do not contain business logic.

## 6. Runtime Services

### Client

The client is a single-page React application. TanStack Query owns server data, polling, caching, and cache invalidation. React Context owns authentication and small UI state. React Hook Form and Zod own client-side form validation. Axios attaches credentials and maps API errors into typed client errors.

### API Server

The API server validates requests, authenticates users, enforces ownership, coordinates services, and returns safe responses. It does not perform heavy document processing inside request handlers.

### Processing Worker

The worker claims pending `ProcessingJob` rows, applies a database lease to prevent duplicate processing, extracts text, chunks it, generates embeddings, upserts vectors, and updates the material status. Jobs are idempotent and may retry a bounded number of times.

### MySQL

MySQL stores authoritative application state. It does not store the vector index.

### Qdrant

Qdrant stores one collection named `studymate_chunks`. Each point contains a 384-dimensional vector and the following payload:

```json
{
  "userId": "user-id",
  "materialId": "material-id",
  "chunkId": "chunk-id",
  "sourceName": "Topic 5.pdf",
  "chunkIndex": 0,
  "text": "normalized chunk text"
}
```

Keyword payload indexes are created for `userId`, `materialId`, and `chunkId`. Every retrieval and deletion query includes server-generated ownership filters.

### Local Embedding Provider

The worker uses `@huggingface/transformers` with `Xenova/multilingual-e5-small`. The model runs locally through ONNX, supports English and Chinese content, and produces 384-dimensional vectors. Documents use the `passage:` prefix and questions use the `query:` prefix. Vectors are normalized and compared with cosine distance.

The default model is configured through `EMBEDDING_MODEL=Xenova/multilingual-e5-small`. The first local run downloads model artifacts and then uses the configured cache directory.

### DeepSeek Provider

The default generation model is `deepseek-v4-flash`, configured through `DEEPSEEK_MODEL`. The provider uses the DeepSeek Responses API at `https://api.deepseek.com`. It registers only application-owned function tools. The `web_search` tool is never registered.

The provider is stateless. StudyMate persists conversations in MySQL and supplies the necessary recent conversation context on each request.

## 7. Data Model

### User

- `id`, `name`, `email`, `passwordHash`
- `createdAt`, `updatedAt`

Email is unique and normalized before storage.

### Material

- `id`, `userId`
- `originalName`, `storedName`, `storagePath`
- `mimeType`, `extension`, `size`, `checksum`
- `status`: `UPLOADING`, `PROCESSING`, `READY`, or `FAILED`
- `chunkCount`, `processingError`
- `createdAt`, `updatedAt`

`processingError` stores a stable application error code, never a raw stack trace or provider response.

### ProcessingJob

- `id`, `materialId`, `userId`
- `stage`: `QUEUED`, `EXTRACTING`, `CHUNKING`, `EMBEDDING`, `INDEXING`, `COMPLETE`, or `FAILED`
- `attempts`, `maxAttempts`, `lockedAt`, `lockedBy`, `errorCode`
- `createdAt`, `updatedAt`

### Conversation

- `id`, `userId`, `title`
- `createdAt`, `updatedAt`

### Message

- `id`, `conversationId`
- `role`: `USER` or `ASSISTANT`
- `content`
- `sources` as validated JSON
- `groundingStatus`: `GROUNDED`, `INSUFFICIENT`, or `NOT_APPLICABLE`
- `createdAt`

### GeneratedContent

- `id`, `userId`
- `type`: `SUMMARY`, `KEY_POINTS`, or `EXAM_REVIEW`
- `title`, `materialIds`, `content`
- `createdAt`, `updatedAt`

`content` and `materialIds` are JSON columns validated by application schemas before writes.

### Quiz

- `id`, `userId`, `title`, `difficulty`, `questionCount`, `score`
- `materialIds`
- `createdAt`, `updatedAt`

### QuizQuestion

- `id`, `quizId`
- `question`, `type`, `options`, `correctAnswer`, `userAnswer`
- `explanation`, `sourceReference`
- `createdAt`, `updatedAt`

Relations use cascading deletes where the child has no meaning without its parent. Material deletion additionally removes Qdrant vectors and the stored file before deleting the authoritative database record.

## 8. Authentication and Authorization

- Passwords are hashed with bcrypt.
- Authentication uses a signed JWT in an `httpOnly` cookie.
- The authentication cookie uses `SameSite=Lax`; production sets `Secure`.
- State-changing requests require an `X-CSRF-Token` header that matches a separate readable CSRF cookie (double-submit pattern).
- CORS allows only `CLIENT_URL` and includes credentials.
- `/api/auth/me` restores the authenticated user.
- All material and study endpoints require authentication.
- Services load materials with both `id` and `userId`; matching only by material ID is forbidden.
- Qdrant filter objects are constructed on the server and cannot be supplied directly by the client.

## 9. Upload and Indexing Flow

1. Multer streams the file into a temporary upload directory with a size limit.
2. The API checks the extension, declared MIME type, and file signature.
3. The API creates a `Material` and `ProcessingJob`, then moves the file to `storage/{userId}/{materialId}/{storedName}`.
4. The response returns the material in `PROCESSING` state.
5. The worker extracts text through a format-specific adapter:
   - PDF: `pdf-parse`
   - DOCX: `mammoth`
   - PPTX: `officeparser`
   - TXT: UTF-8 decoding with BOM and newline normalization
6. Normalization removes control characters, repeated whitespace, and empty runs without rewriting the source content.
7. A tokenizer-aware chunker creates chunks capped at 420 tokens with a 60-token overlap. It preserves paragraphs when possible.
8. The local embedding provider creates normalized vectors.
9. The worker replaces any existing points for the same `userId` and `materialId`, then upserts the new points.
10. The worker stores `chunkCount` and changes the material to `READY`.

Empty, encrypted, corrupted, or textless files fail with a safe user-facing processing message. OCR is outside the MVP.

## 10. Grounded Agent Flow

The DeepSeek provider exposes an application function tool named `search_materials` with an input schema containing the query and selected material IDs. The server ignores any model-provided user identity and injects the authenticated `userId` itself.

```text
Validate request and ownership
→ Save the user message
→ Send system instructions, recent history, and search tool to DeepSeek
→ Execute search_materials against Qdrant
→ Apply the grounding gate
→ Return tool results to DeepSeek when evidence is sufficient
→ Validate the final response
→ Save the assistant message and source filenames
```

The retrieval service embeds the question, filters by `userId` and selected `materialIds`, and requests the best matching chunks. Initial retrieval uses a configurable top-K of 8 and a score threshold calibrated with test fixtures. The implementation plan must include a retrieval-evaluation task before locking the production threshold.

### Grounding Gate

- No retrieved chunk or all scores below the configured threshold produces the fixed insufficient-information response without asking the model to improvise.
- The model receives only the retrieved text, source filenames, and instructions required for the requested task.
- Returned sources are intersected with the retrieved source set before storage or display.
- The MVP displays filenames only. It never generates page numbers.
- General chat unrelated to selected materials is not an MVP mode; study endpoints always require at least one ready material.

## 11. Generation Features

Summary, key points, quiz, and exam review share the retrieval and ownership pipeline. They differ only in their generation schema and prompt template.

- Summary returns sections for introduction, key concepts, definitions, formulas found in the source, and exam focus.
- Key points return importance groups and common mistakes supported by evidence.
- Quiz returns a strict schema for title and questions. Each question includes type, prompt, options when applicable, correct answer, explanation, and source filename.
- Exam review returns must-know concepts, definitions, algorithms, formulas present in the sources, likely question forms, common mistakes, quick review, and self-test.

DeepSeek structured output is validated with Zod. A schema failure receives one bounded repair attempt. A second failure returns a safe generation error and writes no partial artifact.

## 12. API Surface

### Authentication

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### Materials

- `POST /api/materials`
- `GET /api/materials`
- `GET /api/materials/:id`
- `DELETE /api/materials/:id`

### Study

- `POST /api/chat`
- `POST /api/study/summary`
- `POST /api/study/key-points`
- `POST /api/study/quiz`
- `POST /api/study/exam-review`
- `POST /api/quizzes/:id/submit`

### History

- `GET /api/history/conversations`
- `GET /api/history/conversations/:id`
- `GET /api/history/generated`
- `GET /api/history/quizzes`
- `GET /api/history/quizzes/:id`

List endpoints are paginated. Validation errors use stable application error codes.

## 13. Frontend Experience

### Visual System

- Navy navigation and warm ivory primary surfaces.
- Electric blue for primary actions.
- Saffron for exam tips, mint for trusted/ready states, and pale peach for common mistakes.
- Handwritten visual cues appear only in short annotations and section labels; body text uses a highly readable sans-serif.
- Lightweight paper and dotted-grid textures appear in limited areas.
- Lucide icons provide the icon system.
- Gradients, glassmorphism, emoji decoration, and excessive card grids are avoided.

### Layout

`PublicLayout` contains Login and Register. `AppShell` contains Dashboard, Materials, AI Study, Summary, Quiz, Exam Review, and History.

Desktop layouts retain the sidebar and a multi-column study workspace. Tablet layouts collapse contextual material selection. Mobile layouts use a navigation drawer, single-column content, and a bottom-anchored chat composer.

### State Management

- TanStack Query manages API data, cache invalidation, and material-status polling.
- React Context manages the authenticated session and small UI state.
- React Hook Form and Zod manage forms.
- Axios sends credentials and maps server error codes.

Every major workflow includes loading, empty, processing, ready, failed, success, and confirmation states. Keyboard focus, form labels, contrast, and reduced-motion preferences are included in the implementation acceptance checks.

## 14. Error Handling

The server uses a typed `AppError`, a central Express error handler, and request correlation IDs. Safe API responses contain an application error code, user-safe message, and request ID. Provider errors, stack traces, SQL errors, vector details, and secrets never reach the client.

Material jobs retry only transient failures and stop after the configured maximum. DeepSeek and Qdrant timeouts return retryable errors. Database writes use transactions where multiple authoritative records must change together.

Material deletion is idempotent:

1. Authenticate and verify ownership.
2. Delete Qdrant points filtered by `userId` and `materialId`.
3. Remove the stored file and now-empty material directory.
4. Delete the database material record and dependents.

If an external cleanup step fails, the record remains so the operation can be retried.

## 15. Security

- Bcrypt password hashing.
- JWT verification, secure cookie settings, and CSRF defenses.
- Strict request schemas and body-size limits.
- File-size, extension, MIME, and signature validation.
- Random server-side filenames and path traversal prevention.
- Helmet and an explicit CORS allowlist.
- Separate rate limits for authentication, uploads, chat, and generation.
- Ownership checks in both relational and vector access paths.
- Environment-only credentials and log redaction.
- No `DEEPSEEK_API_KEY` or JWT secret in frontend bundles.

Before implementation, the environment is checked for a DeepSeek credential without printing its value. If a credential exists, the user chooses whether to reuse it. If no credential exists, the user is asked to provide or create one through a secure method.

## 16. Testing Strategy

### Server

Vitest and Supertest cover registration, login, logout, unauthenticated access, ownership enforcement, upload validation, worker transitions, Qdrant filters, grounding refusal, structured output validation, quiz submission, and safe errors.

DeepSeek, Qdrant, filesystem, and embedding adapters are mockable. CI uses deterministic fakes and does not spend API credits. A separate manually invoked integration suite exercises real DeepSeek and local infrastructure when credentials are available.

### Client

Vitest and React Testing Library cover authentication forms, protected navigation, upload interaction, progress, polling, material selection, chat states, generation forms, quiz scoring, history opening, and responsive navigation behavior.

### End-to-End

Playwright covers the principal demonstration path:

```text
Register
→ Login
→ Upload fixture
→ Process fixture
→ Select material
→ Ask grounded question
→ Generate quiz
→ Submit answers
→ View score and explanation
```

### Retrieval Evaluation

A small fixture corpus includes relevant, irrelevant, Chinese, English, and adversarial questions. Tests assert that retrieval respects material selection and user isolation, returns the expected source for answerable questions, and triggers refusal for unsupported questions.

## 17. Development and Delivery

Docker Compose runs:

- `mysql:8` with a named volume.
- `qdrant/qdrant` with a named volume.

The application retains the requested commands:

```bash
cd server
npm install
npm run dev

cd client
npm install
npm run dev
```

Server scripts include Prisma generation and migration commands. The repository includes `.env.example`, seed data, fixture materials, and a complete README.

GitHub Actions runs on pushes and pull requests:

1. Install dependencies from lockfiles.
2. Lint client and server.
3. Run TypeScript checks.
4. Run unit and integration tests with service containers.
5. Build client and server production bundles.
6. Run the deterministic end-to-end smoke path where supported.

No secrets are committed. Real-provider integration tests are opt-in and use repository secrets only after the user configures them.

## 18. Environment Variables

```text
DATABASE_URL=
JWT_SECRET=
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
EMBEDDING_MODEL=Xenova/multilingual-e5-small
EMBEDDING_CACHE_DIR=.cache/embeddings
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=studymate_chunks
PORT=5000
CLIENT_URL=http://localhost:5173
MAX_UPLOAD_BYTES=26214400
```

## 19. Implementation Phases

1. Repository scaffold, tooling, Docker services, Prisma, and CI foundation.
2. Authentication and protected application shell.
3. Material upload, storage, worker, extraction, and processing UI.
4. Local embeddings, Qdrant indexing, retrieval evaluation, and deletion.
5. DeepSeek provider, agent tool loop, grounded chat, and refusal gate.
6. Summary, key points, quiz, scoring, and exam review.
7. History, demo seed data, accessibility, responsive polish, and error states.
8. Full verification, README, screenshots, and final acceptance audit.

Each phase ends with its relevant tests before the next phase begins.

## 20. Acceptance Mapping

The final acceptance audit verifies every requirement in the original project brief. Completion requires:

- All supported file types upload and reach a truthful terminal status.
- Different users cannot read, retrieve, or delete one another's materials.
- Grounded questions use only selected materials and unsupported questions refuse.
- English, Chinese, bilingual, and Beginner Mode behavior works.
- Summary, key points, quiz, explanations, scoring, and exam review work through the real backend.
- History persists and reopens generated content.
- Responsive UI includes loading, empty, processing, error, and confirmation states.
- Lint, type checks, tests, and production builds pass.
- The README enables a new developer to run the complete application.
- No secret is committed or included in the frontend bundle.

## 21. Principal Risks and Mitigations

- **Textless or malformed files:** fail safely and explain that readable text could not be extracted; OCR remains out of scope.
- **Embedding model download:** document the first-run download and cache the model locally.
- **Weak retrieval:** use fixture-based calibration, source-aware chunking, and a conservative grounding threshold.
- **Cross-user leakage:** enforce ownership before retrieval and filter every Qdrant query by authenticated `userId`.
- **Hallucinated citations:** intersect returned sources with retrieved sources and never expose model-created page numbers.
- **Structured-output drift:** validate with Zod, repair once, then fail safely.
- **Provider outage or rate limit:** time out, return a retryable error, and preserve consistent database state.
- **Large project scope:** implement in eight gated phases and keep optional features out of the MVP.

## 22. Design Completion

The approved design contains no unresolved product decisions. The implementation plan may select exact package versions after checking the current package registries and official documentation, but it must preserve the interfaces, boundaries, security guarantees, and user experience defined here.
