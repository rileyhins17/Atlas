'use client';

import { useState, type FormEvent } from 'react';
import { localDayKey, manualTransactionInput, type AccountDTO } from '@atlas/shared';
import { errorMessage } from '@/lib/api';
import { useCreateTransaction } from '@/lib/hooks/finance';
import { Button, Input } from '@/components/ui';

export function ManualTransactionForm({ accounts, onSaved, onCancel }: {
  accounts: AccountDTO[]; onSaved: () => void; onCancel: () => void;
}) {
  const create = useCreateTransaction();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [direction, setDirection] = useState<'expense' | 'income'>('expense');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => localDayKey(new Date()));
  const [validation, setValidation] = useState<string | null>(null);
  const account = accounts.find((item) => item.id === accountId);

  function save(event: FormEvent) {
    event.preventDefault();
    if (create.isPending) return;
    const input = manualTransactionInput(account, { amount, direction, description, date });
    if (!input) {
      setValidation('Choose an account, enter a description, a valid date and an amount greater than zero with up to two decimal places.');
      return;
    }
    setValidation(null);
    create.mutate(input, { onSuccess: onSaved });
  }

  return (
    <form onSubmit={save} className="stack" aria-label="New manual transaction">
      <h2>Add a transaction</h2>
      <p className="muted">Record spending or income. This adds to your ledger; the account’s recorded balance stays unchanged.</p>
      <fieldset disabled={create.isPending} className="stack" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <label className="stack">Account
          <select className="input" value={accountId} onChange={(event) => setAccountId(event.target.value)} required>
            {accounts.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.currency})</option>)}
          </select>
        </label>
        <label className="stack">Type
          <select className="input" value={direction} onChange={(event) => setDirection(event.target.value === 'income' ? 'income' : 'expense')}>
            <option value="expense">Money out</option><option value="income">Money in</option>
          </select>
        </label>
        <label className="stack">Description<Input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} required /></label>
        <label className="stack">Amount ({account?.currency ?? 'select an account'})<Input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" maxLength={20} required /></label>
        <label className="stack">Date<Input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
        <p className="muted">Date uses your device’s calendar. Enter a positive amount; Money out records it as spending.</p>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <Button type="submit">{create.isPending ? 'Saving…' : 'Save transaction'}</Button>
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        </div>
      </fieldset>
      {(validation || create.error) && <p role="alert">{validation ?? errorMessage(create.error, 'Could not save transaction. Your draft is kept.')}</p>}
    </form>
  );
}
