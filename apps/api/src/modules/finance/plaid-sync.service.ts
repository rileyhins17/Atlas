import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  PlaidApiError,
  mapPlaidAccountType,
  plaidAmountToMinor,
  plaidCurrency,
  type PlaidAccount,
  type PlaidConnector,
  type PlaidTransaction,
  type SyncResult,
} from '@atlas/connectors';
import { PrismaService } from '../../core/prisma.service.js';
import { TimelineService } from '../../core/timeline.service.js';
import { ConnectorsService } from '../../core/connectors.service.js';

const CONNECTOR_ID = 'plaid';

export interface PlaidItemSummary {
  itemId: string;
  institution: string | null;
  connectedAt: string | null;
  lastSyncedAt: string | null;
}

/**
 * Two-way? No — **pull-only**. Bank data flows bank → Atlas and never back.
 * Atlas is a read-only observer of the account; there is no push half.
 *
 * One Plaid "item" (a linked bank) is one `credentials` row keyed by
 * `label = itemId`, so a user can link several banks. The sync cursor and
 * institution metadata live in that credential's `meta`. Reconciliation lives
 * here, not in the connector, because a connector has no DB access by design.
 */
@Injectable()
export class PlaidSyncService {
  private readonly logger = new Logger(PlaidSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly timeline: TimelineService,
    private readonly connectors: ConnectorsService,
  ) {}

  private connector(): PlaidConnector {
    const connector = this.connectors.plaid;
    if (!connector) {
      throw new BadRequestException(
        'Plaid is not configured on this server (missing PLAID_CLIENT_ID/PLAID_SECRET).',
      );
    }
    return connector;
  }

  isConfigured(): boolean {
    return this.connectors.plaid !== null;
  }

  async isConnected(userId: string): Promise<boolean> {
    if (!this.connectors.plaid) return false;
    const count = await this.prisma.client.credential.count({
      where: { userId, connector: CONNECTOR_ID },
    });
    return count > 0;
  }

  /** The banks this user has linked (from their plaid credentials' metadata). */
  async listItems(userId: string): Promise<PlaidItemSummary[]> {
    const creds = await this.prisma.client.credential.findMany({
      where: { userId, connector: CONNECTOR_ID },
      orderBy: { createdAt: 'asc' },
    });
    return creds.map((c) => {
      const meta = (c.meta as Record<string, unknown> | null) ?? {};
      return {
        itemId: c.label,
        institution: (meta.institution as string) ?? null,
        connectedAt: (meta.connectedAt as string) ?? null,
        lastSyncedAt: (meta.lastSyncedAt as string) ?? null,
      };
    });
  }

  /**
   * A Link token for the browser widget. With `itemId`, this is update mode
   * (re-auth an existing bank) using that item's stored access token.
   */
  async createLinkToken(userId: string, itemId?: string): Promise<string> {
    const connector = this.connector();
    if (itemId) {
      const secret = await this.connectors
        .contextFor(userId, CONNECTOR_ID, itemId)
        .getSecret();
      const accessToken = secret?.accessToken as string | undefined;
      return connector.createLinkToken({ userId, accessToken });
    }
    return connector.createLinkToken({ userId });
  }

  /** Exchange a Link public_token, store the item encrypted, and pull once. */
  async completeExchange(userId: string, publicToken: string): Promise<SyncResult> {
    const connector = this.connector();
    const credential = await connector.exchangePublicToken(publicToken);
    // Store keyed by itemId so multiple banks coexist.
    await this.connectors.saveCredential(userId, CONNECTOR_ID, credential, {
      label: credential.itemId,
      meta: { connectedAt: new Date().toISOString() },
    });

    // Resolve a friendly institution name (best-effort).
    let institution: string | null = null;
    try {
      const ctx = this.connectors.contextFor(userId, CONNECTOR_ID, credential.itemId);
      const { institutionId } = await connector.getAccounts(ctx);
      if (institutionId) institution = await connector.getInstitutionName(institutionId);
    } catch {
      // Non-fatal; the sync below still works without a name.
    }
    if (institution) {
      await this.connectors.saveCredentialMeta(userId, CONNECTOR_ID, { institution }, credential.itemId);
    }

    await this.timeline.write({
      userId,
      type: 'connector.connected',
      source: CONNECTOR_ID,
      title: `Connected bank${institution ? `: ${institution}` : ''}`,
    });

    return this.syncItem(userId, credential.itemId, institution);
  }

  /** Sync every linked bank for a user. */
  async sync(userId: string): Promise<SyncResult> {
    const items = await this.listItems(userId);
    const total: SyncResult = {
      connector: CONNECTOR_ID,
      imported: 0,
      updated: 0,
      pushed: 0,
      deleted: 0,
      errors: [],
    };
    for (const item of items) {
      const one = await this.syncItem(userId, item.itemId, item.institution);
      total.imported += one.imported;
      total.updated += one.updated;
      total.deleted += one.deleted;
      total.errors.push(...one.errors);
    }
    return total;
  }

