import type { Server } from 'node:http';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import type { CreateUserInput, UserRecord, UserRepository } from '../src/modules/auth/user.repository.js';
import {
  MaterialService,
  type CreateMaterialInput,
  type MaterialRecord,
  type MaterialRepository,
} from '../src/modules/materials/material.service.js';
import type { StudyAnswer, StudyRequest } from '../src/modules/study/grounded-study-agent.js';
import {
  ChatService,
  type ChatRepository,
  type ConversationDetail,
  type ConversationMessage,
  type ConversationSummary,
  type StudyAgent,
} from '../src/modules/study/chat.service.js';
import {
  GenerationService,
  type GeneratedArtifact,
  type GenerationRepository,
} from '../src/modules/study/generation.service.js';
import {
  QuizService,
  type QuizQuestionDraft,
  type QuizRecord,
  type QuizRepository,
} from '../src/modules/study/quiz.service.js';

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
    const material: MaterialRecord = {
      id: `material-${this.materials.length + 1}`,
      ...input,
      status: 'PROCESSING',
      chunkCount: 0,
      processingError: null,
      createdAt: now,
      updatedAt: now,
    };
    this.materials.push(material);
    return Promise.resolve(material);
  }
  listByUser(userId: string) { return Promise.resolve(this.materials.filter((material) => material.userId === userId)); }
  findByIdForUser(id: string, userId: string) { return Promise.resolve(this.materials.find((material) => material.id === id && material.userId === userId) ?? null); }
  deleteByIdForUser(id: string, userId: string) {
    const index = this.materials.findIndex((material) => material.id === id && material.userId === userId);
    return Promise.resolve(index < 0 ? null : (this.materials.splice(index, 1)[0] ?? null));
  }
  completeProcessing(id: string) {
    const material = this.materials.find((candidate) => candidate.id === id);
    if (!material) throw new Error('Material fixture not found.');
    material.status = 'READY';
    material.chunkCount = 1;
    material.updatedAt = new Date();
  }
}

class RecordingStudyAgent implements StudyAgent {
  readonly requests: StudyRequest[] = [];
  ask(input: StudyRequest): Promise<StudyAnswer> {
    this.requests.push(input);
    if (input.question.startsWith('Create exactly 2')) {
      return Promise.resolve({
        answer: JSON.stringify({
          title: 'Memory practice',
          questions: [
            {
              question: 'What strengthens long-term memory?',
              type: 'MULTIPLE_CHOICE',
              options: ['Spaced practice', 'Cramming'],
              correctAnswer: 'Spaced practice',
              explanation: 'The uploaded note states this directly.',
              sourceReference: 'learning-notes.txt',
            },
            {
              question: 'Cramming is the recommended method.',
              type: 'TRUE_FALSE',
              options: ['True', 'False'],
              correctAnswer: 'False',
              explanation: 'The note recommends spaced practice.',
              sourceReference: 'learning-notes.txt',
            },
          ],
        }),
        sources: ['learning-notes.txt'],
        groundingStatus: 'GROUNDED',
      });
    }
    return Promise.resolve({
      answer: input.history?.length ? 'It connects to your previous question through retrieval practice.' : 'Spaced practice strengthens long-term memory.',
      sources: ['learning-notes.txt'],
      groundingStatus: 'GROUNDED',
    });
  }
}

class MemoryChatRepository implements ChatRepository {
  private readonly conversations: ConversationDetail[] = [];
  constructor(private readonly materials: MemoryMaterialRepository) {}
  readyMaterialIds(userId: string, materialIds: string[]) {
    return Promise.resolve(materialIds.filter((id) => this.materials.materials.some((material) => material.id === id && material.userId === userId && material.status === 'READY')));
  }
  getContext(userId: string, conversationId: string | undefined) {
    if (!conversationId) return Promise.resolve([]);
    const conversation = this.conversations.find((candidate) => candidate.id === conversationId && candidate.id.startsWith(`${userId}:`));
    return Promise.resolve(conversation?.messages.slice(-12).map(({ role, content }) => ({ role, content })) ?? []);
  }
  saveTurn(userId: string, conversationId: string | undefined, question: string, answer: StudyAnswer) {
    const now = new Date();
    let conversation = this.conversations.find((candidate) => candidate.id === conversationId);
    if (!conversation) {
      conversation = { id: `${userId}:conversation-1`, title: question.slice(0, 80), updatedAt: now, messages: [] };
      this.conversations.push(conversation);
    }
    const messages: ConversationMessage[] = [
      { id: `message-${conversation.messages.length + 1}`, role: 'user', content: question, sources: [], groundingStatus: 'NOT_APPLICABLE', createdAt: now },
      { id: `message-${conversation.messages.length + 2}`, role: 'assistant', content: answer.answer, sources: answer.sources, groundingStatus: answer.groundingStatus, createdAt: now },
    ];
    conversation.messages.push(...messages);
    conversation.updatedAt = now;
    return Promise.resolve(conversation.id);
  }
  listConversations(userId: string) {
    const conversations: ConversationSummary[] = this.conversations
      .filter((conversation) => conversation.id.startsWith(`${userId}:`))
      .map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
        updatedAt: conversation.updatedAt,
        messageCount: conversation.messages.length,
        preview: conversation.messages.at(-1)?.content ?? '',
      }));
    return Promise.resolve({ conversations, nextCursor: null });
  }
  getConversation(userId: string, conversationId: string) {
    return Promise.resolve(this.conversations.find((conversation) => conversation.id === conversationId && conversation.id.startsWith(`${userId}:`)) ?? null);
  }
}

