import { forwardRef, type TextareaHTMLAttributes } from 'react';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    const classes = ['input', className].filter(Boolean).join(' ');
    return <textarea ref={ref} className={classes} {...props} />;
  },
);
