import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { LocalUserRepository } from '../src/local/local-auth.repository.js';
import { LocalChatRepository } from '../src/local/local-chat.repository.js';
import { LocalGenerationRepository } from '../src/local/local-generation.repository.js';
import { LocalMaterialRepository } from '../src/local/local-material.repository.js';
import { LocalProcessingRepository } from '../src/local/local-processing.repository.js';
import { LocalQuizRepository } from '../src/local/local-quiz.repository.js';
import { LocalStore } from '../src/local/local-store.js';
import { ChatService, type StudyAgent } from '../src/modules/study/chat.service.js';
import { GenerationService } from '../src/modules/study/generation.service.js';
import type { StudyAnswer, StudyRequest } from '../src/modules/study/grounded-study-agent.js';
import { QuizService } from '../src/modules/study/quiz.service.js';

const directories: string[] = [];

class QueueAgent implements StudyAgent {
  readonly requests: StudyRequest[] = [];
  constructor(private readonly answers: StudyAnswer[]) {}
  ask(request: StudyRequest): Promise<StudyAnswer> {
    this.requests.push(request);
    const answer = this.answers.shift();
    if (!answer) throw new Error('Missing test answer.');
    return Promise.resolve(answer);
  }
}

async function fixture() {
  const directory = path.join(tmpdir(), `studymate-local-study-${crypto.randomUUID()}`);
  directories.push(directory);
  const statePath = path.join(directory, 'state.json');
  const store = new LocalStore(statePath);
  const users = new LocalUserRepository(store);
  const owner = await users.create({ name: 'Owner', email: 'owner@example.com', passwordHash: 'hash' });
  const materials = new LocalMaterialRepository(store);
  const material = await materials.createWithJob({
    userId: owner.id, originalName: 'notes.txt', storedName: 'notes.txt', storagePath: path.join(directory, 'notes.txt'),
    mimeType: 'text/plain', extension: 'txt', size: 12, checksum: 'checksum',
  });
  const processing = new LocalProcessingRepository(store);
  const job = await processing.claimNext('test-worker');
  await processing.complete(job?.id ?? '', job?.lockOwner ?? '', material.id, 1);
  return { directory, statePath, store, owner, material };
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('local study repositories', () => {
  it('persists two chat turns and restores bounded context', async () => {
    const { statePath, store, owner, material } = await fixture();
    const agent = new QueueAgent([
      { answer: 'First answer', sources: ['notes.txt'], groundingStatus: 'GROUNDED' },
      { answer: 'Second answer', sources: ['notes.txt'], groundingStatus: 'GROUNDED' },
    ]);
    const service = new ChatService(new LocalChatRepository(store), agent);
    const first = await service.send({
      userId: owner.id, question: 'First question', materialIds: [material.id], language: 'en', beginnerMode: false,
    });
    await service.send({
      userId: owner.id, question: 'Second question', materialIds: [material.id], conversationId: first.conversationId,
      language: 'en', beginnerMode: false,
    });

    expect(agent.requests[1]?.history).toHaveLength(2);
    const reloaded = new LocalChatRepository(new LocalStore(statePath));
    await expect(reloaded.getConversation(owner.id, first.conversationId))
      .resolves.toMatchObject({ messages: [{ content: 'First question' }, { content: 'First answer' }, { content: 'Second question' }, { content: 'Second answer' }] });
    await expect(reloaded.getConversation('other-user', first.conversationId)).resolves.toBeNull();
  });

  it('persists and owns generated artifacts', async () => {
    const { statePath, store, owner, material } = await fixture();
    const service = new GenerationService(
      new LocalGenerationRepository(store),
      new QueueAgent([{ answer: 'Summary text', sources: ['notes.txt'], groundingStatus: 'GROUNDED' }]),
    );
    const artifact = await service.generate({ userId: owner.id, type: 'SUMMARY', materialIds: [material.id], language: 'en' });
    await store.flush();

    const reloaded = new LocalGenerationRepository(new LocalStore(statePath));
    await expect(reloaded.get(artifact.id, owner.id)).resolves.toMatchObject({ text: 'Summary text', materialIds: [material.id] });
    await expect(reloaded.get(artifact.id, 'other-user')).resolves.toBeNull();
  });

  it('persists a scored quiz without exposing it to another user', async () => {
    const { statePath, store, owner, material } = await fixture();
    const quizJson = JSON.stringify({
      title: 'Retention quiz',
      questions: [
        { question: 'Spacing improves retention.', type: 'TRUE_FALSE', options: ['True', 'False'], correctAnswer: 'True', explanation: 'The note states this.', sourceReference: 'notes.txt' },
        { question: 'Which method helps?', type: 'MULTIPLE_CHOICE', options: ['Spacing', 'Cramming'], correctAnswer: 'Spacing', explanation: 'Spacing helps.', sourceReference: 'notes.txt' },
      ],
    });
    const service = new QuizService(
      new LocalQuizRepository(store),
      new QueueAgent([{ answer: quizJson, sources: ['notes.txt'], groundingStatus: 'GROUNDED' }]),
    );
    const quiz = await service.generate({ userId: owner.id, materialIds: [material.id], language: 'en', difficulty: 'MEDIUM', questionCount: 2 });
    const submitted = await service.submit(owner.id, quiz.id, [
      { questionId: quiz.questions[0]?.id ?? '', answer: 'True' },
      { questionId: quiz.questions[1]?.id ?? '', answer: 'Cramming' },
    ]);
    expect(submitted.score).toBe(50);
    await store.flush();

    const reloaded = new LocalQuizRepository(new LocalStore(statePath));
    await expect(reloaded.get(quiz.id, owner.id)).resolves.toMatchObject({ score: 50 });
    await expect(reloaded.get(quiz.id, 'other-user')).resolves.toBeNull();
  });
});
