import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { AppShell } from './AppShell';

const logout = vi.fn<() => Promise<void>>();

vi.mock('../features/auth/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'user-1', name: 'Ada Lovelace', email: 'ada@example.com' },
    status: 'authenticated',
    login: vi.fn(),
    register: vi.fn(),
    logout,
  }),
}));

describe('AppShell', () => {
  it('renders the complete StudyMate navigation for an authenticated user', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AppShell />
      </MemoryRouter>,
    );

    for (const label of [
      '首页',
      '学习资料',
      'AI 学习',
      '智能总结',
      '重点提炼',
      '练习测验',
      '考前复习',
      '学习记录',
    ]) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('submits workspace search to the materials page', async () => {
    function Location() { const location = useLocation(); return <output>{location.pathname}{location.search}</output>; }
    render(<MemoryRouter initialEntries={['/dashboard']}><Routes><Route element={<AppShell />}><Route path="/dashboard" element={<Location />} /><Route path="/materials" element={<Location />} /></Route></Routes></MemoryRouter>);
    await userEvent.type(screen.getByRole('searchbox', { name: '搜索学习空间' }), 'memory{Enter}');
    expect(await screen.findByText('/materials?q=memory')).toBeVisible();
  });

  it('shows the current user and signs out from the profile control', async () => {
    render(<MemoryRouter><AppShell /></MemoryRouter>);

    await userEvent.click(screen.getByRole('button', { name: /Ada Lovelace/ }));

    expect(logout).toHaveBeenCalledOnce();
  });

  it('moves focus into the mobile drawer and restores it on Escape', async () => {
    render(<MemoryRouter initialEntries={['/dashboard']}><AppShell /></MemoryRouter>);
    const menuButton = screen.getByRole('button', { name: '打开导航' });

    await userEvent.click(menuButton);
    expect(screen.getByRole('link', { name: '首页' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');

    expect(menuButton).toHaveFocus();
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');
  });
});
