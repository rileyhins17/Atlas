import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { lbToGrams, type WorkoutDTO } from '@atlas/shared';
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
function renderBlock(
  kind: 'weight_reps' | 'reps' | 'duration' | 'distance' = 'weight_reps',
  sets: WorkoutDTO['sets'] = [],
) {
  return render(
    <ExerciseBlock
      workoutId="w1"
      exerciseId="e1"
      exerciseName="Squat"
      kind={kind}
      sets={sets}
      onLogged={() => {}}
    />,
  );
}

const loggedSet = (over: Partial<WorkoutDTO['sets'][number]> = {}): WorkoutDTO['sets'][number] => ({
  id: 's1',
  exerciseId: 'e1',
  exerciseName: 'Squat',
  kind: 'reps',
  position: 0,
  weightGrams: null,
  reps: null,
  durationSec: null,
  distanceM: null,
  warmup: false,
  setType: 'normal',
  rpe: null,
  completedAt: '2026-10-01T10:00:00.000Z',
  ...over,
});

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

/** What a movement is measured in decides which boxes the entry row opens with. */
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

/** `kind` decides what the form opens with, never what it can record. */
describe('ExerciseBlock — measures a movement is not filed under', () => {
  beforeEach(() => logSetMutate.mockClear());

  const chips = () =>
    Array.from(screen.getByRole('group', { name: 'Also log for Squat' }).querySelectorAll('button')).map(
      (b) => `${b.textContent}:${b.getAttribute('aria-pressed')}`,
    );

  it('offers nothing extra on a weight × reps lift', () => {
    renderBlock('weight_reps');
    expect(screen.queryByRole('group', { name: 'Also log for Squat' })).not.toBeInTheDocument();
  });

  it('offers the other three measures on everything else', () => {
    renderBlock('reps');
    expect(chips()).toEqual(['Weight:false', 'Time:false', 'Distance:false']);
  });

  it('offers weight and reps on a distance exercise — the row machine that started this', () => {
    renderBlock('distance');
    expect(chips()).toEqual(['Weight:false', 'Reps:false', 'Time:false']);
  });

  it('adds a weight box when asked, and sends it with the reps', () => {
    renderBlock('reps');
    expect(screen.queryByLabelText('Weight in lb for Squat')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Weight' }));
    fireEvent.change(screen.getByLabelText('Weight in lb for Squat'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('Reps for Squat'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log set' }));

    expect(logSetMutate).toHaveBeenCalledWith(
      expect.objectContaining({ weightGrams: lbToGrams(25), reps: 6 }),
      expect.anything(),
    );
  });

  it('sends nothing for a box that was never opened', () => {
    renderBlock('reps');
    fireEvent.change(screen.getByLabelText('Reps for Squat'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log set' }));

    const sent = logSetMutate.mock.calls[0]![0] as Record<string, unknown>;
    expect(sent.reps).toBe(12);
    expect(sent).not.toHaveProperty('weightGrams');
    expect(sent).not.toHaveProperty('durationSec');
    expect(sent).not.toHaveProperty('distanceM');
  });

  it('opens what last time used, so a weighted movement stays weighted', () => {
    renderBlock('reps', [loggedSet({ weightGrams: lbToGrams(25), reps: 6 })]);
    expect(chips()).toEqual(['Weight:true', 'Time:false', 'Distance:false']);
    expect(screen.getByLabelText('Weight in lb for Squat')).toHaveValue(25);
  });

  it('logs a carry by weight and time without inventing the distance it is filed under', () => {
    renderBlock('distance');
    fireEvent.click(screen.getByRole('button', { name: 'Weight' }));
    fireEvent.click(screen.getByRole('button', { name: 'Time' }));
    fireEvent.change(screen.getByLabelText('Weight in lb for Squat'), { target: { value: '70' } });
    fireEvent.change(screen.getByLabelText('Seconds for Squat'), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log set' }));

    const sent = logSetMutate.mock.calls[0]![0] as Record<string, unknown>;
    expect(sent).toMatchObject({ weightGrams: lbToGrams(70), durationSec: 45 });
    expect(sent).not.toHaveProperty('distanceM');
  });

  it('will not log a weight on its own', () => {
    renderBlock('reps');
    fireEvent.click(screen.getByRole('button', { name: 'Weight' }));
    fireEvent.change(screen.getByLabelText('Weight in lb for Squat'), { target: { value: '25' } });
    expect(screen.getByRole('button', { name: 'Log set' })).toBeDisabled();
  });

  it('hides the box again when the chip is turned off', () => {
    renderBlock('reps');
    fireEvent.click(screen.getByRole('button', { name: 'Weight' }));
    expect(screen.getByLabelText('Weight in lb for Squat')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Weight' }));
    expect(screen.queryByLabelText('Weight in lb for Squat')).not.toBeInTheDocument();
  });
});

/** Native constraint checking is off: a typed 187 lb used to be refused against the 2.5 lb step, silently. */
describe('ExerciseBlock — what is typed', () => {
  beforeEach(() => logSetMutate.mockClear());

  it('logs a weight that is not a multiple of the stepper increment', () => {
    renderBlock('weight_reps');
    fireEvent.change(screen.getByLabelText('Weight in lb for Squat'), { target: { value: '187' } });
    fireEvent.change(screen.getByLabelText('Reps for Squat'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log set' }));

    expect(logSetMutate).toHaveBeenCalledWith(
      expect.objectContaining({ weightGrams: lbToGrams(187), reps: 8 }),
      expect.anything(),
    );
  });

  it('does not constrain the form natively, so one rule decides what may be logged', () => {
    const { container } = renderBlock('weight_reps');
    expect(container.querySelector('form.fit-entry')).toHaveAttribute('novalidate');
  });
});
