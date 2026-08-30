import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

class Session {
  cookies = new Map();

  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  async request(route, init = {}) {
    const headers = new Headers(init.headers);
    if (this.cookies.size) {
      headers.set('Cookie', [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; '));
    }
    const response = await fetch(`${this.baseUrl}${route}`, { ...init, headers });
    const setCookies = typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie')].filter(Boolean);
    for (const raw of setCookies) {
      const [pair] = raw.split(';');
      const separator = pair.indexOf('=');
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (value) this.cookies.set(name, value);
      else this.cookies.delete(name);
    }
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  }

  async csrf() {
    return (await this.request('/api/auth/csrf')).body.csrfToken;
  }

  async jsonMutation(route, body) {
    return this.request(route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': await this.csrf() },
      body: JSON.stringify(body),
    });
  }
}

const baseUrl = process.env.LIVE_TEST_URL ?? 'http://127.0.0.1:4173';
const email = process.env.LIVE_TEST_EMAIL ?? 'codex.qa.20260828@example.test';
const password = process.env.LIVE_TEST_PASSWORD ?? 'StudyMateTest123!';
const session = new Session(baseUrl);

let login = await session.jsonMutation('/api/auth/login', { email, password });
if (login.status !== 200) {
  const registration = await session.jsonMutation('/api/auth/register', {
    name: 'Codex QA',
    email,
    password,
  });
  if (registration.status === 409) {
    login = await session.jsonMutation('/api/auth/login', { email, password });
    assert.equal(login.status, 200, `Login failed with HTTP ${login.status}`);
  } else {
    assert.equal(registration.status, 201, `Registration failed with HTTP ${registration.status}`);
  }
}

const fixturePath = path.resolve('server/tests/fixtures/spaced-practice.txt');
const uploadForm = new FormData();
uploadForm.append('file', new Blob([await readFile(fixturePath)], { type: 'text/plain' }), path.basename(fixturePath));
const upload = await session.request('/api/materials', {
  method: 'POST',
  headers: { 'X-CSRF-Token': await session.csrf() },
  body: uploadForm,
});
assert.equal(upload.status, 201, `Upload failed with HTTP ${upload.status}`);
const materialId = upload.body.material.id;

let material;
for (let attempt = 0; attempt < 120; attempt += 1) {
  material = (await session.request(`/api/materials/${materialId}`)).body.material;
  if (material.status === 'READY') break;
  await new Promise((resolve) => setTimeout(resolve, 250));
}
assert.equal(material?.status, 'READY', 'Uploaded material never became ready');

const chat = await session.jsonMutation('/api/study/chat', {
  question: 'According to the uploaded material, how do spaced practice and retrieval practice improve long-term retention?',
  materialIds: [materialId],
  language: 'en',
  beginnerMode: false,
});
assert.equal(chat.status, 201, `AI study failed with HTTP ${chat.status}`);
assert.equal(chat.body.groundingStatus, 'GROUNDED');
assert.ok(chat.body.sources.includes('spaced-practice.txt'));

const summary = await session.jsonMutation('/api/study/generate', {
  type: 'SUMMARY',
  materialIds: [materialId],
  language: 'en',
});
assert.equal(summary.status, 201, `Summary generation failed with HTTP ${summary.status}`);
assert.ok(summary.body.artifact.text.length > 20);

const quiz = await session.jsonMutation('/api/quizzes', {
  materialIds: [materialId],
  language: 'en',
  difficulty: 'MEDIUM',
  questionCount: 5,
  questionTypes: ['TRUE_FALSE'],
});
assert.equal(quiz.status, 201, `Quiz generation failed with HTTP ${quiz.status}: ${JSON.stringify(quiz.body)}`);
assert.equal(quiz.body.quiz.questions.length, 5);
assert.ok(quiz.body.quiz.questions.every((question) => question.type === 'TRUE_FALSE'));

const answers = quiz.body.quiz.questions.map((question) => ({
  questionId: question.id,
  answer: question.options?.[0] ?? 'True',
}));
const scored = await session.jsonMutation(`/api/quizzes/${quiz.body.quiz.id}/submit`, { answers });
assert.equal(scored.status, 200);
assert.equal(typeof scored.body.quiz.score, 'number');

assert.ok((await session.request('/api/study/conversations')).body.conversations.length >= 1);
assert.ok((await session.request('/api/study/history')).body.artifacts.length >= 1);
assert.ok((await session.request('/api/quizzes')).body.quizzes.length >= 1);

const logout = await session.request('/api/auth/logout', {
  method: 'POST',
  headers: { 'X-CSRF-Token': await session.csrf() },
});
assert.equal(logout.status, 204);
assert.equal((await session.request('/api/auth/me')).status, 401);
assert.equal((await session.jsonMutation('/api/auth/login', { email, password })).status, 200);
assert.ok((await session.request('/api/materials')).body.materials.some((item) => item.id === materialId));

process.stdout.write('StudyMate live local check passed with DeepSeek.\n');
