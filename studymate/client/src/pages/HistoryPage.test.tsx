import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { HistoryPage } from './HistoryPage';

vi.mock('../features/study/api', () => ({
  listStudyHistory: vi.fn().mockResolvedValue([{ id: 'artifact-1', type: 'SUMMARY', title: 'Memory summary', materialIds: [], text: 'Summary', sources: [], groundingStatus: 'GROUNDED', createdAt: '2026-08-26T00:00:00.000Z' }]),
  listConversations: vi.fn().mockResolvedValue({ conversations: [{ id: 'conversation-1', title: 'Memory review', preview: 'Working memory…', messageCount: 4, updatedAt: '2026-08-26T00:00:00.000Z' }], nextCursor: null }),
  listQuizzes: vi.fn().mockResolvedValue([{ id: 'quiz-1', title: 'Memory quiz', difficulty: 'MEDIUM', questionCount: 8, score: 75, createdAt: '2026-08-26T00:00:00.000Z', materialIds: [], questions: [] }]),
}));

describe('HistoryPage', () => {
  it('shows reopenable conversations and scored quizzes', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><MemoryRouter><HistoryPage /></MemoryRouter></QueryClientProvider>);

    expect(screen.getByRole('heading', { name: '学习记录' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Memory review/ })).toHaveAttribute('href', '/study?conversation=conversation-1');
    expect(screen.getByRole('link', { name: /Memory quiz/ })).toHaveAttribute('href', '/quiz?id=quiz-1');
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Memory summary/ })).toHaveAttribute('href', '/artifacts/artifact-1');
  });
});
