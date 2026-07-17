import { forwardRef, type HTMLAttributes } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds the `.stack` vertical-gap layout used by form-like cards. */
  stack?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, stack, ...props },
  ref,
) {
  const classes = ['card', stack && 'stack', className].filter(Boolean).join(' ');
  return <div ref={ref} className={classes} {...props} />;
});
