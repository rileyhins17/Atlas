'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Constellation } from '@/components/atlas/Constellation';

export interface EmptyStateProps {
  /** Accepted for backwards-compat; the constellation motif is used instead. */
  icon?: LucideIcon;
  title: string;
  /** What to do next — every empty state should point somewhere. */
  hint?: string;
  /** Optional call-to-action rendered under the hint. */
  action?: ReactNode;
}

/**
 * "Nothing here yet" — the Atlas constellation with one bright node among faint
 * ones (your graph waiting to be connected), a title, and a next step. One motif
 * across every domain so the whole app reads as a single surface.
 */
export function EmptyState({ title, hint, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <span className="empty-state-art" aria-hidden>
        <Constellation variant="lonely" size={64} />
      </span>
      <strong>{title}</strong>
      {hint && <span className="empty-state-hint">{hint}</span>}
      {action}
    </div>
  );
}
