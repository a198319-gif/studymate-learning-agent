# StudyMate Foundation and Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the runnable StudyMate monorepo foundation with MySQL/Qdrant Docker configuration, a tested Express authentication API, and a polished responsive React login/register application shell.

**Architecture:** The `client` and `server` remain separate npm projects. The server exposes cookie-based JWT REST endpoints through controller/service/repository boundaries and keeps Prisma behind a `UserRepository` interface. The client uses React Router, TanStack Query, Axios, React Hook Form, and Zod; the selected Modern Campus Notebook visual system is established before feature pages are added.

**Tech Stack:** Node.js 24+, npm 11+, React, Vite, TypeScript strict mode, Tailwind CSS, Express, Prisma, MySQL 8, Qdrant, JWT, bcrypt, Vitest, Supertest, React Testing Library, Docker Compose, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-25-studymate-learning-agent-design.md`

## Global Constraints

- Preserve separate `client` and `server` npm projects and the requested `npm run dev` commands.
- Use TypeScript strict mode and avoid `any`.
- Store the JWT only in an `httpOnly` cookie named `studymate_session`.
- Use `SameSite=Lax`; set `Secure` when `NODE_ENV=production`.
- Require `X-CSRF-Token` for state-changing `/api` requests using a double-submit token.
- Never place `DEEPSEEK_API_KEY`, `JWT_SECRET`, or database credentials in client code.
- Use `AppError` and safe error responses; never return stack traces.
- Use the selected Modern Campus Notebook visual language and Lucide icons.
- Do not add web search, payment, social, voice, or admin features.
- Run the relevant tests after each implementation change.

## Planned File Map

### Root

- `package.json`: convenience scripts that delegate to client and server.
- `.gitignore`: secrets, uploads, caches, builds, coverage, and dependencies.
- `.env.example`: shared environment contract without values.
- `docker-compose.yml`: MySQL 8 and Qdrant development services.
- `.github/workflows/ci.yml`: lint, typecheck, test, and build workflow.
- `README.md`: current foundation setup and run instructions.

### Server

- `server/package.json`: server scripts and dependencies.
- `server/tsconfig.json`: strict Node ESM TypeScript configuration.
- `server/eslint.config.js`, `server/.prettierrc.json`: quality rules.
- `server/prisma/schema.prisma`: MySQL `User` model.
- `server/src/app.ts`: Express application composition.
- `server/src/index.ts`: HTTP process entry point.
- `server/src/config/env.ts`: validated server environment.
- `server/src/config/prisma.ts`: singleton Prisma client.
- `server/src/middleware/authenticate.ts`: JWT verification.
- `server/src/middleware/csrf.ts`: double-submit CSRF enforcement.
- `server/src/middleware/errorHandler.ts`: safe centralized errors.
- `server/src/middleware/requestId.ts`: request correlation ID.
- `server/src/modules/auth/auth.controller.ts`: auth HTTP adapter.
- `server/src/modules/auth/auth.routes.ts`: auth route declarations.
- `server/src/modules/auth/auth.schemas.ts`: request and response schemas.
- `server/src/modules/auth/auth.service.ts`: registration/login/session rules.
- `server/src/modules/auth/user.repository.ts`: repository contract and Prisma implementation.
- `server/src/shared/app-error.ts`: typed application error.
- `server/src/shared/async-handler.ts`: rejected-promise forwarding.
- `server/src/shared/cookies.ts`: cookie option builders.
- `server/tests/health.test.ts`: health endpoint test.
- `server/tests/auth.service.test.ts`: auth service unit tests.
- `server/tests/auth.routes.test.ts`: auth HTTP tests.

### Client

- `client/package.json`: client scripts and dependencies.
- `client/tsconfig*.json`, `client/vite.config.ts`: Vite TypeScript setup.
- `client/eslint.config.js`, `client/.prettierrc.json`: quality rules.
- `client/src/main.tsx`: providers and app bootstrap.
- `client/src/app/router.tsx`: public/protected routing.
- `client/src/app/query-client.ts`: TanStack Query client.
- `client/src/styles/index.css`: Tailwind theme and notebook design tokens.
- `client/src/layouts/PublicLayout.tsx`: login/register composition.
- `client/src/layouts/AppShell.tsx`: responsive authenticated shell.
- `client/src/components/Brand.tsx`: StudyMate identity.
- `client/src/components/ProtectedRoute.tsx`: authenticated route gate.
- `client/src/features/auth/api.ts`: auth HTTP calls.
- `client/src/features/auth/AuthProvider.tsx`: session state.
- `client/src/features/auth/auth.schemas.ts`: form schemas.
- `client/src/features/auth/LoginForm.tsx`: login form.
- `client/src/features/auth/RegisterForm.tsx`: registration form.
- `client/src/pages/LoginPage.tsx`, `RegisterPage.tsx`, `DashboardPage.tsx`: initial routes.
- `client/src/services/http.ts`: Axios instance and CSRF handling.
- `client/src/test/setup.ts`: DOM test setup.
- `client/src/features/auth/AuthProvider.test.tsx`: session-state tests.
- `client/src/features/auth/LoginForm.test.tsx`: login tests.
- `client/src/features/auth/RegisterForm.test.tsx`: register tests.
- `client/src/layouts/AppShell.test.tsx`: responsive shell/navigation test.

---

### Task 1: Scaffold the Separate Client and Server Projects

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `docker-compose.yml`
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/eslint.config.js`
- Create: `server/.prettierrc.json`
- Create: `server/prisma/schema.prisma`
- Create: `client/package.json`
- Create: `client/tsconfig.json`
- Create: `client/tsconfig.app.json`
- Create: `client/tsconfig.node.json`
- Create: `client/vite.config.ts`
- Create: `client/eslint.config.js`
- Create: `client/.prettierrc.json`
- Create: `client/index.html`

