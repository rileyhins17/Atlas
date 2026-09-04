'use client';

import { ArrowDown, ArrowRight, ArrowUp, TriangleAlert } from 'lucide-react';
import type { StatsDTO } from '@atlas/shared';
import { whatChanged } from '@/lib/what-changed';

/**
 * The answer, first.
 *
 * This is what the page leads with now instead of "193 things happened" and six
 * unlabelled sparklines. Each line is a sentence with a real number in it, and
 * the ranking is editorial: anything you can act on tonight comes before any
 * amount of good news, because a review that only reports improvement is one
 * nobody believes twice.
 *
 * Every sentence is arithmetic, not a model. See lib/what-changed.ts.
 */
const ARROWS = { up: ArrowUp, down: ArrowDown, flat: ArrowRight };

export function WhatChanged({ data, days }: { data: StatsDTO; days: number }) {
  const changes = whatChanged(data, days);
  if (changes.length === 0) return null;

  return (
    <section className="wc" aria-label={`What changed in the last ${days} days`}>
      <ul className="wc-list">
        {changes.map((c) => {
          // Arrow from the DIRECTION, colour from the TONE. "You spent $378 —
          // down 31%" is good news that points down, and drawing a green
          // up-arrow beside the word "down" is how a page loses a reader.
          const Icon = c.tone === 'warn' ? TriangleAlert : ARROWS[c.direction];
          return (
            <li key={c.id} className="wc-item" data-tone={c.tone}>
              <Icon size={16} aria-hidden className="wc-icon" />
              <span className="wc-text">{c.text}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
