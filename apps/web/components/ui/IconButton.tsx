'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required accessible name — icon buttons have no visible text. */
  label: string;
  children: ReactNode;
}

/** A square, quiet icon-only control (`.icon-btn`). Used for row actions and header controls. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, className, type = 'button', children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      className={className ? `icon-btn ${className}` : 'icon-btn'}
      {...rest}
    >
      {children}
    </button>
  );
});
