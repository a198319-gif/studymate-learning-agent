import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LoginForm } from './LoginForm';
import { useAuth } from './auth-context';

vi.mock('./auth-context', () => ({ useAuth: vi.fn() }));

describe('LoginForm', () => {
  const login = vi.fn<() => Promise<void>>();

  beforeEach(() => {
    login.mockReset();
    login.mockResolvedValue(undefined);
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      status: 'anonymous',
      login,
      register: vi.fn(),
      logout: vi.fn(),
    });
  });

  function renderForm() {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginForm />} />
          <Route path="/dashboard" element={<h1>仪表盘目标页</h1>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('shows field errors without sending an invalid login', async () => {
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: '登录' }));

    expect(await screen.findAllByRole('alert')).toHaveLength(2);
    expect(login).not.toHaveBeenCalled();
  });

  it('submits a valid login and navigates to /dashboard', async () => {
    renderForm();
    await userEvent.type(screen.getByLabelText('邮箱'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('密码'), 'correct-horse');
    await userEvent.click(screen.getByRole('button', { name: '登录' }));

    expect(await screen.findByText('仪表盘目标页')).toBeInTheDocument();
    expect(login).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'correct-horse' });
  });

  it('shows safe API errors in an alert', async () => {
    login.mockRejectedValue(new Error('database password leaked internally'));
    renderForm();
    await userEvent.type(screen.getByLabelText('邮箱'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('密码'), 'correct-horse');
    await userEvent.click(screen.getByRole('button', { name: '登录' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '暂时无法完成请求，请稍后重试。',
    );
    expect(screen.queryByText(/database password/i)).not.toBeInTheDocument();
  });
});
