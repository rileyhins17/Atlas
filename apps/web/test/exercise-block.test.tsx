import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ExerciseBlock } from '@/components/fitness/ExerciseBlock';

const logSetMutate = vi.fn();
vi.mock('@/lib/hooks/fitness', () => ({
  useLastPerformance: () => ({ data: undefined }),
  useLogSet: () => ({ mutate: logSetMutate, isPending: false }),
  useDeleteSet: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/lib/hooks/settings', () => ({ useWeightUnit: () => 'lb' }));

/**
 * Set type and effort are optional and rarely used, so they fold behind one
 * line rather than putting sixteen chips under every exercise of a session.
 * The fold must never hide a choice that will be written onto the next set.
 */
function renderBlock(kind: 'weight_reps' | 'reps' | 'duration' | 'distance' = 'weight_reps') {
  return render(
    <ExerciseBlock
      workoutId="w1"
      exerciseId="e1"
      exerciseName="Squat"
      kind={kind}
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

/**
 * What a set is measured in decides which fields the entry row asks for. It
 * used to ask every exercise for "reps" and only a weight_reps one for
 * weight, so a rowing machine or a treadmill run — both measured in
 * distance — got a "reps" box that meant nothing and nowhere to log how far
 * the movement actually went.
 */
describe('ExerciseBlock fields by kind', () => {
  beforeEach(() => logSetMutate.mockClear());

  it('asks weight_reps for weight and reps, nothing else', () => {
    renderBlock('weight_reps');
    expect(screen.getByLabelText('Weight in lb for Squat')).toBeInTheDocument();
    expect(screen.getByLabelText('Reps for Squat')).toBeInTheDocument();
    expect(screen.queryByLabelText('Minutes for Squat')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Distance in km for Squat')).not.toBeInTheDocument();
  });

  it('asks a bodyweight (reps-only) exercise for reps, never weight', () => {
    renderBlock('reps');
    expect(screen.getByLabelText('Reps for Squat')).toBeInTheDocument();
    expect(screen.queryByLabelText('Weight in lb for Squat')).not.toBeInTheDocument();
  });

  it('asks a duration exercise for minutes and seconds, not reps or weight', () => {
    renderBlock('duration');
    expect(screen.getByLabelText('Minutes for Squat')).toBeInTheDocument();
    expect(screen.getByLabelText('Seconds for Squat')).toBeInTheDocument();
    expect(screen.queryByLabelText('Reps for Squat')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Weight in lb for Squat')).not.toBeInTheDocument();
  });

  it('logs a duration set as whole seconds, combining both fields', () => {
    renderBlock('duration');
    const min = screen.getByLabelText('Minutes for Squat');
    const sec = screen.getByLabelText('Seconds for Squat');
    fireEvent.change(min, { target: { value: '3' } });
    fireEvent.change(sec, { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log set' }));
    expect(logSetMutate).toHaveBeenCalledWith(
      expect.objectContaining({ durationSec: 210 }),
      expect.anything(),
    );
  });

  it('asks a distance exercise for km, not reps or weight', () => {
    renderBlock('distance');
    expect(screen.getByLabelText('Distance in km for Squat')).toBeInTheDocument();
    expect(screen.queryByLabelText('Reps for Squat')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Weight in lb for Squat')).not.toBeInTheDocument();
  });

  it('logs a distance set as whole metres', () => {
    renderBlock('distance');
    fireEvent.change(screen.getByLabelText('Distance in km for Squat'), { target: { value: '2.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log set' }));
    expect(logSetMutate).toHaveBeenCalledWith(
      expect.objectContaining({ distanceM: 2_500 }),
      expect.anything(),
    );
  });

  it('will not submit a distance or duration set left at zero', () => {
    renderBlock('distance');
    expect(screen.getByRole('button', { name: 'Log set' })).toBeDisabled();
  });
});
