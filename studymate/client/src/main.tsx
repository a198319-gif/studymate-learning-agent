import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

import { queryClient } from './app/query-client';
import { router } from './app/router';
import { AuthProvider } from './features/auth/AuthProvider';
import './styles/index.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('StudyMate root element was not found.');
}

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
