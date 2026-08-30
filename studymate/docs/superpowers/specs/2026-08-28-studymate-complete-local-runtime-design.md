# StudyMate Complete Local Runtime — Design Addendum

**Date:** 2026-08-28

**Status:** Approved in chat for implementation planning

**Parent design:** `docs/superpowers/specs/2026-08-25-studymate-learning-agent-design.md`

## 1. Problem and Goal

The production-oriented StudyMate implementation already contains authenticated Express routes, Prisma repositories, document processing, vector retrieval, DeepSeek integration, structured quizzes, and the React workspace. The page currently shown to the user is served by `scripts/qa-preview.mjs`, which returns fixed read data and a generic empty `204` response for most writes. Consequently, registration appears to submit but produces no user, protected navigation returns to `/login`, and upload, chat, generation, deletion, logout, and history restoration are not truthful demonstrations.

The goal of this addendum is to make the complete approved MVP usable on the current Windows machine without Docker while preserving the MySQL and Qdrant production path. A single documented command must start a persistent local runtime that serves the built React application and the real API. Registration, document processing, retrieval, DeepSeek generation, quizzes, and history must survive page reloads and server restarts.

## 2. Chosen Architecture

StudyMate gains a first-class `local` runtime selected by its own entry point rather than conditionals spread through production services.

```text
Browser — http://127.0.0.1:4173
  │
  ├── React production build
  └── /api
       └── existing Express routers and services
            ├── LocalStore repositories → .local-data/state.json
            ├── MaterialProcessor
            │    ├── existing PDF/DOCX/PPTX/TXT extraction
            │    ├── existing local embeddings
            │    └── LocalVectorStore → .local-data/vectors.json
            └── DeepSeekResponsesProvider → DeepSeek Responses API
```

The normal production entry points continue to use Prisma/MySQL and Qdrant. Local mode supplies repository and vector-store adapters through the service injection points already used by tests. It does not weaken authentication, CSRF, upload validation, ownership checks, grounding rules, or safe error responses.

`scripts/qa-preview.mjs` remains a visual fixture server only and is renamed in documentation as such. It is never presented as the working application again.

## 3. Local Persistence

`LocalStore` owns one versioned JSON state document containing users, materials, processing jobs, conversations, messages, generated artifacts, quizzes, and quiz questions. Passwords remain bcrypt hashes. The store serializes mutations through an in-process promise queue, writes a complete temporary file, and atomically renames it over the previous state file. Reads return copies rather than mutable references.

The local runtime is intentionally single-process. It does not claim distributed locking or multi-host durability. The state schema includes a version number and rejects unknown future versions with a safe startup error instead of corrupting data.

The local vector store persists validated chunk records and numeric vectors in a separate atomic JSON file. Search applies `userId` and selected `materialIds` filters before cosine scoring. Deleted materials remove both vector records and stored files. A restart reloads both application state and vectors, so ready materials remain searchable.

Both `.local-data/` and local uploaded files are ignored by Git. No API key, JWT secret, password hash, uploaded document, or generated user content is committed.

## 4. Processing Lifecycle

Uploading through the existing route creates a material in `PROCESSING` state and a queued local processing job. The local runtime starts one bounded polling worker in the same Node process. The worker uses the existing `MaterialProcessor`, extraction adapters, chunking, embedding provider, and failure codes.

The UI polls while any material is processing. Successful jobs become `READY` with a truthful chunk count. Invalid, empty, corrupted, encrypted, or unsupported documents become `FAILED` with a safe message. Processing never reports `READY` before vectors are stored.

The server shuts the worker down cleanly on `SIGINT` and `SIGTERM`, finishes no new jobs after shutdown begins, and flushes pending local-state writes before exit.

## 5. DeepSeek Compatibility

Live testing established the following behavior for `deepseek-v4-flash` on 2026-08-27:

- A normal Responses API request succeeds with the configured credential.
- Thinking mode rejects `tool_choice: "required"` with HTTP 400.
- `tool_choice: "auto"` follows the explicit instruction and emits the `search_materials` function call.
- The final answer may format the source footer as either `SOURCES_JSON:["file"]` or `SOURCES_JSON` followed by the JSON array on the next line.

The model request contract therefore permits `auto`. The grounded agent uses `auto` for the retrieval turn and still enforces retrieval server-side: if the model omits the tool call, StudyMate synthesizes the same safe search call from the user question and selected material IDs. The final response turn keeps tools disabled. Source parsing accepts the one-line and two-line footer forms, validates the JSON array, strips the footer from display text, and intersects names with retrieved sources.

Provider failures retain safe client messages while server diagnostics record only status, provider code, and request ID—never credentials or raw private material content.

## 6. Complete Product Workflows

### Authentication

- Register validates name, normalized email, password, and password confirmation; returns a user and authenticated cookie.
- Login validates credentials and restores the same local account after restart.
- Logout clears the session and protected-query cache.
- `/auth/me` returns only the authenticated user.
- The misleading password-reset link is removed because password reset and outbound email are outside the approved MVP.

### Materials

- The upload surface supports both browse and drag-and-drop.
- Axios reports upload percentage while bytes are being sent.
- Client and server validate extension, MIME/signature, and the 25 MB limit.
- Search matches filenames case-insensitively; filters cover file type and status.
- Each ready material has a Study action that opens AI Study with that material selected.
- Deletion uses an accessible in-app confirmation dialog, removes vectors and the stored file, and refreshes every dependent query.

