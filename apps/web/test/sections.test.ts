import { describe, expect, it } from 'vitest';
import { SECTIONS, sectionFor, tabFor } from '../lib/sections';

describe('sections', () => {
  it('has exactly four destinations', () => {
    // The whole point of the collapse. If this grows, the nav is drifting back.
    expect(SECTIONS).toHaveLength(4);
  });

  it('maps every legacy route into a section', () => {
    const legacy = [
      '/today', '/progress', '/history', '/goals', '/tasks', '/calendar',
      '/habits', '/fitness', '/journal', '/notes', '/finance',
    ];
    for (const path of legacy) {
      expect(sectionFor(path), path).not.toBeNull();
    }
  });

  it('puts planning routes under Plan and personal ones under Life', () => {
    expect(sectionFor('/tasks')?.label).toBe('Plan');
    expect(sectionFor('/goals')?.label).toBe('Plan');
    expect(sectionFor('/calendar')?.label).toBe('Plan');
    expect(sectionFor('/fitness')?.label).toBe('Life');
    expect(sectionFor('/notes')?.label).toBe('Life');
    expect(sectionFor('/finance')?.label).toBe('Money');
  });

  it('matches nested routes, not just exact ones', () => {
    expect(sectionFor('/fitness/history')?.label).toBe('Life');
  });

  it('returns null for a route outside the app shell', () => {
    expect(sectionFor('/settings')).toBeNull();
    expect(sectionFor('/privacy')).toBeNull();
  });

  it('resolves the active tab, falling back to the first', () => {
    const plan = SECTIONS.find((s) => s.label === 'Plan')!;
    expect(tabFor(plan, '/calendar')).toBe('calendar');
    expect(tabFor(plan, '/plan')).toBe('goals');
  });

  it('never lists the same route in two sections', () => {
    const seen = new Set<string>();
    for (const s of SECTIONS) {
      for (const t of s.tabs) {
        expect(seen.has(t.href), t.href).toBe(false);
        seen.add(t.href);
      }
    }
  });
});
