'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check } from 'lucide-react';
import { HabitsApi, SettingsApi } from '@/lib/api';
import { useReplaceRoutine } from '@/lib/hooks/routine';
import { qk } from '@/lib/hooks/keys';
import { Button, Input, useToast } from '@/components/ui';
import { Constellation } from '@/components/atlas/Constellation';
import { buildRoutine, HABIT_SEEDS, type OnboardingAnswers } from '@/lib/onboarding';

/**
 * First-run onboarding: a premium, one-question-per-screen wizard that maps the
 * user's actual week — sleep, weekday shape, movement, meals — into routine
 * blocks Atlas and the stream understand, plus starter habits. ADHD-proof by
 * design: one decision at a time, big tap targets, auto-advance, skippable at
 * every step, under two minutes end to end.
 */

type StepId = 'name' | 'bed' | 'wake' | 'weekday' | 'exercise' | 'meals' | 'habits' | 'building';

const STEPS: StepId[] = ['name', 'bed', 'wake', 'weekday', 'exercise', 'meals', 'habits'];

interface ChipOption<T> {
  value: T;
  label: string;
  hint?: string;
}

function ChipGrid<T extends string | number>({
  options,
  onPick,
  picked,
}: {
  options: ChipOption<T>[];
  onPick: (v: T) => void;
  picked?: T;
}) {
  return (
    <div className="onb-chips" role="group">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          className={`onb-chip ${picked === o.value ? 'picked' : ''}`}
          onClick={() => onPick(o.value)}
        >
          <span className="onb-chip-label">{o.label}</span>
          {o.hint && <span className="onb-chip-hint">{o.hint}</span>}
        </button>
      ))}
    </div>
  );
}

