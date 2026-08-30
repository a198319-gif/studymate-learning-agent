import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { getStudyArtifact } from '../features/study/api';
import { ArtifactPage } from './ArtifactPage';

vi.mock('../features/study/api', () => ({ getStudyArtifact: vi.fn() }));

describe('ArtifactPage', () => {
  it('restores a saved generated artifact by route id', async () => {
    vi.mocked(getStudyArtifact).mockResolvedValue({
      id: 'artifact-7', type: 'KEY_POINTS', title: 'Key points', materialIds: ['material-1'], text: '1. Spacing improves retention.',
      sources: ['notes.txt'], groundingStatus: 'GROUNDED', createdAt: '2026-08-28T00:00:00.000Z',
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/artifacts/artifact-7']}><Routes><Route path="/artifacts/:id" element={<ArtifactPage />} /></Routes></MemoryRouter></QueryClientProvider>);

    expect(await screen.findByRole('heading', { name: '重点提炼' })).toBeVisible();
    expect(screen.getByText('1. Spacing improves retention.')).toBeVisible();
    expect(getStudyArtifact).toHaveBeenCalledWith('artifact-7');
  });
});
