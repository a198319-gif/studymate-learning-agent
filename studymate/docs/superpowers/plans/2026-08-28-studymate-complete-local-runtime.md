# StudyMate Complete Local Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a persistent, fully interactive StudyMate local runtime at `http://127.0.0.1:4173` that needs no Docker, uses the real DeepSeek provider, and completes every approved MVP workflow.

**Architecture:** Existing Express routers and domain services remain the single business layer. A new local adapter package supplies atomic JSON repositories, a persistent local vector store, and an in-process material worker; the production Prisma/MySQL and Qdrant adapters remain unchanged. The same local Express process serves `/api` and the built React SPA.

**Tech Stack:** Node.js 24, Express 5, TypeScript 5.9, React 19, Vite 7, Vitest, Supertest, TanStack Query, Axios, bcrypt, JWT, Multer, DeepSeek Responses API.

**Spec:** `docs/superpowers/specs/2026-08-28-studymate-complete-local-runtime-design.md`

## Global Constraints

- Preserve the parent design at `docs/superpowers/specs/2026-08-25-studymate-learning-agent-design.md`.
- Keep `DEEPSEEK_API_KEY`, JWT secrets, password hashes, uploads, and `.local-data/` out of Git and the frontend bundle.
- Never use web search or invent page numbers; sources are validated filenames only.
- Every repository lookup and vector query must filter by authenticated `userId`.
- Correct quiz answers and explanations must not be returned before submission.
- Production MySQL/Qdrant entry points and Docker Compose must continue to build.
- Add a failing behavioral test and observe its expected failure before each production change.
- The current `.git` directory is read-only. Preserve commit checkpoints below as suggested commits; do not attempt them until Git becomes writable.

---

### Task 1: Make the DeepSeek tool loop compatible with `deepseek-v4-flash`

**Files:**
- Modify: `server/src/modules/study/grounded-study-agent.ts`
- Modify: `server/src/modules/study/deepseek-responses-provider.ts`
- Test: `server/tests/study.agent.test.ts`
- Test: `server/tests/deepseek-provider.test.ts`

**Interfaces:**
- Consumes: `ModelRequest`, `DeepSeekResponsesProvider.create`, and `GroundedStudyAgent.ask`.
- Produces: `ModelRequest.toolChoice: 'auto' | 'required' | 'none'`; source parsing that accepts one-line and two-line `SOURCES_JSON` footers.

- [ ] **Step 1: Add failing provider and agent tests**

```ts
it('accepts a two-line source footer', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
    status: 'completed',
    output: [{ type: 'message', content: [{ type: 'output_text', text: 'Answer\nSOURCES_JSON\n["notes.txt"]' }] }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  const provider = new DeepSeekResponsesProvider({ apiKey: 'test-key', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash', fetcher });
  await expect(provider.create({ instructions: 'Use sources.', input: [], tools: [], toolChoice: 'none' })).resolves.toEqual({
    output: [{ type: 'message', text: 'Answer', sources: ['notes.txt'] }],
  });
});

it('uses auto tool choice for the retrieval turn', async () => {
  const provider = new FakeProvider();
  provider.responses = [{ output: [] }];
  const agent = new GroundedStudyAgent(provider, new FakeRetrieval());
  await agent.ask({ userId: 'user-1', question: 'Explain memory.', materialIds: ['material-1'], language: 'en', beginnerMode: false });
  expect(provider.requests[0]?.toolChoice).toBe('auto');
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm --prefix server run test -- tests/deepseek-provider.test.ts tests/study.agent.test.ts`

Expected: the footer test returns no sources and the agent request contains `required`.

- [ ] **Step 3: Implement the minimal compatibility change**

```ts
export type ModelRequest = {
  instructions: string;
  input: ModelInput[];
  tools: ModelTool[];
  toolChoice: 'auto' | 'required' | 'none';
};

const match = /\nSOURCES_JSON\s*:?\s*(\[[^\n]*\])\s*$/.exec(text);

const first = await this.provider.create({
  instructions,
  input: initialInput,
  tools: [searchTool],
  toolChoice: 'auto',
});
```

- [ ] **Step 4: Run focused and full server tests**

Run: `npm --prefix server run test -- tests/deepseek-provider.test.ts tests/study.agent.test.ts`

Run: `npm --prefix server test`

Expected: all deterministic server tests pass and no test spends API credits.

