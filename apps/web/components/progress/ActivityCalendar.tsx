'use client';

import { activityCalendarGrid, activityLevel, describeActivityCell as describe, activityMonthLabel, type ActivityCell } from '@atlas/shared';

import { useMemo, useState } from 'react';
import type { StatsDayDTO } from '@atlas/shared';

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

export function ActivityCalendar({ days }: { days: StatsDayDTO[] }) {
  const [picked, setPicked] = useState<ActivityCell | null>(null);

  const { columns, bands, total } = useMemo(() => activityCalendarGrid(days, new Date()), [days]);
  const level = (count: number) => activityLevel(count, bands);
  const monthFor = (col: ActivityCell[], i: number) => activityMonthLabel(col, i, columns);

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
        <div className="cal-key" role="group" aria-label="Scale">
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
