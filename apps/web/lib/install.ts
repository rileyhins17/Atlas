/**
 * Whether to tell someone to add Atlas to their Home Screen, and why it matters.
 *
 * The install banner listened only for `beforeinstallprompt`, which Chromium
 * fires and Safari never does — so on iPhone, the platform Atlas is actually
 * used on, there was no install affordance at all.
 *
 * That is not merely a missing nicety. iOS refuses notification permission to a
 * page running in a Safari tab: `Notification.requestPermission` is unavailable
 * until the app is launched from the Home Screen icon in standalone mode. So a
 * user who never adds the icon can never be reminded of anything, and nothing
 * on screen ever told them. The whole push stack — VAPID keys, service worker,
 * subscription plumbing — sat behind a door with no handle.
 *
 * Pure so the detection is unit-tested rather than eyeballed on one device.
 */

export interface Env {
  userAgent: string;
  /** `navigator.standalone`, the iOS-only flag for "launched from the icon". */
  iosStandalone?: boolean;
  /** `matchMedia('(display-mode: standalone)').matches`, the standard one. */
  displayModeStandalone?: boolean;
  /** iPadOS reports a Macintosh UA, so touch points are what separate them. */
  maxTouchPoints?: number;
}

/** iPhone, iPad or iPod — including iPadOS, which lies about being a Mac. */
export function isIos(env: Env): boolean {
  if (/iPad|iPhone|iPod/.test(env.userAgent)) return true;
  // iPadOS 13+ sends a desktop Safari UA. A Mac has no touch screen.
  return /Macintosh/.test(env.userAgent) && (env.maxTouchPoints ?? 0) > 1;
}

/** Already launched from the Home Screen icon. */
export function isStandalone(env: Env): boolean {
  return Boolean(env.iosStandalone || env.displayModeStandalone);
}

/**
 * Safari specifically. Chrome and Firefox on iOS are WebKit underneath but do
 * NOT offer "Add to Home Screen" in the share sheet, so telling their users to
 * look for it sends them hunting for something that is not there.
 */
export function isIosSafari(env: Env): boolean {
  if (!isIos(env)) return false;
  const ua = env.userAgent;
  // CriOS = Chrome, FxiOS = Firefox, EdgiOS = Edge, and an in-app webview
  // (Instagram, Facebook) has no share sheet worth naming either.
  return !/CriOS|FxiOS|EdgiOS|OPiOS|FBAN|FBAV|Instagram|Line\//.test(ua);
}

/**
 * Should the iOS "Add to Home Screen" hint be shown?
 *
 * Only on iOS Safari, only when not already installed. Every other platform
 * gets the native `beforeinstallprompt` flow instead.
 */
export function shouldShowIosInstallHint(env: Env): boolean {
  return isIosSafari(env) && !isStandalone(env);
}

/**
 * Can this browser ask for notification permission at all?
 *
 * On iOS the answer is no until the app is standalone, and saying so is kinder
 * than letting someone tap a button that silently does nothing.
 */
export function canRequestNotifications(env: Env): boolean {
  return !isIos(env) || isStandalone(env);
}

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
