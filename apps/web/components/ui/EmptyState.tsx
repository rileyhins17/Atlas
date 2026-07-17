'use client';

import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title: string;
  /** What to do next — every empty state should point somewhere. */
  hint?: string;
  /** Optional call-to-action rendered under the hint. */
  action?: ReactNode;
}

/** "Nothing here yet" with a purposeful next step. */
export function EmptyState({ title, hint, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {hint && <span className="muted" style={{ fontSize: 13 }}>{hint}</span>}
      {action}
    </div>
  );
}
