import { http } from '../../services/http';

export type DashboardData = {
  materialCount: number;
  conversationCount: number;
  practiceQuestionCount: number;
  examReviewCount: number;
  quizAccuracy: number | null;
  recentMaterials: Array<{ id: string; originalName: string; status: 'UPLOADING' | 'PROCESSING' | 'READY' | 'FAILED'; size: number; createdAt: string; updatedAt: string }>;
  recentConversations: Array<{ id: string; title: string; updatedAt: string; messageCount: number; preview: string }>;
};

export async function getDashboard(): Promise<DashboardData> {
  return (await http.get<DashboardData>('/dashboard')).data;
}
