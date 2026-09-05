/**
 * One titled card in the Progress grid. `wide` spans both columns — used by the
 * cards whose content needs the width (a 52-week heatmap, the weekly review),
 * and deliberately NOT by the ones that would just stretch a short series
 * across a lot of empty space.
 */
export function ProgressCard({
  title,
  hint,
  wide,
  children,
}: {
  title: string;
  hint?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={`prog-card ${wide ? 'wide' : ''}`} aria-label={title}>
      <header className="prog-card-head">
        <h2 className="prog-card-title">{title}</h2>
        {hint && <span className="prog-card-hint">{hint}</span>}
      </header>
      {children}
    </section>
  );
}

/**
 * What a chart shows when it has nothing to show.
 *
 * A flat line pinned to zero under the caption "0 in 30 days · peak 0 in a
 * week" is not a chart, it is a full-size card saying nothing — and it reads as
 * broken rather than as empty. Reported from a phone as "this page is ugly".
 *
 * One sentence naming the one action that would fill it in is both smaller and
 * more useful than the shape it replaces.
 */
export function NothingYet({ children }: { children: React.ReactNode }) {
  return <p className="prog-nothing">{children}</p>;
}

/** True when a series has no signal at all — every bucket empty. */
export function hasNothing(points: number[]): boolean {
  return points.length === 0 || points.every((n) => n === 0);
}
