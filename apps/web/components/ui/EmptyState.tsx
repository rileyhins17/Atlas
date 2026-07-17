'use client';

import type { ReactNode } from 'react';

export interface EmptyStateProps {
  children: ReactNode;
  /** Optional call-to-action rendered under the message. */
  action?: ReactNode;
}

/**
 * "Nothing here yet" message. Phase 1 renders the same muted text the panels
 * always had; Phase 2 upgrades this in place (illustration + next action).
 */
export function EmptyState({ children, action }: EmptyStateProps) {
  if (!action) return <span className="muted">{children}</span>;
  return (
    <div className="stack" style={{ alignItems: 'flex-start' }}>
      <span className="muted">{children}</span>
      {action}
    </div>
  );
}
