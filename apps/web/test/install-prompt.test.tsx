import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InstallPrompt } from '@/components/InstallPrompt';

/**
 * On iPhone this component rendered nothing, ever.
 *
 * It waited for `beforeinstallprompt`, which Chromium fires and Safari does
 * not, so the one platform Atlas is actually used on had no way to discover
 * the Home Screen icon. And iOS refuses notification permission to a page in a
 * browser tab, so without that icon the entire push stack was unreachable —
 * with nothing on screen explaining why.
 */
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';

function setBrowser(userAgent: string, standalone = false) {
  vi.stubGlobal('navigator', {
    userAgent,
    maxTouchPoints: 5,
    standalone,
    serviceWorker: {},
  });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

const HINT = /Put Atlas on your Home Screen/i;

describe('InstallPrompt on iOS', () => {
  it('tells an iPhone user how to install, since Safari never offers to', async () => {
    setBrowser(IPHONE_SAFARI);
    render(<InstallPrompt />);
    expect(await screen.findByText(HINT)).toBeTruthy();
    expect(screen.getByText(/Add to Home Screen/i)).toBeTruthy();
  });

  /**
   * The stake, not just the request. "Add to home screen for quick access" is
   * ignorable; "reminders cannot reach you until you do" is true and is the
   * only reason it matters.
   */
  it('says why it matters, not just what to tap', async () => {
    setBrowser(IPHONE_SAFARI);
    render(<InstallPrompt />);
    await screen.findByText(HINT);
    expect(screen.getByText(/only send you reminders from the Home Screen/i)).toBeTruthy();
  });

  it('says nothing once the app is already installed', () => {
    setBrowser(IPHONE_SAFARI, true);
    render(<InstallPrompt />);
    expect(screen.queryByText(HINT)).toBeNull();
  });

  /** Android has its own native prompt; two banners is one too many. */
  it('says nothing on Android', () => {
    setBrowser(ANDROID);
    render(<InstallPrompt />);
    expect(screen.queryByText(HINT)).toBeNull();
  });

  it('stays dismissed', async () => {
    const user = userEvent.setup();
    setBrowser(IPHONE_SAFARI);
    const { unmount } = render(<InstallPrompt />);
    await screen.findByText(HINT);
    await user.click(screen.getByRole('button', { name: /Not now/i }));
    expect(screen.queryByText(HINT)).toBeNull();

    unmount();
    render(<InstallPrompt />);
    expect(screen.queryByText(HINT)).toBeNull();
  });
});
