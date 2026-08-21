'use client';

import { useGenerateWeeklyReview, useInsights } from '@/lib/hooks/ai';
import { reviewBullets } from '@/lib/progress';
import { Button } from '@/components/ui';
import { WeeklyDecisions } from '@/components/panels/WeeklyDecisions';
import { formatDayHeading } from '@/lib/dates';
import { ProgressCard } from './ProgressCard';

/**
 * Render the `**bold**` lead the review prompt asks for. Deliberately the only
 * markdown we honour — a full parser is a dependency and an XSS surface for one
 * emphasis rule.
 */
export function renderBold(line: string): React.ReactNode[] {
  return line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

/**
 * Atlas's weekly review, and the decisions that come out of it.
 *
 * The proactive engine writes one on a schedule — but until there was a button,
 * a new account (or one with proactive off) had no way to ask for one and just
 * saw an empty card with no explanation.
 */
export function WeeklyReviewCard() {
  const insights = useInsights();
  const writeReview = useGenerateWeeklyReview();
  const review = insights.data?.find((i) => i.kind === 'weekly_review') ?? null;

  return (
    <ProgressCard
      title="Atlas's weekly review"
      hint={review ? formatDayHeading(new Date(review.createdAt)) : undefined}
      wide
    >
      {/* The half you can act on comes FIRST. Atlas's prose is the commentary;
          these are the decisions, and a review you only read changes nothing. */}
      <WeeklyDecisions />
      {review ? (
        <ul className="prog-review-list">
          {reviewBullets(review.body).map((line, i) => (
            <li key={i}>{renderBold(line)}</li>
          ))}
        </ul>
      ) : (
        <p className="prog-muted" style={{ margin: '0 0 10px', fontSize: 13 }}>
          Atlas writes one every week. Ask for one now to see where the last seven days actually
          went.
        </p>
      )}
      <Button variant="ghost" disabled={writeReview.isPending} onClick={() => writeReview.mutate()}>
        {writeReview.isPending
          ? 'Reading your week…'
          : review
            ? 'Write a fresh one'
            : 'Write my weekly review'}
      </Button>
    </ProgressCard>
  );
}
