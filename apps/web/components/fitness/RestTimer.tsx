'use client';

import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';

const DEFAULTS = [60, 90, 120, 180];

/**
 * Rest between sets. Remounted (via `key`) each time a set is logged, so
 * finishing a set starts the clock automatically — the timer you have to
 * remember to start is the timer you never use.
 *
 * Counts UP with a chosen target rather than down to zero: overrunning rest is
 * normal and useful information, and a timer that hits 00:00 and stops tells
 * you nothing about how long you actually rested.
 */
export function RestTimer() {
  const [target, setTarget] = useState(90);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(true);
  // Wall-clock anchored: setInterval drifts, and a backgrounded mobile tab is
  // throttled hard enough that tick-counting would under-report badly.
  const startedAt = useRef(Date.now());
  const offset = useRef(0);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt.current) / 1000) + offset.current);
    }, 250);
    return () => clearInterval(id);
  }, [running]);

  function toggle() {
    if (running) {
      offset.current = seconds;
      setRunning(false);
    } else {
      startedAt.current = Date.now();
      setRunning(true);
    }
  }

  function reset() {
    offset.current = 0;
    startedAt.current = Date.now();
    setSeconds(0);
    setRunning(true);
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  const done = seconds >= target;

  return (
    <div className="rest-timer" role="group" aria-label="Rest timer">
      <span className={`rest-clock ${done ? 'done' : ''}`} aria-live="off">
        {mm}:{ss}
      </span>
      {/* The clock ticks every 250ms, so it is NOT a live region — screen
          readers would announce it continuously. This is the readable label. */}
      <span className="sr-only">
        Rested {Math.floor(seconds / 60)} minutes {seconds % 60} seconds of a {target} second target
      </span>

      <div className="rest-targets">
        {DEFAULTS.map((t) => (
          <button
            key={t}
            type="button"
            className={`rest-chip ${target === t ? 'on' : ''}`}
            aria-pressed={target === t}
            onClick={() => setTarget(t)}
          >
            {t < 60 ? `${t}s` : `${t / 60}m`}
          </button>
        ))}
      </div>

      <button type="button" className="rest-btn" onClick={toggle} aria-label={running ? 'Pause rest timer' : 'Resume rest timer'}>
        {running ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
      </button>
      <button type="button" className="rest-btn" onClick={reset} aria-label="Reset rest timer">
        <RotateCcw size={14} aria-hidden />
      </button>
    </div>
  );
}
