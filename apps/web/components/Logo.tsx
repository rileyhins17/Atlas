/**
 * The Atlas mark — a constellation "A": your life's domains as one connected
 * graph.
 *
 * Solid colours rather than a gradient, and that is deliberate. The gradient
 * version referenced `url(#atlas-mark)`, and the mark renders TWICE on every
 * app page — once in the sidebar and once in the mobile top bar. Two elements
 * with the same id is invalid, `url(#id)` resolves to whichever came first, and
 * below 901px the first one lives inside a `display: none` sidebar: the mobile
 * top bar painted a blank grey square where the logo should be.
 *
 * A unique id per instance would need `useId`, which would make this a client
 * component — and it is also on the landing page, which ships no client JS on
 * purpose. Stepping the colour by position keeps the light-to-dark reading of
 * the original with no id to collide.
 */
const NEAR = '#eda184';
const MID = '#d4785a';
const FAR = '#b5502f';

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 192 192" fill="none" role="img" aria-label="Atlas">
      <rect width="192" height="192" rx="46" fill="#2b2723" />
      <g transform="translate(21 21) scale(1.5)" strokeLinecap="round">
        <g strokeWidth="4" fill="none">
          <line x1="50" y1="20" x2="24" y2="80" stroke={MID} />
          <line x1="50" y1="20" x2="76" y2="80" stroke={MID} />
          <line x1="37" y1="50" x2="63" y2="50" stroke={MID} />
        </g>
        <circle cx="50" cy="20" r="6.5" fill={NEAR} />
        <circle cx="24" cy="80" r="6.5" fill={FAR} />
        <circle cx="76" cy="80" r="6.5" fill={FAR} />
        <circle cx="37" cy="50" r="4.5" fill={MID} />
        <circle cx="63" cy="50" r="4.5" fill={MID} />
      </g>
    </svg>
  );
}
