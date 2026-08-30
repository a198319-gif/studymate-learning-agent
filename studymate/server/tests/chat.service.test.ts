import { describe, expect, it } from 'vitest';

import { ChatService, type ChatRepository, type StudyAgent } from '../src/modules/study/chat.service.js';
import type { StudyAnswer, StudyRequest } from '../src/modules/study/grounded-study-agent.js';

class FakeAgent implements StudyAgent {
  requests: StudyRequest[] = [];
  error: Error | null = null;
  ask(request: StudyRequest): Promise<StudyAnswer> {
    this.requests.push(request);
    if (this.error) return Promise.reject(this.error);
    return Promise.resolve({ answer: 'Answer from notes.', sources: ['notes.txt'], groundingStatus: 'GROUNDED' });
  }
}

class FakeChatRepository implements ChatRepository {
  messages: Array<{ role: string; content: string }> = [];
  readyMaterialIds(_userId: string, materialIds: string[]) { return Promise.resolve(materialIds.filter((id) => id === 'owned-ready')); }
  getContext(_userId: string, conversationId: string | undefined) {
    return Promise.resolve(conversationId ? [{ role: 'user' as const, content: 'Earlier question' }, { role: 'assistant' as const, content: 'Earlier answer' }] : []);
  }
  saveTurn(_userId: string, _conversationId: string | undefined, question: string, answer: StudyAnswer) {
    this.messages.push({ role: 'USER', content: question });
    this.messages.push({ role: 'ASSISTANT', content: answer.answer });
    return Promise.resolve('conversation-1');
  }
  listConversations(userId: string, cursor: string | undefined) { void userId; void cursor; return Promise.resolve({ conversations: [], nextCursor: null }); }
  getConversation(userId: string, conversationId: string) { void userId; void conversationId; return Promise.resolve(null); }
}

describe('ChatService', () => {
  it('passes only authenticated ready materials to the grounded agent and persists the turn', async () => {
    const agent = new FakeAgent();
    const repository = new FakeChatRepository();
    const service = new ChatService(repository, agent);

    const result = await service.send({
      userId: 'user-1', question: 'What should I remember?', materialIds: ['owned-ready', 'another-user'],
      language: 'en', beginnerMode: true, conversationId: 'conversation-1',
    });

    expect(agent.requests[0]?.materialIds).toEqual(['owned-ready']);
    expect(agent.requests[0]?.history).toEqual([
      { role: 'user', content: 'Earlier question' },
      { role: 'assistant', content: 'Earlier answer' },
    ]);
    expect(repository.messages).toEqual([
      { role: 'USER', content: 'What should I remember?' },
      { role: 'ASSISTANT', content: 'Answer from notes.' },
    ]);
    expect(result).toMatchObject({ conversationId: 'conversation-1', groundingStatus: 'GROUNDED' });
  });

  it('does not persist half a turn when the model fails', async () => {
    const agent = new FakeAgent();
    agent.error = new Error('provider failed');
    const repository = new FakeChatRepository();
    const service = new ChatService(repository, agent);

    await expect(service.send({ userId: 'user-1', question: 'Follow up', materialIds: ['owned-ready'], language: 'en', beginnerMode: false }))
      .rejects.toThrow('provider failed');
    expect(repository.messages).toEqual([]);
  });
});
