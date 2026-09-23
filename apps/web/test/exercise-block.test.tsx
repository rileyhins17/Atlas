import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ExerciseBlock } from '@/components/fitness/ExerciseBlock';

vi.mock('@/lib/hooks/fitness', () => ({
  useLastPerformance: () => ({ data: undefined }),
  useLogSet: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSet: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/lib/hooks/settings', () => ({ useWeightUnit: () => 'lb' }));

/**
 * Set type and effort are optional and rarely used, so they fold behind one
 * line rather than putting sixteen chips under every exercise of a session.
 * The fold must never hide a choice that will be written onto the next set.
 */
function renderBlock() {
  return render(
    <ExerciseBlock
      workoutId="w1"
      exerciseId="e1"
      exerciseName="Squat"
      kind="weight_reps"
      sets={[]}
      onLogged={() => {}}
    />,
  );
}

describe('ExerciseBlock options', () => {
  it('starts folded, with the chips out of the way', () => {
    renderBlock();
    const toggle = screen.getByRole('button', { name: /Set type & effort/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('group', { name: 'Set type for Squat' })).not.toBeInTheDocument();
  });

  it('opens, and keeps an armed choice visible and named until it is used', () => {
    renderBlock();
    fireEvent.click(screen.getByRole('button', { name: /Set type & effort/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Warm-up' }));
    fireEvent.click(screen.getByRole('button', { name: '8' }));

    const toggle = screen.getByRole('button', { name: /Warm-up · RPE 8/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toBeDisabled();
    fireEvent.click(toggle);
    expect(screen.getByRole('group', { name: 'Set type for Squat' })).toBeInTheDocument();
  });
});
