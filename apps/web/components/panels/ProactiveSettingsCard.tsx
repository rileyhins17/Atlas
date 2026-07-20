'use client';

import { useEffect, useState } from 'react';
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

  const [tz, setTz] = useState('');
  const [hour, setHour] = useState(7);
  const [enabled, setEnabled] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [pushState, setPushState] = useState<PushState | null>(null);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    void currentPushState().then(setPushState);
  }, []);

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

  useEffect(() => {
    if (settingsQuery.data) {
      setTz(settingsQuery.data.timezone);
      setHour(settingsQuery.data.briefHour);
      setEnabled(settingsQuery.data.proactiveEnabled);
      setDirty(false);
    }
  }, [settingsQuery.data]);

  function detectTz() {
    try {
      setTz(Intl.DateTimeFormat().resolvedOptions().timeZone);
      setDirty(true);
    } catch {
      /* ignore — user can type it */
    }
  }

  function save() {
    update.mutate(
      { timezone: tz.trim(), briefHour: hour, proactiveEnabled: enabled },
      {
        onSuccess: () => {
          setDirty(false);
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
              onChange={(e) => {
                setEnabled(e.target.checked);
                setDirty(true);
              }}
            />
            <span>Enable proactive briefs &amp; reviews</span>
          </label>

          <label className="stack" style={{ gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Timezone</span>
            <div className="row" style={{ gap: 8 }}>
              <Input
                value={tz}
                placeholder="America/Toronto"
                onChange={(e) => {
                  setTz(e.target.value);
                  setDirty(true);
                }}
              />
              <Button variant="ghost" onClick={detectTz}>Detect</Button>
            </div>
          </label>

          <label className="stack" style={{ gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Brief hour (0–23, local)</span>
            <Input
              type="number"
              min={0}
              max={23}
              value={hour}
              onChange={(e) => {
                setHour(Math.max(0, Math.min(23, Number(e.target.value) || 0)));
                setDirty(true);
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
            {pushState === 'unsupported' ? (
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
