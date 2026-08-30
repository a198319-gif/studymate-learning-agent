import { prisma } from '../../config/prisma.js';
import { AppError } from '../../shared/app-error.js';
import type { StudyAnswer } from './grounded-study-agent.js';
import type { ChatRepository } from './chat.service.js';
import { z } from 'zod';

const sourcesSchema = z.array(z.string());

export class PrismaChatRepository implements ChatRepository {
  async readyMaterialIds(userId: string, materialIds: string[]): Promise<string[]> {
    const materials = await prisma.material.findMany({
      where: { userId, id: { in: materialIds }, status: 'READY' },
      select: { id: true },
    });
    const owned = new Set(materials.map((material) => material.id));
    return materialIds.filter((id) => owned.has(id));
  }

  async getContext(userId: string, conversationId: string | undefined) {
    if (!conversationId) return [];
    const conversation = await prisma.conversation.findFirst({ where: { id: conversationId, userId } });
    if (!conversation) throw new AppError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');
    const messages = await prisma.message.findMany({
      where: { conversationId }, orderBy: { createdAt: 'desc' }, take: 12,
      select: { role: true, content: true },
    });
    return messages.reverse().map((message) => ({
      role: message.role === 'USER' ? 'user' as const : 'assistant' as const,
      content: message.content,
    }));
  }

  async saveTurn(userId: string, conversationId: string | undefined, question: string, answer: StudyAnswer): Promise<string> {
    return prisma.$transaction(async (transaction) => {
      let id = conversationId;
      if (id) {
        const conversation = await transaction.conversation.findFirst({ where: { id, userId } });
        if (!conversation) throw new AppError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');
      } else {
        const conversation = await transaction.conversation.create({
          data: { userId, title: question.trim().slice(0, 80) },
        });
        id = conversation.id;
      }
      await transaction.message.create({
        data: { conversationId: id, role: 'USER', content: question, groundingStatus: 'NOT_APPLICABLE' },
      });
      await transaction.message.create({
        data: {
          conversationId: id,
          role: 'ASSISTANT',
          content: answer.answer,
          sources: answer.sources,
          groundingStatus: answer.groundingStatus,
        },
      });
      await transaction.conversation.update({ where: { id }, data: { updatedAt: new Date() } });
      return id;
    });
  }

  async listConversations(userId: string, cursor: string | undefined) {
    const rows = await prisma.conversation.findMany({
      where: { userId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 21,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { _count: { select: { messages: true } }, messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    const hasMore = rows.length > 20;
    const page = rows.slice(0, 20);
    return {
      conversations: page.map((row) => ({
        id: row.id, title: row.title, updatedAt: row.updatedAt,
        messageCount: row._count.messages, preview: row.messages[0]?.content.slice(0, 180) ?? '',
      })),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async getConversation(userId: string, conversationId: string) {
    const row = await prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!row) return null;
    return {
      id: row.id, title: row.title, updatedAt: row.updatedAt,
      messages: row.messages.map((message) => {
        const sources = sourcesSchema.safeParse(message.sources);
        return {
          id: message.id,
          role: message.role === 'USER' ? 'user' as const : 'assistant' as const,
          content: message.content,
          sources: sources.success ? sources.data : [],
          groundingStatus: message.groundingStatus,
          createdAt: message.createdAt,
        };
      }),
    };
  }
}
