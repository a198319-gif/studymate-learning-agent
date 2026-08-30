import type { StudyAnswer, StudyRequest } from './grounded-study-agent.js';
import { AppError } from '../../shared/app-error.js';

export interface StudyAgent {
  ask(request: StudyRequest): Promise<StudyAnswer>;
}

export interface ChatRepository {
  readyMaterialIds(userId: string, materialIds: string[]): Promise<string[]>;
  getContext(userId: string, conversationId: string | undefined): Promise<Array<{ role: 'user' | 'assistant'; content: string }>>;
  saveTurn(userId: string, conversationId: string | undefined, question: string, answer: StudyAnswer): Promise<string>;
  listConversations(userId: string, cursor: string | undefined): Promise<{ conversations: ConversationSummary[]; nextCursor: string | null }>;
  getConversation(userId: string, conversationId: string): Promise<ConversationDetail | null>;
}

export type ConversationMessage = { id: string; role: 'user' | 'assistant'; content: string; sources: string[]; groundingStatus: string; createdAt: Date };
export type ConversationSummary = { id: string; title: string; updatedAt: Date; messageCount: number; preview: string };
export type ConversationDetail = { id: string; title: string; updatedAt: Date; messages: ConversationMessage[] };

export type SendChatInput = Omit<StudyRequest, 'materialIds'> & {
  materialIds: string[];
  conversationId?: string | undefined;
};

export class ChatService {
  constructor(
    private readonly repository: ChatRepository,
    private readonly agent: StudyAgent,
  ) {}

  async send(input: SendChatInput): Promise<StudyAnswer & { conversationId: string }> {
    const materialIds = await this.repository.readyMaterialIds(input.userId, [...new Set(input.materialIds)]);
    const history = await this.repository.getContext(input.userId, input.conversationId);
    const answer = await this.agent.ask({
      userId: input.userId,
      question: input.question,
      materialIds,
      language: input.language,
      beginnerMode: input.beginnerMode,
      ...(input.retrievalMode ? { retrievalMode: input.retrievalMode } : {}),
      history,
    });
    const conversationId = await this.repository.saveTurn(input.userId, input.conversationId, input.question, answer);
    return { conversationId, ...answer };
  }

  listConversations(userId: string, cursor?: string) {
    return this.repository.listConversations(userId, cursor);
  }

  async getConversation(userId: string, conversationId: string): Promise<ConversationDetail> {
    const conversation = await this.repository.getConversation(userId, conversationId);
    if (!conversation) throw new AppError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');
    return conversation;
  }
}
