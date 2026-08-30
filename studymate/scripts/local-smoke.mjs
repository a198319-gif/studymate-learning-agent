import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createLocalRuntime } from '../server/dist/local/create-local-runtime.js';

class DeterministicProvider {
  async create(request) {
    if (request.toolChoice === 'auto') {
      const prompt = request.input.findLast((item) => item.type === 'message' && item.role === 'user')?.content ?? 'notes';
      return { output: [{ type: 'function_call', callId: crypto.randomUUID(), name: 'search_materials', arguments: JSON.stringify({ query: prompt, materialIds: [] }) }] };
    }
    const prompt = request.input.find((item) => item.type === 'message' && item.role === 'user')?.content ?? '';
    const evidenceRaw = request.input.find((item) => item.type === 'function_call_output')?.output ?? '[]';
    const source = JSON.parse(evidenceRaw)[0]?.sourceName ?? 'notes.txt';
    if (prompt.startsWith('Create exactly 2')) {
      return { output: [{ type: 'message', text: JSON.stringify({ title: 'Spacing check', questions: [
        { question: 'Spacing improves retention.', type: 'TRUE_FALSE', options: ['True', 'False'], correctAnswer: 'True', explanation: 'The note states this.', sourceReference: source },
        { question: 'Retrieval supports memory.', type: 'TRUE_FALSE', options: ['True', 'False'], correctAnswer: 'True', explanation: 'The note states this.', sourceReference: source },
      ] }), sources: [source] }] };
    }
    if (prompt.toLowerCase().includes('summary')) return { output: [{ type: 'message', text: 'Spacing and retrieval improve long-term retention.', sources: [source] }] };
    return { output: [{ type: 'message', text: 'Spacing improves retention.', sources: [source] }] };
  }
}

class Session {
  cookies = new Map();
  constructor(baseUrl) { this.baseUrl = baseUrl; }

  async request(route, init = {}) {
    const headers = new Headers(init.headers);
    if (this.cookies.size) headers.set('Cookie', [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; '));
    const response = await fetch(`${this.baseUrl}${route}`, { ...init, headers });
    const setCookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [response.headers.get('set-cookie')].filter(Boolean);
    for (const raw of setCookies) {
      const [pair] = raw.split(';');
      const separator = pair.indexOf('=');
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (value) this.cookies.set(name, value); else this.cookies.delete(name);
    }
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  }

  async csrf() { return (await this.request('/api/auth/csrf')).body.csrfToken; }
  async jsonMutation(route, body) {
    const token = await this.csrf();
    return this.request(route, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: JSON.stringify(body) });
  }
}

const dataDirectory = await mkdtemp(path.join(tmpdir(), 'studymate-smoke-'));
let runtime;
let server;
try {
  runtime = await createLocalRuntime({ dataDirectory, provider: new DeterministicProvider(), workerIntervalMs: 10 });
  server = runtime.app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const session = new Session(`http://127.0.0.1:${address.port}`);

  const registration = await session.jsonMutation('/api/auth/register', { name: 'Smoke Learner', email: 'smoke@example.com', password: 'correct-horse-battery-staple' });
  assert.equal(registration.status, 201);
  const uploadForm = new FormData();
  uploadForm.append('file', new Blob(['Spacing and retrieval practice improve long-term retention.'], { type: 'text/plain' }), 'notes.txt');
  const upload = await session.request('/api/materials', { method: 'POST', headers: { 'X-CSRF-Token': await session.csrf() }, body: uploadForm });
  assert.equal(upload.status, 201);
  const materialId = upload.body.material.id;

  let material;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    material = (await session.request(`/api/materials/${materialId}`)).body.material;
    if (material.status === 'READY') break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(material.status, 'READY');
  const chat = await session.jsonMutation('/api/study/chat', { question: 'What improves retention?', materialIds: [materialId], language: 'en', beginnerMode: false });
  assert.equal(chat.status, 201);
  assert.equal(chat.body.groundingStatus, 'GROUNDED');
  const summary = await session.jsonMutation('/api/study/generate', { type: 'SUMMARY', materialIds: [materialId], language: 'en' });
  assert.equal(summary.status, 201);
  const quiz = await session.jsonMutation('/api/quizzes', { materialIds: [materialId], language: 'en', difficulty: 'MEDIUM', questionCount: 2, questionTypes: ['TRUE_FALSE'] });
  assert.equal(quiz.status, 201);
  const questions = quiz.body.quiz.questions;
  const scored = await session.jsonMutation(`/api/quizzes/${quiz.body.quiz.id}/submit`, { answers: [{ questionId: questions[0].id, answer: 'True' }, { questionId: questions[1].id, answer: 'False' }] });
  assert.equal(scored.body.quiz.score, 50);
  assert.equal((await session.request('/api/study/conversations')).body.conversations.length, 1);
  assert.equal((await session.request('/api/study/history')).body.artifacts.length, 1);
  assert.equal((await session.request('/api/quizzes')).body.quizzes.length, 1);

  const logout = await session.request('/api/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': await session.csrf() } });
  assert.equal(logout.status, 204);
  assert.equal((await session.request('/api/auth/me')).status, 401);
  assert.equal((await session.jsonMutation('/api/auth/login', { email: 'smoke@example.com', password: 'correct-horse-battery-staple' })).status, 200);
  assert.equal((await session.request('/api/materials')).body.materials.length, 1);
  process.stdout.write('StudyMate local smoke test passed.\n');
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (runtime) await runtime.close();
  await rm(dataDirectory, { recursive: true, force: true });
}
