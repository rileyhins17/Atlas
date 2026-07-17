import { forwardRef, type InputHTMLAttributes } from 'react';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    const classes = ['input', className].filter(Boolean).join(' ');
    return <input ref={ref} className={classes} {...props} />;
  },
);
