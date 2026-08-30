import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { prisma } from '../src/config/prisma.js';
import { PrismaUserRepository } from '../src/modules/auth/user.repository.js';

const describeWithDatabase = process.env.RUN_DATABASE_TESTS === 'true' ? describe : describe.skip;

describeWithDatabase('PrismaUserRepository integration', () => {
  const repository = new PrismaUserRepository();
  const email = `repository-${randomUUID()}@example.com`;

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it('creates and reads a user through the migrated MySQL schema', async () => {
    const created = await repository.create({
      name: 'Database Test',
      email,
      passwordHash: 'not-a-real-password-hash',
    });

    await expect(repository.findByEmail(email)).resolves.toMatchObject({
      id: created.id,
      name: 'Database Test',
      email,
    });
  });
});
