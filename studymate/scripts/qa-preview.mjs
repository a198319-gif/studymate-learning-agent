import { createReadStream, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';

if (process.env.ALLOW_FIXED_QA_PREVIEW !== '1') {
  throw new Error('This is a fixed visual fixture, not the functional app. Use npm run local:build && npm run local.');
}

const root = path.resolve('client/dist');
const materials = [
  { id: 'material-1', originalName: 'Lecture 08 — Memory Systems.pdf', mimeType: 'application/pdf', extension: 'pdf', size: 1842000, status: 'READY', chunkCount: 18, processingError: null, createdAt: '2026-08-26T08:00:00.000Z', updatedAt: '2026-08-26T08:01:00.000Z' },
  { id: 'material-2', originalName: 'Midterm Study Guide.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', extension: 'docx', size: 382000, status: 'READY', chunkCount: 9, processingError: null, createdAt: '2026-08-25T10:00:00.000Z', updatedAt: '2026-08-25T10:01:00.000Z' },
  { id: 'material-3', originalName: 'Seminar notes.txt', mimeType: 'text/plain', extension: 'txt', size: 12800, status: 'PROCESSING', chunkCount: 0, processingError: null, createdAt: '2026-08-26T09:00:00.000Z', updatedAt: '2026-08-26T09:00:00.000Z' },
];
const quizQuestions = [
  { id: 'q1', question: 'Working memory has unlimited capacity.', type: 'TRUE_FALSE', options: ['True', 'False'], userAnswer: null, sourceReference: 'Lecture 08 — Memory Systems.pdf' },
  { id: 'q2', question: 'Which study strategy best supports long-term retention?', type: 'MULTIPLE_CHOICE', options: ['Massed practice', 'Spaced practice', 'Passive rereading'], userAnswer: null, sourceReference: 'Midterm Study Guide.docx' },
];

function quiz(submitted = false) {
  return {
    id: 'quiz-1', title: 'Memory Systems Check-in', difficulty: 'MEDIUM', questionCount: 2,
    score: submitted ? 50 : null, materialIds: ['material-1', 'material-2'], createdAt: '2026-08-26T09:30:00.000Z',
    questions: quizQuestions.map((question, index) => ({ ...question, userAnswer: submitted ? (index === 0 ? 'False' : 'Massed practice') : null, ...(submitted ? { correctAnswer: index === 0 ? 'False' : 'Spaced practice', explanation: index === 0 ? 'Working memory is capacity-limited.' : 'Spacing strengthens later retrieval.' } : {}) })),
  };
}

const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  if (url.pathname === '/api/auth/csrf') return void response.end(JSON.stringify({ csrfToken: 'qa-token' }));
  if (url.pathname === '/api/auth/me') return void response.end(JSON.stringify({ user: { id: 'qa-user', name: 'Maya Chen', email: 'maya@example.edu' } }));
  if (url.pathname === '/api/materials') return void response.end(JSON.stringify({ materials }));
  if (url.pathname === '/api/study/history') return void response.end(JSON.stringify({ artifacts: [{ id: 'artifact-1', type: 'SUMMARY', title: 'Memory systems summary', materialIds: ['material-1'], text: 'Working memory is capacity-limited and supports active processing.', sources: ['Lecture 08 — Memory Systems.pdf'], groundingStatus: 'GROUNDED', createdAt: '2026-08-26T09:00:00.000Z' }] }));
  if (url.pathname === '/api/study/conversations') return void response.end(JSON.stringify({ conversations: [{ id: 'conversation-1', title: 'Compare memory systems', preview: 'How is working memory different from long-term memory?', messageCount: 4, updatedAt: '2026-08-26T09:20:00.000Z' }], nextCursor: null }));
  if (url.pathname === '/api/quizzes' && request.method === 'GET') return void response.end(JSON.stringify({ quizzes: [quiz(true)] }));
  if (url.pathname === '/api/quizzes' && request.method === 'POST') return void response.end(JSON.stringify({ quiz: quiz(false) }));
  if (url.pathname === '/api/quizzes/quiz-1/submit') return void response.end(JSON.stringify({ quiz: quiz(true) }));
  if (url.pathname === '/api/quizzes/quiz-1') return void response.end(JSON.stringify({ quiz: quiz(true) }));
  if (url.pathname.startsWith('/api/')) {
    response.statusCode = 204;
    return void response.end();
  }
  const candidate = path.join(root, url.pathname === '/' ? 'index.html' : url.pathname);
  const filePath = existsSync(candidate) ? candidate : path.join(root, 'index.html');
  response.setHeader('Content-Type', contentTypes[path.extname(filePath)] ?? 'application/octet-stream');
  createReadStream(filePath).pipe(response);
}).listen(4173, '127.0.0.1', () => console.info('StudyMate fixed visual fixture (non-functional): http://127.0.0.1:4173'));
