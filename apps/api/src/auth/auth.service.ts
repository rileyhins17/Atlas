import { Injectable, ConflictException, Logger, UnauthorizedException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { createHash, randomBytes } from 'node:crypto';
import type { RegisterInput, LoginInput, UserDTO } from '@atlas/shared';
import { PrismaService } from '../core/prisma.service.js';
import { ActivityService } from '../core/activity.service.js';
import { safeTz } from '../modules/ai/time.util.js';
import { hashPassword, verifyPassword } from './password.util.js';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
// Daily is plenty for rows that live thirty days.
const SESSION_SWEEP_INTERVAL_MS = 1000 * 60 * 60 * 24;

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
  private readonly logger = new Logger(AuthService.name);
  private sweeping = false;
  /** Request count at the last purge; see purgeExpiredSessions. */
  private sweptAtCount = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

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
        // Every day rollup buckets by this with `AT TIME ZONE`, so an
        // unparseable zone would break the user's whole Progress page. Fall
        // back rather than store something Postgres will choke on.
        timezone: safeTz(input.timezone),
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

  /**
   * Delete sessions that have already expired.
   *
   * Nothing else ever removed them. `logout` deletes the one token it is given,
   * and `remember` defaults to true precisely so a daily-use app does not sign
   * you out — so the common path is that a row is written on every login and
   * never removed. An expired row cannot authenticate anything (userFromToken
   * checks expiresAt), which is exactly why keeping it is pure cost: index
   * weight, table bloat, and a stale token hash sitting in the database for no
   * reason.
   *
   * Daily is often enough for rows with a thirty-day life, and the re-entrancy
   * guard and activity gate match the other sweeps in the app.
   *
   * Gated even though daily is cheap — one query a day is not what burned the
   * Neon quota. It is here so the rule reads the same everywhere: every
   * @Interval in this codebase checks ActivityService first. A sweep that is
   * exempt "because it is cheap" is how the next one gets written ungated.
   * Nothing can expire that was not created by a request, so there is never
   * work waiting on a server nobody has used.
   */
  @Interval(SESSION_SWEEP_INTERVAL_MS)
  async purgeExpiredSessions(): Promise<void> {
    if (!this.activity.hasRequestsSince(this.sweptAtCount)) return;
    if (this.sweeping) return;
    this.sweeping = true;
    const seen = this.activity.count;
    try {
      const { count } = await this.prisma.client.session.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      if (count > 0) this.logger.log(`Purged ${count} expired session(s)`);
    } catch (err) {
      // A failed sweep must never take the API down; the next one retries.
      this.logger.warn(`Session purge failed: ${String(err)}`);
    } finally {
      this.sweptAtCount = seen;
      this.sweeping = false;
    }
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
