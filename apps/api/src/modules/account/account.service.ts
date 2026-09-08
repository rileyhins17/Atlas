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
/**
 * Rows per read. Small enough that a page is never a memory problem, large
 * enough that a big account is not thousands of round trips.
 */
const EXPORT_PAGE = 500;

/** `JSON.stringify`, with bigints as strings — Prisma returns them for money. */
function json(value: unknown, space?: number): string {
  return JSON.stringify(value, (_key, v: unknown) => (typeof v === 'bigint' ? v.toString() : v), space);
}

/** Re-indent a stringified value so it sits correctly inside the document. */
function indent(text: string, depth: number): string {
  const pad = '  '.repeat(depth);
  return text.split('\n').join('\n' + pad);
}

/**
 * One page of a user's rows, ordered by id so the cursor is stable.
 *
 * Typed loosely on purpose: this walks fourteen different Prisma models that
 * share only `id` and `userId`, and spelling out that union buys nothing a
 * reader of an export routine needs.
 */
type Findable = { findMany: (args: Record<string, unknown>) => Promise<unknown> };

async function page(
  model: unknown,
  userId: string,
  cursor: string | undefined,
  select?: Record<string, boolean>,
): Promise<{ id: string }[]> {
  const rows = await (model as Findable).findMany({
    where: { userId, ...(cursor ? { id: { gt: cursor } } : {}) },
    orderBy: { id: 'asc' },
    take: EXPORT_PAGE,
    ...(select ? { select } : {}),
  });
  return rows as { id: string }[];
}

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Everything Atlas holds about this user, STREAMED.
   *
   * This used to read fourteen unbounded tables into one `Promise.all`, build a
   * single object from them, and hand that to `JSON.stringify(…, null, 2)` — so
   * peak memory was the whole account, twice, plus indentation, in a
   * single-process API that serves everyone. One person with a long history
   * exporting their data could take the origin down for all three users, and
   * the bigger the account the likelier they are to want the export.
   *
   * It yields JSON fragments instead, paging each table by id. Memory is now
   * one page regardless of account size, and the output is byte-comparable with
   * what it produced before: same key order, same `atlas.account-export.v1`
   * format, same two-space indentation.
   *
   * Deliberately EXCLUDES secrets: password hash, session tokens, and the
   * encrypted connector credential blobs. Connections are reported as metadata
   * (which provider, when, status) but never the stored secret — even
   * ciphertext must not leave the box.
   */
  async *streamExport(userId: string): AsyncGenerator<string> {
    const db = this.prisma.client;

    const user = await db.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        timezone: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    yield '{\n';
    yield `  "exportedAt": ${json(new Date().toISOString())},\n`;
    yield `  "format": ${json('atlas.account-export.v1')},\n`;
    yield `  "user": ${indent(json(user, 2), 1)},\n`;

    // Ordered as the v1 format has always ordered them. Each entry is a name
    // and a function that reads ONE page after the given id.
    const sections: [string, (cursor: string | undefined) => Promise<{ id: string }[]>][] = [
      ['tasks', (c) => page(db.task, userId, c)],
      ['events', (c) => page(db.event, userId, c)],
      ['habits', (c) => page(db.habit, userId, c)],
      ['habitLogs', (c) => page(db.habitLog, userId, c)],
      ['journalEntries', (c) => page(db.journalEntry, userId, c)],
      ['notes', (c) => page(db.note, userId, c)],
      ['goals', (c) => page(db.goal, userId, c)],
      ['accounts', (c) => page(db.account, userId, c)],
      ['transactions', (c) => page(db.transaction, userId, c)],
      ['timelineEvents', (c) => page(db.timelineEvent, userId, c)],
      ['insights', (c) => page(db.insight, userId, c)],
      ['aiQuestions', (c) => page(db.aiQuestion, userId, c)],
      // The embedded content is the user's own text; the raw vector is derived
      // and not useful in an export, and it is the Unsupported pgvector column
      // Prisma cannot select anyway.
      [
        'embeddings',
        (c) =>
          page(db.embedding, userId, c, {
            id: true,
            ownerType: true,
            ownerId: true,
            content: true,
            model: true,
            createdAt: true,
          }),
      ],
      // Connections WITHOUT the secret. `dataEnc` is never selected.
      [
        'connections',
        (c) =>
          page(db.credential, userId, c, {
            id: true,
            connector: true,
            label: true,
            status: true,
            meta: true,
            createdAt: true,
            updatedAt: true,
          }),
      ],
    ];

    for (let i = 0; i < sections.length; i += 1) {
      const [name, read] = sections[i]!;
      yield `  ${json(name)}: [`;
      let cursor: string | undefined;
      let first = true;
      for (;;) {
        const rows = await read(cursor);
        if (rows.length === 0) break;
        for (const row of rows) {
          yield first ? '\n' : ',\n';
          first = false;
          yield indent(json(row, 2), 2);
        }
        if (rows.length < EXPORT_PAGE) break;
        cursor = rows[rows.length - 1]!.id;
      }
      yield first ? ']' : '\n  ]';
      yield i === sections.length - 1 ? '\n' : ',\n';
    }

    yield '}\n';
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
