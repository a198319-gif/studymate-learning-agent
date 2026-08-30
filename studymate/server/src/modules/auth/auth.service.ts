import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import { AppError } from '../../shared/app-error.js';
import type { UserRecord, UserRepository } from './user.repository.js';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
};

export type RegisterInput = {
  name: string;
  email: string;
  password: string;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type AuthResult = {
  user: AuthUser;
  token: string;
};

function publicUser(user: UserRecord): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as Error & { code?: unknown }).code === 'P2002'
  );
}

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly jwtSecret: string,
  ) {}

  async register(input: RegisterInput): Promise<AuthResult> {
    const email = input.email.trim().toLowerCase();
    const existingUser = await this.users.findByEmail(email);

    if (existingUser) {
      throw new AppError(409, 'AUTH_EMAIL_EXISTS', 'An account with this email already exists.');
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    let user: UserRecord;
    try {
      user = await this.users.create({
        name: input.name.trim(),
        email,
        passwordHash,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new AppError(409, 'AUTH_EMAIL_EXISTS', 'An account with this email already exists.');
      }
      throw error;
    }

    return this.createResult(user);
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const email = input.email.trim().toLowerCase();
    const user = await this.users.findByEmail(email);

    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      throw new AppError(401, 'AUTH_INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }

    return this.createResult(user);
  }

  async getUser(id: string): Promise<AuthUser> {
    const user = await this.users.findById(id);

    if (!user) {
      throw new AppError(401, 'AUTH_SESSION_INVALID', 'Your session is no longer valid.');
    }

    return publicUser(user);
  }

  private createResult(user: UserRecord): AuthResult {
    const authUser = publicUser(user);
    const token = jwt.sign({ email: authUser.email }, this.jwtSecret, {
      subject: authUser.id,
      expiresIn: '7d',
    });

    return { user: authUser, token };
  }
}
