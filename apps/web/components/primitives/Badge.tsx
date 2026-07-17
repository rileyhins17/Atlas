import type { HTMLAttributes } from 'react';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Extra pill variant class, e.g. task priority (`HIGH`, `URGENT`). */
  tone?: string;
}

export function Badge({ className, tone, ...props }: BadgeProps) {
  const classes = ['pill', tone, className].filter(Boolean).join(' ');
  return <span className={classes} {...props} />;
}