**Interfaces:**
- Consumes: Node.js 24+, npm 11+, local workspace filesystem.
- Produces: independent `client` and `server` dependency graphs; root delegation scripts; MySQL/Qdrant development service names `mysql` and `qdrant`.

- [ ] **Step 1: Create package manifests and strict TypeScript configurations**

Use server scripts with these stable names:

```json
{
  "scripts": {
    "dev": "concurrently -k -n api,worker \"tsx watch src/index.ts\" \"tsx watch src/workers/index.ts\"",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "lint": "eslint .",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:seed": "tsx prisma/seed.ts"
  }
}
```

Use client scripts named `dev`, `build`, `lint`, `typecheck`, and `test`. Root scripts delegate through `npm --prefix client` and `npm --prefix server`.

- [ ] **Step 2: Install and lock dependencies**

Run:

```bash
npm install
npm --prefix server install
npm --prefix client install
```

Expected: root, server, and client `package-lock.json` files exist; installation exits 0.

- [ ] **Step 3: Add Docker Compose development services**

Define MySQL 8 with database `studymate`, healthcheck `mysqladmin ping`, port `3306`, and named volume `mysql_data`. Define Qdrant on ports `6333` and `6334` with named volume `qdrant_data`. Read the MySQL password from `${MYSQL_ROOT_PASSWORD:-studymate_local}` so no production secret is committed.

- [ ] **Step 4: Add the initial Prisma schema**

Create the required `User` model:

```prisma
model User {
  id           String   @id @default(cuid())
  name         String
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@map("users")
}
```

- [ ] **Step 5: Verify configuration parses**

Run:

```bash
npm --prefix server run typecheck
npm --prefix client run typecheck
docker compose config
```

Expected: TypeScript commands exit 0 after minimal `src/index.ts`, `src/workers/index.ts`, and `src/main.tsx` entry files are created; Docker config exits 0 when Docker Desktop is installed. If Docker is unavailable locally, record that exact environmental limitation and validate the Compose file in GitHub Actions.

- [ ] **Step 6: Commit the scaffold**

```bash
git add package.json package-lock.json .gitignore .env.example docker-compose.yml client server
git commit -m "chore: scaffold StudyMate client and server"
```

If the managed `.git` directory remains read-only, keep the files unstaged and report the blocked commit without altering repository permissions.

### Task 2: Build the Server Platform and Health Endpoint

**Files:**
- Create: `server/src/config/env.ts`
- Create: `server/src/config/prisma.ts`
- Create: `server/src/shared/app-error.ts`
- Create: `server/src/shared/async-handler.ts`
- Create: `server/src/middleware/requestId.ts`
- Create: `server/src/middleware/errorHandler.ts`
- Create: `server/src/app.ts`
- Create: `server/src/index.ts`
- Create: `server/src/workers/index.ts`
- Create: `server/tests/health.test.ts`