class MemoryGenerationRepository implements GenerationRepository {
  readonly artifacts: GeneratedArtifact[] = [];
  readyMaterialIds(_userId: string, materialIds: string[]) { return Promise.resolve(materialIds); }
  save(input: Omit<GeneratedArtifact, 'id' | 'createdAt'>) {
    const artifact = { ...input, id: `artifact-${this.artifacts.length + 1}`, createdAt: new Date() };
    this.artifacts.push(artifact);
    return Promise.resolve(artifact);
  }
  list(userId: string) { return Promise.resolve(this.artifacts.filter((artifact) => artifact.userId === userId)); }
  get(id: string, userId: string) {
    return Promise.resolve(this.artifacts.find((artifact) => artifact.id === id && artifact.userId === userId) ?? null);
  }
}

class MemoryQuizRepository implements QuizRepository {
  readonly quizzes: QuizRecord[] = [];
  constructor(private readonly materials: MemoryMaterialRepository) {}
  readyMaterialIds(userId: string, materialIds: string[]) {
    return Promise.resolve(materialIds.filter((id) => this.materials.materials.some((material) => material.id === id && material.userId === userId && material.status === 'READY')));
  }
  save(input: { userId: string; title: string; difficulty: QuizRecord['difficulty']; materialIds: string[]; questions: QuizQuestionDraft[] }) {
    const quiz: QuizRecord = {
      ...input,
      id: `quiz-${this.quizzes.length + 1}`,
      questionCount: input.questions.length,
      score: null,
      createdAt: new Date(),
      questions: input.questions.map((question, index) => ({ ...question, id: `question-${index + 1}`, userAnswer: null })),
    };
    this.quizzes.push(quiz);
    return Promise.resolve(quiz);
  }
  get(id: string, userId: string) { return Promise.resolve(this.quizzes.find((quiz) => quiz.id === id && quiz.userId === userId) ?? null); }
  saveSubmission(quizId: string, userId: string, score: number, answers: Array<{ questionId: string; answer: string }>) {
    const quiz = this.quizzes.find((candidate) => candidate.id === quizId && candidate.userId === userId);
    if (!quiz) throw new Error('Quiz fixture not found.');
    quiz.score = score;
    const submitted = new Map(answers.map((answer) => [answer.questionId, answer.answer]));
    quiz.questions.forEach((question) => { question.userAnswer = submitted.get(question.id) ?? ''; });
    return Promise.resolve(quiz);
  }
  list(userId: string) { return Promise.resolve(this.quizzes.filter((quiz) => quiz.userId === userId)); }
}

type Body = Record<string, unknown>;
const secret = 'test-only-jwt-secret-with-at-least-32-characters';

