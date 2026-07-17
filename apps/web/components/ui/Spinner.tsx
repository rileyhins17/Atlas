'use client';

/** Inline loading indicator. Size in px; defaults to text-sized. */
export function Spinner({ size = 16, label }: { size?: number; label?: string }) {
  return (
    <span className="row" style={{ gap: 8 }} role="status" aria-live="polite">
      <span className="spinner" style={{ width: size, height: size }} aria-hidden />
      {label ? <span className="muted">{label}</span> : <span className="sr-only">Loading</span>}
    </span>
  );
}
