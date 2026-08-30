import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../features/auth/auth-context';

export function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <div className="session-loader" role="status">正在打开你的学习空间…</div>;
  }

  if (status === 'anonymous') {
    return <Navigate replace to="/login" state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
