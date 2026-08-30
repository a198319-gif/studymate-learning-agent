import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RegisterForm } from './RegisterForm';
import { useAuth } from './auth-context';

vi.mock('./auth-context', () => ({ useAuth: vi.fn() }));

describe('RegisterForm', () => {
  const register = vi.fn<() => Promise<void>>();

  beforeEach(() => {
    register.mockReset();
    register.mockResolvedValue(undefined);
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      status: 'anonymous',
      login: vi.fn(),
      register,
      logout: vi.fn(),
    });
  });

  function renderForm() {
    render(
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<RegisterForm />} />
          <Route path="/dashboard" element={<h1>仪表盘目标页</h1>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('requires matching passwords during registration', async () => {
    renderForm();
    await userEvent.type(screen.getByLabelText('姓名'), 'Ada Lovelace');
    await userEvent.type(screen.getByLabelText('邮箱'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('密码'), 'correct-horse');
    await userEvent.type(screen.getByLabelText('确认密码'), 'different-horse');
    await userEvent.click(screen.getByRole('button', { name: '创建账号' }));

    expect(await screen.findByText('两次输入的密码不一致。')).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  it('submits registration and navigates to /dashboard', async () => {
    renderForm();
    await userEvent.type(screen.getByLabelText('姓名'), 'Ada Lovelace');
    await userEvent.type(screen.getByLabelText('邮箱'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('密码'), 'correct-horse');
    await userEvent.type(screen.getByLabelText('确认密码'), 'correct-horse');
    await userEvent.click(screen.getByRole('button', { name: '创建账号' }));

    expect(await screen.findByText('仪表盘目标页')).toBeInTheDocument();
    expect(register).toHaveBeenCalledWith({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'correct-horse',
    });
  });
});
