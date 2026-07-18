'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface EmptyStateProps {
  /** A Lucide icon shown in a soft badge above the title. */
  icon?: LucideIcon;
  title: string;
  /** What to do next — every empty state should point somewhere. */
  hint?: string;
  /** Optional call-to-action rendered under the hint. */
  action?: ReactNode;
}

/** "Nothing here yet" — a quiet icon, a title, and a next step. */
export function EmptyState({ icon: Icon, title, hint, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      {Icon && (
        <span className="empty-state-icon" aria-hidden>
          <Icon size={22} />
        </span>
      )}
      <strong>{title}</strong>
      {hint && <span className="empty-state-hint">{hint}</span>}
      {action}
    </div>
  );
}
