import { Navigate, createBrowserRouter } from 'react-router-dom';

import { ProtectedRoute } from '../components/ProtectedRoute';
import { AppShell } from '../layouts/AppShell';
import { PublicLayout } from '../layouts/PublicLayout';
import { DashboardPage } from '../pages/DashboardPage';
import { HistoryPage } from '../pages/HistoryPage';
import { LoginPage } from '../pages/LoginPage';
import { MaterialsPage } from '../pages/MaterialsPage';
import { RegisterPage } from '../pages/RegisterPage';
import { QuizPage } from '../pages/QuizPage';
import { StudyPage } from '../pages/StudyPage';
import { StudyToolPage } from '../pages/StudyToolPage';
import { ArtifactPage } from '../pages/ArtifactPage';

export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/dashboard', element: <DashboardPage /> },
          { path: '/materials', element: <MaterialsPage /> },
          { path: '/study', element: <StudyPage /> },
          { path: '/summary', element: <StudyToolPage type="SUMMARY" /> },
          { path: '/key-points', element: <StudyToolPage type="KEY_POINTS" /> },
          { path: '/quiz', element: <QuizPage /> },
          { path: '/exam-review', element: <StudyToolPage type="EXAM_REVIEW" /> },
          { path: '/history', element: <HistoryPage /> },
          { path: '/artifacts/:id', element: <ArtifactPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate replace to="/dashboard" /> },
]);