**Interfaces:**
- Consumes: validated process environment and Express.
- Produces: `createApp(): Express`, `env`, `AppError`, and `GET /api/health -> { status: "ok", requestId: string }`.

- [ ] **Step 1: Write the failing health test**

```ts
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('GET /api/health', () => {
  it('returns a safe health response and request id', async () => {
    const response = await request(createApp()).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      requestId: expect.any(String),
    });
  });
});
```

- [ ] **Step 2: Run the test and verify the red state**

Run: `npm --prefix server test -- health.test.ts`

Expected: FAIL because `src/app.ts` does not exist.

- [ ] **Step 3: Implement validated configuration and Express composition**

Define `envSchema` with `NODE_ENV`, `DATABASE_URL`, `JWT_SECRET` minimum 32 characters, `PORT`, `CLIENT_URL`, and cookie settings. In tests, allow deterministic test defaults through the Vitest setup file rather than weakening production validation.

Implement `createApp()` with JSON limits, Helmet, exact-origin credentialed CORS, cookie parsing, request IDs, `/api/health`, a 404 `AppError`, and the central error handler.

- [ ] **Step 4: Run the health test and quality checks**

Run:

```bash
npm --prefix server test -- health.test.ts
npm --prefix server run lint
npm --prefix server run typecheck
```

Expected: all commands PASS.

- [ ] **Step 5: Commit the server platform**

```bash
git add server/src server/tests/health.test.ts
git commit -m "feat: add server platform and health endpoint"
```

### Task 3: Implement Tested Backend Authentication

**Files:**
- Create: `server/src/shared/cookies.ts`
- Create: `server/src/middleware/authenticate.ts`
- Create: `server/src/middleware/csrf.ts`
- Create: `server/src/modules/auth/auth.schemas.ts`
- Create: `server/src/modules/auth/user.repository.ts`
- Create: `server/src/modules/auth/auth.service.ts`
- Create: `server/src/modules/auth/auth.controller.ts`
- Create: `server/src/modules/auth/auth.routes.ts`
- Create: `server/tests/auth.service.test.ts`
- Create: `server/tests/auth.routes.test.ts`
- Modify: `server/src/app.ts`

**Interfaces:**
- Consumes: `UserRepository`, bcrypt, JWT secret, Express cookies, `AppError`.
- Produces: `AuthService.register(input)`, `AuthService.login(input)`, `authenticate`, `requireCsrf`, and `/api/auth/csrf|register|login|logout|me`.

Define shared public user output exactly as:

```ts
export type AuthUser = {
  id: string;
  name: string;
  email: string;
};
```

- [ ] **Step 1: Write failing service tests**

Test these behaviors with an in-memory `UserRepository` fake:

```ts
it('normalizes email and hashes the password during registration');
it('rejects an existing email with AUTH_EMAIL_EXISTS');
it('returns AUTH_INVALID_CREDENTIALS for an unknown email');
it('returns AUTH_INVALID_CREDENTIALS for a wrong password');
it('returns a public user and signed token for valid credentials');
```

Assertions must verify that returned users never contain `passwordHash`.

- [ ] **Step 2: Run service tests and verify failure**

Run: `npm --prefix server test -- auth.service.test.ts`

Expected: FAIL because the auth service and repository contract are missing.

- [ ] **Step 3: Implement repository and service**

Use this contract:

```ts
export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  create(input: {
    name: string;
    email: string;
    passwordHash: string;
  }): Promise<UserRecord>;
}
```

Normalize email with `trim().toLowerCase()`, hash passwords with bcrypt cost 12, and sign a seven-day JWT containing only `sub` and `email`.

- [ ] **Step 4: Run service tests and verify pass**

