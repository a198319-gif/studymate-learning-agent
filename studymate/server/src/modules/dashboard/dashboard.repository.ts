import { prisma } from '../../config/prisma.js';
import type { DashboardData, DashboardRepository } from './dashboard.service.js';

export class PrismaDashboardRepository implements DashboardRepository {
  async get(userId: string): Promise<DashboardData> {
    const [
      materialCount,
      conversationCount,
      quizAggregate,
      examReviewCount,
      recentMaterials,
      recentConversations,
    ] = await Promise.all([
      prisma.material.count({ where: { userId } }),
      prisma.conversation.count({ where: { userId } }),
      prisma.quiz.aggregate({ where: { userId }, _sum: { questionCount: true }, _avg: { score: true } }),
      prisma.generatedContent.count({ where: { userId, type: 'EXAM_REVIEW' } }),
      prisma.material.findMany({
        where: { userId }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: 4,
        select: { id: true, originalName: true, status: true, size: true, createdAt: true, updatedAt: true },
      }),
      prisma.conversation.findMany({
        where: { userId }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: 4,
        include: { _count: { select: { messages: true } }, messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
      }),
    ]);

    const average = quizAggregate._avg.score;
    return {
      materialCount,
      conversationCount,
      practiceQuestionCount: quizAggregate._sum.questionCount ?? 0,
      examReviewCount,
      quizAccuracy: average === null ? null : Math.round(average),
      recentMaterials,
      recentConversations: recentConversations.map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
        updatedAt: conversation.updatedAt,
        messageCount: conversation._count.messages,
        preview: conversation.messages[0]?.content.slice(0, 180) ?? '',
      })),
    };
  }
}
