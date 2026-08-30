import { describe, expect, it } from 'vitest';

import { getSafeApiError } from './http';

describe('getSafeApiError', () => {
  it('localizes known API error codes without exposing server messages', () => {
    const error = {
      isAxiosError: true,
      response: { data: { error: { code: 'AUTH_INVALID_CREDENTIALS', message: 'Email or password is incorrect.' } } },
    };

    expect(getSafeApiError(error)).toBe('邮箱或密码不正确。');
  });

  it('uses a safe Chinese fallback for unknown failures', () => {
    expect(getSafeApiError(new Error('database password leaked internally'))).toBe('暂时无法完成请求，请稍后重试。');
  });
});
