import { Link } from 'react-router-dom';

import { RegisterForm } from '../features/auth/RegisterForm';

export function RegisterPage() {
  return (
    <div className="auth-placeholder">
      <span className="paper-label">开启更聪明的学习方式</span>
      <h1>创建你的学习空间。</h1>
      <p>带上学习资料，下一步交给 StudyMate。</p>
      <RegisterForm />
      <p>已经有账号？<Link to="/login">直接登录</Link></p>
    </div>
  );
}
