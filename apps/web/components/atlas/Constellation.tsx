/**
 * The Atlas constellation motif — the same mark as the logo, reusable at any
 * size. `animated` draws the graph in (nodes pop, lines connect); `variant
 *="lonely"` shows one bright node among faint others, for empty states ("your
 * graph is waiting to be connected").
 */
export function Constellation({
  size = 96,
  animated = false,
  loading = false,
  variant = 'full',
  className = '',
}: {
  size?: number;
  animated?: boolean;
  /** Loops a gentle pulse — for "Atlas is thinking" loading moments. */
  loading?: boolean;
  variant?: 'full' | 'lonely';
  className?: string;
}) {
  const lonely = variant === 'lonely';
  const doAnimate = animated && !lonely;
  const faint = lonely ? 0.22 : 1;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      role="img"
      aria-label="Atlas"
      className={`constellation ${doAnimate ? 'animated' : ''} ${loading ? 'loading' : ''} ${className}`.trim()}
    >
      <defs>
        <linearGradient id="atlas-constellation" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f2a98f" />
          <stop offset="1" stopColor="#b5502f" />
        </linearGradient>
      </defs>
      {!lonely && (
        <g stroke="url(#atlas-constellation)" strokeWidth="3" strokeLinecap="round">
          <line x1="50" y1="20" x2="24" y2="80" style={{ animationDelay: '0.15s' }} />
          <line x1="50" y1="20" x2="76" y2="80" style={{ animationDelay: '0.3s' }} />
          <line x1="37" y1="50" x2="63" y2="50" style={{ animationDelay: '0.45s' }} />
        </g>
      )}
      <g fill="url(#atlas-constellation)">
        <circle cx="50" cy="20" r="6.5" style={{ animationDelay: '0s' }} />
        <circle cx="24" cy="80" r="6.5" opacity={faint} style={{ animationDelay: '0.1s' }} />
        <circle cx="76" cy="80" r="6.5" opacity={faint} style={{ animationDelay: '0.2s' }} />
        <circle cx="37" cy="50" r="4.5" opacity={faint} style={{ animationDelay: '0.3s' }} />
        <circle cx="63" cy="50" r="4.5" opacity={faint} style={{ animationDelay: '0.4s' }} />
      </g>
    </svg>
  );
}
