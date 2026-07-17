import type { ReactNode } from 'react';

export interface EmptyStateProps {
  message: ReactNode;
  action?: ReactNode;
}

/** Matches the plain `.muted` text the panels already used for "no data yet" states. */
export function EmptyState({ message, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <span className="muted">{message}</span>
      {action}
    </div>
  );
}
