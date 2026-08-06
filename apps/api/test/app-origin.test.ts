import { describe, expect, it } from 'vitest';
import { pickOrigin } from '../src/config/env.js';

/**
 * The bug this defends against looked like a Google outage and was not one:
 * WEB_ORIGIN is an allow-LIST, and using it raw as a redirect target produced
 * "http://localhost:3000,https://atlaslife.app/settings", which is not a URL.
 * Chrome said ERR_INVALID_REDIRECT and the service worker turned that into the
 * offline page.
 */
describe('picking the one origin a browser is redirected back to', () => {
  it('never returns the whole list', () => {
    expect(pickOrigin('http://localhost:3000,https://atlaslife.app')).not.toContain(',');
  });

  it('prefers the deployed https origin over a local one', () => {
    expect(pickOrigin('http://localhost:3000,https://atlaslife.app')).toBe('https://atlaslife.app');
    // Order must not matter — the deployed origin is not always last.
    expect(pickOrigin('https://atlaslife.app,http://localhost:3000')).toBe('https://atlaslife.app');
  });

  it('works with a single origin, in either scheme', () => {
    expect(pickOrigin('https://atlaslife.app')).toBe('https://atlaslife.app');
    expect(pickOrigin('http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('tolerates whitespace and empty entries', () => {
    expect(pickOrigin(' http://localhost:3000 , https://atlaslife.app ')).toBe(
      'https://atlaslife.app',
    );
    expect(pickOrigin('https://atlaslife.app,,')).toBe('https://atlaslife.app');
  });

  it('always produces something a browser can parse', () => {
    for (const raw of ['http://localhost:3000,https://atlaslife.app', 'https://atlaslife.app', '']) {
      expect(() => new URL('/settings?google=connected', pickOrigin(raw))).not.toThrow();
    }
  });
});
