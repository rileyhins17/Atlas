'use client';

import { useMemo, useState } from 'react';
import type { AccountDTO, TransactionDTO } from '@atlas/shared';
import { Landmark, Wallet } from 'lucide-react';
import { useAccounts, useTransactions } from '@/lib/hooks/finance';
import { Button, Card, EmptyState, ListSkeleton, QueryState } from '@/components/ui';
import { ManualAccountForm } from './ManualAccountForm';
import { ManualTransactionForm } from './ManualTransactionForm';
import { PageHeader } from '@/components/PageHeader';
import { PlaidCard } from './PlaidCard';
import { formatDayHeading } from '@/lib/dates';
import { groupTransactionsByDay } from '@atlas/shared';
export { groupTransactionsByDay } from '@atlas/shared';
import { formatMoney } from '@/lib/money';

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

/** Stable "no data yet" identity — see the note in CalendarPanel. */
const NO_TXNS: TransactionDTO[] = [];

export function FinancePanel() {
  const [addingAccount, setAddingAccount] = useState(false);
  const [addingTransaction, setAddingTransaction] = useState(false);
  const accountsQuery = useAccounts();
  const txnsQuery = useTransactions();

  const accounts = accountsQuery.data ?? [];
  const txns = txnsQuery.data ?? NO_TXNS;
  const grouped = useMemo(() => groupTransactionsByDay(txns), [txns]);

  return (
    <>
      {/* "Money", not "Finance". Everything that points here — the Everything
          list, the search results, the decision that took it out of the nav —
          calls it Money; only the page itself said Finance, so following the
          link appeared to land somewhere else. The route stays /finance. */}
      <PageHeader title="Money" subtitle="Accounts and spending." />

      <div style={{ marginBottom: 14 }}>
        {addingAccount ? (
          <Card><ManualAccountForm onSaved={() => setAddingAccount(false)} onCancel={() => setAddingAccount(false)} /></Card>
        ) : (
          <Button onClick={() => setAddingAccount(true)}>Add account</Button>
        )}
      </div>

      <Card stack>
        <QueryState
          query={accountsQuery}
          errorFallback="Failed to load accounts"
          skeleton={<ListSkeleton rows={2} circle={false} />}
          empty={
            accounts.length === 0 && (
              <EmptyState
                icon={Wallet}
                title="No accounts yet"
                hint="Add an account above to start tracking by hand. You can also connect a bank below."
              />
            )
          }
        >
          <div className="stack" style={{ gap: 6 }}>
            {accounts.map((a) => (
              <AccountCard key={a.id} account={a} />
            ))}
          </div>
        </QueryState>
      </Card>

      <details style={{ marginTop: 14 }}>
        <summary className="btn secondary">Connect a bank</summary>
        <PlaidCard />
      </details>

      <Card style={{ marginTop: 14 }}>
        <h2>Transactions</h2>
        {addingTransaction ? (
          <ManualTransactionForm accounts={accounts} onSaved={() => setAddingTransaction(false)} onCancel={() => setAddingTransaction(false)} />
        ) : (
          <div className="stack" style={{ marginBottom: 14 }}>
            <Button disabled={accountsQuery.isPending || accountsQuery.isError || accounts.length === 0} onClick={() => setAddingTransaction(true)}>Add transaction</Button>
            {!accountsQuery.isPending && !accountsQuery.isError && accounts.length === 0 && <p className="muted">Add an account first to record spending or income.</p>}
          </div>
        )}
        <QueryState
          query={txnsQuery}
          errorFallback="Failed to load transactions"
          skeleton={<ListSkeleton rows={4} circle={false} />}
          empty={
            grouped.length === 0 && (
              <EmptyState
                icon={Wallet}
                title="No transactions"
                hint="Record spending or income above, or sync transactions from a connected bank."
              />
            )
          }
        >
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
        </QueryState>
      </Card>
    </>
  );
}
