'use client';

import { useState } from 'react';
import { useSettings, useUpdateSettings } from '@/lib/hooks/settings';
import { useMe } from '@/lib/hooks/auth';
import { Button, ErrorState, Input, Spinner } from '@/components/ui';
import { firstNameFrom } from '@/lib/name';
import { greeting } from '@/lib/dates';

/**
 * What Atlas calls you.
 *
 * `displayName` has been on the user record, accepted at registration and
 * patchable through /settings since the beginning, and no screen ever set it —
 * so it was null for every account and Today fell back to the local part of the
 * email address. The column, the DTO and the endpoint were all already there;
 * only this field was missing.
 */
export function NameSettingsCard() {
  const settings = useSettings();
  const me = useMe();
  const update = useUpdateSettings();

  const saved = settings.data?.displayName ?? '';
  const [draft, setDraft] = useState<string | null>(null);
  const name = draft ?? saved;
  const [error, setError] = useState<string | null>(null);

  const failed = [settings, me].filter((query) => query.isError);
  if (failed.length > 0) return <ErrorState message="Your profile settings could not be loaded." onRetry={() => {
    for (const query of failed) void query.refetch();
  }} />;
  if (settings.isPending || me.isPending || settings.data === undefined || me.data === undefined) return <Spinner />;

  const trimmed = name.trim();
  const dirty = trimmed !== saved;
  // Mirrors UpdateSettingsInput (1..80). Checked here so it answers inline
  // rather than as a 400 the form has to translate.
  const tooLong = trimmed.length > 80;

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty || update.isPending) return;
    if (tooLong) {
      setError('That is longer than 80 characters.');
      return;
    }
    setError(null);
    // The DTO takes a non-empty string, so clearing the box cannot be expressed
    // as displayName: ''. Sending the field only when it has content means
    // "clear it" is not offered rather than silently doing nothing.
    if (!trimmed) {
      setError('Enter a name, or leave this as it was.');
      return;
    }
    update.mutate({ displayName: trimmed }, {
      onSuccess: () => setDraft(null),
      onError: () => setError('Could not save that name.'),
    });
  }

  // Show the actual sentence Today will render, so the setting explains itself.
  const preview = firstNameFrom(trimmed || null, me.data?.email);

  return (
    <form className="stack" style={{ gap: 8 }} noValidate onSubmit={save}>
      <p className="prog-muted" style={{ margin: 0, fontSize: 13 }}>
        Atlas uses this name to greet you on Today. Until you set one, it uses a suitable name
        from your email address or leaves the greeting unnamed.
      </p>
      <label className="field">
        <span className="field-label">Your name</span>
        <Input
          value={name}
          onChange={(e) => setDraft(e.target.value)}
          disabled={update.isPending}
          placeholder="Riley"
          maxLength={80}
        />
      </label>
      <p className="prog-muted" style={{ margin: 0, fontSize: 13 }}>
        {`${greeting()}${preview ? `, ${preview}` : ''}.`}
      </p>
      {error && <div className="error">{error}</div>}
      {/* Nothing confirmed this save, so the only way to know it worked was to
          go to Today and look. That is also how the change got LOST: clicking
          Save and navigating in the same breath cancels the in-flight PATCH,
          and the app said nothing either way. */}
      {update.isSuccess && !dirty && !error && (
        <p className="field-saved" role="status">
          Saved. Atlas will call you {preview || 'by no name at all'}.
        </p>
      )}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button type="submit" disabled={!dirty || update.isPending}>
          Save
        </Button>
      </div>
    </form>
  );
}
