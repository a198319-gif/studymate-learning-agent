export type DashboardMaterial = {
  id: string;
  originalName: string;
  status: 'UPLOADING' | 'PROCESSING' | 'READY' | 'FAILED';
  size: number;
  createdAt: Date;
  updatedAt: Date;
};

export type DashboardConversation = {
  id: string;
  title: string;
  updatedAt: Date;
  messageCount: number;
  preview: string;
};

export type DashboardData = {
  materialCount: number;
  conversationCount: number;
  practiceQuestionCount: number;
  examReviewCount: number;
  quizAccuracy: number | null;
  recentMaterials: DashboardMaterial[];
  recentConversations: DashboardConversation[];
};

export interface DashboardRepository {
  get(userId: string): Promise<DashboardData>;
}

export class DashboardService {
  constructor(private readonly repository: DashboardRepository) {}

  get(userId: string): Promise<DashboardData> {
    return this.repository.get(userId);
  }
}
