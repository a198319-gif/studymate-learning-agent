import type { Server } from 'node:http';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import type { CreateUserInput, UserRecord, UserRepository } from '../src/modules/auth/user.repository.js';
import { MaterialService, type CreateMaterialInput, type MaterialRecord, type MaterialRepository } from '../src/modules/materials/material.service.js';

class MemoryUserRepository implements UserRepository {
  readonly users: UserRecord[] = [];
  findByEmail(email: string) { return Promise.resolve(this.users.find((user) => user.email === email) ?? null); }
  findById(id: string) { return Promise.resolve(this.users.find((user) => user.id === id) ?? null); }
  create(input: CreateUserInput) {
    const now = new Date();
    const user = { id: `user-${this.users.length + 1}`, ...input, createdAt: now, updatedAt: now };
    this.users.push(user);
    return Promise.resolve(user);
  }
}

class MemoryMaterialRepository implements MaterialRepository {
  readonly materials: MaterialRecord[] = [];
  createWithJob(input: CreateMaterialInput) {
    const now = new Date();
    const material: MaterialRecord = { id: `material-${this.materials.length + 1}`, ...input, status: 'PROCESSING', chunkCount: 0, processingError: null, createdAt: now, updatedAt: now };
    this.materials.push(material);
    return Promise.resolve(material);
  }
  listByUser(userId: string) { return Promise.resolve(this.materials.filter((material) => material.userId === userId)); }
  findByIdForUser(id: string, userId: string) { return Promise.resolve(this.materials.find((material) => material.id === id && material.userId === userId) ?? null); }
  deleteByIdForUser(id: string, userId: string) {
    const index = this.materials.findIndex((material) => material.id === id && material.userId === userId);
    return Promise.resolve(index < 0 ? null : (this.materials.splice(index, 1)[0] ?? null));
  }
}

type Body = Record<string, unknown>;
const secret = 'test-only-jwt-secret-with-at-least-32-characters';

describe('material routes', () => {
  let server: Server;
  let storageDirectory: string;

  beforeEach(() => {
    storageDirectory = path.join(tmpdir(), `studymate-route-${crypto.randomUUID()}`);
    const materialService = new MaterialService(new MemoryMaterialRepository(), storageDirectory);
    const authService = new AuthService(new MemoryUserRepository(), secret);
    server = createApp({ authService, materialService }).listen();
  });

  afterEach(async () => {
    server.close();
    await rm(storageDirectory, { recursive: true, force: true });
  });

  async function authenticatedAgent() {
    const agent = request.agent(server);
    const csrfResponse = await agent.get('/api/auth/csrf');
    const csrfToken = (csrfResponse.body as Body).csrfToken as string;
    await agent.post('/api/auth/register').set('X-CSRF-Token', csrfToken).send({
      name: 'Ada Lovelace', email: 'ada@example.com', password: 'correct-horse',
    });
    return { agent, csrfToken };
  }

  it('uploads and lists a user material without leaking its storage path', async () => {
    const { agent, csrfToken } = await authenticatedAgent();
    const uploaded = await agent
      .post('/api/materials')
      .set('X-CSRF-Token', csrfToken)
      .attach('file', Buffer.from('Spaced practice strengthens long-term memory.'), {
        filename: 'learning-notes.txt', contentType: 'text/plain',
      });

    expect(uploaded.status).toBe(201);
    expect(uploaded.body).toMatchObject({ material: { id: 'material-1', originalName: 'learning-notes.txt', status: 'PROCESSING' } });
    expect(JSON.stringify(uploaded.body as unknown)).not.toContain('storagePath');

    const listed = await agent.get('/api/materials');
    expect(listed.status).toBe(200);
    expect(listed.body).toMatchObject({ materials: [{ id: 'material-1', chunkCount: 0 }] });
  });

  it('requires authentication and CSRF protection for mutations', async () => {
    const unauthenticated = await request(server).get('/api/materials');
    expect(unauthenticated.status).toBe(401);

    const { agent } = await authenticatedAgent();
    const upload = await agent.post('/api/materials').attach('file', Buffer.from('notes'), {
      filename: 'notes.txt', contentType: 'text/plain',
    });
    expect(upload.status).toBe(403);
  });
});
