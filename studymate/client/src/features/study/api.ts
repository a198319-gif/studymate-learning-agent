import { http } from '../../services/http';

export type StudyAnswer = {
  conversationId: string;
  answer: string;
  sources: string[];
  groundingStatus: 'GROUNDED' | 'INSUFFICIENT';
};

export async function sendStudyMessage(input: {
  question: string;
  materialIds: string[];
  conversationId?: string;
  language: 'en' | 'zh';
  beginnerMode: boolean;
  retrievalMode: 'semantic' | 'selected';
}): Promise<StudyAnswer> {
  const response = await http.post<StudyAnswer>('/study/chat', input);
  return response.data;
}

export type GenerationType = 'SUMMARY' | 'KEY_POINTS' | 'QUIZ' | 'EXAM_REVIEW';

export type GeneratedArtifact = {
  id: string;
  type: GenerationType;
  title: string;
  materialIds: string[];
  text: string;
  sources: string[];
  groundingStatus: 'GROUNDED' | 'INSUFFICIENT';
  createdAt: string;
};

export async function generateStudyArtifact(input: { type: GenerationType; materialIds: string[]; language: 'en' | 'zh' }): Promise<GeneratedArtifact> {
  const response = await http.post<{ artifact: GeneratedArtifact }>('/study/generate', input);
  return response.data.artifact;
}

export async function listStudyHistory(): Promise<GeneratedArtifact[]> {
  const response = await http.get<{ artifacts: GeneratedArtifact[] }>('/study/history');
  return response.data.artifacts;
}

export async function getStudyArtifact(id: string): Promise<GeneratedArtifact> {
  const response = await http.get<{ artifact: GeneratedArtifact }>(`/study/artifacts/${id}`);
  return response.data.artifact;
}

export type QuizQuestion = {
  id: string;
  question: string;
  type: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_ANSWER';
  options: string[] | null;
  userAnswer: string | null;
  sourceReference: string;
  correctAnswer?: string;
  explanation?: string;
};

export type Quiz = {
  id: string;
  title: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  questionCount: number;
  score: number | null;
  materialIds: string[];
  createdAt: string;
  questions: QuizQuestion[];
};

export async function generateQuiz(input: { materialIds: string[]; language: 'en' | 'zh'; difficulty: Quiz['difficulty']; questionCount: number; questionTypes: QuizQuestion['type'][] }): Promise<Quiz> {
  const response = await http.post<{ quiz: Quiz }>('/quizzes', input);
  return response.data.quiz;
}

export async function submitQuiz(quizId: string, answers: Array<{ questionId: string; answer: string }>): Promise<Quiz> {
  const response = await http.post<{ quiz: Quiz }>(`/quizzes/${quizId}/submit`, { answers });
  return response.data.quiz;
}

export async function listQuizzes(): Promise<Quiz[]> {
  const response = await http.get<{ quizzes: Quiz[] }>('/quizzes');
  return response.data.quizzes;
}

export async function getQuiz(quizId: string): Promise<Quiz> {
  const response = await http.get<{ quiz: Quiz }>(`/quizzes/${quizId}`);
  return response.data.quiz;
}

export type ConversationSummary = { id: string; title: string; updatedAt: string; messageCount: number; preview: string };
export type ConversationDetail = { id: string; title: string; updatedAt: string; messages: Array<{ id: string; role: 'user' | 'assistant'; content: string; sources: string[]; groundingStatus: string; createdAt: string }> };

export async function listConversations(cursor?: string): Promise<{ conversations: ConversationSummary[]; nextCursor: string | null }> {
  const response = await http.get<{ conversations: ConversationSummary[]; nextCursor: string | null }>('/study/conversations', { params: cursor ? { cursor } : undefined });
  return response.data;
}

export async function getConversation(conversationId: string): Promise<ConversationDetail> {
  const response = await http.get<{ conversation: ConversationDetail }>(`/study/conversations/${conversationId}`);
  return response.data.conversation;
}
