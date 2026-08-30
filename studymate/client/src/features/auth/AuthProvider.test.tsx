import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AuthProvider } from './AuthProvider';
import * as authApi from './api';
import { useAuth } from './auth-context';

vi.mock('./api', () => ({
  getCurrentUser: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
}));

function SessionView() {
  const { status, user } = useAuth();
  return <div>{status === 'authenticated' ? user?.name : status}</div>;
}

describe('AuthProvider', () => {
  it('restores the current session from /api/auth/me', async () => {
    vi.mocked(authApi.getCurrentUser).mockResolvedValue({
      id: 'user-1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider><SessionView /></AuthProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
  });
});
