import { z } from 'zod';
import { PaginationQuery } from './pagination.js';

/**
 * Money is stored in the DB as BigInt minor units (cents) to avoid float drift.
 * Over the wire it travels as a plain integer number of minor units — safe well
 * past any realistic personal balance — and the client formats it for display.
 * Sign convention: a transaction amount is signed, **negative = money out**.
 */
const minorUnits = z.number().int();

export const AccountType = z.enum(['checking', 'savings', 'credit', 'cash', 'investment']);
export type AccountType = z.infer<typeof AccountType>;

export const CreateAccountInput = z.object({
  name: z.string().min(1).max(200),
  type: AccountType.default('checking'),
  currency: z.string().length(3).default('USD'),
  balanceMinor: minorUnits.default(0),
});
export type CreateAccountInput = z.infer<typeof CreateAccountInput>;

export const AccountDTO = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  currency: z.string(),
  balanceMinor: minorUnits,
  mask: z.string().nullable(),
  institution: z.string().nullable(),
  source: z.string(),
  createdAt: z.string(),
});
export type AccountDTO = z.infer<typeof AccountDTO>;

export const CreateTransactionInput = z.object({
  accountId: z.string().min(1),
  amountMinor: minorUnits,
  currency: z.string().length(3).default('USD'),
  description: z.string().min(1).max(500),
  category: z.string().max(100).optional(),
  merchantName: z.string().max(200).optional(),
  postedAt: z.coerce.date(),
});
export type CreateTransactionInput = z.infer<typeof CreateTransactionInput>;

export const UpdateTransactionInput = z.object({
  description: z.string().min(1).max(500).optional(),
  category: z.string().max(100).nullable().optional(),
  merchantName: z.string().max(200).nullable().optional(),
});
export type UpdateTransactionInput = z.infer<typeof UpdateTransactionInput>;

export const TransactionQuery = PaginationQuery.extend({
  /** Restrict to one account. */
  accountId: z.string().optional(),
});
export type TransactionQuery = z.infer<typeof TransactionQuery>;

export const TransactionDTO = z.object({
  id: z.string(),
  accountId: z.string(),
  amountMinor: minorUnits,
  currency: z.string(),
  description: z.string(),
  category: z.string().nullable(),
  merchantName: z.string().nullable(),
  postedAt: z.string(),
  pending: z.boolean(),
  source: z.string(),
  createdAt: z.string(),
});
export type TransactionDTO = z.infer<typeof TransactionDTO>;
