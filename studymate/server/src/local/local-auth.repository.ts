import { randomUUID } from 'node:crypto';

import type { CreateUserInput, UserRecord, UserRepository } from '../modules/auth/user.repository.js';
import type { LocalUser } from './local-state.js';
import type { LocalStore } from './local-store.js';

function toUserRecord(user: LocalUser): UserRecord {
  return { ...user, createdAt: new Date(user.createdAt), updatedAt: new Date(user.updatedAt) };
}

export class LocalUserRepository implements UserRepository {
  constructor(private readonly store: LocalStore) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    const user = (await this.store.read()).users.find((candidate) => candidate.email === email);
    return user ? toUserRecord(user) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const user = (await this.store.read()).users.find((candidate) => candidate.id === id);
    return user ? toUserRecord(user) : null;
  }

  create(input: CreateUserInput): Promise<UserRecord> {
    return this.store.update((state) => {
      if (state.users.some((user) => user.email === input.email)) {
        throw Object.assign(new Error('Email already exists.'), { code: 'P2002' });
      }
      const now = new Date().toISOString();
      const user: LocalUser = { id: randomUUID(), ...input, createdAt: now, updatedAt: now };
      state.users.push(user);
      return toUserRecord(user);
    });
  }
}