- [ ] **Step 5: Record the suggested commit**

```text
fix: support DeepSeek thinking-mode tool calls
```

---

### Task 2: Add the versioned atomic LocalStore

**Files:**
- Create: `server/src/local/local-state.ts`
- Create: `server/src/local/local-store.ts`
- Test: `server/tests/local-store.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: Node `fs/promises`, `path`, and application record shapes.
- Produces: `LocalState`, `emptyLocalState()`, and `LocalStore.read()` / `LocalStore.update(mutator)` / `LocalStore.flush()`.

- [ ] **Step 1: Add failing persistence and serialization tests**

```ts
it('persists a mutation and reloads version 1 state', async () => {
  const userFixture = { id: 'user-1', name: 'Ada', email: 'ada@example.com', passwordHash: 'hash', createdAt: '2026-08-28T00:00:00.000Z', updatedAt: '2026-08-28T00:00:00.000Z' };
  const first = new LocalStore(statePath);
  await first.update((state) => { state.users.push(userFixture); });
  await first.flush();
  const second = new LocalStore(statePath);
  expect((await second.read()).users).toEqual([userFixture]);
});

it('serializes concurrent mutations without losing data', async () => {
  const userFixtureWithId = (id: string) => ({ id, name: id, email: `${id}@example.com`, passwordHash: 'hash', createdAt: '2026-08-28T00:00:00.000Z', updatedAt: '2026-08-28T00:00:00.000Z' });
  await Promise.all(Array.from({ length: 20 }, (_, index) =>
    store.update((state) => { state.users.push(userFixtureWithId(`user-${index}`)); })));
  expect((await store.read()).users).toHaveLength(20);
});

it('rejects an unknown state version', async () => {
  await writeFile(statePath, JSON.stringify({ version: 99 }));
  await expect(new LocalStore(statePath).read()).rejects.toMatchObject({ code: 'LOCAL_STATE_VERSION_UNSUPPORTED' });
});
```

- [ ] **Step 2: Run the LocalStore test and verify RED**

Run: `npm --prefix server run test -- tests/local-store.test.ts`

Expected: module resolution fails because `local-store.ts` does not exist.

- [ ] **Step 3: Implement validated state and atomic writes**

```ts
export const LOCAL_STATE_VERSION = 1;

export class LocalStore {
  private queue = Promise.resolve();
  async read(): Promise<LocalState> { return structuredClone(await this.load()); }
  async update<T>(mutator: (draft: LocalState) => T | Promise<T>): Promise<T> {
    const operation = this.queue.then(async () => {
      const draft = structuredClone(await this.load());
      const result = await mutator(draft);
      await this.atomicWrite(draft);
      return result;
    });
    this.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }
  async flush(): Promise<void> { await this.queue; }
}
```

Validate loaded JSON with Zod, write `${statePath}.tmp-${process.pid}`, then `rename` it over `statePath`.

- [ ] **Step 4: Ignore local user data and rerun tests**

```gitignore
.local-data/
```

Run: `npm --prefix server run test -- tests/local-store.test.ts`

Expected: all LocalStore tests pass.

- [ ] **Step 5: Record the suggested commit**

```text
feat: add atomic local application store
```

---

### Task 3: Implement local authentication, material, and processing repositories

**Files:**
- Create: `server/src/local/local-auth.repository.ts`
- Create: `server/src/local/local-material.repository.ts`
- Create: `server/src/local/local-processing.repository.ts`
- Test: `server/tests/local-repositories.test.ts`

**Interfaces:**
- Consumes: `UserRepository`, `MaterialRepository`, `ProcessingRepository`, `ProcessingJobRecord`, and `LocalStore`.
- Produces: `LocalUserRepository`, `LocalMaterialRepository`, and `LocalProcessingRepository.claimNext(workerId)`.

- [ ] **Step 1: Add failing real-service repository tests**

```ts
it('registers, reloads, and logs in a local user through AuthService', async () => {
  const auth = new AuthService(new LocalUserRepository(store), jwtSecret);
  await auth.register({ name: 'Ada', email: 'ADA@example.com', password: 'password123' });
  const reloaded = new AuthService(new LocalUserRepository(new LocalStore(statePath)), jwtSecret);
  await expect(reloaded.login({ email: 'ada@example.com', password: 'password123' }))
    .resolves.toMatchObject({ user: { email: 'ada@example.com' } });
});

