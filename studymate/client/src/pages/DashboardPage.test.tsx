import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { DashboardPage } from './DashboardPage';
import { getDashboard } from '../features/dashboard/api';

vi.mock('../features/dashboard/api', () => ({ getDashboard: vi.fn() }));

vi.mock('../features/auth/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'user-1', name: 'Ada Lovelace', email: 'ada@example.com' },
    status: 'authenticated',
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  }),
}));

describe('DashboardPage', () => {
  it('renders live statistics and opens the latest conversation', async () => {
    vi.mocked(getDashboard).mockResolvedValue({
      materialCount: 3, conversationCount: 2, practiceQuestionCount: 20, examReviewCount: 1, quizAccuracy: 75,
      recentMaterials: [{ id: 'material-1', originalName: 'Memory.pdf', status: 'READY', size: 2048, createdAt: '2026-08-28T00:00:00.000Z', updatedAt: '2026-08-28T00:00:00.000Z' }],
      recentConversations: [{ id: 'conversation-1', title: 'Memory review', preview: 'Spacing helps.', messageCount: 4, updatedAt: '2026-08-28T00:00:00.000Z' }],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><DashboardPage /></MemoryRouter></QueryClientProvider>);

    expect(screen.getByRole('heading', { name: /(早上好|下午好|晚上好)，Ada/ })).toBeInTheDocument();
    expect(await screen.findByText('3')).toBeVisible();
    expect(screen.getByRole('link', { name: /继续学习/ })).toHaveAttribute('href', '/study?conversation=conversation-1');
    expect(screen.getByRole('link', { name: /查看全部/ })).toHaveAttribute('href', '/history');
    expect(screen.getByText('Memory.pdf')).toBeVisible();
  });
});
