import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaletteSettingsCard } from '@/components/panels/PaletteSettingsCard';
import { DEFAULT_PALETTE, PALETTES } from '@/lib/theme/palettes';

/**
 * The picker itself. The colours are proven safe by palette-contrast.test.ts;
 * what is left to get wrong is the plumbing — applying a choice without a
 * reload, remembering it, and agreeing with the light/dark toggle rather than
 * keeping its own idea of the theme.
 */
const root = () => document.documentElement;

beforeEach(() => {
  root().setAttribute('data-palette', DEFAULT_PALETTE);
  root().setAttribute('data-theme', 'dark');
  localStorage.clear();
});

describe('PaletteSettingsCard', () => {
  it('offers every palette', async () => {
    render(<PaletteSettingsCard />);
    for (const p of PALETTES) {
      expect(await screen.findByRole('radio', { name: new RegExp(p.name, 'i') })).toBeTruthy();
    }
  });

  it('marks the one in use', async () => {
    root().setAttribute('data-palette', 'ocean');
    render(<PaletteSettingsCard />);
    const ocean = await screen.findByRole('radio', { name: /Ocean/i });
    expect(ocean.getAttribute('aria-checked')).toBe('true');
  });

  /** Judged by looking at it, so it applies on click rather than behind a Save. */
  it('applies a choice immediately', async () => {
    const user = userEvent.setup();
    render(<PaletteSettingsCard />);
    await user.click(await screen.findByRole('radio', { name: /Forest/i }));
    expect(root().getAttribute('data-palette')).toBe('forest');
  });

  it('remembers the choice', async () => {
    const user = userEvent.setup();
    render(<PaletteSettingsCard />);
    await user.click(await screen.findByRole('radio', { name: /Violet/i }));
    expect(localStorage.getItem('atlas-palette')).toBe('violet');
  });

  /**
   * Reads the document, not storage. The pre-paint script has already resolved
   * "never chosen" against the system preference; deriving it again here is how
   * the picker and the page get to disagree about what is on screen.
   */
  it('trusts the document over an empty storage', async () => {
    root().setAttribute('data-palette', 'gold');
    render(<PaletteSettingsCard />);
    expect((await screen.findByRole('radio', { name: /Gold/i })).getAttribute('aria-checked')).toBe(
      'true',
    );
  });

  /**
   * The swatches have to follow the light/dark toggle, which lives elsewhere in
   * the tree and writes the attribute directly rather than sharing state. Without
   * the observer the previews stay dark on a light page.
   */
  it('follows the light/dark toggle', async () => {
    render(<PaletteSettingsCard />);
    const before = (await screen.findByRole('radio', { name: /Ember/i })).innerHTML;
    root().setAttribute('data-theme', 'light');
    await screen.findByRole('radio', { name: /Ember/i });
    await new Promise((r) => setTimeout(r, 0));
    const after = screen.getByRole('radio', { name: /Ember/i }).innerHTML;
    expect(after).not.toBe(before);
  });

  it('describes each scheme, so all ten need not be tried', async () => {
    render(<PaletteSettingsCard />);
    await screen.findByRole('radio', { name: /Mono/i });
    expect(screen.getByText(/No colour at all/i)).toBeTruthy();
  });
});
