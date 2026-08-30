import { describe, expect, it } from 'vitest';

import { QuizService, type QuizQuestionDraft, type QuizRecord, type QuizRepository } from '../src/modules/study/quiz.service.js';
import type { StudyAgent } from '../src/modules/study/chat.service.js';
import type { StudyAnswer, StudyRequest } from '../src/modules/study/grounded-study-agent.js';

class FakeAgent implements StudyAgent {
  requests: StudyRequest[] = [];
  answers: StudyAnswer[] = [];
  ask(request: StudyRequest) {
    this.requests.push(request);
    const answer = this.answers.shift();
    if (!answer) throw new Error('Missing fake answer.');
    return Promise.resolve(answer);
  }
}

class FakeQuizRepository implements QuizRepository {
  saved: QuizRecord | null = null;
  readyMaterialIds(_userId: string, ids: string[]) { return Promise.resolve(ids.filter((id) => id === 'owned')); }
  save(input: Parameters<QuizRepository['save']>[0]) {
    const now = new Date();
    this.saved = {
      id: 'quiz-1', userId: input.userId, title: input.title, difficulty: input.difficulty,
      questionCount: input.questions.length, score: null, materialIds: input.materialIds, createdAt: now,
      questions: input.questions.map((question, index) => ({ id: `question-${index + 1}`, userAnswer: null, ...question })),
    };
    return Promise.resolve(this.saved);
  }
  get(id: string, userId: string) { return Promise.resolve(this.saved?.id === id && this.saved.userId === userId ? this.saved : null); }
  saveSubmission(_quizId: string, _userId: string, score: number, answers: Array<{ questionId: string; answer: string }>) {
    if (!this.saved) throw new Error('No quiz.');
    this.saved.score = score;
    for (const item of answers) {
      const question = this.saved.questions.find((candidate) => candidate.id === item.questionId);
      if (question) question.userAnswer = item.answer;
    }
    return Promise.resolve(this.saved);
  }
  list(userId: string) { return Promise.resolve(this.saved?.userId === userId ? [this.saved] : []); }
}

const validQuestions: QuizQuestionDraft[] = [
    { question: 'Working memory is unlimited.', type: 'TRUE_FALSE', options: ['True', 'False'], correctAnswer: 'False', explanation: 'It has limited capacity.', sourceReference: 'notes.txt' },
    { question: 'Which technique improves retention?', type: 'MULTIPLE_CHOICE', options: ['Cramming', 'Spaced practice'], correctAnswer: 'Spaced practice', explanation: 'Spacing supports retention.', sourceReference: 'notes.txt' },
];
const validQuiz = JSON.stringify({ title: 'Memory practice', questions: validQuestions });

describe('QuizService', () => {
  it('constrains generation and validation to requested question types', async () => {
    const questions: QuizQuestionDraft[] = [
      validQuestions[0]!,
      { ...validQuestions[0]!, question: 'Retrieval practice strengthens memory.' },
    ];
    const agent = new FakeAgent();
    agent.answers = [{ answer: JSON.stringify({ title: 'True or false', questions }), sources: ['notes.txt'], groundingStatus: 'GROUNDED' }];
    const service = new QuizService(new FakeQuizRepository(), agent);

    await service.generate({ userId: 'user-1', materialIds: ['owned'], language: 'en', difficulty: 'EASY', questionCount: 2, questionTypes: ['TRUE_FALSE'] });

    expect(agent.requests[0]?.question).toContain('Use only these question types: TRUE_FALSE');
    expect(agent.requests[0]?.retrievalMode).toBe('selected');
    expect(agent.requests[0]?.responseFormat).toMatchObject({ type: 'json_schema', name: 'studymate_quiz' });
  });

  it('repairs two invalid model responses, validates sources, and persists only the valid quiz', async () => {
    const agent = new FakeAgent();
    agent.answers = [
      { answer: 'not json', sources: ['notes.txt'], groundingStatus: 'GROUNDED' },
      { answer: '{"title":"Still missing questions"}', sources: ['notes.txt'], groundingStatus: 'GROUNDED' },
      { answer: validQuiz, sources: ['notes.txt'], groundingStatus: 'GROUNDED' },
    ];
    const repository = new FakeQuizRepository();
    const service = new QuizService(repository, agent);

    const quiz = await service.generate({ userId: 'user-1', materialIds: ['owned', 'foreign'], language: 'en', difficulty: 'MEDIUM', questionCount: 2 });

    expect(agent.requests).toHaveLength(3);
    expect(agent.requests[0]?.materialIds).toEqual(['owned']);
    expect(quiz.questions).toHaveLength(2);
    expect(repository.saved?.title).toBe('Memory practice');
  });

  it('scores answers and rejects access to another user quiz', async () => {
    const repository = new FakeQuizRepository();
    const service = new QuizService(repository, new FakeAgent());
    await repository.save({
      userId: 'owner', title: 'Quiz', difficulty: 'EASY', materialIds: ['owned'],
      questions: validQuestions,
    });

    const result = await service.submit('owner', 'quiz-1', [
      { questionId: 'question-1', answer: 'false' },
      { questionId: 'question-2', answer: 'Cramming' },
    ]);

    expect(result.score).toBe(50);
    await expect(service.submit('owner', 'quiz-1', [{ questionId: 'question-1', answer: 'False' }]))
      .rejects.toMatchObject({ code: 'QUIZ_ALREADY_SUBMITTED' });
    await expect(service.get('other-user', 'quiz-1')).rejects.toMatchObject({ code: 'QUIZ_NOT_FOUND' });
  });
});
