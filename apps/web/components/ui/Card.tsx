'use client';

import type { HTMLAttributes } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Lay children out as a vertical stack (`.stack`). */
  stack?: boolean;
}

/** Raised surface container (`.card` in globals.css). */
export function Card({ stack = false, className, ...rest }: CardProps) {
  const base = stack ? 'card stack' : 'card';
  return <div className={className ? `${base} ${className}` : base} {...rest} />;
}
