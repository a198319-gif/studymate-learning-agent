import type { DashboardData, DashboardRepository } from '../modules/dashboard/dashboard.service.js';
import type { LocalStore } from './local-store.js';

function newestFirst(left: { updatedAt: string; id: string }, right: { updatedAt: string; id: string }): number {
  return right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id);
}

export class LocalDashboardRepository implements DashboardRepository {
  constructor(private readonly store: LocalStore) {}

  async get(userId: string): Promise<DashboardData> {
    const state = await this.store.read();
    const materials = state.materials.filter((material) => material.userId === userId);
    const conversations = state.conversations.filter((conversation) => conversation.userId === userId);
    const quizzes = state.quizzes.filter((quiz) => quiz.userId === userId);
    const scored = quizzes.flatMap((quiz) => quiz.score === null ? [] : [quiz.score]);

    return {
      materialCount: materials.length,
      conversationCount: conversations.length,
      practiceQuestionCount: quizzes.reduce((total, quiz) => total + quiz.questionCount, 0),
      examReviewCount: state.artifacts.filter((artifact) => artifact.userId === userId && artifact.type === 'EXAM_REVIEW').length,
      quizAccuracy: scored.length === 0 ? null : Math.round(scored.reduce((total, score) => total + score, 0) / scored.length),
      recentMaterials: materials.sort(newestFirst).slice(0, 4).map((material) => ({
        id: material.id,
        originalName: material.originalName,
        status: material.status,
        size: material.size,
        createdAt: new Date(material.createdAt),
        updatedAt: new Date(material.updatedAt),
      })),
      recentConversations: conversations.sort(newestFirst).slice(0, 4).map((conversation) => {
        const messages = state.messages
          .filter((message) => message.conversationId === conversation.id)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
        return {
          id: conversation.id,
          title: conversation.title,
          updatedAt: new Date(conversation.updatedAt),
          messageCount: messages.length,
          preview: messages[0]?.content.slice(0, 180) ?? '',
        };
      }),
    };
  }
}
