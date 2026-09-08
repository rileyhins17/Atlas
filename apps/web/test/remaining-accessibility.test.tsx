import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { buildPalette, PALETTES, contrast, mix } from '@atlas/shared';
import { ActivityCalendar } from '@/components/progress/ActivityCalendar';
it('exposes the activity legend as a named group', () => {
  render(<ActivityCalendar days={[]} />);
  expect(screen.getByRole('group', { name: 'Scale' })).toBeTruthy();
});
it('keeps the actual Now label token readable over its actual gradient tint in every palette', () => {
  const css = readFileSync('app/globals.css', 'utf8');
  const label = css.match(/\.nownext-eyebrow\s*\{([^}]+)\}/)![1]!;
  const token = label.match(/color:\s*var\((--[a-z-]+)\)/)![1]!;
  const surface = css.match(/\.nownext\s*\{([^}]+)\}/)![1]!;
  expect(surface).toContain('in srgb');
  const tint = Number(surface.match(/var\(--brand\)\s+(\d+)%/)![1]);
  const failures: string[] = [];
  for (const seed of PALETTES) for (const mode of ['light', 'dark'] as const) {
    const palette = buildPalette(seed, mode);
    const ratio = contrast(palette[token as keyof typeof palette], mix(palette['--brand'], palette['--surface-raised'], tint));
    if (ratio < 4.5) failures.push(`${seed.id}/${mode}: ${ratio.toFixed(2)}`);
  }
  expect(failures).toEqual([]);
});
