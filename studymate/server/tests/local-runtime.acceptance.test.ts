import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';

import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { createLocalRuntime } from '../src/local/create-local-runtime.js';
import type { ModelRequest, ResponsesProvider } from '../src/modules/study/grounded-study-agent.js';

class DeterministicProvider implements ResponsesProvider {
  create(modelRequest: ModelRequest) {
    if (modelRequest.toolChoice === 'auto') {
      const question = modelRequest.input.findLast((item) => item.type === 'message' && item.role === 'user');
      return Promise.resolve({ output: [{
        type: 'function_call' as const,
        callId: crypto.randomUUID(),
        name: 'search_materials',
        arguments: JSON.stringify({ query: question?.type === 'message' ? question.content : 'notes', materialIds: [] }),
      }] });
    }
    const userPrompt = modelRequest.input.find((item) => item.type === 'message' && item.role === 'user');
    const evidenceItem = modelRequest.input.find((item) => item.type === 'function_call_output');
    const evidence = evidenceItem?.type === 'function_call_output'
      ? JSON.parse(evidenceItem.output) as Array<{ sourceName: string }>
      : [];
    const source = evidence[0]?.sourceName ?? 'notes.txt';
    if (userPrompt?.type === 'message' && userPrompt.content.startsWith('Create exactly 2')) {
      return Promise.resolve({ output: [{
        type: 'message' as const,
        text: JSON.stringify({
          title: 'Spacing practice',
          questions: [
            { question: 'What improves retention?', type: 'MULTIPLE_CHOICE', options: ['Spacing', 'Cramming'], correctAnswer: 'Spacing', explanation: 'The note says so.', sourceReference: source },
            { question: 'Spacing improves retention.', type: 'TRUE_FALSE', options: ['True', 'False'], correctAnswer: 'True', explanation: 'The note states this.', sourceReference: source },
          ],
        }),
        sources: [source],
      }] });
    }
    return Promise.resolve({ output: [{ type: 'message' as const, text: 'Spacing improves retention.', sources: [source] }] });
  }
}

async function csrf(agent: ReturnType<typeof request.agent>): Promise<string> {
  return ((await agent.get('/api/auth/csrf')).body as { csrfToken: string }).csrfToken;
}

describe('complete local runtime', () => {
  const directories: string[] = [];
  const servers: Server[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  it('persists registration, processed material, study history, and quiz across restart', async () => {
    const dataDirectory = path.join(tmpdir(), `studymate-runtime-${crypto.randomUUID()}`);
    directories.push(dataDirectory);
    const first = await createLocalRuntime({ dataDirectory, provider: new DeterministicProvider(), workerIntervalMs: 10 });
    const firstServer = first.app.listen();
    servers.push(firstServer);
    const firstAgent = request.agent(firstServer);
    const registrationCsrf = await csrf(firstAgent);
    const registration = await firstAgent.post('/api/auth/register').set('x-csrf-token', registrationCsrf).send({
      name: 'Ada Learner', email: 'ada-runtime@example.com', password: 'correct-horse-battery-staple',
    });
    expect(registration.status).toBe(201);
    const uploadCsrf = await csrf(firstAgent);
    const uploaded = await firstAgent.post('/api/materials').set('x-csrf-token', uploadCsrf)
      .attach('file', Buffer.from('Spacing improves long-term retention through repeated retrieval.'), { filename: 'notes.txt', contentType: 'text/plain' });
    expect(uploaded.status).toBe(201);
    const materialId = (uploaded.body as { material: { id: string } }).material.id;

    let materialStatus = '';
    for (let attempt = 0; attempt < 100 && materialStatus !== 'READY'; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      materialStatus = ((await firstAgent.get(`/api/materials/${materialId}`)).body as { material: { status?: string } }).material.status ?? '';
    }
    expect(materialStatus).toBe('READY');

    const chatCsrf = await csrf(firstAgent);
    const chat = await firstAgent.post('/api/study/chat').set('x-csrf-token', chatCsrf).send({
      question: 'What improves retention?', materialIds: [materialId], language: 'en', beginnerMode: false,
    });
    expect(chat.status).toBe(201);
    expect(chat.body).toMatchObject({ groundingStatus: 'GROUNDED', sources: ['notes.txt'] });
    const quizCsrf = await csrf(firstAgent);
    const quiz = await firstAgent.post('/api/quizzes').set('x-csrf-token', quizCsrf).send({
      materialIds: [materialId], language: 'en', difficulty: 'MEDIUM', questionCount: 2,
    });
    expect(quiz.status).toBe(201);
    await first.close();

    const second = await createLocalRuntime({ dataDirectory, provider: new DeterministicProvider(), workerIntervalMs: 10 });
    const secondServer = second.app.listen();
    servers.push(secondServer);
    const secondAgent = request.agent(secondServer);
    const loginCsrf = await csrf(secondAgent);
    const login = await secondAgent.post('/api/auth/login').set('x-csrf-token', loginCsrf).send({
      email: 'ada-runtime@example.com', password: 'correct-horse-battery-staple',
    });
    expect(login.status).toBe(200);
    expect(((await secondAgent.get('/api/materials')).body as { materials: unknown[] }).materials)
      .toContainEqual(expect.objectContaining({ id: materialId, status: 'READY' }));
    expect(((await secondAgent.get('/api/study/conversations')).body as { conversations: unknown[] }).conversations).toHaveLength(1);
    expect(((await secondAgent.get('/api/quizzes')).body as { quizzes: unknown[] }).quizzes).toHaveLength(1);
    await second.close();
  }, 15_000);
});
