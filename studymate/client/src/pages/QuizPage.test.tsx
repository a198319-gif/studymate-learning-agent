import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { QuizPage } from './QuizPage';

vi.mock('../features/materials/api', () => ({
  listMaterials: vi.fn().mockResolvedValue([{
    id: 'material-1', originalName: 'memory-notes.txt', mimeType: 'text/plain', extension: 'txt', size: 100,
    status: 'READY', chunkCount: 4, processingError: null, createdAt: '2026-08-26T00:00:00.000Z', updatedAt: '2026-08-26T00:00:00.000Z',
  }]),
}));
vi.mock('../features/study/api', () => ({ generateQuiz: vi.fn(), submitQuiz: vi.fn() }));

describe('QuizPage', () => {
  it('shows structured quiz settings and keeps generation disabled until a source is selected', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><MemoryRouter><QuizPage /></MemoryRouter></QueryClientProvider>);

    expect(screen.getByRole('heading', { name: '练习测验' })).toBeInTheDocument();
    expect(await screen.findByText('memory-notes.txt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '生成练习测验' })).toBeDisabled();
    expect(screen.getByText('提交全部答案前，正确答案将保持隐藏。')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '20' })).toBeInTheDocument();
    expect(screen.getByLabelText('题型')).toHaveValue('MIXED');
  });
});
