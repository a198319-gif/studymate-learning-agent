import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { MaterialsPage } from './MaterialsPage';
import { deleteMaterial, listMaterials, uploadMaterial } from '../features/materials/api';

vi.mock('../features/materials/api', () => ({
  listMaterials: vi.fn().mockResolvedValue([]),
  uploadMaterial: vi.fn(),
  deleteMaterial: vi.fn(),
}));

describe('MaterialsPage', () => {
  function renderMaterials() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><MemoryRouter><MaterialsPage /></MemoryRouter></QueryClientProvider>);
  }

  it('shows the secure upload formats and empty library state', async () => {
    vi.mocked(listMaterials).mockResolvedValueOnce([]);
    renderMaterials();

    expect(screen.getByRole('heading', { name: '学习资料' })).toBeInTheDocument();
    expect(screen.getByText(/PDF、DOCX、PPTX 或 TXT/)).toBeInTheDocument();
    expect(await screen.findByText('资料库正在等待你的第一份文件。')).toBeInTheDocument();
  });

  it('uploads a dropped file and announces upload progress', async () => {
    vi.mocked(listMaterials).mockResolvedValueOnce([]);
    vi.mocked(uploadMaterial).mockImplementationOnce((_file, onProgress) => {
      onProgress?.(50);
      return new Promise(() => undefined);
    });
    renderMaterials();

    fireEvent.drop(screen.getByRole('button', { name: /拖放新的学习文件/i }), {
      dataTransfer: { files: [new File(['notes'], 'notes.txt', { type: 'text/plain' })] },
    });

    expect(await screen.findByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    expect(uploadMaterial).toHaveBeenCalledWith(expect.objectContaining({ name: 'notes.txt' }), expect.any(Function));
  });

  it('filters materials and links a ready file into AI Study', async () => {
    vi.mocked(listMaterials).mockResolvedValueOnce([
      { id: 'material-1', originalName: 'Memory.pdf', mimeType: 'application/pdf', extension: 'pdf', size: 2048, status: 'READY', chunkCount: 2, processingError: null, createdAt: '2026-08-28T00:00:00.000Z', updatedAt: '2026-08-28T00:00:00.000Z' },
      { id: 'material-2', originalName: 'Algorithms.pdf', mimeType: 'application/pdf', extension: 'pdf', size: 2048, status: 'PROCESSING', chunkCount: 0, processingError: null, createdAt: '2026-08-28T00:00:00.000Z', updatedAt: '2026-08-28T00:00:00.000Z' },
    ]);
    renderMaterials();
    await userEvent.type(await screen.findByRole('searchbox', { name: '搜索资料' }), 'memory');

    expect(screen.getByText('Memory.pdf')).toBeVisible();
    expect(screen.queryByText('Algorithms.pdf')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /学习 Memory.pdf/ })).toHaveAttribute('href', '/study?material=material-1');
  });

  it('confirms deletion in an accessible dialog', async () => {
    vi.mocked(listMaterials).mockResolvedValueOnce([
      { id: 'material-1', originalName: 'Memory.pdf', mimeType: 'application/pdf', extension: 'pdf', size: 2048, status: 'READY', chunkCount: 2, processingError: null, createdAt: '2026-08-28T00:00:00.000Z', updatedAt: '2026-08-28T00:00:00.000Z' },
    ]);
    vi.mocked(deleteMaterial).mockResolvedValueOnce(undefined);
    renderMaterials();
    await userEvent.click(await screen.findByRole('button', { name: '删除 Memory.pdf' }));

    expect(screen.getByRole('alertdialog', { name: /删除 Memory.pdf/ })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: '删除' }));
    expect(deleteMaterial).toHaveBeenCalledWith('material-1');
  });
});
