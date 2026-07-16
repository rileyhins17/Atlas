import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { RegisterInput, LoginInput, UserDTO } from '@atlas/shared';
import { PrismaService } from '../core/prisma.service.js';
import { hashPassword, verifyPassword } from './password.util.js';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface AuthedUser {
  id: string;
  email: string;
  displayName: string | null;
  timezone: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  private toDto(u: AuthedUser): UserDTO {
    return { id: u.id, email: u.email, displayName: u.displayName, timezone: u.timezone };
  }

  async register(input: RegisterInput): Promise<UserDTO> {
    const existing = await this.prisma.client.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException('Email already registered');
    const user = await this.prisma.client.user.create({
      data: {
        email: input.email,
        passwordHash: await hashPassword(input.password),
        displayName: input.displayName ?? null,
        timezone: input.timezone,
      },
    });
    return this.toDto(user);
  }

  /** Verify credentials and open a session. Returns the raw token for the cookie. */
  async login(input: LoginInput, userAgent?: string): Promise<{ token: string; user: UserDTO }> {
    const user = await this.prisma.client.user.findUnique({ where: { email: input.email } });
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const token = randomBytes(32).toString('hex');
    await this.prisma.client.session.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        userAgent: userAgent ?? null,
      },
    });
    return { token, user: this.toDto(user) };
  }

  async logout(token: string): Promise<void> {
    await this.prisma.client.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }

  /** Resolve a raw session token to a user, or null if invalid/expired. */
  async userFromToken(token: string): Promise<AuthedUser | null> {
    const session = await this.prisma.client.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!session || session.expiresAt < new Date()) return null;
    const { user } = session;
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      timezone: user.timezone,
    };
  }
}
