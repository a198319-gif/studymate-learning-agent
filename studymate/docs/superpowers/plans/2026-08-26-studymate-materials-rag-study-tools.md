# StudyMate Materials, RAG, and Study Tools Implementation Plan

> **Execution:** Continue with `superpowers:executing-plans`, use TDD for every behavior change, and run a review plus full verification at the end.

**Goal:** Complete the StudyMate MVP after the authenticated foundation: material ingestion, self-managed retrieval, DeepSeek Responses API orchestration, study generators, quiz scoring, history, and working responsive frontend flows.

**Architecture:** Express controllers remain thin. Material, retrieval, model, and persistence behavior sit behind interfaces so deterministic fakes cover CI without downloading models or spending API credits. MySQL remains authoritative; Qdrant contains only user-filtered chunks. A polling worker claims durable jobs. The client uses TanStack Query for all remote state and preserves the approved notebook design.

**Provider decision verified 2026-08-26:** DeepSeek officially exposes `POST /responses`; `deepseek-v4-flash` supports function tools and JSON Schema output. StudyMate registers only `search_materials` and never registers `web_search`.

## Task 7: Expand the Data Model and Runtime Contracts

- Add Material, ProcessingJob, Conversation, Message, GeneratedContent, Quiz, and QuizQuestion Prisma models and enums with ownership indexes and cascading relations.
- Add validated environment fields for uploads, Qdrant, embeddings, DeepSeek, retrieval top-K/threshold, and worker identity.
- Add dependencies for signature inspection, PDF/DOCX/PPTX extraction, Qdrant, and local transformers.
- Generate Prisma Client; add schema/contract tests before implementation where executable behavior exists.

## Task 8: Implement Secure Material CRUD and Upload

- Test extension/MIME/signature/size/path validation, ownership isolation, list pagination/search/status filters, and safe deletion ordering.
- Implement Multer temporary storage, random stored names, SHA-256 checksums, user-scoped directories, Material/ProcessingJob transaction creation, and truthful `PROCESSING` responses.
- Implement authenticated `POST|GET|DELETE /api/materials` routes with CSRF on mutations.
- Keep storage and vector deletion behind adapters; never accept a client-supplied ownership filter.

## Task 9: Implement Extraction, Chunking, and Durable Processing

- Test TXT normalization, paragraph-aware chunk overlap, terminal failures, bounded retries, and idempotent status transitions.
- Implement format adapters for PDF, DOCX, PPTX, and TXT.
- Implement worker leasing and the EXTRACTING → CHUNKING → EMBEDDING → INDEXING → COMPLETE flow.
- Store only stable processing error codes; delete partial vectors before retrying an index.

## Task 10: Implement Local Embeddings and Qdrant Retrieval

- Define EmbeddingProvider and VectorStore contracts plus deterministic fakes.
- Implement lazy local `multilingual-e5-small` loading, `passage:`/`query:` prefixes, normalization, and a configured cache.
- Implement Qdrant collection bootstrap, keyword payload indexes, filtered replacement/deletion, and top-K cosine search.
- Add retrieval fixtures proving selected-material and user isolation plus insufficient-evidence behavior.

## Task 11: Implement the DeepSeek Responses Agent and Grounding Gate

- Test request formation, absence of web search, function-call argument validation, authenticated user injection, source intersection, bilingual refusal, timeouts, and safe provider errors.
- Implement a native-fetch DeepSeek adapter for `/responses`, model `deepseek-v4-flash`, and a bounded `search_materials` tool loop.
- Persist user/assistant messages only through the conversation service.
- Skip the final model call when the grounding gate finds no qualifying evidence.

## Task 12: Implement Summary, Key Points, Quiz, Exam Review, and History APIs

- Test ownership, structured schema validation, one repair attempt, no partial writes, quiz scoring, and paginated history.
- Implement shared grounded generation orchestration with feature-specific Zod schemas and prompts.
- Implement quiz persistence/submission and generated-content/conversation history routes.

## Task 13: Implement the Materials Frontend

- Test upload validation/progress, polling, search/filter, selection, failure states, empty states, and delete confirmation.
- Replace `/materials` placeholder with a responsive library and upload dropzone.
- Add shared material selection state for study tools.

## Task 14: Implement Chat and Study Tool Frontends

- Test grounded chat states, sources, Beginner Mode, language choice, generation forms, quiz answering/scoring, and retryable errors.
- Replace AI Study, Summary, Quiz, and Exam Review placeholders with working API-backed pages.
- Use a bottom-anchored mobile composer and keyboard-accessible material selector.

## Task 15: Implement History and Final UX States

- Test opening conversations, generated artifacts, and quizzes from paginated history.
- Replace History placeholder; add loading skeletons, toasts, confirmations, empty/failed/success states, focus management, and reduced-motion behavior.

## Task 16: Final Verification and Delivery

- Add deterministic E2E fixtures and the principal register → upload → process → chat → quiz → score → history path.
- Update CI, seed fixtures, `.env.example`, and README for the complete app.
- Run lint, typecheck, unit/integration tests, build, dependency audit, secret scan, and browser responsive QA.
- Run real DeepSeek/Qdrant integration only when credentials and Docker are available; otherwise report those exact environmental limits without weakening deterministic acceptance tests.