### AI Study

- A query parameter may preselect a material from the library.
- Users may select one or many ready materials.
- Quick actions populate or submit Explain Simply, Summarize, Key Points, Generate Questions, and Exam Review prompts.
- The client derives reply language from the selected language control; bilingual requests remain valid model instructions.
- Multi-turn messages persist atomically and can be restored from History.
- Failed sends preserve the user's text with a retry affordance rather than silently losing it.

### Generated Study Aids

- Summary, Key Points, and Exam Review are separate routes using the shared generation service.
- Generated content is saved automatically by the backend.
- Copy copies only the generated text and gives visible success feedback.
- Regenerate repeats the last validated request.
- History reopens saved output in a dedicated readable view rather than only a collapsed preview.

### Quiz

- Setup supports 5, 10, 15, and 20 questions, easy/medium/hard difficulty, and multiple-choice/true-false/short-answer/mixed question types.
- The API passes the requested type mix into the validated DeepSeek prompt.
- Correct answers and explanations are absent before submission.
- Submission requires every answer, scores once, persists user answers, and restores the result from History.
- Creating another quiz clears only the current quiz form state, not saved history.

### Dashboard and Navigation

- Dashboard statistics, recent materials, recent conversations, quiz accuracy, and generated-review counts derive from authenticated API data.
- Continue studying opens the most recent conversation; View all opens History.
- The top search field submits to Materials with a filename query instead of being inert.
- Navigation includes Key Points alongside the existing approved study tools.
- Every visible button either performs its labeled action or is removed.

## 7. API Additions and Compatibility

Existing endpoint paths remain compatible. The following additions support complete UI behavior:

- `GET /api/dashboard` returns counts and recent user-owned records.
- `GET /api/study/artifacts/:id` restores one generated artifact owned by the user.
- Quiz generation accepts `questionTypes`, an array containing one or more of `MULTIPLE_CHOICE`, `TRUE_FALSE`, and `SHORT_ANSWER`.

List and detail responses never expose password hashes, storage paths, correct quiz answers before submission, provider payloads, or data owned by another user.

## 8. UI States and Accessibility

All workflows expose loading, empty, success, retryable error, and disabled states. Toasts announce successful upload, deletion, copy, generation, and logout. Destructive confirmation uses a focus-trapped dialog with Cancel and Delete buttons. Upload progress uses an accessible progress element. Keyboard focus returns to the initiating control after dialogs close. Reduced-motion preferences remain respected.

Desktop and 390 px mobile layouts must complete the same principal workflow without horizontal overflow. English UI copy remains consistent with the existing visual design; AI output language remains user-selectable.

## 9. Testing and Acceptance

Implementation follows red-green-refactor. Tests are added before each production change.

### Server tests

- LocalStore persistence, atomic mutation serialization, version rejection, and user isolation.
- Local repositories through real AuthService, MaterialService, ChatService, GenerationService, and QuizService behavior.
- Local vector replacement, deletion, ownership filters, and cosine ranking.
- Local worker transitions from upload through READY and FAILED.
- DeepSeek `auto` tool choice and both source-footer formats.
- Dashboard and artifact ownership routes.
- Full HTTP acceptance flow using the local runtime adapters.

### Client tests

- Registration returns a session and reaches Dashboard.
- Drag/drop, upload progress, polling, search, status filter, Study, and confirmation deletion.
- Chat quick actions, preselection, retry, and history restoration.
- Copy, regenerate, saved artifact restoration, question-type selection, scoring, and dynamic Dashboard navigation.
- No rendered interactive control is intentionally inert.

### Browser acceptance

The deliverable local server is started from a clean `.local-data` directory and exercised through:

```text
Register
→ upload a TXT fixture
→ wait for Ready
→ study the selected file with DeepSeek
→ generate and copy a summary
→ generate a typed quiz
→ submit answers and view explanations
→ open conversation, artifact, and quiz from History
→ log out
→ log in again
→ confirm persisted data
```

The same critical pages are inspected at desktop width and 390 px. Browser console errors must be empty. Lint, type checks, all deterministic tests, production builds, dependency audits, and a secret scan must pass before completion is claimed.

## 10. Commands and Delivery

The root scripts expose:

```text
npm run local:build
npm run local
```

`local:build` builds the client and server. `local` starts the single local server at `http://127.0.0.1:4173`. Production commands and Docker Compose remain documented separately.

The README clearly labels three modes:

1. Complete local mode: no Docker, persistent local adapters, real DeepSeek.
2. Production-like mode: MySQL, Qdrant, API, worker, and Vite.
3. Visual fixture mode: fixed UI data only, never used for functional demonstrations.

GitHub Actions runs deterministic local-adapter acceptance tests without a real provider key. Live DeepSeek verification remains opt-in and never prints the credential.

## 11. Non-Goals

This work does not add password-reset email, payments, web search, OCR, collaborative classrooms, cloud storage, distributed jobs, teacher administration, or mobile-native applications. It does not replace the production MySQL/Qdrant architecture; it adds a truthful self-contained runtime for local use and demonstration.

## 12. Completion Criteria

The work is complete only when the browser-visible application—not `qa-preview`—passes the full acceptance path, survives a server restart, contains no known inert controls in MVP pages, and maintains every security and grounding rule from the parent design.
