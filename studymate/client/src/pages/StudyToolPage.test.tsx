import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { generateStudyArtifact } from '../features/study/api';
import { StudyToolPage } from './StudyToolPage';

vi.mock('../features/materials/api', () => ({
  listMaterials: vi.fn().mockResolvedValue([{ id: 'material-1', originalName: 'notes.txt', status: 'READY', chunkCount: 1 }]),
}));
vi.mock('../features/study/api', () => ({ generateStudyArtifact: vi.fn() }));

const writeText = vi.fn();

describe('StudyToolPage', () => {
  beforeEach(() => {
    vi.mocked(generateStudyArtifact).mockReset().mockResolvedValue({
      id: 'artifact-1', type: 'SUMMARY', title: 'Smart summary', materialIds: ['material-1'], text: 'Generated summary',
      sources: ['notes.txt'], groundingStatus: 'GROUNDED', createdAt: '2026-08-28T00:00:00.000Z',
    });
    writeText.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  });

  it('copies and regenerates a generated summary with the same settings', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><StudyToolPage type="SUMMARY" /></MemoryRouter></QueryClientProvider>);
    await userEvent.click(await screen.findByRole('button', { name: /notes.txt/i }));
    await userEvent.click(screen.getByRole('button', { name: '生成总结' }));
    expect(await screen.findByText('Generated summary')).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: '复制结果' }));
    expect(writeText).toHaveBeenCalledWith('Generated summary');
    await userEvent.click(screen.getByRole('button', { name: '重新生成' }));
    expect(generateStudyArtifact).toHaveBeenCalledTimes(2);
    expect(generateStudyArtifact).toHaveBeenLastCalledWith({ type: 'SUMMARY', materialIds: ['material-1'], language: 'zh' });
  });

  it('supports the key points tool', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><StudyToolPage type="KEY_POINTS" /></MemoryRouter></QueryClientProvider>);
    expect(screen.getByRole('heading', { name: '重点提炼' })).toBeVisible();
  });
});
