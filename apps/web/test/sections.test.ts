import { describe, expect, it } from 'vitest';
import { DESTINATIONS, EVERYTHING, SECTIONS, sectionFor, tabFor } from '../lib/sections';

describe('sections', () => {
  it('has exactly three destinations', () => {
    // The whole point of the collapse, and the number this file exists to
    // defend. Eleven peers became four sections, and four sections still hid a
    // tab strip that put the eleven back. If this grows, the nav is drifting.
    expect(SECTIONS).toHaveLength(3);
    expect(SECTIONS.map((s) => s.label)).toEqual(['Today', 'Week', 'Progress']);
  });

  it('is organised by time, not by data type', () => {
    // Today is now/soon/after — never a domain. A section named after a noun
    // like "Money" or "Life" is the shape this replaced.
    expect(sectionFor('/today')?.label).toBe('Today');
    expect(sectionFor('/week')?.label).toBe('Week');
    expect(sectionFor('/progress')?.label).toBe('Progress');
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

describe('DESTINATIONS (what ⌘K can reach)', () => {
  it('covers every section and every domain page', () => {
    // The command bar used to keep its own hand-written copy of this, and it
    // silently kept the pre-restructure eleven: "week", "money", "goals" and
    // "training" matched nothing, while "Notes" and "Progress" still offered
    // screens that had been folded into other places. Deriving it is the fix;
    // this test is what stops a new page being added to one list only.
    const hrefs = new Set(DESTINATIONS.map((d) => d.href));
    for (const s of SECTIONS) expect(hrefs.has(s.tabs[0]!.href), s.label).toBe(true);
    for (const d of EVERYTHING) expect(hrefs.has(d.href), d.label).toBe(true);
  });

  it('offers no route twice', () => {
    const hrefs = DESTINATIONS.map((d) => d.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('every destination has a label, an icon and searchable keywords', () => {
    for (const d of DESTINATIONS) {
      expect(d.label.length, d.href).toBeGreaterThan(0);
      expect(d.icon.length, d.href).toBeGreaterThan(0);
      expect(d.keywords.length, d.href).toBeGreaterThan(0);
      // Its own label must be findable, or typing the name of the page fails.
      expect(d.keywords, d.href).toContain(d.label.toLowerCase());
    }
  });

  it('finds the screens that superseded the old ones by their old names', () => {
    const find = (term: string) =>
      DESTINATIONS.filter((d) => d.keywords.includes(term)).map((d) => d.href);
    // Someone who learnt this app before the restructure still gets somewhere.
    expect(find('notes')).toContain('/journal');
    expect(find('progress')).toContain('/progress');
    expect(find('history')).toContain('/progress');
    expect(find('finance')).toContain('/finance');
    expect(find('workout')).toContain('/fitness');
  });
});
