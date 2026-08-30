import type { Server } from 'node:http';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import type {
  CreateUserInput,
  UserRecord,
  UserRepository,
} from '../src/modules/auth/user.repository.js';

class MemoryUserRepository implements UserRepository {
  readonly users: UserRecord[] = [];

  findByEmail(email: string): Promise<UserRecord | null> {
    return Promise.resolve(this.users.find((user) => user.email === email) ?? null);
  }

  findById(id: string): Promise<UserRecord | null> {
    return Promise.resolve(this.users.find((user) => user.id === id) ?? null);
  }

  create(input: CreateUserInput): Promise<UserRecord> {
    const now = new Date();
    const user: UserRecord = {
      id: `user-${this.users.length + 1}`,
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    this.users.push(user);
    return Promise.resolve(user);
  }
}

type Body = Record<string, unknown>;

const secret = 'test-only-jwt-secret-with-at-least-32-characters';
const validRegistration = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  password: 'correct-horse',
};

describe('auth routes', () => {
  let server: Server;
  let repository: MemoryUserRepository;
  let service: AuthService;

  beforeEach(() => {
    repository = new MemoryUserRepository();
    service = new AuthService(repository, secret);
    server = createApp({ authService: service }).listen();
  });

  afterEach(() => {
    server.close();
  });

  async function csrf(agent: ReturnType<typeof request.agent>): Promise<string> {
    const response = await agent.get('/api/auth/csrf');
    const body = response.body as Body;
    return body.csrfToken as string;
  }

  it('issues a CSRF cookie and token', async () => {
    const response = await request(server).get('/api/auth/csrf');
    const body = response.body as Body;

    expect(response.status).toBe(200);
    expect(body.csrfToken).toEqual(expect.any(String));
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('studymate_csrf=')]),
    );
  });

  it('rejects register without a matching CSRF token', async () => {
    const response = await request(server).post('/api/auth/register').send(validRegistration);
    const body = response.body as Body;

    expect(response.status).toBe(403);
    expect(body).toMatchObject({ error: { code: 'CSRF_INVALID' } });
  });

  it('registers and sets an httpOnly session cookie', async () => {
    const agent = request.agent(server);
    const token = await csrf(agent);
    const response = await agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', token)
      .send(validRegistration);
    const body = response.body as Body;

    expect(response.status).toBe(201);
    expect(body).toEqual({
      user: { id: 'user-1', name: 'Ada Lovelace', email: 'ada@example.com' },
    });
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/studymate_session=.*HttpOnly.*SameSite=Lax/i),
      ]),
    );
  });

  it('logs in and sets an httpOnly session cookie', async () => {
    await service.register(validRegistration);
    const agent = request.agent(server);
    const token = await csrf(agent);
    const response = await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', token)
      .send({ email: validRegistration.email, password: validRegistration.password });

    expect(response.status).toBe(200);
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('studymate_session=')]),
    );
  });

  it('returns the current user for a valid session', async () => {
    const agent = request.agent(server);
    const token = await csrf(agent);
    await agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', token)
      .send(validRegistration);

    const response = await agent.get('/api/auth/me');
    const body = response.body as Body;

    expect(response.status).toBe(200);
    expect(body).toEqual({
      user: { id: 'user-1', name: 'Ada Lovelace', email: 'ada@example.com' },
    });
  });

  it('returns 401 for /me without a session', async () => {
    const response = await request(server).get('/api/auth/me');
    const body = response.body as Body;

    expect(response.status).toBe(401);
    expect(body).toMatchObject({ error: { code: 'AUTH_REQUIRED' } });
  });

  it('returns a safe validation error for malformed JSON', async () => {
    const response = await request(server)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');
    const body = response.body as Body;

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('rate limits repeated login attempts', async () => {
    const agent = request.agent(server);
    const token = await csrf(agent);

    for (let attempt = 0; attempt < 20; attempt += 1) {
      await agent
        .post('/api/auth/login')
        .set('X-CSRF-Token', token)
        .send({ email: 'missing@example.com', password: 'wrong-password' });
    }
    const response = await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', token)
      .send({ email: 'missing@example.com', password: 'wrong-password' });
    const body = response.body as Body;

    expect(response.status).toBe(429);
    expect(body).toMatchObject({ error: { code: 'RATE_LIMITED' } });
  });

  it('clears the session cookie on logout', async () => {
    const agent = request.agent(server);
    const token = await csrf(agent);
    await agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', token)
      .send(validRegistration);

    const response = await agent.post('/api/auth/logout').set('X-CSRF-Token', token);

    expect(response.status).toBe(204);
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringMatching(/studymate_session=;.*Expires=/i)]),
    );
  });

  it('does not return stack traces or password hashes', async () => {
    const agent = request.agent(server);
    const token = await csrf(agent);
    await agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', token)
      .send(validRegistration);
    const response = await agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', token)
      .send(validRegistration);
    const serialized = JSON.stringify(response.body as unknown);

    expect(response.status).toBe(409);
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('stack');
  });
});
