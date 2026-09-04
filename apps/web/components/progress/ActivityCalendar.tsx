'use client';

import { useMemo, useState } from 'react';
import type { StatsDayDTO } from '@atlas/shared';
import { dayActivity } from '@/lib/what-changed';
import { localDayKey } from '@/lib/dates';

/**
 * Your last N days, as a calendar you can actually read.
 *
 * The old version was a grid of coloured squares with no labels of any kind:
 * no weekdays, no months, no scale, and a tooltip carrying a raw `2026-08-26:
 * 12`. You could see that some days were darker than others and nothing else —
 * not which day, not what the colour meant, not what "12" counted. On a phone,
 * where there is no hover at all, it was decoration.
 *
 * So every axis is drawn: weekdays down the side, months across the top, and a
 * legend with the actual thresholds rather than "Quieter / Busier". Tapping a
 * day names it in full underneath, which is the only way this works on touch.
 *
 * What it counts is `dayActivity` — tasks finished, habits checked, workouts
 * done, journal entries written. NOT the timeline row count it used to plot,
 * which measured how much Atlas wrote to its own log.
 */
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** Only alternate rows get a label, or the column is a wall of tiny text. */
const LABELLED_ROWS = new Set([0, 2, 4]);

interface Cell {
  key: string;
  date: Date;
  count: number;
  future: boolean;
}

/** The four bands, chosen from the data so the scale means something. */
function thresholds(counts: number[]): [number, number, number] {
  const busy = counts.filter((n) => n > 0).sort((a, b) => a - b);
  if (busy.length === 0) return [1, 2, 3];
  const at = (q: number) => busy[Math.min(busy.length - 1, Math.floor(busy.length * q))] ?? 1;
  // Quartiles, deduplicated and monotonic — a flat distribution must not
  // produce three identical bands that all render as the darkest shade.
  const a = Math.max(1, at(0.25));
  const b = Math.max(a + 1, at(0.55));
  const c = Math.max(b + 1, at(0.8));
  return [a, b, c];
}

export function ActivityCalendar({ days }: { days: StatsDayDTO[] }) {
  const [picked, setPicked] = useState<Cell | null>(null);

  const { columns, bands, total } = useMemo(() => {
    const byDay = new Map(days.map((d) => [d.day, dayActivity(d)]));
    const counts = [...byDay.values()];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Start on the Monday on or before the first day in the window, so every
    // column is a whole week and the weekday rows line up.
    const first = days[0] ? new Date(`${days[0].day}T00:00:00`) : today;
    const start = new Date(first);
    start.setDate(first.getDate() - ((first.getDay() + 6) % 7));

    const cols: Cell[][] = [];
    const cursor = new Date(start);
    while (cursor <= today) {
      const col: Cell[] = [];
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
  }, [days]);

  const level = (count: number) => {
    if (count <= 0) return 0;
    if (count <= bands[0]) return 1;
    if (count <= bands[1]) return 2;
    if (count <= bands[2]) return 3;
    return 4;
  };

  const describe = (c: Cell) =>
    `${c.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} — ${
      c.count === 1 ? '1 thing' : `${c.count} things`
    }`;

  // A month label sits above the first column that starts a new month.
  const monthFor = (col: Cell[], i: number): string | null => {
    // The month of the LAST day in the column: a month that begins on a
    // Thursday never appears if you only look at the Monday, which is how a
    // thirty-day window spanning August and September was labelled "Aug".
    const month = col[6]!.date.getMonth();
    if (i === 0) return col[6]!.date.toLocaleDateString('en-US', { month: 'short' });
    return columns[i - 1]![6]!.date.getMonth() === month
      ? null
      : col[6]!.date.toLocaleDateString('en-US', { month: 'short' });
  };

  return (
    <div className="cal">
      <div className="cal-scroll">
        <div className="cal-months" aria-hidden>
          {columns.map((col, i) => (
            <span key={col[0]!.key} className="cal-month">
              {monthFor(col, i)}
            </span>
          ))}
        </div>

        <div className="cal-body">
          <div className="cal-weekdays" aria-hidden>
            {WEEKDAYS.map((d, i) => (
              <span key={d}>{LABELLED_ROWS.has(i) ? d : ''}</span>
            ))}
          </div>

          <div className="cal-grid" role="group" aria-label="Activity per day">
            {columns.map((col) => (
              <div className="cal-col" key={col[0]!.key}>
                {col.map((cell) =>
                  cell.future ? (
                    <span key={cell.key} className="cal-cell" data-level="future" aria-hidden />
                  ) : (
                    <button
                      key={cell.key}
                      type="button"
                      className={`cal-cell ${picked?.key === cell.key ? 'on' : ''}`}
                      data-level={level(cell.count)}
                      // Both, deliberately: the title serves a mouse, the label
                      // serves a screen reader, and the readout below serves a
                      // thumb — which had nothing at all before.
                      title={describe(cell)}
                      aria-label={describe(cell)}
                      onClick={() => setPicked(picked?.key === cell.key ? null : cell)}
                    />
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="cal-footer">
        <p className="cal-readout" role="status">
          {picked ? describe(picked) : `${total.toLocaleString()} things, all told`}
        </p>
        {/* RANGES, not bare numbers. "Quieter → Busier" said the squares were
            ordered and nothing about what any meant; "0 5 7 8 8+" then read as
            a sequence of counts rather than the bands they are. */}
        <div className="cal-key" aria-label="Scale">
          <i data-level="0" />
          <span>0</span>
          <i data-level="1" />
          <span>{bands[0] === 1 ? '1' : `1–${bands[0]}`}</span>
          {bands[1] > bands[0] && (
            <>
              <i data-level="2" />
              <span>{bands[0] + 1 === bands[1] ? bands[1] : `${bands[0] + 1}–${bands[1]}`}</span>
            </>
          )}
          {bands[2] > bands[1] && (
            <>
              <i data-level="3" />
              <span>{bands[1] + 1 === bands[2] ? bands[2] : `${bands[1] + 1}–${bands[2]}`}</span>
            </>
          )}
          <i data-level="4" />
          <span>{bands[2] + 1}+</span>
        </div>
      </div>
    </div>
  );
}
