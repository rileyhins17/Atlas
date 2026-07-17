'use client';

import type { CSSProperties } from 'react';

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  /** Round the placeholder fully (avatars, checkboxes). */
  circle?: boolean;
  style?: CSSProperties;
  className?: string;
}

/** Shimmering layout placeholder. Size it to match the content it stands in for. */
export function Skeleton({ width = '100%', height = 16, circle = false, style, className }: SkeletonProps) {
  return (
    <span
      className={className ? `skeleton ${className}` : 'skeleton'}
      style={{ width, height, borderRadius: circle ? '50%' : undefined, ...style }}
      aria-hidden
    />
  );
}

/**
 * Placeholder for a list of `.task` rows (tasks, habits, events) — same
 * paddings and check-circle footprint as the real rows so nothing shifts
 * when data lands.
 */
export function ListSkeleton({ rows = 3, circle = true }: { rows?: number; circle?: boolean }) {
  return (
    <div aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div className="task" key={i}>
          {circle && <Skeleton width={22} height={22} circle />}
          <Skeleton height={16} style={{ flex: 1, maxWidth: `${70 - i * 12}%` }} />
        </div>
      ))}
    </div>
  );
}

/** Placeholder for a stack of content cards (journal entries, notes, briefs). */
export function CardListSkeleton({ cards = 2, lines = 2 }: { cards?: number; lines?: number }) {
  return (
    <div className="stack" aria-hidden>
      {Array.from({ length: cards }, (_, i) => (
        <div className="card stack" key={i} style={{ gap: 8 }}>
          <Skeleton height={12} width="30%" />
          {Array.from({ length: lines }, (_, j) => (
            <Skeleton height={14} width={j === lines - 1 ? '60%' : '90%'} key={j} />
          ))}
        </div>
      ))}
    </div>
  );
}
