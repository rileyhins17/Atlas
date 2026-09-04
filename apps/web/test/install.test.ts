import { describe, expect, it } from 'vitest';
import {
  canRequestNotifications,
  isIos,
  isIosSafari,
  isStandalone,
  shouldShowIosInstallHint,
  type Env,
} from '@/lib/install';

/**
 * The install banner listened only for `beforeinstallprompt`, which Safari
 * never fires — so on iPhone there was no install affordance at all.
 *
 * That blocked more than convenience. iOS refuses notification permission to a
 * page in a Safari tab, so a user who never adds the Home Screen icon can never
 * be reminded of anything, and nothing on screen said so. The entire push stack
 * sat behind a door with no handle.
 */
const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148 Safari/604.1',
  iphoneInstagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0',
  ipadOS:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
};

const env = (over: Partial<Env> & { userAgent: string }): Env => ({ maxTouchPoints: 5, ...over });

describe('isIos', () => {
  it('recognises an iPhone', () => {
    expect(isIos(env({ userAgent: UA.iphoneSafari }))).toBe(true);
  });

  /** iPadOS 13+ sends a desktop Safari UA; touch points are the tell. */
  it('recognises an iPad pretending to be a Mac', () => {
    expect(isIos(env({ userAgent: UA.ipadOS, maxTouchPoints: 5 }))).toBe(true);
  });

  it('does not mistake a real Mac for one', () => {
    expect(isIos(env({ userAgent: UA.mac, maxTouchPoints: 0 }))).toBe(false);
  });

  it('does not fire on Android', () => {
    expect(isIos(env({ userAgent: UA.androidChrome }))).toBe(false);
  });
});

describe('isIosSafari', () => {
  it('is true for Safari', () => {
    expect(isIosSafari(env({ userAgent: UA.iphoneSafari }))).toBe(true);
  });

  /**
   * Chrome on iOS is WebKit underneath but has no "Add to Home Screen" in its
   * share sheet. Telling its users to look for it sends them hunting for
   * something that is not there.
   */
  it('is false for Chrome on iOS', () => {
    expect(isIosSafari(env({ userAgent: UA.iphoneChrome }))).toBe(false);
  });

  it('is false inside an in-app browser', () => {
    expect(isIosSafari(env({ userAgent: UA.iphoneInstagram }))).toBe(false);
  });
});

describe('shouldShowIosInstallHint', () => {
  it('shows on iPhone Safari in a tab', () => {
    expect(shouldShowIosInstallHint(env({ userAgent: UA.iphoneSafari }))).toBe(true);
  });

  /** Already installed — the hint would be telling them to do what they did. */
  it('is silent once launched from the icon', () => {
    expect(
      shouldShowIosInstallHint(env({ userAgent: UA.iphoneSafari, iosStandalone: true })),
    ).toBe(false);
    expect(
      shouldShowIosInstallHint(env({ userAgent: UA.iphoneSafari, displayModeStandalone: true })),
    ).toBe(false);
  });

  it('is silent on Android, which has its own install prompt', () => {
    expect(shouldShowIosInstallHint(env({ userAgent: UA.androidChrome }))).toBe(false);
  });

  it('is silent on desktop', () => {
    expect(shouldShowIosInstallHint(env({ userAgent: UA.mac, maxTouchPoints: 0 }))).toBe(false);
  });
});

describe('canRequestNotifications', () => {
  /**
   * The reason the hint exists. iOS makes notification permission unavailable
   * outside standalone mode, so offering the button in a tab is offering
   * something that silently does nothing.
   */
  it('is false on iOS in a browser tab', () => {
    expect(canRequestNotifications(env({ userAgent: UA.iphoneSafari }))).toBe(false);
  });

  it('is true on iOS once installed', () => {
    expect(
      canRequestNotifications(env({ userAgent: UA.iphoneSafari, iosStandalone: true })),
    ).toBe(true);
  });

  it('is true everywhere else, installed or not', () => {
    expect(canRequestNotifications(env({ userAgent: UA.androidChrome }))).toBe(true);
    expect(canRequestNotifications(env({ userAgent: UA.mac, maxTouchPoints: 0 }))).toBe(true);
  });
});

describe('isStandalone', () => {
  it('accepts either signal', () => {
    expect(isStandalone(env({ userAgent: UA.iphoneSafari, iosStandalone: true }))).toBe(true);
    expect(isStandalone(env({ userAgent: UA.androidChrome, displayModeStandalone: true }))).toBe(true);
    expect(isStandalone(env({ userAgent: UA.iphoneSafari }))).toBe(false);
  });
});
