'use client';

import { localDayKey } from '@/lib/dates';

export interface HeatmapProps {
  /** day (local YYYY-MM-DD) → count. Missing days render as empty cells. */
  counts: Map<string, number>;
  /** How many weeks of history to show (columns), ending this week. */
  weeks?: number;
  /** Count that renders at full intensity (habit target, usually). */
  target?: number;
  /** Accessible description, e.g. "Gym check-ins, last 12 weeks". */
  label: string;
}

/**
 * GitHub-style check-in heatmap: columns are weeks (oldest → newest), rows are
 * Mon..Sun. Intensity is count/target in four steps via data-level CSS.
 */
export function Heatmap({ counts, weeks = 12, target = 1, label }: HeatmapProps) {
  const today = new Date();
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

  const level = (count: number): number => {
    if (count <= 0) return 0;
    const ratio = count / Math.max(1, target);
    if (ratio >= 1) return 3;
    if (ratio >= 0.5) return 2;
    return 1;
  };

  return (
    <div className="heatmap" role="img" aria-label={label}>
      {columns.map((col, i) => (
        <div className="heatmap-col" key={i}>
          {col.map((day) => {
            const key = localDayKey(day);
            const future = day.getTime() > today.getTime();
            const count = counts.get(key) ?? 0;
            return (
              <span
                key={key}
                className="heatmap-cell"
                data-level={future ? 'future' : level(count)}
                title={future ? undefined : `${key}: ${count}`}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
