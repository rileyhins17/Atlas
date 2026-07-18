'use client';

import { useEffect } from 'react';

/**
 * Registers the offline service worker — production only, so the SW cache never
 * masks local changes during `next dev`. Best-effort: the app works without it.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const onLoad = () => {
      void navigator.serviceWorker.register('/sw.js').catch(() => {
        /* registration is best-effort */
      });
    };
    window.addEventListener('load', onLoad);
    return () => window.removeEventListener('load', onLoad);
  }, []);

  return null;
}
