import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sparkline } from '@/components/ui';

/**
 * The domain rule, pinned.
 *
 * A sparkline has no axis, so the only thing telling you what the floor of the
 * box MEANS is the domain. Left to the series' own minimum, every flat series
 * lands on the floor — so "5 check-ins every week for two months" and "none at
 * all" draw the identical picture. That misreading has now been fixed twice on
 * this codebase and reintroduced on the charts the fix did not reach, which is
 * why it is a test rather than a comment.
 */
const H = 88;
const PAD = 3;
const FLOOR = H - PAD;
const TOP = PAD;

/** The y of the first vertex of the rendered polyline. */
function firstY(): number {
  const line = screen.getByTestId('spark-line').getAttribute('points') ?? '';
  return Number(line.split(' ')[0]!.split(',')[1]);
}

describe('Sparkline domain', () => {
  it('draws a steady nonzero series at the top when anchored at zero', () => {
    render(<Sparkline points={[5, 5, 5, 5]} min={0} height={H} label="steady" />);
    expect(firstY()).toBeCloseTo(TOP, 1);
  });

  it('draws an all-zero series on the floor, anchored or not', () => {
    const { unmount } = render(<Sparkline points={[0, 0, 0, 0]} min={0} height={H} label="none" />);
    expect(firstY()).toBeCloseTo(FLOOR, 1);
    unmount();

    render(<Sparkline points={[0, 0, 0, 0]} height={H} label="none" />);
    expect(firstY()).toBeCloseTo(FLOOR, 1);
  });

  it('cannot tell a steady nonzero series from nothing WITHOUT a zero anchor', () => {
    // Not a wish — a statement of what the component does, and the reason every
    // count-like caller passes min={0}. If this ever stops being true the
    // callers can drop the prop; until then, removing it is a regression.
    render(<Sparkline points={[5, 5, 5, 5]} height={H} label="steady, unanchored" />);
    expect(firstY()).toBeCloseTo(FLOOR, 1);
  });

  it('keeps zero in frame for a signed series so a deficit sits below it', () => {
    // Net cash flow: -400 every week must not look like +400 every week.
    const negative = [-400, -400, -400];
    const { unmount } = render(
      <Sparkline
        points={negative}
        min={Math.min(0, ...negative)}
        max={Math.max(0, ...negative)}
        height={H}
        label="deficit"
      />,
    );
    const deficitY = firstY();
    unmount();

    const positive = [400, 400, 400];
    render(
      <Sparkline
        points={positive}
        min={Math.min(0, ...positive)}
        max={Math.max(0, ...positive)}
        height={H}
        label="surplus"
      />,
    );
    expect(deficitY).toBeGreaterThan(firstY()); // lower on screen is a larger y
  });

  it('needs two points before it claims a trend', () => {
    render(<Sparkline points={[4]} height={H} label="one reading" />);
    expect(screen.queryByTestId('spark-line')).toBeNull();
    // The single reading is still marked, so the card is not simply blank.
    expect(screen.getByTestId('spark-dot')).toBeTruthy();
  });
});
