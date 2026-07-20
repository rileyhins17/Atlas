import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  AccountDTO,
  CreateAccountInput,
  CreateTransactionInput,
  PaginationQuery,
  TransactionDTO,
  TransactionQuery,
  UpdateTransactionInput,
} from '@atlas/shared';
import type { Account, Transaction } from '@atlas/db';
import { PrismaService } from '../../core/prisma.service.js';
import { TimelineService } from '../../core/timeline.service.js';

function toAccountDto(a: Account): AccountDTO {
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    currency: a.currency,
    // Minor units fit comfortably in a JS number for any realistic balance.
    balanceMinor: Number(a.balanceMinor),
    mask: a.mask,
    institution: a.institution,
    source: a.source,
    createdAt: a.createdAt.toISOString(),
  };
}

function toTransactionDto(t: Transaction): TransactionDTO {
  return {
    id: t.id,
    accountId: t.accountId,
    amountMinor: Number(t.amountMinor),
    currency: t.currency,
    description: t.description,
    category: t.category,
    merchantName: t.merchantName,
    postedAt: t.postedAt.toISOString(),
    pending: t.pending,
    source: t.source,
    createdAt: t.createdAt.toISOString(),
  };
}

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timeline: TimelineService,
  ) {}

  private async ownedAccount(userId: string, id: string): Promise<Account> {
    const account = await this.prisma.client.account.findFirst({ where: { id, userId } });
    if (!account) throw new NotFoundException('Account not found');
    return account;
  }

  private async ownedTransaction(userId: string, id: string): Promise<Transaction> {
    const txn = await this.prisma.client.transaction.findFirst({ where: { id, userId } });
    if (!txn) throw new NotFoundException('Transaction not found');
    return txn;
  }

  async listAccounts(userId: string, page: PaginationQuery): Promise<AccountDTO[]> {
    const accounts = await this.prisma.client.account.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      take: page.limit,
      skip: page.offset,
    });
    return accounts.map(toAccountDto);
  }

  async createAccount(userId: string, input: CreateAccountInput): Promise<AccountDTO> {
    const account = await this.prisma.client.account.create({
      data: {
        userId,
        name: input.name,
        type: input.type,
        currency: input.currency,
        balanceMinor: BigInt(input.balanceMinor),
        source: 'atlas',
      },
    });
    await this.timeline.write({
      userId,
      type: 'account.created',
      source: 'finance',
      title: `Account: ${account.name}`,
      refType: 'account',
      refId: account.id,
    });
    return toAccountDto(account);
  }

  async listTransactions(userId: string, query: TransactionQuery): Promise<TransactionDTO[]> {
    const txns = await this.prisma.client.transaction.findMany({
      where: { userId, accountId: query.accountId },
      orderBy: { postedAt: 'desc' },
      take: query.limit,
      skip: query.offset,
    });
    return txns.map(toTransactionDto);
  }

  async createTransaction(userId: string, input: CreateTransactionInput): Promise<TransactionDTO> {
    await this.ownedAccount(userId, input.accountId);
    const txn = await this.prisma.client.transaction.create({
      data: {
        userId,
        accountId: input.accountId,
        amountMinor: BigInt(input.amountMinor),
        currency: input.currency,
        description: input.description,
        category: input.category,
        merchantName: input.merchantName,
        postedAt: input.postedAt,
        source: 'atlas',
      },
    });
    await this.timeline.write({
      userId,
      type: 'transaction.created',
      source: 'finance',
      title: `${input.amountMinor < 0 ? 'Spent' : 'Received'}: ${txn.description}`,
      refType: 'transaction',
      refId: txn.id,
      occurredAt: txn.postedAt,
      payload: { amountMinor: Number(txn.amountMinor), currency: txn.currency },
    });
    return toTransactionDto(txn);
  }

  async updateTransaction(
    userId: string,
    id: string,
    input: UpdateTransactionInput,
  ): Promise<TransactionDTO> {
    await this.ownedTransaction(userId, id);
    const txn = await this.prisma.client.transaction.update({
      where: { id },
      data: {
        description: input.description,
        category: input.category,
        merchantName: input.merchantName,
      },
    });
    return toTransactionDto(txn);
  }

  /**
   * Compact money summary for the AI context: per-account balances plus net
   * cash-flow over the last 7 days. Deliberately small — the AI reads this, not
   * the whole ledger.
   */
  async summarize(userId: string): Promise<string> {
    const accounts = await this.prisma.client.account.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    if (accounts.length === 0) return 'No financial accounts connected.';

    const since = new Date(Date.now() - 7 * 86_400_000);
    const recent = await this.prisma.client.transaction.findMany({
      where: { userId, postedAt: { gte: since } },
      take: 500,
    });
    let outMinor = 0;
    let inMinor = 0;
    for (const t of recent) {
      const amt = Number(t.amountMinor);
      if (amt < 0) outMinor += amt;
      else inMinor += amt;
    }

    const lines = accounts.map((a) => {
      const bal = (Number(a.balanceMinor) / 100).toFixed(2);
      const where = a.institution ? ` (${a.institution}${a.mask ? ` ••${a.mask}` : ''})` : '';
      return `- ${a.name}${where}: ${bal} ${a.currency}`;
    });
    const flow = `Last 7 days: out ${(outMinor / 100).toFixed(2)}, in ${(inMinor / 100).toFixed(2)}.`;
    return `Accounts (${accounts.length}):\n${lines.join('\n')}\n${flow}`;
  }
}
