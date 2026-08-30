import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, LockKeyhole, Mail } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';

import { getSafeApiError } from '../../services/http';
import { useAuth } from './auth-context';
import { loginSchema, type LoginFormInput } from './auth.schemas';

export function LoginForm() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [apiError, setApiError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginFormInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (input) => {
    setApiError(null);
    try {
      await login(input);
      void navigate('/dashboard', { replace: true });
    } catch (error) {
      setApiError(getSafeApiError(error));
    }
  });

  return (
    <form className="auth-form" onSubmit={(event) => void onSubmit(event)} noValidate>
      {apiError && <div className="form-alert" role="alert">{apiError}</div>}
      <label className="field">
        <span>邮箱</span>
        <div className="field__control"><Mail aria-hidden="true" /><input type="email" autoComplete="email" placeholder="你的邮箱地址" {...register('email')} /></div>
        {errors.email && <small role="alert">{errors.email.message}</small>}
      </label>
      <label className="field">
        <span>密码</span>
        <div className="field__control"><LockKeyhole aria-hidden="true" /><input type="password" autoComplete="current-password" placeholder="输入密码" {...register('password')} /></div>
        {errors.password && <small role="alert">{errors.password.message}</small>}
      </label>
      <button className="button button--primary auth-submit" type="submit" disabled={isSubmitting}>
        {isSubmitting ? '正在登录…' : '登录'} {!isSubmitting && <ArrowRight size={17} aria-hidden="true" />}
      </button>
    </form>
  );
}
