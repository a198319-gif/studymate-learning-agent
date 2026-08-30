import type { User } from '@prisma/client';

import { prisma } from '../../config/prisma.js';

export type UserRecord = User;

export type CreateUserInput = {
  name: string;
  email: string;
  passwordHash: string;
};

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  create(input: CreateUserInput): Promise<UserRecord>;
}

export class PrismaUserRepository implements UserRepository {
  findByEmail(email: string): Promise<UserRecord | null> {
    return prisma.user.findUnique({ where: { email } });
  }

  findById(id: string): Promise<UserRecord | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  create(input: CreateUserInput): Promise<UserRecord> {
    return prisma.user.create({ data: input });
  }
}