Run: `npm --prefix server test -- auth.service.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing HTTP tests**

Cover:

```ts
it('issues a CSRF cookie and token');
it('rejects register without a matching CSRF token');
it('registers and sets an httpOnly session cookie');
it('logs in and sets an httpOnly session cookie');
it('returns the current user for a valid session');
it('returns 401 for /me without a session');
it('clears the session cookie on logout');
it('does not return stack traces or password hashes');
```

- [ ] **Step 6: Implement schemas, middleware, controller, and routes**

Register input requires `name` length 2–80, a valid email, and password length 8–72. Login requires email and password. `GET /api/auth/csrf` returns `{ csrfToken }` and sets `studymate_csrf`. Register and login return `{ user: AuthUser }` and set `studymate_session`. Logout clears the session cookie.

- [ ] **Step 7: Run auth tests and server quality checks**

Run:

```bash
npm --prefix server test -- auth.service.test.ts auth.routes.test.ts
npm --prefix server run lint
npm --prefix server run typecheck
npm --prefix server run build
```

Expected: all commands PASS.

- [ ] **Step 8: Commit authentication**

```bash
git add server/src server/tests server/prisma/schema.prisma
git commit -m "feat: add secure authentication API"
```

### Task 4: Establish the Approved Frontend Design System and Routing

**Files:**
- Create: `client/src/main.tsx`
- Create: `client/src/app/query-client.ts`
- Create: `client/src/app/router.tsx`
- Create: `client/src/styles/index.css`
- Create: `client/src/components/Brand.tsx`
- Create: `client/src/layouts/PublicLayout.tsx`
- Create: `client/src/layouts/AppShell.tsx`
- Create: `client/src/pages/LoginPage.tsx`
- Create: `client/src/pages/RegisterPage.tsx`
- Create: `client/src/pages/DashboardPage.tsx`
- Create: `client/src/test/setup.ts`
- Create: `client/src/layouts/AppShell.test.tsx`

**Interfaces:**
- Consumes: React Router and the visual constraints from the approved design spec.
- Produces: React routes `/login`, `/register`, `/dashboard`; responsive `AppShell`; reusable visual tokens. Task 5 adds the authentication gate without changing these route paths.

- [ ] **Step 1: Write the failing shell test**

```tsx
it('renders the complete StudyMate navigation for an authenticated user', () => {
  render(<AppShell />, { wrapper: TestRouter });
  for (const label of [
    'Dashboard',
    'Materials',
    'AI Study',
    'Summary',
    'Quiz',
    'Exam Review',
    'History',
  ]) {
    expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
  }
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm --prefix client test -- AppShell.test.tsx`

Expected: FAIL because `AppShell` does not exist.

- [ ] **Step 3: Implement visual tokens and layouts**

Define CSS variables for navy ink, ivory paper, electric blue, saffron, mint, peach, borders, focus rings, radii, and shadows. Use system sans-serif for body text and a handwriting-style fallback stack only for short annotation labels; do not fetch external fonts during tests.

Implement an accessible desktop sidebar, mobile drawer button, skip link, main landmark, and active-route states. Use Lucide icons for every navigation item.

- [ ] **Step 4: Implement the route tree**

Public routes render inside `PublicLayout`. `/dashboard` renders inside `AppShell` during this isolated visual task. Task 5 wraps the authenticated branch in `ProtectedRoute` and adds authentication-aware fallback redirects.

- [ ] **Step 5: Run the shell test and client quality checks**

Run:

```bash
npm --prefix client test -- AppShell.test.tsx
npm --prefix client run lint
npm --prefix client run typecheck
```

Expected: all commands PASS.

- [ ] **Step 6: Commit the application shell**

```bash
git add client/src client/index.html
git commit -m "feat: add StudyMate application shell"
```

### Task 5: Implement the Client Authentication Flow

**Files:**
- Create: `client/src/services/http.ts`
- Create: `client/src/features/auth/api.ts`
- Create: `client/src/features/auth/auth.schemas.ts`
- Create: `client/src/features/auth/types.ts`
- Create: `client/src/features/auth/AuthProvider.tsx`
- Create: `client/src/components/ProtectedRoute.tsx`
- Create: `client/src/features/auth/LoginForm.tsx`
- Create: `client/src/features/auth/RegisterForm.tsx`
- Create: `client/src/features/auth/AuthProvider.test.tsx`
- Create: `client/src/features/auth/LoginForm.test.tsx`
- Create: `client/src/features/auth/RegisterForm.test.tsx`
- Modify: `client/src/pages/LoginPage.tsx`
- Modify: `client/src/pages/RegisterPage.tsx`
- Modify: `client/src/app/router.tsx`

**Interfaces:**
- Consumes: `/api/auth/csrf|register|login|logout|me` and `AuthUser` shape.
- Produces: `AuthProvider`, `useAuth()`, working login/register/logout, and protected navigation.

Use this context interface:

```ts
export type AuthUser = {
  id: string;
  name: string;
  email: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  status: 'loading' | 'authenticated' | 'anonymous';
  login(input: LoginInput): Promise<void>;
  register(input: RegisterInput): Promise<void>;
  logout(): Promise<void>;
};
```

- [ ] **Step 1: Write failing form and provider tests**

Cover:

```ts
it('restores the current session from /api/auth/me');
it('shows field errors without sending an invalid login');
it('submits a valid login and navigates to /dashboard');
it('requires matching passwords during registration');
it('submits registration and navigates to /dashboard');
it('shows safe API errors in an alert');
```

- [ ] **Step 2: Run the tests and verify failure**

Run:

```bash
npm --prefix client test -- AuthProvider.test.tsx LoginForm.test.tsx RegisterForm.test.tsx
```

Expected: FAIL because auth modules are missing.

- [ ] **Step 3: Implement Axios and CSRF handling**

Create an Axios instance with `baseURL` from `VITE_API_URL`, `withCredentials: true`, and a request interceptor. Before the first state-changing request, fetch `/api/auth/csrf`, retain the returned token in memory, and send it as `X-CSRF-Token`. On a CSRF failure, refresh once and retry once.

- [ ] **Step 4: Implement auth API and provider**

Map API responses into `AuthUser`. Treat `/me` 401 as an anonymous session, not a global error. Invalidate the session query after login, registration, and logout.

- [ ] **Step 5: Implement accessible forms**

Use labeled inputs, inline field errors, an alert region for API errors, disabled submit state, and a visible loading label. Registration contains Name, Email, Password, and Confirm Password. Password values are never logged.

- [ ] **Step 6: Run auth UI tests and complete client verification**

Run:

```bash
npm --prefix client test
npm --prefix client run lint
npm --prefix client run typecheck
npm --prefix client run build
```

Expected: all commands PASS.

- [ ] **Step 7: Commit client authentication**

```bash
git add client/src
git commit -m "feat: add client authentication flow"
```

### Task 6: Add CI, Seed Data, and Foundation Documentation

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `server/prisma/seed.ts`
- Modify: `server/package.json`
- Modify: `README.md`
- Modify: `.env.example`

**Interfaces:**
- Consumes: all foundation scripts from Tasks 1–5.
- Produces: deterministic CI and documented local setup.

- [ ] **Step 1: Add a safe development seed**

Read `DEMO_USER_EMAIL` and `DEMO_USER_PASSWORD` from environment. When either is missing, print only `Demo user seed skipped: credentials are not configured.` Do not commit a default password.

- [ ] **Step 2: Add GitHub Actions**

Use Node.js 24 and service containers for MySQL 8 and Qdrant. Run server Prisma generation, lint, typecheck, and tests; then run client lint, typecheck, tests, and build. Use fake JWT and database secrets scoped to the workflow.

- [ ] **Step 3: Write the foundation README**

Document prerequisites, environment variables, Docker services, Prisma migration/generation, server startup, client startup, test commands, and the current feature boundary. Explicitly state that DeepSeek integration begins in the later RAG plan.

- [ ] **Step 4: Run the complete foundation verification**

Run:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Expected: all commands PASS. Also run `docker compose config`; run service health checks when Docker Desktop is available.

- [ ] **Step 5: Perform secret and bundle scans**

Run:

```bash
rg -n "DEEPSEEK_API_KEY|JWT_SECRET|BEGIN (RSA|OPENSSH|EC) PRIVATE KEY" . -g '!node_modules' -g '!package-lock.json' -g '!.env.example'
```

Expected: no committed secrets and no secret identifiers in client source.

- [ ] **Step 6: Commit the verified foundation**

```bash
git add .github README.md .env.example server/prisma/seed.ts server/package.json
git commit -m "ci: verify StudyMate foundation"
```

## Foundation Acceptance Checkpoint

The phase is complete only when:

- Client and server install independently and have lockfiles.
- The health endpoint passes its test.
- Register, login, logout, and `/me` pass service and HTTP tests.
- JWT and CSRF cookies have the approved attributes.
- Public and protected frontend routes work.
- Login and registration interactions pass UI tests.
- The selected StudyMate design system is visible and responsive.
- Lint, type checks, tests, and production builds pass.
- Docker Compose is valid; any inability to run it is reported as an environmental limitation.
- No secret is committed or included in client source.

After this checkpoint, create and execute the Materials and RAG plan, followed by Study Tools and History, then Final Polish and Delivery.
