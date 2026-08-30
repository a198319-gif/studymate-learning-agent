import { resolve } from 'node:path';

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { config } from 'dotenv';

config({
  path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../.env')],
  quiet: true,
});

const email = process.env.DEMO_USER_EMAIL?.trim().toLowerCase();
const password = process.env.DEMO_USER_PASSWORD;

if (!email || !password) {
  console.info('Demo user seed skipped: credentials are not configured.');
} else {
  const prisma = new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.upsert({
      where: { email },
      update: { passwordHash },
      create: {
        name: process.env.DEMO_USER_NAME?.trim() || 'StudyMate Demo',
        email,
        passwordHash,
      },
    });
    console.info('Demo user seed completed.');
  } finally {
    await prisma.$disconnect();
  }
}
