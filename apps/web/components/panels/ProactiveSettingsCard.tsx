'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '@/lib/api';
import { useSettings, useUpdateSettings } from '@/lib/hooks/settings';
import {
  currentPushState,
  disablePush,
  enablePush,
  type PushState,
} from '@/lib/push';
import { Button, Card, ErrorState, Input, Skeleton, useToast } from '@/components/ui';

export function ProactiveSettingsCard() {
  const { toast } = useToast();
  const settingsQuery = useSettings();
  const update = useUpdateSettings();

  const [draft, setDraft] = useState<{ timezone: string; briefHour: number; proactiveEnabled: boolean } | null>(null);
  const tz = draft?.timezone ?? settingsQuery.data?.timezone ?? '';
  const hour = draft?.briefHour ?? settingsQuery.data?.briefHour ?? 7;
  const enabled = draft?.proactiveEnabled ?? settingsQuery.data?.proactiveEnabled ?? true;
  const dirty = draft !== null;
  function edit(patch: Partial<NonNullable<typeof draft>>) {
    setDraft({ timezone: tz, briefHour: hour, proactiveEnabled: enabled, ...patch });
  }
  const [pushState, setPushState] = useState<PushState | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState(false);
  const pushRead = useRef(0);
  const readPushState = useCallback(async () => {
    const request = ++pushRead.current;
    setPushError(false);
    setPushState(null);
    try {
      const next = await currentPushState();
      if (request === pushRead.current) setPushState(next);
    } catch {
      if (request === pushRead.current) setPushError(true);
    }
  }, []);
  const cancelPushRead = useCallback(() => { pushRead.current++; }, []);

  useEffect(() => {
    void readPushState();
    return cancelPushRead;
  }, [readPushState, cancelPushRead]);

  async function togglePush() {
    setPushBusy(true);
    try {
      const next = pushState === 'enabled' ? await disablePush() : await enablePush();
      setPushState(next);
      if (next === 'enabled') toast('Notifications enabled', 'success');
      else if (next === 'disabled') toast('Notifications disabled', 'info');
      else if (next === 'denied') toast('Notifications are blocked in your browser', 'error');
      else if (next === 'unconfigured') toast('Push is not configured on this server', 'error');
    } catch {
      toast('Could not change notifications', 'error');
    } finally {
      setPushBusy(false);
    }
  }

  function detectTz() {
    try {
      edit({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    } catch {
      /* ignore — user can type it */
    }
  }

  function save() {
    if (update.isPending || !dirty) return;
    update.mutate(
      { timezone: tz.trim(), briefHour: hour, proactiveEnabled: enabled },
      {
        onSuccess: () => {
          setDraft(null);
          toast('Settings saved', 'success');
        },
      },
    );
  }

  return (
    <Card stack style={{ marginTop: 12 }}>
      <strong>Proactive AI</strong>

      {settingsQuery.isPending ? (
        <div className="stack" style={{ gap: 8 }}>
          <Skeleton height={14} width="70%" />
          <Skeleton height={14} width="45%" />
        </div>
      ) : settingsQuery.isError ? (
        <ErrorState
          message={errorMessage(settingsQuery.error, 'Failed to load settings')}
          onRetry={() => void settingsQuery.refetch()}
        />
      ) : (
        <>
          <div className="muted" style={{ fontSize: 13 }}>
            Atlas can write you a daily brief and a weekly review on its own, at the hour you choose
            in your timezone.
          </div>

          <label className="row" style={{ gap: 8 }}>
            <input
              type="checkbox"
              checked={enabled}
              disabled={update.isPending}
              onChange={(e) => {
                edit({ proactiveEnabled: e.target.checked });
              }}
            />
            <span>Enable proactive briefs &amp; reviews</span>
          </label>

          <label className="stack" style={{ gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Timezone</span>
            <div className="row" style={{ gap: 8 }}>
              <Input
                value={tz}
                disabled={update.isPending}
                placeholder="America/Toronto"
                onChange={(e) => {
                  edit({ timezone: e.target.value });
                }}
              />
              <Button variant="ghost" onClick={detectTz} disabled={update.isPending}>Detect</Button>
            </div>
          </label>

          <label className="stack" style={{ gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Brief hour (0–23, local)</span>
            <Input
              type="number"
              min={0}
              max={23}
              value={hour}
              disabled={update.isPending}
              onChange={(e) => {
                edit({ briefHour: Math.max(0, Math.min(23, Number(e.target.value) || 0)) });
              }}
            />
          </label>

          <div className="row">
            <Button onClick={save} disabled={!dirty || update.isPending}>
              {update.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
          {update.error && <div className="error">{errorMessage(update.error, 'Failed to save settings')}</div>}

          <div className="stack" style={{ gap: 4, marginTop: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Push notifications</span>
            {pushError ? (
              <ErrorState message="Could not read notification status." onRetry={() => void readPushState()} />
            ) : pushState === null ? (
              <p role="status" className="muted">Checking notifications…</p>
            ) : pushState === 'unsupported' ? (
              <span className="muted" style={{ fontSize: 13 }}>This browser doesn&apos;t support notifications.</span>
            ) : pushState === 'unconfigured' ? (
              <span className="muted" style={{ fontSize: 13 }}>Push isn&apos;t configured on this server.</span>
            ) : pushState === 'denied' ? (
              <span className="muted" style={{ fontSize: 13 }}>Notifications are blocked in your browser settings.</span>
            ) : (
              <div className="row">
                <Button variant="ghost" onClick={togglePush} disabled={pushBusy || pushState === null}>
                  {pushBusy ? '…' : pushState === 'enabled' ? 'Disable notifications' : 'Enable notifications'}
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
