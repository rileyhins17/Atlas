/** The Atlas mark — a compass rose in warm terracotta on a soft app tile. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 192 192" fill="none" role="img" aria-label="Atlas">
      <defs>
        <linearGradient id="atlas-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e8836a" />
          <stop offset="1" stopColor="#c2603f" />
        </linearGradient>
      </defs>
      <rect width="192" height="192" rx="46" fill="#2b2723" />
      <circle cx="96" cy="96" r="58" fill="none" stroke="url(#atlas-mark)" strokeWidth="9" />
      <path
        d="M96 44 L96 148 M44 96 L148 96"
        stroke="url(#atlas-mark)"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <circle cx="96" cy="96" r="11" fill="url(#atlas-mark)" />
    </svg>
  );
}
