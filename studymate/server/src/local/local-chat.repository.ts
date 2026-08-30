import { randomUUID } from 'node:crypto';

import { AppError } from '../shared/app-error.js';
import type { StudyAnswer } from '../modules/study/grounded-study-agent.js';
import type { ChatRepository, ConversationDetail } from '../modules/study/chat.service.js';
import type { LocalConversation, LocalMessage } from './local-state.js';
import type { LocalStore } from './local-store.js';

function detail(conversation: LocalConversation, messages: LocalMessage[]): ConversationDetail {
  return {
    id: conversation.id,
    title: conversation.title,
    updatedAt: new Date(conversation.updatedAt),
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role === 'USER' ? 'user' : 'assistant',
      content: message.content,
      sources: [...message.sources],
      groundingStatus: message.groundingStatus,
      createdAt: new Date(message.createdAt),
    })),
  };
}

export class LocalChatRepository implements ChatRepository {
  constructor(private readonly store: LocalStore) {}

  async readyMaterialIds(userId: string, materialIds: string[]): Promise<string[]> {
    const state = await this.store.read();
    const ready = new Set(state.materials.filter((material) => material.userId === userId && material.status === 'READY').map((material) => material.id));
    return materialIds.filter((id) => ready.has(id));
  }

  async getContext(userId: string, conversationId: string | undefined) {
    if (!conversationId) return [];
    const state = await this.store.read();
    const conversation = state.conversations.find((candidate) => candidate.id === conversationId && candidate.userId === userId);
    if (!conversation) throw new AppError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');
    return state.messages.filter((message) => message.conversationId === conversationId).slice(-12).map((message) => ({
      role: message.role === 'USER' ? 'user' as const : 'assistant' as const,
      content: message.content,
    }));
  }

  saveTurn(userId: string, conversationId: string | undefined, question: string, answer: StudyAnswer): Promise<string> {
    return this.store.update((state) => {
      const now = new Date().toISOString();
      let conversation = conversationId
        ? state.conversations.find((candidate) => candidate.id === conversationId && candidate.userId === userId)
        : undefined;
      if (conversationId && !conversation) throw new AppError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');
      if (!conversation) {
        conversation = { id: randomUUID(), userId, title: question.trim().slice(0, 80), createdAt: now, updatedAt: now };
        state.conversations.push(conversation);
      }
      state.messages.push({
        id: randomUUID(), conversationId: conversation.id, role: 'USER', content: question,
        sources: [], groundingStatus: 'NOT_APPLICABLE', createdAt: now,
      });
      state.messages.push({
        id: randomUUID(), conversationId: conversation.id, role: 'ASSISTANT', content: answer.answer,
        sources: [...answer.sources], groundingStatus: answer.groundingStatus, createdAt: now,
      });
      conversation.updatedAt = now;
      return conversation.id;
    });
  }

  async listConversations(userId: string, cursor: string | undefined) {
    const state = await this.store.read();
    const rows = state.conversations
      .filter((conversation) => conversation.userId === userId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id));
    const start = cursor ? Math.max(0, rows.findIndex((row) => row.id === cursor) + 1) : 0;
    const page = rows.slice(start, start + 20);
    return {
      conversations: page.map((conversation) => {
        const messages = state.messages.filter((message) => message.conversationId === conversation.id);
        return {
          id: conversation.id,
          title: conversation.title,
          updatedAt: new Date(conversation.updatedAt),
          messageCount: messages.length,
          preview: messages.at(-1)?.content.slice(0, 180) ?? '',
        };
      }),
      nextCursor: rows.length > start + 20 ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async getConversation(userId: string, conversationId: string): Promise<ConversationDetail | null> {
    const state = await this.store.read();
    const conversation = state.conversations.find((candidate) => candidate.id === conversationId && candidate.userId === userId);
    if (!conversation) return null;
    return detail(conversation, state.messages.filter((message) => message.conversationId === conversationId));
  }
}
