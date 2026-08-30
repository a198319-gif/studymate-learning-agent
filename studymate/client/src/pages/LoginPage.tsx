import { Link } from 'react-router-dom';

import { LoginForm } from '../features/auth/LoginForm';

export function LoginPage() {
  return (
    <div className="auth-placeholder">
      <span className="paper-label">欢迎回来</span>
      <h1>准备好开始下一次高效学习了吗？</h1>
      <p>登录后继续你的学习进度。</p>
      <LoginForm />
      <p>第一次使用 StudyMate？<Link to="/register">创建账号</Link></p>
    </div>
  );
}
