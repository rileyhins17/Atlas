import type { Env } from '@atlas/shared';
export { type Env, isIos, isStandalone, isIosSafari, shouldShowIosInstallHint, canRequestNotifications } from '@atlas/shared';

/** Read the real browser. Guarded so it is safe during SSR. */
export function readEnv(): Env {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') {
    return { userAgent: '' };
  }
  return {
    userAgent: navigator.userAgent,
    iosStandalone: (navigator as Navigator & { standalone?: boolean }).standalone === true,
    displayModeStandalone: window.matchMedia?.('(display-mode: standalone)').matches ?? false,
    maxTouchPoints: navigator.maxTouchPoints,
  };
}
