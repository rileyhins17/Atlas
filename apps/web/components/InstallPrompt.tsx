'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';

// The event Chromium fires when the PWA is installable. Not in lib.dom yet.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'atlas-install-dismissed';

/**
 * A tasteful "Add to home screen" banner. We intercept Chrome's default
 * mini-infobar (preventDefault) and surface our own affordance instead; once
 * dismissed we don't nag again (localStorage), and it hides itself after a
 * real install.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY)) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!deferred) return null;

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1');
    setDeferred(null);
  }

  return (
    <div className="install-prompt">
      <span>Install Atlas for quick access and offline use.</span>
      <div className="row" style={{ gap: 8 }}>
        <Button onClick={install}>Install</Button>
        <Button variant="ghost" onClick={dismiss}>
          Not now
        </Button>
      </div>
    </div>
  );
}
