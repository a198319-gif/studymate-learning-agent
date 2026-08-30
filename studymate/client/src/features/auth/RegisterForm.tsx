import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, LockKeyhole, Mail, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';

import { getSafeApiError } from '../../services/http';
import { useAuth } from './auth-context';
import { registerFormSchema, type RegisterFormInput } from './auth.schemas';

export function RegisterForm() {
  const { register: createAccount } = useAuth();
  const navigate = useNavigate();
  const [apiError, setApiError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RegisterFormInput>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async (form) => {
    setApiError(null);
    try {
      const input = { name: form.name, email: form.email, password: form.password };
      await createAccount(input);
      void navigate('/dashboard', { replace: true });
    } catch (error) {
      setApiError(getSafeApiError(error));
    }
  });

  return (
    <form className="auth-form auth-form--register" onSubmit={(event) => void onSubmit(event)} noValidate>
      {apiError && <div className="form-alert" role="alert">{apiError}</div>}
      <label className="field"><span>姓名</span><div className="field__control"><UserRound aria-hidden="true" /><input autoComplete="name" placeholder="你的姓名" {...register('name')} /></div>{errors.name && <small role="alert">{errors.name.message}</small>}</label>
      <label className="field"><span>邮箱</span><div className="field__control"><Mail aria-hidden="true" /><input type="email" autoComplete="email" placeholder="你的邮箱地址" {...register('email')} /></div>{errors.email && <small role="alert">{errors.email.message}</small>}</label>
      <div className="field-pair">
        <label className="field"><span>密码</span><div className="field__control"><LockKeyhole aria-hidden="true" /><input type="password" autoComplete="new-password" placeholder="至少 8 个字符" {...register('password')} /></div>{errors.password && <small role="alert">{errors.password.message}</small>}</label>
        <label className="field"><span>确认密码</span><div className="field__control"><LockKeyhole aria-hidden="true" /><input type="password" autoComplete="new-password" placeholder="再次输入密码" {...register('confirmPassword')} /></div>{errors.confirmPassword && <small role="alert">{errors.confirmPassword.message}</small>}</label>
      </div>
      <button className="button button--primary auth-submit" type="submit" disabled={isSubmitting}>{isSubmitting ? '正在创建账号…' : '创建账号'} {!isSubmitting && <ArrowRight size={17} aria-hidden="true" />}</button>
    </form>
  );
}
