import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';

import * as authApi from './api';
import { AuthContext, type AuthContextValue } from './auth-context';

const sessionKey = ['auth', 'session'] as const;
export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const session = useQuery({
    queryKey: sessionKey,
    queryFn: authApi.getCurrentUser,
    retry: false,
  });

  const value: AuthContextValue = {
    user: session.data ?? null,
    status: session.isPending ? 'loading' : session.data ? 'authenticated' : 'anonymous',
    async login(input) {
      const user = await authApi.login(input);
      queryClient.setQueryData(sessionKey, user);
    },
    async register(input) {
      const user = await authApi.register(input);
      queryClient.setQueryData(sessionKey, user);
    },
    async logout() {
      await authApi.logout();
      queryClient.clear();
      queryClient.setQueryData(sessionKey, null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