  /** Pull accounts + transactions for a single item and reconcile them. */
  private async syncItem(
    userId: string,
    itemId: string,
    institution: string | null,
  ): Promise<SyncResult> {
    const connector = this.connector();
    const ctx = this.connectors.contextFor(userId, CONNECTOR_ID, itemId);
    const result: SyncResult = {
      connector: CONNECTOR_ID,
      imported: 0,
      updated: 0,
      pushed: 0,
      deleted: 0,
      errors: [],
    };

    // 1) Upsert accounts, building plaid account_id → Atlas account id map.
    const acctMap = new Map<string, string>();
    try {
      const { accounts } = await connector.getAccounts(ctx);
      for (const pAcct of accounts) {
        const atlasId = await this.upsertAccount(userId, pAcct, institution);
        acctMap.set(pAcct.account_id, atlasId);
      }
    } catch (err) {
      result.errors.push(`accounts: ${errText(err)}`);
      return result; // no accounts → can't place transactions
    }

    // 2) Incremental transaction sync via the stored cursor.
    const cred = await this.prisma.client.credential.findUnique({
      where: { userId_connector_label: { userId, connector: CONNECTOR_ID, label: itemId } },
    });
    const cursor = ((cred?.meta as Record<string, unknown> | null)?.cursor as string) || undefined;

    try {
      const sync = await connector.syncTransactions(ctx, cursor);

      for (const t of [...sync.added, ...sync.modified]) {
        const accountId = acctMap.get(t.account_id);
        if (!accountId) continue; // transaction for an account we didn't load
        const existed = await this.upsertTransaction(userId, accountId, t);
        if (existed) result.updated++;
        else result.imported++;
      }

      for (const removedId of sync.removed) {
        const { count } = await this.prisma.client.transaction.deleteMany({
          where: { userId, source: CONNECTOR_ID, externalId: removedId },
        });
        result.deleted += count;
      }

      await this.connectors.saveCredentialMeta(userId, CONNECTOR_ID, {
        cursor: sync.nextCursor,
        lastSyncedAt: new Date().toISOString(),
      }, itemId);

      await this.timeline.write({
        userId,
        type: 'finance.synced',
        source: CONNECTOR_ID,
        title: `Synced ${institution ?? 'bank'}: ${result.imported} new, ${result.updated} updated`,
      });
    } catch (err) {
      if (err instanceof PlaidApiError && err.errorCode === 'PRODUCT_NOT_READY') {
        // Fresh item; Plaid is still preparing transactions. Next sync succeeds.
        result.errors.push('transactions not ready yet — try syncing again shortly');
      } else {
        result.errors.push(`transactions: ${errText(err)}`);
      }
    }

    if (result.errors.length > 0) {
      this.logger.warn(`Plaid sync had ${result.errors.length} issue(s) for user ${userId}, item ${itemId}`);
    }
    return result;
  }

  private async upsertAccount(
    userId: string,
    p: PlaidAccount,
    institution: string | null,
  ): Promise<string> {
    const currency = plaidCurrency(p.balances);
    const balance = p.balances.current ?? p.balances.available ?? 0;
    const data = {
      name: p.official_name ?? p.name,
      type: mapPlaidAccountType(p.type, p.subtype),
      currency,
      balanceMinor: BigInt(Math.round(balance * 100)),
      mask: p.mask ?? null,
      institution,
    };
    const account = await this.prisma.client.account.upsert({
      where: { userId_source_externalId: { userId, source: CONNECTOR_ID, externalId: p.account_id } },
      create: { userId, source: CONNECTOR_ID, externalId: p.account_id, ...data },
      update: data,
    });
    return account.id;
  }

  /** Returns true if the transaction already existed (an update), false if new. */
  private async upsertTransaction(
    userId: string,
    accountId: string,
    t: PlaidTransaction,
  ): Promise<boolean> {
    const existing = await this.prisma.client.transaction.findUnique({
      where: { userId_source_externalId: { userId, source: CONNECTOR_ID, externalId: t.transaction_id } },
    });
    const data = {
      accountId,
      amountMinor: BigInt(plaidAmountToMinor(t.amount)),
      currency: plaidCurrency(t),
      description: t.name,
      merchantName: t.merchant_name ?? null,
      category: t.category?.[0] ?? null,
      postedAt: new Date(t.date),
      pending: t.pending,
    };
    if (existing) {
      await this.prisma.client.transaction.update({ where: { id: existing.id }, data });
      return true;
    }
    await this.prisma.client.transaction.create({
      data: { userId, source: CONNECTOR_ID, externalId: t.transaction_id, ...data },
    });
    return false;
  }

  /** Stop syncing an item (or all of them) and invalidate the Plaid token. */
  async disconnect(userId: string, itemId?: string): Promise<{ ok: true }> {
    const items = itemId ? [itemId] : (await this.listItems(userId)).map((i) => i.itemId);
    for (const id of items) {
      try {
        await this.connector().removeItem(this.connectors.contextFor(userId, CONNECTOR_ID, id));
      } catch (err) {
        this.logger.warn(`Plaid item/remove failed for ${id}: ${errText(err)}`);
      }
      await this.prisma.client.credential.deleteMany({
        where: { userId, connector: CONNECTOR_ID, label: id },
      });
    }
    // Local account/transaction rows stay — they're the user's data.
    return { ok: true };
  }
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}