export function OnboardingWizard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const replaceRoutine = useReplaceRoutine();

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [bedtimeMin, setBedtime] = useState<number | undefined>();
  const [wakeMin, setWake] = useState<number | undefined>();
  const [weekday, setWeekday] = useState<OnboardingAnswers['weekday'] | undefined>();
  const [exercise, setExercise] = useState<OnboardingAnswers['exercise'] | undefined>();
  const [meals, setMeals] = useState<OnboardingAnswers['meals'] | undefined>();
  const [habitPicks, setHabitPicks] = useState<Set<string>>(new Set());
  const [building, setBuilding] = useState(false);

  const id: StepId = building ? 'building' : STEPS[step]!;
  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));
  const pick = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    // Auto-advance: one decision, done, next screen. No "confirm" friction.
    setTimeout(next, 180);
  };

  async function finish() {
    setBuilding(true);
    try {
      const answers: OnboardingAnswers = {
        bedtimeMin: bedtimeMin ?? 23 * 60,
        wakeMin: wakeMin ?? 7 * 60,
        weekday: weekday ?? 'flexible',
        exercise: exercise ?? 'none',
        meals: meals ?? 'regular',
      };
      const work: Promise<unknown>[] = [replaceRoutine.mutateAsync(buildRoutine(answers))];
      if (name.trim()) work.push(SettingsApi.update({ displayName: name.trim() }));
      for (const h of habitPicks) work.push(HabitsApi.create({ name: h }));
      await Promise.all(work);
      // Refetch everything the wizard touched; the stream takes over from here.
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.habits }),
        qc.invalidateQueries({ queryKey: qk.settings }),
        qc.invalidateQueries({ queryKey: qk.me }),
      ]);
      toast('Your week is mapped. Welcome to Atlas.', 'success');
    } catch {
      toast('Could not save everything — you can adjust it later in Settings.', 'error');
      setBuilding(false);
    }
  }

  const hours = (list: number[]) =>
    list.map((h) => ({
      value: h * 60,
      label: new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric' }),
    }));

  return (
    <section className="onb" aria-label="Set up Atlas">
      {id !== 'building' && (
        <header className="onb-top">
          {step > 0 ? (
            <button type="button" className="onb-back" onClick={back} aria-label="Back">
              <ArrowLeft size={17} aria-hidden />
            </button>
          ) : (
            <span />
          )}
          <div className="onb-dots" role="group" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
            {STEPS.map((s, i) => (
              <span key={s} className={`onb-dot ${i === step ? 'on' : i < step ? 'done' : ''}`} />
            ))}
          </div>
          <button type="button" className="onb-skip" onClick={() => (step === STEPS.length - 1 ? finish() : next())}>
            Skip
          </button>
        </header>
      )}

      <div className="onb-step" key={id}>
        {id === 'name' && (
          <>
            <Constellation size={72} animated />
            <h1 className="onb-q">What should Atlas call you?</h1>
            <form
              className="onb-name-row"
              onSubmit={(e) => {
                e.preventDefault();
                next();
              }}
            >
              <Input
                autoFocus
                placeholder="Your name"
                aria-label="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Button type="submit">Continue</Button>
            </form>
            <p className="onb-hint">Atlas learns your life to plan around it. Two minutes, all skippable.</p>
          </>
        )}

        {id === 'bed' && (
          <>
            <h1 className="onb-q">When do you usually go to sleep?</h1>
            <ChipGrid
              picked={bedtimeMin}
              onPick={pick(setBedtime)}
              options={[
                ...hours([21, 22, 23]),
                { value: 0, label: 'Midnight' },
                { value: 60, label: 'Later' },
              ]}
            />
          </>
        )}

        {id === 'wake' && (
          <>
            <h1 className="onb-q">And when do you wake up?</h1>
            <ChipGrid picked={wakeMin} onPick={pick(setWake)} options={hours([5, 6, 7, 8, 9, 10])} />
          </>
        )}

        {id === 'weekday' && (
          <>
            <h1 className="onb-q">What shapes your weekdays?</h1>
            <ChipGrid
              picked={weekday}
              onPick={pick(setWeekday)}
              options={[
                { value: 'office', label: 'A 9–5', hint: 'work block, Mon–Fri' },
                { value: 'school', label: 'School', hint: 'classes most of the day' },
                { value: 'shifts', label: 'Shifts / varies', hint: 'no fixed hours' },
                { value: 'flexible', label: 'Flexible', hint: 'I set my own time' },
              ]}
            />
          </>
        )}

        {id === 'exercise' && (
          <>
            <h1 className="onb-q">When do you like to move?</h1>
            <ChipGrid
              picked={exercise}
              onPick={pick(setExercise)}
              options={[
                { value: 'morning', label: 'Morning', hint: 'right after waking' },
                { value: 'lunch', label: 'Midday', hint: 'break in the day' },
                { value: 'evening', label: 'Evening', hint: 'after work' },
                { value: 'none', label: 'Not right now' },
              ]}
            />
          </>
        )}

        {id === 'meals' && (
          <>
            <h1 className="onb-q">Do you eat at regular times?</h1>
            <ChipGrid
              picked={meals}
              onPick={pick(setMeals)}
              options={[
                { value: 'regular', label: 'Mostly, yes', hint: 'breakfast · lunch · dinner' },
                { value: 'chaotic', label: 'Honestly, no', hint: 'skip the meal blocks' },
              ]}
            />
          </>
        )}

        {id === 'habits' && (
          <>
            <h1 className="onb-q">Anything you want to track daily?</h1>
            <div className="onb-chips">
              {HABIT_SEEDS.map((h) => {
                const on = habitPicks.has(h);
                return (
                  <button
                    key={h}
                    type="button"
                    className={`onb-chip ${on ? 'picked' : ''}`}
                    aria-pressed={on}
                    onClick={() =>
                      setHabitPicks((prev) => {
                        const nextSet = new Set(prev);
                        if (on) nextSet.delete(h);
                        else nextSet.add(h);
                        return nextSet;
                      })
                    }
                  >
                    <span className="onb-chip-label">
                      {on && <Check size={14} aria-hidden />} {h}
                    </span>
                  </button>
                );
              })}
            </div>
            <Button onClick={finish} style={{ marginTop: 18 }}>
              Build my week
            </Button>
          </>
        )}

        {id === 'building' && (
          <>
            <Constellation size={104} animated />
            <h1 className="onb-q">Mapping your week…</h1>
            <p className="onb-hint">Sleep, focus, movement — Atlas now knows the shape of your days.</p>
          </>
        )}
      </div>
    </section>
  );
}
