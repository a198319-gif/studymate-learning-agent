import type { Server } from 'node:http';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { LocalUserRepository } from '../src/local/local-auth.repository.js';
import { LocalDashboardRepository } from '../src/local/local-dashboard.repository.js';
import { LocalGenerationRepository } from '../src/local/local-generation.repository.js';
import { LocalStore } from '../src/local/local-store.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { DashboardService } from '../src/modules/dashboard/dashboard.service.js';
import { GenerationService } from '../src/modules/study/generation.service.js';
import type { StudyAgent } from '../src/modules/study/chat.service.js';

const unusedAgent: StudyAgent = {
  ask: () => Promise.reject(new Error('The route test must not invoke the study agent.')),
};

async function register(agent: ReturnType<typeof request.agent>, email: string) {
  const csrf = await agent.get('/api/auth/csrf');
  return agent.post('/api/auth/register').set('x-csrf-token', (csrf.body as { csrfToken: string }).csrfToken).send({
    name: 'Ada Learner', email, password: 'correct-horse-battery-staple',
  });
}

describe('dashboard and generated artifact routes', () => {
  let server: Server | undefined;
  let directory: string | undefined;

  afterEach(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it('returns only authenticated dashboard data and restores only owned artifacts', async () => {
    directory = path.join(tmpdir(), `studymate-dashboard-${crypto.randomUUID()}`);
    const store = new LocalStore(path.join(directory, 'state.json'));
    const authService = new AuthService(new LocalUserRepository(store), env.JWT_SECRET);
    const generationRepository = new LocalGenerationRepository(store);
    server = createApp({
      authService,
      generationService: new GenerationService(generationRepository, unusedAgent),
      dashboardService: new DashboardService(new LocalDashboardRepository(store)),
    }).listen();

    const ownerAgent = request.agent(server);
    const otherAgent = request.agent(server);
    const ownerRegistration = await register(ownerAgent, 'owner-dashboard@example.com');
    await register(otherAgent, 'other-dashboard@example.com');
    const ownerId = (ownerRegistration.body as { user: { id: string } }).user.id;
    const now = new Date().toISOString();

    await store.update((state) => {
      state.materials.push({
        id: 'material-a', userId: ownerId, originalName: 'memory.txt', storedName: 'stored.txt', storagePath: 'private/path',
        mimeType: 'text/plain', extension: 'txt', size: 42, checksum: 'sum', status: 'READY', chunkCount: 1,
        processingError: null, createdAt: now, updatedAt: now,
      });
      state.conversations.push({ id: 'conversation-a', userId: ownerId, title: 'Spacing', createdAt: now, updatedAt: now });
      state.messages.push({
        id: 'message-a', conversationId: 'conversation-a', role: 'ASSISTANT', content: 'Use spacing.',
        sources: ['memory.txt'], groundingStatus: 'GROUNDED', createdAt: now,
      });
      state.quizzes.push({
        id: 'quiz-a', userId: ownerId, title: 'Practice', difficulty: 'MEDIUM', questionCount: 2,
        score: 50, materialIds: ['material-a'], createdAt: now, updatedAt: now,
      });
    });
    const artifact = await generationRepository.save({
      userId: ownerId, type: 'EXAM_REVIEW', title: 'Exam review', materialIds: ['material-a'],
      text: 'Review spacing.', sources: ['memory.txt'], groundingStatus: 'GROUNDED',
    });

    const dashboard = await ownerAgent.get('/api/dashboard');
    expect(dashboard.status).toBe(200);
    expect(dashboard.body).toMatchObject({
      materialCount: 1,
      conversationCount: 1,
      practiceQuestionCount: 2,
      examReviewCount: 1,
      quizAccuracy: 50,
      recentMaterials: [{ id: 'material-a', originalName: 'memory.txt', status: 'READY' }],
      recentConversations: [{ id: 'conversation-a', title: 'Spacing', preview: 'Use spacing.' }],
    });
    expect(JSON.stringify(dashboard.body)).not.toContain('private/path');

    const restored = await ownerAgent.get(`/api/study/artifacts/${artifact.id}`);
    expect(restored.status).toBe(200);
    expect((restored.body as { artifact: unknown }).artifact).toMatchObject({ id: artifact.id, text: 'Review spacing.' });
    const forbidden = await otherAgent.get(`/api/study/artifacts/${artifact.id}`);
    expect(forbidden.status).toBe(404);
    expect((forbidden.body as { error: { code: string } }).error.code).toBe('ARTIFACT_NOT_FOUND');
  });
});
