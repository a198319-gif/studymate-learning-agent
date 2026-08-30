import { z } from 'zod';

export const loginSchema = z.object({
  email: z.email('请输入有效的邮箱地址。'),
  password: z.string().min(1, '请输入密码。').max(72),
});

export const registerFormSchema = z
  .object({
    name: z.string().trim().min(2, '姓名至少需要 2 个字符。').max(80),
    email: z.email('请输入有效的邮箱地址。'),
    password: z.string().min(8, '密码至少需要 8 个字符。').max(72),
    confirmPassword: z.string(),
  })
  .refine((input) => input.password === input.confirmPassword, {
    message: '两次输入的密码不一致。',
    path: ['confirmPassword'],
  });

export type LoginFormInput = z.infer<typeof loginSchema>;
export type RegisterFormInput = z.infer<typeof registerFormSchema>;
