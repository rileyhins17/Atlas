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
