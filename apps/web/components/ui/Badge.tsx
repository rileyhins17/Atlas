'use client';

import type { HTMLAttributes } from 'react';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Extra pill classes, e.g. a priority (`HIGH`/`URGENT`) for the danger tint. */
  tone?: string;
}

/** Small status pill (`.pill` in globals.css). */
export function Badge({ tone, className, ...rest }: BadgeProps) {
  const classes = ['pill', tone, className].filter(Boolean).join(' ');
  return <span className={classes} {...rest} />;
}
