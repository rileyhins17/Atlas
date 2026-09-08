import type { StatsDayDTO } from './dto/stats.js';
import { dayActivity } from './what-changed.js';
import { localDayKey } from './local-dates.js';
import { activityThresholds as thresholds } from './component-calculations.js';

export interface ActivityCell {
  key: string;
  date: Date;
  count: number;
  future: boolean;
}

export function activityCalendarGrid(days: StatsDayDTO[], now: Date) {
  const byDay = new Map(days.map((d) => [d.day, dayActivity(d)]));
  const counts = [...byDay.values()];
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  // Start on the Monday on or before the first day in the window, so every
  // column is a whole week and the weekday rows line up.
  const first = days[0] ? new Date(`${days[0].day}T00:00:00`) : today;
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));

  const cols: ActivityCell[][] = [];
  const cursor = new Date(start);
  while (cursor <= today) {
    const col: ActivityCell[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(cursor);
      date.setDate(cursor.getDate() + d);
      const key = localDayKey(date);
      col.push({ key, date, count: byDay.get(key) ?? 0, future: date > today });
    }
    cols.push(col);
    cursor.setDate(cursor.getDate() + 7);
  }
  return {
    columns: cols,
    bands: thresholds(counts),
    total: counts.reduce((n, c) => n + c, 0),
  };
}

export function activityLevel(count: number, bands: [number, number, number]) {
  if (count <= 0) return 0;
  if (count <= bands[0]) return 1;
  if (count <= bands[1]) return 2;
  if (count <= bands[2]) return 3;
  return 4;
}

export const describeActivityCell = (c: ActivityCell) =>
  `${c.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} — ${
    c.count === 1 ? '1 thing' : `${c.count} things`
  }`;

// A month label sits above the first column that starts a new month.
export function activityMonthLabel(col: ActivityCell[], i: number, columns: ActivityCell[][]): string | null {
  // The month of the LAST day in the column: a month that begins on a
  // Thursday never appears if you only look at the Monday, which is how a
  // thirty-day window spanning August and September was labelled "Aug".
  const month = col[6]!.date.getMonth();
  if (i === 0) return col[6]!.date.toLocaleDateString('en-US', { month: 'short' });
  return columns[i - 1]![6]!.date.getMonth() === month
    ? null
    : col[6]!.date.toLocaleDateString('en-US', { month: 'short' });
}

export function sparklineGeometry(points: number[], width: number, height: number, min?: number, max?: number) {
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
  return { coords, line, area };
}

export function heatmapColumns(today: Date, weeks: number): Date[][] {
  // Monday of the current week (getDay(): Sun=0 → offset 6, Mon=1 → 0, ...).
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));

  const columns: Date[][] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const col: Date[] = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(monday);
      day.setDate(monday.getDate() - w * 7 + d);
      col.push(day);
    }
    columns.push(col);
  }

  return columns;
}

export function heatmapLevel(count: number, target: number): number {
    if (count <= 0) return 0;
    const ratio = count / Math.max(1, target);
    if (ratio >= 1) return 3;
    if (ratio >= 0.5) return 2;
    return 1;
}

export function progressRingGeometry(value: number, size: number, strokeWidth: number) {
  const clamped = Math.max(0, Math.min(1, value));
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  return { clamped, r, c };
}
