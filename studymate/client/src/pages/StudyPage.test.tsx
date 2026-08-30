import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { StudyPage } from './StudyPage';
import { sendStudyMessage } from '../features/study/api';

vi.mock('../features/materials/api', () => ({
  listMaterials: vi.fn().mockResolvedValue([{
    id: 'material-1', originalName: 'memory-notes.txt', mimeType: 'text/plain', extension: 'txt', size: 100,
    status: 'READY', chunkCount: 4, processingError: null, createdAt: '2026-08-26T00:00:00.000Z', updatedAt: '2026-08-26T00:00:00.000Z',
  }, {
    id: 'material-2', originalName: 'tutorial-notes.txt', mimeType: 'text/plain', extension: 'txt', size: 100,
    status: 'READY', chunkCount: 2, processingError: null, createdAt: '2026-08-26T00:00:00.000Z', updatedAt: '2026-08-26T00:00:00.000Z',
  }]),
}));

vi.mock('../features/study/api', () => ({ sendStudyMessage: vi.fn(), getConversation: vi.fn() }));

describe('StudyPage', () => {
  function renderAt(entry = '/study') {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={[entry]}><StudyPage /></MemoryRouter></QueryClientProvider>);
  }

  it('offers ready materials as grounded sources', async () => {
    renderAt();

    expect(screen.getByRole('heading', { name: 'AI 学习' })).toBeInTheDocument();
    expect(await screen.findByText('memory-notes.txt')).toBeInTheDocument();
    expect(screen.getByText('仅检索已选中且处理完成的资料。')).toBeInTheDocument();
  });

  it('preselects only the material from the query parameter and exposes five quick actions', async () => {
    renderAt('/study?material=material-2');
    expect(await screen.findByRole('button', { name: /tutorial-notes.txt/i })).toHaveClass('source-option--active');
    expect(screen.getByRole('button', { name: /memory-notes.txt/i })).not.toHaveClass('source-option--active');
    expect(screen.getAllByRole('button', { name: /总结核心概念|通俗解释|提取关键词|查找考试重点|生成练习题/i })).toHaveLength(5);
  });

  it('searches all selected material content for a quick action', async () => {
    vi.mocked(sendStudyMessage).mockResolvedValueOnce({
      conversationId: 'conversation-1', answer: '这是资料总结。', sources: ['tutorial-notes.txt'], groundingStatus: 'GROUNDED',
    });
    renderAt('/study?material=material-2');
    await screen.findByText('tutorial-notes.txt');

    await userEvent.click(screen.getByRole('button', { name: '总结核心概念' }));
    await userEvent.click(screen.getByRole('button', { name: '发送问题' }));

    expect(sendStudyMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      question: '请用简单的语言总结这些资料的核心概念。',
      materialIds: ['material-2'],
      retrievalMode: 'selected',
    }));
    expect(await screen.findByText('这是资料总结。')).toBeVisible();
  });

  it('retries a failed question without losing its text', async () => {
    vi.mocked(sendStudyMessage)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ conversationId: 'conversation-1', answer: 'Recursion calls itself.', sources: ['tutorial-notes.txt'], groundingStatus: 'GROUNDED' });
    renderAt('/study?material=material-2');
    await screen.findByText('tutorial-notes.txt');
    await userEvent.type(screen.getByRole('textbox', { name: '向 StudyMate 提问' }), 'Explain recursion');
    await userEvent.click(screen.getByRole('button', { name: '发送问题' }));
    await userEvent.click(await screen.findByRole('button', { name: '重试问题' }));

    expect(sendStudyMessage).toHaveBeenLastCalledWith(expect.objectContaining({ question: 'Explain recursion', retrievalMode: 'semantic' }));
    expect(await screen.findByText('Recursion calls itself.')).toBeVisible();
  });
});
