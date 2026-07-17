'use client';

import { Button } from './Button';

export interface ErrorStateProps {
  message: string;
  /** Wire to `query.refetch` for load failures. */
  onRetry?: () => void;
}

/** Load-failure display with a retry affordance. Mutation errors stay inline. */
export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="stack" style={{ alignItems: 'flex-start', gap: 8 }}>
      <span className="error" style={{ marginTop: 0 }}>{message}</span>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