it('does not return another users material', async () => {
  const repository = new LocalMaterialRepository(store);
  await repository.createWithJob(materialInput({ userId: 'user-a' }));
  expect(await repository.listByUser('user-b')).toEqual([]);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm --prefix server run test -- tests/local-repositories.test.ts`

Expected: local repository modules are missing.

- [ ] **Step 3: Implement repository adapters**

```ts
export class LocalUserRepository implements UserRepository {
  constructor(private readonly store: LocalStore) {}
  async findByEmail(email: string) { return (await this.store.read()).users.find((user) => user.email === email) ?? null; }
  async findById(id: string) { return (await this.store.read()).users.find((user) => user.id === id) ?? null; }
  async create(input: CreateUserInput) {
    return this.store.update((state) => {
      const user = localUserRecord(input);
      state.users.push(serializeUser(user));
      return user;
    });
  }
}

export interface ClaimableProcessingRepository extends ProcessingRepository {
  claimNext(workerId: string): Promise<ProcessingJobRecord | null>;
}
```

Material creation writes its material and queued job in one `LocalStore.update`. Claiming assigns a unique `lockOwner`; stage, complete, and fail mutations verify that owner. Records convert ISO strings to `Date` at repository boundaries.

- [ ] **Step 4: Rerun focused and auth/material route tests**

Run: `npm --prefix server run test -- tests/local-repositories.test.ts tests/auth.routes.test.ts tests/material.routes.test.ts`

Expected: local and existing route tests pass.

- [ ] **Step 5: Record the suggested commit**

```text
feat: add local auth and material repositories
```

---

### Task 4: Add persistent local vectors and the in-process worker

**Files:**
- Create: `server/src/local/local-vector-store.ts`
- Create: `server/src/local/local-worker.ts`
- Test: `server/tests/local-vector-store.test.ts`
- Test: `server/tests/local-worker.test.ts`

**Interfaces:**
- Consumes: `VectorStore`, `VectorChunk`, `MaterialProcessor`, `LocalProcessingRepository`, and `LocalStore`.
- Produces: `LocalVectorStore`, `LocalWorker.start()`, and `LocalWorker.stop()`.

- [ ] **Step 1: Add failing vector and worker tests**

```ts
it('filters vector search by user and selected material', async () => {
  await vectors.replaceMaterial([chunk('user-a', 'm1', [1, 0]), chunk('user-b', 'm2', [1, 0])]);
  const result = await vectors.search({ userId: 'user-a', materialIds: ['m1', 'm2'], vector: [1, 0], limit: 8, scoreThreshold: 0.3 });
  expect(result.map((item) => item.materialId)).toEqual(['m1']);
});

it('processes a queued TXT material to READY', async () => {
  await worker.tick();
  await expect(materials.findByIdForUser('m1', 'user-a')).resolves.toMatchObject({ status: 'READY', chunkCount: 1 });
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm --prefix server run test -- tests/local-vector-store.test.ts tests/local-worker.test.ts`

Expected: local vector and worker modules are missing.

- [ ] **Step 3: Implement cosine search and persistent vectors**

```ts
const cosine = (left: number[], right: number[]) => {
  const dot = left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
  const leftNorm = Math.sqrt(left.reduce((sum, value) => sum + value * value, 0));
  const rightNorm = Math.sqrt(right.reduce((sum, value) => sum + value * value, 0));
  return leftNorm && rightNorm ? dot / (leftNorm * rightNorm) : 0;
};
```

Persist vector mutations atomically. Filter by `userId` and `materialIds` before scoring, then apply threshold, descending score, and limit.

- [ ] **Step 4: Implement a condition-driven local worker**

```ts
export class LocalWorker {
  async tick(): Promise<boolean> {
    const job = await this.repository.claimNext(this.workerId);
    if (!job) return false;
    await this.processor.process(job);
    return true;
  }
  start(): void { this.timer = setInterval(() => void this.tick(), 500); }
  async stop(): Promise<void> { if (this.timer) clearInterval(this.timer); await this.store.flush(); }
}
```

- [ ] **Step 5: Run vector, processor, and worker tests**

Run: `npm --prefix server run test -- tests/local-vector-store.test.ts tests/material-processor.test.ts tests/local-worker.test.ts`

Expected: all tests pass with real local files and deterministic embeddings.

- [ ] **Step 6: Record the suggested commit**

```text
feat: process and search materials in local mode
```

---

### Task 5: Complete local study repositories and restore APIs

**Files:**
- Create: `server/src/local/local-chat.repository.ts`
- Create: `server/src/local/local-generation.repository.ts`
- Create: `server/src/local/local-quiz.repository.ts`
- Create: `server/src/modules/dashboard/dashboard.service.ts`
- Create: `server/src/modules/dashboard/dashboard.routes.ts`
- Create: `server/src/modules/dashboard/dashboard.repository.ts`
- Create: `server/src/local/local-dashboard.repository.ts`
- Modify: `server/src/modules/study/generation.service.ts`
- Modify: `server/src/modules/study/generation.repository.ts`
- Modify: `server/src/modules/study/study.routes.ts`
- Modify: `server/src/app.ts`
- Test: `server/tests/local-study-repositories.test.ts`
- Test: `server/tests/dashboard.routes.test.ts`

**Interfaces:**
- Consumes: `ChatRepository`, `GenerationRepository`, `QuizRepository`, and authenticated route middleware.
- Produces: persistent local study repositories; `GenerationRepository.get(id, userId)`; `GET /api/study/artifacts/:id`; `GET /api/dashboard`.

- [ ] **Step 1: Add failing persistence and ownership tests**

```ts
it('restores a local conversation with four messages after two turns', async () => {
  const id = await repository.saveTurn('user-a', undefined, 'First', groundedAnswer);
  await repository.saveTurn('user-a', id, 'Second', groundedAnswer);
  expect((await repository.getConversation('user-a', id))?.messages).toHaveLength(4);
});

it('returns 404 for another users artifact', async () => {
  const response = await userBAgent.get('/api/study/artifacts/artifact-a');
  expect(response.status).toBe(404);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm --prefix server run test -- tests/local-study-repositories.test.ts tests/dashboard.routes.test.ts`

Expected: local repositories and dashboard router are missing.

- [ ] **Step 3: Implement chat, generation, and quiz adapters**

Each adapter stores all authoritative fields from its service contract, maps ISO timestamps to `Date`, checks `userId` on every lookup, and uses one atomic mutation for a chat turn or quiz submission.

```ts
export interface GenerationRepository {
  readyMaterialIds(userId: string, materialIds: string[]): Promise<string[]>;
  save(artifact: Omit<GeneratedArtifact, 'id' | 'createdAt'>): Promise<GeneratedArtifact>;
  list(userId: string): Promise<GeneratedArtifact[]>;
  get(id: string, userId: string): Promise<GeneratedArtifact | null>;
}
```

- [ ] **Step 4: Add dashboard and artifact routes**

```ts
router.get('/artifacts/:id', asyncHandler(async (request, response) => {
  const session = response.locals.session as { sub: string };
  response.json({ artifact: await generation.get(session.sub, routeId(request.params.id)) });
}));

app.use('/api/dashboard', createDashboardRouter(dashboardService));
```

Dashboard output contains `materialCount`, `conversationCount`, `practiceQuestionCount`, `examReviewCount`, `quizAccuracy`, `recentMaterials`, and `recentConversations`, all user-owned.

- [ ] **Step 5: Run focused and full HTTP acceptance tests**

Run: `npm --prefix server run test -- tests/local-study-repositories.test.ts tests/dashboard.routes.test.ts tests/learning-flow.acceptance.test.ts`

Expected: repository, ownership, dashboard, and existing flow tests pass.

- [ ] **Step 6: Record the suggested commit**

```text
feat: persist local study activity and dashboard data
```

---

### Task 6: Compose and serve the complete local runtime

**Files:**
- Create: `server/src/local/index.ts`
- Create: `server/src/local/create-local-runtime.ts`
- Create: `server/tests/helpers/local-http.ts`
- Modify: `server/src/app.ts`
- Modify: `server/tsconfig.build.json`
- Modify: `server/package.json`
- Modify: `package.json`
- Test: `server/tests/local-runtime.acceptance.test.ts`

**Interfaces:**
- Consumes: all local adapters, existing services, `DeepSeekResponsesProvider`, and `createApp(options)`.
- Produces: `createLocalRuntime(options)`, test helpers `register`, `login`, `uploadTxt`, `waitForMaterial`, `askQuestion`, `listMaterials`, and `listConversations`, root scripts `local:build` and `local`, and one server on `127.0.0.1:4173`.

- [ ] **Step 1: Add a failing local-runtime HTTP acceptance test**

```ts
it('persists registration, upload, processing, chat, quiz, and login across restart', async () => {
  const first = await createLocalRuntime({ dataDirectory, provider: deterministicProvider });
  const session = await register(first.app, 'ada@example.com');
  const material = await uploadTxt(session, 'notes.txt', 'Spacing improves retention.');
  await waitForMaterial(session, material.id, 'READY');
  await askQuestion(session, material.id, 'What improves retention?');
  await first.close();

  const second = await createLocalRuntime({ dataDirectory, provider: deterministicProvider });
  const restored = await login(second.app, 'ada@example.com');
  expect(await listMaterials(restored)).toContainEqual(expect.objectContaining({ originalName: 'notes.txt', status: 'READY' }));
  expect(await listConversations(restored)).toHaveLength(1);
  await second.close();
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm --prefix server run test -- tests/local-runtime.acceptance.test.ts`

Expected: `createLocalRuntime` is missing.

- [ ] **Step 3: Add static SPA serving before the API 404 handler**

```ts
if (options.staticDirectory) {
  app.use(express.static(options.staticDirectory));
  app.use((request, response, next) => {
    if (request.method !== 'GET' || request.path.startsWith('/api/')) return next();
    response.sendFile(path.join(options.staticDirectory, 'index.html'));
  });
}
```

- [ ] **Step 4: Assemble local dependencies and lifecycle**

Use `.local-data/state.json`, `.local-data/vectors.json`, and `.local-data/uploads`. Start the worker only after state and vectors load. `close()` stops accepting requests, stops the worker, and flushes stores.

```ts
export type LocalRuntime = {
  app: Express;
  listen(port?: number): Promise<Server>;
  close(): Promise<void>;
};
```

- [ ] **Step 5: Add root commands**

```json
{
  "scripts": {
    "local:build": "npm run build",
    "local": "node server/dist/local/index.js"
  }
}
```

- [ ] **Step 6: Run acceptance, typecheck, and build**

Run: `npm --prefix server run test -- tests/local-runtime.acceptance.test.ts`

Run: `npm run typecheck && npm run build`

Expected: restart acceptance passes and `server/dist/local/index.js` exists.

- [ ] **Step 7: Record the suggested commit**

```text
feat: add complete self-contained local runtime
```

---

### Task 7: Complete authentication and materials UX

**Files:**
- Modify: `client/src/features/auth/LoginForm.tsx`
- Modify: `client/src/features/auth/RegisterForm.tsx`
- Modify: `client/src/layouts/AppShell.tsx`
- Modify: `client/src/features/materials/api.ts`
- Modify: `client/src/pages/MaterialsPage.tsx`
- Create: `client/src/components/ConfirmDialog.tsx`
- Create: `client/src/components/Toast.tsx`
- Test: `client/src/features/auth/RegisterForm.test.tsx`
- Test: `client/src/pages/MaterialsPage.test.tsx`
- Test: `client/src/components/ConfirmDialog.test.tsx`

**Interfaces:**
- Consumes: existing auth context and material endpoints.
- Produces: working registration flow, drag/drop upload with percentage, search/status/type filters, Study links, and accessible confirmation deletion.

- [ ] **Step 1: Add failing UI behavior tests**

```tsx
it('uploads a dropped file and shows progress', async () => {
  renderMaterials();
  fireEvent.drop(screen.getByRole('button', { name: /drop in a new study file/i }), {
    dataTransfer: { files: [new File(['notes'], 'notes.txt', { type: 'text/plain' })] },
  });
  expect(await screen.findByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
});

it('filters materials and links a ready file to study', async () => {
  renderMaterials();
  await userEvent.type(await screen.findByRole('searchbox'), 'memory');
  expect(screen.getByText('Memory.pdf')).toBeVisible();
  expect(screen.queryByText('Algorithms.pdf')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: /study memory.pdf/i })).toHaveAttribute('href', '/study?material=material-1');
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm --prefix client run test -- src/pages/MaterialsPage.test.tsx src/features/auth/RegisterForm.test.tsx`

Expected: no drop handler, progressbar, searchbox, filters, or Study link exists.

- [ ] **Step 3: Implement upload progress and filtering**

```ts
export async function uploadMaterial(file: File, onProgress?: (percent: number) => void): Promise<Material> {
  const form = new FormData();
  form.append('file', file);
  const response = await http.post<{ material: Material }>('/materials', form, {
    onUploadProgress: ({ loaded, total }) => onProgress?.(total ? Math.round((loaded / total) * 100) : 0),
  });
  return response.data.material;
}
```

Use `onDragOver`/`onDrop`, a search input, native filter selects, and derived filtered materials. Reset the file input after every selection so the same file can be retried.

- [ ] **Step 4: Implement dialog, toast, and auth cleanup**

Replace `window.confirm` with `ConfirmDialog`. Remove the out-of-scope Forgot password anchor. Submit top navigation logout through auth context, clear authenticated queries, and let `ProtectedRoute` navigate to `/login`.

- [ ] **Step 5: Run client tests**

Run: `npm --prefix client run test -- src/pages/MaterialsPage.test.tsx src/components/ConfirmDialog.test.tsx src/features/auth/RegisterForm.test.tsx`

Expected: authentication and material UI tests pass.

- [ ] **Step 6: Record the suggested commit**

```text
feat: complete account and material workflows
```

---

### Task 8: Complete AI Study and generated study aids

**Files:**
- Modify: `client/src/pages/StudyPage.tsx`
- Modify: `client/src/pages/StudyToolPage.tsx`
- Create: `client/src/pages/ArtifactPage.tsx`
- Modify: `client/src/features/study/api.ts`
- Modify: `client/src/app/router.tsx`
- Test: `client/src/pages/StudyPage.test.tsx`
- Create: `client/src/pages/StudyToolPage.test.tsx`
- Create: `client/src/pages/ArtifactPage.test.tsx`

**Interfaces:**
- Consumes: material query parameter, chat/generation endpoints, `GET /study/artifacts/:id`, and toast UI.
- Produces: material preselection, five quick actions, failed-message retry, copy/regenerate, and saved artifact restoration.

- [ ] **Step 1: Add failing study workflow tests**

```tsx
it('preselects the material query parameter', async () => {
  renderAt('/study?material=material-2');
  expect(await screen.findByRole('button', { name: /tutorial notes/i })).toHaveClass('source-option--active');
});

it('retries a failed question without losing its text', async () => {
  renderStudyWithRejectedFirstSend();
  await send('Explain recursion');
  await userEvent.click(await screen.findByRole('button', { name: /retry question/i }));
  expect(sendStudyMessage).toHaveBeenLastCalledWith(expect.objectContaining({ question: 'Explain recursion' }));
});

it('copies and regenerates a saved summary', async () => {
  renderSummary();
  await generateSummary();
  await userEvent.click(screen.getByRole('button', { name: /copy/i }));
  expect(await navigator.clipboard.readText()).toBe('Generated summary');
  await userEvent.click(screen.getByRole('button', { name: /regenerate/i }));
  expect(generateStudyArtifact).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm --prefix client run test -- src/pages/StudyPage.test.tsx src/pages/StudyToolPage.test.tsx src/pages/ArtifactPage.test.tsx`

Expected: quick action, retry, artifact page, copy, and regenerate assertions fail.

- [ ] **Step 3: Implement AI Study behavior**

Read `material` from search params and select it only if it is ready. Render Explain Simply, Summarize, Key Points, Generate Questions, and Exam Review actions. Store the failed question separately; Retry resubmits the same payload and Remove deletes the failed user bubble.

- [ ] **Step 4: Implement generated-aid behavior**

```ts
export async function getStudyArtifact(id: string): Promise<GeneratedArtifact> {
  const response = await http.get<{ artifact: GeneratedArtifact }>(`/study/artifacts/${id}`);
  return response.data.artifact;
}
```

Add Key Points to routing, sidebar, and configuration. Copy writes `artifact.text`; Regenerate reuses the last selected IDs, type, and language. Artifact History links open `/artifacts/:id`.

- [ ] **Step 5: Run the three page tests and full client suite**

Run: `npm --prefix client run test -- src/pages/StudyPage.test.tsx src/pages/StudyToolPage.test.tsx src/pages/ArtifactPage.test.tsx`

Run: `npm --prefix client test`

Expected: all client tests pass.

- [ ] **Step 6: Record the suggested commit**

```text
feat: complete grounded study and generation tools
```

---

### Task 9: Complete quiz configuration and scoring UX

**Files:**
- Modify: `server/src/modules/study/quiz.service.ts`
- Modify: `server/src/modules/study/quiz.routes.ts`
- Modify: `client/src/features/study/api.ts`
- Modify: `client/src/pages/QuizPage.tsx`
- Test: `server/tests/quiz.service.test.ts`
- Test: `client/src/pages/QuizPage.test.tsx`

**Interfaces:**
- Consumes: existing strict quiz JSON validation and one-time score submission.
- Produces: optional `questionTypes: QuizQuestionTypeValue[]` from client through route and service prompt, defaulting to all three types for backward compatibility; 5/10/15/20 question choices.

- [ ] **Step 1: Add failing service and page tests**

```ts
it('constrains generation to requested question types', async () => {
  await service.generate({ ...input, questionTypes: ['TRUE_FALSE'] });
  expect(agent.lastQuestion).toContain('Use only these question types: TRUE_FALSE');
});

it('offers 20 questions and a mixed type selector', async () => {
  renderQuiz();
  expect(await screen.findByRole('option', { name: '20' })).toBeInTheDocument();
  expect(screen.getByLabelText('Question type')).toHaveValue('MIXED');
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm --prefix server run test -- tests/quiz.service.test.ts`

Run: `npm --prefix client run test -- src/pages/QuizPage.test.tsx`

Expected: service input rejects `questionTypes`; page lacks 20 and Question type.

- [ ] **Step 3: Implement server validation and prompting**

```ts
const generateSchema = z.object({
  materialIds: z.array(z.string().min(1)).min(1).max(50),
  language: z.enum(['en', 'zh']).default('zh'),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).default('MEDIUM'),
  questionCount: z.number().int().min(2).max(20).default(8),
  questionTypes: z.array(z.enum(['MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER'])).min(1).max(3)
    .default(['MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER']),
});
```

`QuizService.generate` accepts optional `questionTypes` and resolves a missing value to all three types. Validate every returned question type is in the resolved set before persistence; retry once on mismatch.

- [ ] **Step 4: Implement the client selector**

Map `MIXED` to all three types and the individual labels to one type. Keep answers hidden before submission and existing score restoration unchanged.

- [ ] **Step 5: Run quiz and acceptance tests**

Run: `npm --prefix server run test -- tests/quiz.service.test.ts tests/learning-flow.acceptance.test.ts`

Run: `npm --prefix client run test -- src/pages/QuizPage.test.tsx`

Expected: service, page, and full flow pass.

- [ ] **Step 6: Record the suggested commit**

```text
feat: complete configurable quiz generation
```

---

### Task 10: Replace static Dashboard and inert navigation controls

**Files:**
- Create: `client/src/features/dashboard/api.ts`
- Modify: `client/src/pages/DashboardPage.tsx`
- Modify: `client/src/pages/HistoryPage.tsx`
- Modify: `client/src/layouts/AppShell.tsx`
- Modify: `client/src/app/router.tsx`
- Test: `client/src/pages/DashboardPage.test.tsx`
- Test: `client/src/pages/HistoryPage.test.tsx`
- Test: `client/src/layouts/AppShell.test.tsx`

**Interfaces:**
- Consumes: `GET /api/dashboard`, conversation/quiz/artifact history, and router navigation.
- Produces: authenticated live statistics, recent items, working Continue/View all/search navigation, and links to all restorable records.

- [ ] **Step 1: Add failing dynamic-control tests**

```tsx
it('renders API statistics and opens the latest conversation', async () => {
  renderDashboardWith({ materialCount: 3, conversationCount: 2, recentConversations: [conversation] });
  expect(await screen.findByText('3')).toBeVisible();
  expect(screen.getByRole('link', { name: /continue studying/i })).toHaveAttribute('href', '/study?conversation=conversation-1');
});

it('submits workspace search to materials', async () => {
  renderShell();
  await userEvent.type(screen.getByRole('searchbox'), 'memory{Enter}');
  expect(router.state.location.pathname).toBe('/materials');
  expect(router.state.location.search).toBe('?q=memory');
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm --prefix client run test -- src/pages/DashboardPage.test.tsx src/pages/HistoryPage.test.tsx src/layouts/AppShell.test.tsx`

Expected: static metrics and inert search fail the assertions.

- [ ] **Step 3: Implement dashboard API rendering**

```ts
export async function getDashboard(): Promise<DashboardData> {
  return (await http.get<DashboardData>('/dashboard')).data;
}
```

Use skeletons while loading, a retry state on failure, and real recent records. Use the current date at render time instead of hard-coded August 26.

- [ ] **Step 4: Implement navigation and history links**

Make View all a `/history` link, Continue a latest-conversation link, top search a form that navigates to `/materials?q=...`, and artifacts link to `/artifacts/:id`. Remove any remaining button without an observable action.

- [ ] **Step 5: Run focused and full client tests**

Run: `npm --prefix client run test -- src/pages/DashboardPage.test.tsx src/pages/HistoryPage.test.tsx src/layouts/AppShell.test.tsx`

Run: `npm --prefix client test`

Expected: all client tests pass.

- [ ] **Step 6: Record the suggested commit**

```text
feat: connect dashboard and history to live data
```

---

### Task 11: Run complete local browser acceptance and document delivery

**Files:**
- Create: `server/tests/fixtures/spaced-practice.txt`
- Create: `scripts/local-smoke.mjs`
- Modify: `README.md`
- Modify: `.env.example`
- Modify: `.github/workflows/ci.yml`
- Modify: `scripts/qa-preview.mjs`

**Interfaces:**
- Consumes: root `local:build` and `local` commands plus the complete UI/API.
- Produces: repeatable deterministic smoke test, documented local startup, CI coverage, and browser evidence.

- [ ] **Step 1: Add a failing black-box smoke script**

The script starts the built local server with a temporary data directory and deterministic provider, then performs register, upload, READY polling, chat, quiz generation/submission, history reads, logout, login, and persisted-data assertions through HTTP. It exits nonzero on any wrong status or missing field.

```js
assert.equal(register.status, 201);
assert.equal(ready.material.status, 'READY');
assert.equal(chat.groundingStatus, 'GROUNDED');
assert.equal(submitted.quiz.score, 50);
assert.equal(restored.materials.length, 1);
```

- [ ] **Step 2: Run and verify RED**

Run: `node scripts/local-smoke.mjs`

Expected: the script fails before the finalized start/test hooks are added.

- [ ] **Step 3: Complete README, environment, and CI commands**

Document:

```text
npm install
npm run local:build
npm run local
Open http://127.0.0.1:4173
```

Explain complete local, production-like, and fixed visual-fixture modes. Add `node scripts/local-smoke.mjs` to CI after build. Keep live DeepSeek testing opt-in.

- [ ] **Step 4: Run the full automated verification matrix**

Run: `npm run lint`

Run: `npm run typecheck`

Run: `npm test`

Run: `npm run build`

Run: `node scripts/local-smoke.mjs`

Run: `npm --prefix server audit --omit=dev --audit-level=high`

Run: `npm --prefix client audit --omit=dev --audit-level=high`

Run: `git diff --check`

Expected: every command exits 0; tests report zero failures; audits report zero high-severity vulnerabilities.

- [ ] **Step 5: Perform visible browser acceptance**

Start from a clean temporary local data directory and use the in-app browser to complete:

```text
Register → TXT upload → READY → grounded DeepSeek chat → summary → copy
→ typed quiz → submit → score/explanations → History restores all records
→ logout → login → persisted records
```

Repeat critical Materials, AI Study, Quiz, and History checks at 390 px. Read browser console errors after each workflow; expected result is an empty error list and no horizontal overflow.

- [ ] **Step 6: Scan for secrets and inert controls**

Run a repository scan for `sk-`, `DEEPSEEK_API_KEY=` with a nonempty value, and private local data. Inspect every rendered `button`, `a`, form, file input, select, and search control; each must have a tested action or be removed.

- [ ] **Step 7: Record the suggested commit**

```text
test: verify complete local StudyMate workflow
```

---

## Execution Notes

- Execute tasks in order because later tasks consume the local adapters and APIs created earlier.
- Keep each red-green cycle focused; do not combine unrelated UI and server fixes in one cycle.
- Do not run the live DeepSeek browser step until deterministic tests, type checks, and build pass.
- If a live provider test fails, record the HTTP status and provider error code without logging the key or uploaded content.
- If three attempted fixes fail for the same symptom, stop and reassess the architecture before another change.
