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
