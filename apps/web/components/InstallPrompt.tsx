'use client';

import { useEffect, useState } from 'react';
import { Share } from 'lucide-react';
import { Button } from '@/components/ui';
import { readEnv, shouldShowIosInstallHint } from '@/lib/install';

// The event Chromium fires when the PWA is installable. Not in lib.dom yet.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'atlas-install-dismissed';

/**
 * "Add to home screen", on both kinds of browser.
 *
 * Chromium fires `beforeinstallprompt` and we intercept its mini-infobar to
 * offer our own button. Safari fires nothing at all — so on iPhone, the
 * platform Atlas is actually used on, this component rendered nothing and
 * there was no way to discover the icon.
 *
 * That mattered more than convenience. iOS refuses notification permission to
 * a page in a Safari tab; it only becomes available once the app is launched
 * from the Home Screen. So every part of the push stack — VAPID keys, the
 * service worker, the subscription endpoints — sat behind a door with no
 * handle, and nothing on screen said so. The iOS branch below is that handle,
 * and it explains the reason rather than just asking.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIos, setShowIos] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY)) return;

    // Safari never fires beforeinstallprompt, so iOS is detected rather than
    // waited for. Done in an effect because it reads navigator, and the server
    // has no idea what device is asking.
    if (shouldShowIosInstallHint(readEnv())) setShowIos(true);

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

  function dismissIos() {
    localStorage.setItem(DISMISS_KEY, '1');
    setShowIos(false);
  }

  if (showIos) {
    return (
      <div className="install-prompt ios">
        <div className="install-ios-copy">
          <strong>Put Atlas on your Home Screen</strong>
          <p>
            Tap <Share size={14} aria-label="the Share button" className="install-share" /> below,
            then <strong>Add to Home Screen</strong>.
          </p>
          {/* The reason, not just the request. "Add to home screen for quick
              access" is ignorable; "reminders cannot reach you until you do"
              is the actual stake, and it is true — iOS gives a Safari tab no
              way to ask for notification permission at all. */}
          <p className="install-ios-why">
            Atlas can only send you reminders from the Home Screen icon — iOS gives a browser tab
            no way to ask.
          </p>
        </div>
        <Button variant="ghost" onClick={dismissIos}>
          Not now
        </Button>
      </div>
    );
  }

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
