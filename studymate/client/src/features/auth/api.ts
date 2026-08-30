import axios from 'axios';

import { http } from '../../services/http';
import type { AuthUser, LoginInput, RegisterInput } from './types';

type AuthResponse = { user: AuthUser };

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const response = await http.get<AuthResponse>('/auth/me');
    return response.data.user;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      return null;
    }
    throw error;
  }
}

export async function login(input: LoginInput): Promise<AuthUser> {
  const response = await http.post<AuthResponse>('/auth/login', input);
  return response.data.user;
}

export async function register(input: RegisterInput): Promise<AuthUser> {
  const response = await http.post<AuthResponse>('/auth/register', input);
  return response.data.user;
}

export async function logout(): Promise<void> {
  await http.post('/auth/logout');
}
