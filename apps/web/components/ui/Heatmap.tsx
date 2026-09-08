'use client';

import { heatmapColumns, heatmapLevel } from '@atlas/shared';

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
  const columns = heatmapColumns(today, weeks);
  const level = (count: number) => heatmapLevel(count, target);

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
