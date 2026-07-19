'use client';

export interface SparklineProps {
  /** Series, oldest first. Needs ≥ 2 points to draw a line. */
  points: number[];
  width?: number;
  height?: number;
  /** Fixed value domain; defaults to the series' own min/max. */
  min?: number;
  max?: number;
  /** Accessible description, e.g. "Mood over the last 14 entries". */
  label: string;
  color?: string;
  /** Soft area fill under the line. */
  fill?: boolean;
}

/** Tiny inline trend line (SVG polyline), for mood / spend / streak pulses. */
export function Sparkline({
  points,
  width = 120,
  height = 36,
  min,
  max,
  label,
  color = 'var(--brand)',
  fill = true,
}: SparklineProps) {
  const pad = 3;
  const lo = min ?? Math.min(...points);
  const hi = max ?? Math.max(...points);
  const span = hi - lo || 1;
  const stepX = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;
  const coords = points.map((p, i) => {
    const x = pad + i * stepX;
    const y = pad + (height - pad * 2) * (1 - (p - lo) / span);
    return [Number(x.toFixed(2)), Number(y.toFixed(2))] as const;
  });
  const line = coords.map(([x, y]) => `${x},${y}`).join(' ');
  const area = `${pad},${height - pad} ${line} ${coords.at(-1)?.[0] ?? pad},${height - pad}`;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      className="sparkline"
    >
      {fill && points.length > 1 ? (
        <polygon points={area} fill={color} opacity={0.12} data-testid="spark-fill" />
      ) : null}
      {points.length > 1 ? (
        <polyline
          points={line}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          data-testid="spark-line"
        />
      ) : null}
      {coords.length > 0 ? (
        <circle
          cx={coords.at(-1)?.[0]}
          cy={coords.at(-1)?.[1]}
          r={2.5}
          fill={color}
          data-testid="spark-dot"
        />
      ) : null}
    </svg>
  );
}
