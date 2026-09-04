'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { useUpdateSettings } from '@/lib/hooks/settings';

/**
 * Ask for a name at the only moment it is obviously relevant: mid-greeting.
 *
 * `displayName` has existed on the user record since the first migration, with
 * an endpoint, a DTO and a settings field. Both real accounts have had it NULL
 * for weeks, so Atlas has literally never greeted either of them by name — and
 * neither email survives being guessed from, because a local part with digits
 * in it is a generated address, not a person.
 *
 * The onboarding wizard deliberately dropped its name step: eight questions
 * before the product has demonstrated anything is eight chances to leave, and
 * the stated plan was that the asks bell would raise it later "at the moment it
 * becomes relevant". That moment never arrived. This is it — the sentence that
 * would use the name, offering to learn it, costing one tap and blocking
 * nothing. Dismissing it is not even necessary; it disappears the moment there
 * is a name, and it never appears again after that.
 */
export function NameNudge() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const update = useUpdateSettings();

  if (!open) {
    return (
      <button type="button" className="name-nudge-open" onClick={() => setOpen(true)}>
        What should Atlas call you?
      </button>
    );
  }

  const trimmed = value.trim();

  function save(e: React.FormEvent) {
    e.preventDefault();
    // The DTO takes a non-empty string, so an empty box is a no-op rather than
    // a request that would 400.
    if (!trimmed) {
      setOpen(false);
      return;
    }
    update.mutate({ displayName: trimmed.slice(0, 80) });
  }

  return (
    <form className="name-nudge" onSubmit={save}>
      <input
        autoFocus
        className="name-nudge-input"
        aria-label="What should Atlas call you?"
        placeholder="Your name"
        maxLength={80}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      <button
        type="submit"
        className="name-nudge-save"
        aria-label="Save your name"
        disabled={!trimmed || update.isPending}
      >
        <Check size={15} aria-hidden />
      </button>
    </form>
  );
}
