'use client';

import Link from 'next/link';
import {
  CalendarDays,
  CheckCircle2,
  Dumbbell,
  PenLine,
  Repeat,
  Settings as SettingsIcon,
  Target,
  Wallet,
} from 'lucide-react';
import { EVERYTHING } from '@/lib/sections';
import { PageHeader } from '@/components/PageHeader';

const ICONS = {
  calendar: CalendarDays,
  check: CheckCircle2,
  target: Target,
  repeat: Repeat,
  dumbbell: Dumbbell,
  pen: PenLine,
  wallet: Wallet,
  settings: SettingsIcon,
} as const;

/**
 * The domain pages, one level down.
 *
 * They are complete and unchanged — they simply stopped competing with the
 * question you opened the app to answer. Each carries a line saying what it is
 * for, because "Journal" and "Notes" sitting side by side told nobody which was
 * which.
 *
 * A GRID of cards, not a stack of full-width rows: eight identical 735px pills
 * with a chevron floating 600px from the label they belonged to read as a
 * settings menu, and the label was the only thing distinguishing one from the
 * next. An icon and a two-column grid make it a place you can scan.
 */
export function EverythingPanel() {
  return (
    <>
      <PageHeader
        title="Everything"
        subtitle="Every part of Atlas, whole. Most days you will not need to come here."
      />
      <ul className="evy-list">
        {EVERYTHING.map((d) => {
          const Icon = ICONS[d.icon];
          return (
            <li key={d.href}>
              <Link className="evy-item" href={d.href}>
                <span className="evy-icon" aria-hidden>
                  <Icon size={17} />
                </span>
                <span className="evy-body">
                  <span className="evy-label">{d.label}</span>
                  <span className="evy-blurb">{d.blurb}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
