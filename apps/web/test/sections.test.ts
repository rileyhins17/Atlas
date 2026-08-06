import { describe, expect, it } from 'vitest';
import { EVERYTHING, SECTIONS, sectionFor, tabFor } from '../lib/sections';

describe('sections', () => {
  it('has exactly three destinations', () => {
    // The whole point of the collapse, and the number this file exists to
    // defend. Eleven peers became four sections, and four sections still hid a
    // tab strip that put the eleven back. If this grows, the nav is drifting.
    expect(SECTIONS).toHaveLength(3);
    expect(SECTIONS.map((s) => s.label)).toEqual(['Today', 'Week', 'Looking back']);
  });

  it('is organised by time, not by data type', () => {
    // Today is now/soon/after — never a domain. A section named after a noun
    // like "Money" or "Life" is the shape this replaced.
    expect(sectionFor('/today')?.label).toBe('Today');
    expect(sectionFor('/week')?.label).toBe('Week');
    expect(sectionFor('/looking-back')?.label).toBe('Looking back');
  });

  it('keeps the planning routes reachable inside Week', () => {
    expect(sectionFor('/tasks')?.label).toBe('Week');
    expect(sectionFor('/goals')?.label).toBe('Week');
  });

  it('demotes the domain pages without deleting any of them', () => {
    // Every one still has a route and an entry in Everything. Demoted is not
    // removed — a page nobody can reach is a page that has been deleted badly.
    const hrefs = EVERYTHING.map((d) => d.href);
    // /notes is not listed separately any more — Journal and Notes merged into
    // one Writing surface at /journal. Both routes still resolve to it.
    for (const path of [
      '/calendar', '/tasks', '/goals', '/habits',
      '/fitness', '/journal', '/finance', '/settings',
    ]) {
      expect(hrefs, path).toContain(path);
    }
  });

  it('gives every demoted page a line saying what it is for', () => {
    // "Journal" and "Notes" side by side told nobody which was which.
    for (const d of EVERYTHING) {
      expect(d.blurb.length, d.label).toBeGreaterThan(10);
    }
  });

  it('matches nested routes, not just exact ones', () => {
    expect(sectionFor('/tasks/anything')?.label).toBe('Week');
  });

  it('returns null for a route outside the primary nav', () => {
    // Habits and Money are deliberately NOT in a section any more; they live
    // under Everything, so nothing in the nav lights up for them.
    expect(sectionFor('/settings')).toBeNull();
    expect(sectionFor('/privacy')).toBeNull();
    expect(sectionFor('/finance')).toBeNull();
    expect(sectionFor('/habits')).toBeNull();
  });

  it('resolves the active tab, falling back to the first', () => {
    const week = SECTIONS.find((s) => s.label === 'Week')!;
    expect(tabFor(week, '/tasks')).toBe('tasks');
    expect(tabFor(week, '/week')).toBe('calendar');
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
