/** The Atlas mark — a constellation "A": your life's domains as one connected graph. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 192 192" fill="none" role="img" aria-label="Atlas">
      <defs>
        <linearGradient id="atlas-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f2a98f" />
          <stop offset="1" stopColor="#b5502f" />
        </linearGradient>
      </defs>
      <rect width="192" height="192" rx="46" fill="#2b2723" />
      <g transform="translate(21 21) scale(1.5)" strokeLinecap="round">
        <g stroke="url(#atlas-mark)" strokeWidth="4" fill="none">
          <line x1="50" y1="20" x2="24" y2="80" />
          <line x1="50" y1="20" x2="76" y2="80" />
          <line x1="37" y1="50" x2="63" y2="50" />
        </g>
        <g fill="url(#atlas-mark)">
          <circle cx="50" cy="20" r="6.5" />
          <circle cx="24" cy="80" r="6.5" />
          <circle cx="76" cy="80" r="6.5" />
          <circle cx="37" cy="50" r="4.5" />
          <circle cx="63" cy="50" r="4.5" />
        </g>
      </g>
    </svg>
  );
}
