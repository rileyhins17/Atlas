import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma.service.js';
import { verifyPassword } from '../../auth/password.util.js';

/**
 * Account-level data rights (commercial-grade / privacy bar): a user can export
 * everything Atlas holds about them, and hard-delete their account.
 *
 * Everything here is strictly `userId`-scoped — a user can only ever export or
 * delete their own data.
 */
@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Everything Atlas holds about this user, as a plain object ready to
   * serialize. Deliberately EXCLUDES secrets: password hash, session tokens,
   * and the encrypted connector credential blobs. Connections are reported as
   * metadata (which provider, when, status) but never the stored secret — even
   * ciphertext must not leave the box.
   */
  async exportData(userId: string): Promise<Record<string, unknown>> {
    const db = this.prisma.client;

    const [
      user,
      tasks,
      events,
      habits,
      habitLogs,
      journalEntries,
      notes,
      goals,
      accounts,
      transactions,
      timelineEvents,
      insights,
      aiQuestions,
      embeddings,
      credentials,
    ] = await Promise.all([
      db.user.findUniqueOrThrow({
        where: { id: userId },
        select: { id: true, email: true, displayName: true, timezone: true, createdAt: true, updatedAt: true },
      }),
      db.task.findMany({ where: { userId } }),
      db.event.findMany({ where: { userId } }),
      db.habit.findMany({ where: { userId } }),
      db.habitLog.findMany({ where: { userId } }),
      db.journalEntry.findMany({ where: { userId } }),
      db.note.findMany({ where: { userId } }),
      db.goal.findMany({ where: { userId } }),
      db.account.findMany({ where: { userId } }),
      db.transaction.findMany({ where: { userId } }),
      db.timelineEvent.findMany({ where: { userId } }),
      db.insight.findMany({ where: { userId } }),
      db.aiQuestion.findMany({ where: { userId } }),
      // Embedded content is the user's own text; the raw vector is derived and
      // not useful in an export, so it's left out (and it's the Unsupported
      // pgvector column Prisma can't select anyway).
      db.embedding.findMany({
        where: { userId },
        select: { id: true, ownerType: true, ownerId: true, content: true, model: true, createdAt: true },
      }),
      // Connections WITHOUT the secret. `dataEnc` is never selected.
      db.credential.findMany({
        where: { userId },
        select: { connector: true, label: true, status: true, meta: true, createdAt: true, updatedAt: true },
      }),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      format: 'atlas.account-export.v1',
      user,
      tasks,
      events,
      habits,
      habitLogs,
      journalEntries,
      notes,
      goals,
      accounts,
      transactions,
      timelineEvents,
      insights,
      aiQuestions,
      embeddings,
      connections: credentials,
    };
  }

  /**
   * Permanently delete the account and everything owned by it. Requires the
   * current password (the session alone isn't enough for an irreversible,
   * destructive action). Every domain row cascades via the schema's
   * `onDelete: Cascade`; `ai_usage` rows are retained but de-identified
   * (`onDelete: SetNull`) so the cost ledger survives without any PII.
   */
  async deleteAccount(userId: string, password: string): Promise<void> {
    const user = await this.prisma.client.user.findUnique({ where: { id: userId } });
    // A missing user with a valid session shouldn't happen, but treat it the
    // same as a bad password rather than leaking which case it is.
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new UnauthorizedException('Password is incorrect');
    }
    await this.prisma.client.user.delete({ where: { id: userId } });
  }
}
