'use client';

import { useMemo } from 'react';
import type { AccountDTO, TransactionDTO } from '@atlas/shared';
import { Landmark, Wallet } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { useAccounts, useTransactions } from '@/lib/hooks/finance';
import { Card, EmptyState, ErrorState, ListSkeleton } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { formatDayHeading, localDayKey } from '@/lib/dates';

/** Format signed minor units as a currency string, e.g. -1234 → "-$12.34". */
function formatMoney(minor: number, currency: string): string {
  const abs = Math.abs(minor) / 100;
  let body: string;
  try {
    body = new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(abs);
  } catch {
    body = `${abs.toFixed(2)} ${currency}`;
  }
  return `${minor < 0 ? '-' : '+'}${body}`;
}

/** Transactions grouped by local calendar day, most recent first. */
export function groupTransactionsByDay(txns: TransactionDTO[]): Array<[string, TransactionDTO[]]> {
  const byDay = new Map<string, TransactionDTO[]>();
  const sorted = [...txns].sort(
    (a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime(),
  );
  for (const t of sorted) {
    const key = localDayKey(new Date(t.postedAt));
    const arr = byDay.get(key) ?? [];
    arr.push(t);
    byDay.set(key, arr);
  }
  return [...byDay.entries()];
}

function AccountCard({ account }: { account: AccountDTO }) {
  const where = account.institution
    ? `${account.institution}${account.mask ? ` ••${account.mask}` : ''}`
    : account.source === 'plaid'
      ? 'Linked bank'
      : 'Manual';
  return (
    <div className="task">
      <Landmark size={18} aria-hidden className="muted" />
      <div className="title">
        <div>{account.name}</div>
        <div className="muted" style={{ fontSize: 12 }}>
          {where} · {account.type}
        </div>
      </div>
      <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
        {formatMoney(account.balanceMinor, account.currency).replace('+', '')}
      </strong>
    </div>
  );
}

export function FinancePanel() {
  const accountsQuery = useAccounts();
  const txnsQuery = useTransactions();

  const accounts = accountsQuery.data ?? [];
  const txns = txnsQuery.data ?? [];
  const grouped = useMemo(() => groupTransactionsByDay(txns), [txns]);

  return (
    <>
      <PageHeader title="Finance" subtitle="Accounts and spending." />

      <Card stack>
        {accountsQuery.isPending ? (
          <ListSkeleton rows={2} circle={false} />
        ) : accountsQuery.isError ? (
          <ErrorState
            message={errorMessage(accountsQuery.error, 'Failed to load accounts')}
            onRetry={() => void accountsQuery.refetch()}
          />
        ) : accounts.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No accounts yet"
            hint="Connect a bank with Plaid in Settings to pull your accounts and transactions in."
          />
        ) : (
          <div className="stack" style={{ gap: 6 }}>
            {accounts.map((a) => (
              <AccountCard key={a.id} account={a} />
            ))}
          </div>
        )}
      </Card>

      <Card style={{ marginTop: 14 }}>
        {txnsQuery.isPending ? (
          <ListSkeleton rows={4} circle={false} />
        ) : txnsQuery.isError ? (
          <ErrorState
            message={errorMessage(txnsQuery.error, 'Failed to load transactions')}
            onRetry={() => void txnsQuery.refetch()}
          />
        ) : grouped.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No transactions"
            hint="Once a bank is connected and synced, your transactions show up here."
          />
        ) : (
          <div className="stack" style={{ gap: 18 }}>
            {grouped.map(([day, dayTxns]) => (
              <section key={day} aria-label={formatDayHeading(new Date(`${day}T12:00:00`))}>
                <h3 className="focus-group-title" style={{ marginBottom: 4 }}>
                  {formatDayHeading(new Date(`${day}T12:00:00`))}
                </h3>
                {dayTxns.map((t) => (
                  <div className="task" key={t.id}>
                    <div className="title">
                      <div>
                        {t.merchantName ?? t.description}
                        {t.pending && (
                          <span className="muted" style={{ fontSize: 11 }}> · pending</span>
                        )}
                      </div>
                      {t.category && (
                        <div className="muted" style={{ fontSize: 12 }}>{t.category}</div>
                      )}
                    </div>
                    <strong
                      style={{
                        fontVariantNumeric: 'tabular-nums',
                        color: t.amountMinor >= 0 ? 'var(--good, #22c55e)' : undefined,
                      }}
                    >
                      {formatMoney(t.amountMinor, t.currency)}
                    </strong>
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
