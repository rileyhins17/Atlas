'use client';

import { useState, type FormEvent } from 'react';
import { AccountType, CreateAccountInput, parseMoneyInput } from '@atlas/shared';
import { errorMessage } from '@/lib/api';
import { useCreateAccount } from '@/lib/hooks/finance';
import { Button, Input } from '@/components/ui';

export function ManualAccountForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const create = useCreateAccount();
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('checking');
  const [currency, setCurrency] = useState('CAD');
  const [balance, setBalance] = useState('');
  const [validation, setValidation] = useState<string | null>(null);

  function save(event: FormEvent) {
    event.preventDefault();
    if (create.isPending) return;
    const balanceMinor = parseMoneyInput(balance);
    const parsed = CreateAccountInput.safeParse({ name: name.trim(), type, currency, balanceMinor });
    if (balanceMinor === null || !parsed.success) {
      setValidation('Enter an account name and a balance with up to two decimal places, such as 185.29.');
      return;
    }
    setValidation(null);
    create.mutate(parsed.data, { onSuccess: onSaved });
  }

  return (
    <form onSubmit={save} className="stack" aria-label="New manual account">
      <h2>Add an account</h2>
      <p className="muted">Track an account without connecting a bank. Its recorded balance is a snapshot; logging transactions does not change it.</p>
      <fieldset disabled={create.isPending} className="stack" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <label className="stack">Account name<Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required /></label>
        <label className="stack">Account type
          <select className="input" value={type} onChange={(e) => setType(AccountType.parse(e.target.value))}>
            {AccountType.options.map((option) => <option key={option} value={option}>{option[0]!.toUpperCase() + option.slice(1)}</option>)}
          </select>
        </label>
        <label className="stack">Currency
          <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {['CAD', 'USD', 'EUR', 'GBP'].map((code) => <option key={code} value={code}>{code}</option>)}
          </select>
        </label>
        <label className="stack">Recorded balance<Input value={balance} onChange={(e) => setBalance(e.target.value)} inputMode="decimal" placeholder="0.00" maxLength={20} required /></label>
        <p className="muted">Use a negative balance for money owed. Enter 0 for an account with no balance.</p>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <Button type="submit">{create.isPending ? 'Saving…' : 'Save account'}</Button>
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        </div>
      </fieldset>
      {(validation || create.error) && <p role="alert">{validation ?? errorMessage(create.error, 'Could not save account. Your draft is kept.')}</p>}
    </form>
  );
}
