import { ArrowDownRight, ArrowUpRight, Minus, Sparkles } from 'lucide-react';
import type { Delta } from '@/lib/progress';

/**
 * Change vs the previous window of the same length.
 *
 * `invert` is which direction counts as good, and it is a per-metric fact, not
 * a styling choice: spending 20% less is the green arrow, and colouring it red
 * because the number went down would read as a warning about the one week the
 * user did well.
 */
export function DeltaChip({ d, invert = false }: { d: Delta; invert?: boolean }) {
  if (d.direction === 'flat') {
    return (
      <span className="prog-delta flat">
        <Minus size={11} aria-hidden /> same
      </span>
    );
  }
  if (d.direction === 'new') {
    return (
      <span className="prog-delta up">
        <Sparkles size={11} aria-hidden /> new
      </span>
    );
  }
  const good = invert ? d.direction === 'down' : d.direction === 'up';
  const Icon = d.direction === 'up' ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`prog-delta ${good ? 'up' : 'down'}`}>
      <Icon size={11} aria-hidden /> {Math.abs(d.pct ?? 0)}%
    </span>
  );
}

/** A headline number with its label and its change chip. */
export function StatTile({
  label,
  value,
  d,
  invert,
}: {
  label: string;
  value: string;
  d: Delta;
  invert?: boolean;
}) {
  return (
    <div className="prog-tile">
      <span className="prog-tile-label">{label}</span>
      <span className="prog-tile-value">{value}</span>
      <DeltaChip d={d} invert={invert} />
    </div>
  );
}