describe('StudyMate learning flow acceptance', () => {
  let server: Server;
  let storageDirectory: string;
  let materials: MemoryMaterialRepository;
  let studyAgent: RecordingStudyAgent;

  beforeEach(() => {
    storageDirectory = path.join(tmpdir(), `studymate-acceptance-${crypto.randomUUID()}`);
    materials = new MemoryMaterialRepository();
    studyAgent = new RecordingStudyAgent();
    server = createApp({
      authService: new AuthService(new MemoryUserRepository(), secret),
      materialService: new MaterialService(materials, storageDirectory),
      chatService: new ChatService(new MemoryChatRepository(materials), studyAgent),
      generationService: new GenerationService(new MemoryGenerationRepository(), studyAgent),
      quizService: new QuizService(new MemoryQuizRepository(materials), studyAgent),
    }).listen();
  });

  afterEach(async () => {
    server.close();
    await rm(storageDirectory, { recursive: true, force: true });
  });

  it('runs register, upload, processing, multi-turn study, quiz scoring, and history restore', async () => {
    const agent = request.agent(server);
    const csrf = await agent.get('/api/auth/csrf');
    const csrfToken = (csrf.body as Body).csrfToken as string;
    const registered = await agent.post('/api/auth/register').set('X-CSRF-Token', csrfToken).send({
      name: 'Ada Lovelace', email: 'ada@example.com', password: 'correct-horse',
    });
    expect(registered.status).toBe(201);

    const uploaded = await agent.post('/api/materials').set('X-CSRF-Token', csrfToken).attach(
      'file',
      Buffer.from('Spaced practice strengthens long-term memory.'),
      { filename: 'learning-notes.txt', contentType: 'text/plain' },
    );
    expect(uploaded.status).toBe(201);
    const uploadedBody = uploaded.body as { material: { id: string; status: string } };
    expect(uploadedBody.material).toMatchObject({ id: 'material-1', status: 'PROCESSING' });

    materials.completeProcessing('material-1');
    const library = await agent.get('/api/materials');
    const libraryBody = library.body as { materials: Array<{ id: string; status: string; chunkCount: number }> };
    expect(libraryBody.materials).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'material-1', status: 'READY', chunkCount: 1 })]));

    const firstTurn = await agent.post('/api/study/chat').set('X-CSRF-Token', csrfToken).send({
      question: 'Summarize the selected material.', materialIds: ['material-1'], language: 'en', beginnerMode: true,
      retrievalMode: 'selected',
    });
    expect(firstTurn.status).toBe(201);
    const firstTurnBody = firstTurn.body as { conversationId: string; groundingStatus: string; sources: string[] };
    expect(firstTurnBody).toMatchObject({ groundingStatus: 'GROUNDED', sources: ['learning-notes.txt'] });
    expect(studyAgent.requests.at(-1)?.retrievalMode).toBe('selected');
    const { conversationId } = firstTurnBody;

    const secondTurn = await agent.post('/api/study/chat').set('X-CSRF-Token', csrfToken).send({
      question: 'How does that connect to retrieval?', materialIds: ['material-1'], conversationId, language: 'en', beginnerMode: false,
    });
    expect(secondTurn.status).toBe(201);
    expect(studyAgent.requests.at(-1)?.history).toHaveLength(2);
    expect(studyAgent.requests.at(-1)?.retrievalMode).toBe('semantic');

    const generated = await agent.post('/api/quizzes').set('X-CSRF-Token', csrfToken).send({
      materialIds: ['material-1'], language: 'en', difficulty: 'MEDIUM', questionCount: 2,
    });
    expect(generated.status).toBe(201);
    const generatedBody = generated.body as { quiz: { questions: Array<Record<string, unknown>> } };
    expect(generatedBody.quiz.questions).toHaveLength(2);
    expect(generatedBody.quiz.questions[0]).not.toHaveProperty('correctAnswer');
    expect(generatedBody.quiz.questions[0]).not.toHaveProperty('explanation');

    const submitted = await agent.post('/api/quizzes/quiz-1/submit').set('X-CSRF-Token', csrfToken).send({
      answers: [
        { questionId: 'question-1', answer: 'Spaced practice' },
        { questionId: 'question-2', answer: 'True' },
      ],
    });
    expect(submitted.status).toBe(200);
    const submittedBody = submitted.body as { quiz: { score: number; questions: Array<Record<string, unknown>> } };
    expect(submittedBody.quiz.score).toBe(50);
    expect(submittedBody.quiz.questions[0]).toMatchObject({ correctAnswer: 'Spaced practice', sourceReference: 'learning-notes.txt' });

    const conversations = await agent.get('/api/study/conversations');
    const conversationsBody = conversations.body as { conversations: Array<{ id: string; messageCount: number }> };
    expect(conversationsBody.conversations).toEqual([expect.objectContaining({ id: conversationId, messageCount: 4 })]);
    const restored = await agent.get(`/api/study/conversations/${encodeURIComponent(conversationId)}`);
    const restoredBody = restored.body as { conversation: { messages: unknown[] } };
    expect(restoredBody.conversation.messages).toHaveLength(4);
    const quizzes = await agent.get('/api/quizzes');
    const quizzesBody = quizzes.body as { quizzes: Array<{ id: string; score: number }> };
    expect(quizzesBody.quizzes).toEqual([expect.objectContaining({ id: 'quiz-1', score: 50 })]);
  });
});
