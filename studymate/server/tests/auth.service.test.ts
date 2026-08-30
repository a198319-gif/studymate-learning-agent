import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';

import { AuthService } from '../src/modules/auth/auth.service.js';
import type {
  CreateUserInput,
  UserRecord,
  UserRepository,
} from '../src/modules/auth/user.repository.js';

class MemoryUserRepository implements UserRepository {
  readonly users: UserRecord[] = [];
  createError: Error | undefined;

  findByEmail(email: string): Promise<UserRecord | null> {
    return Promise.resolve(this.users.find((user) => user.email === email) ?? null);
  }

  findById(id: string): Promise<UserRecord | null> {
    return Promise.resolve(this.users.find((user) => user.id === id) ?? null);
  }

  create(input: CreateUserInput): Promise<UserRecord> {
    if (this.createError) {
      return Promise.reject(this.createError);
    }
    const now = new Date();
    const user: UserRecord = {
      id: `user-${this.users.length + 1}`,
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    this.users.push(user);
    return Promise.resolve(user);
  }
}

const secret = 'test-only-jwt-secret-with-at-least-32-characters';

function createSubject(): { repository: MemoryUserRepository; service: AuthService } {
  const repository = new MemoryUserRepository();
  return {
    repository,
    service: new AuthService(repository, secret),
  };
}

describe('AuthService', () => {
  it('normalizes email and hashes the password during registration', async () => {
    const { repository, service } = createSubject();

    const result = await service.register({
      name: 'Ada Lovelace',
      email: '  ADA@Example.COM ',
      password: 'correct-horse',
    });

    expect(result.user).toEqual({
      id: 'user-1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    });
    expect(repository.users[0]?.passwordHash).not.toBe('correct-horse');
    await expect(bcrypt.compare('correct-horse', repository.users[0]?.passwordHash ?? '')).resolves.toBe(
      true,
    );
  });

  it('rejects an existing email with AUTH_EMAIL_EXISTS', async () => {
    const { service } = createSubject();
    const input = { name: 'Ada Lovelace', email: 'ada@example.com', password: 'correct-horse' };

    await service.register(input);

    await expect(service.register(input)).rejects.toMatchObject({ code: 'AUTH_EMAIL_EXISTS' });
  });

  it('maps a concurrent unique-email conflict to AUTH_EMAIL_EXISTS', async () => {
    const { repository, service } = createSubject();
    repository.createError = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

    await expect(
      service.register({ name: 'Ada Lovelace', email: 'ada@example.com', password: 'correct-horse' }),
    ).rejects.toMatchObject({ code: 'AUTH_EMAIL_EXISTS', statusCode: 409 });
  });

  it('returns AUTH_INVALID_CREDENTIALS for an unknown email', async () => {
    const { service } = createSubject();

    await expect(
      service.login({ email: 'missing@example.com', password: 'incorrect-password' }),
    ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });
  });

  it('returns AUTH_INVALID_CREDENTIALS for a wrong password', async () => {
    const { service } = createSubject();
    await service.register({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'correct-horse',
    });

    await expect(
      service.login({ email: 'ada@example.com', password: 'wrong-password' }),
    ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });
  });

  it('returns a public user and signed token for valid credentials', async () => {
    const { service } = createSubject();
    await service.register({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'correct-horse',
    });

    const result = await service.login({ email: ' ADA@example.com ', password: 'correct-horse' });
    const payload = jwt.verify(result.token, secret);

    expect(result.user).toEqual({
      id: 'user-1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    });
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(payload).toMatchObject({ sub: 'user-1', email: 'ada@example.com' });
  });
});
