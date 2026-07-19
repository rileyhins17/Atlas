'use client';

import type { HTMLAttributes } from 'react';

/** Keyboard-key chip for shortcut hints (⌘K, J, Esc). */
export function Kbd({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  const classes = ['kbd', className].filter(Boolean).join(' ');
  return <kbd className={classes} {...rest} />;
}
