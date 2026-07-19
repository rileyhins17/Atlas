'use client';

import type { ReactNode } from 'react';

export interface ProgressRingProps {
  /** 0..1 progress; values outside are clamped. */
  value: number;
  size?: number;
  strokeWidth?: number;
  /** Center content (e.g. a count or icon). */
  children?: ReactNode;
  /** Accessible description, e.g. "Gym: 1 of 1 today". */
  label: string;
  /** CSS color for the progress arc; defaults to the brand accent. */
  color?: string;
}

/**
 * Apple-Fitness-style progress ring (SVG). The arc starts at 12 o'clock and
 * sweeps clockwise; the track is a muted full circle underneath.
 */
export function ProgressRing({
  value,
  size = 52,
  strokeWidth = 5,
  children,
  label,
  color = 'var(--brand)',
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(1, value));
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div
      className="ring"
      role="img"
      aria-label={label}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--surface-inset)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="ring-arc"
          data-testid="ring-arc"
        />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}
