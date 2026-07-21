'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Plus } from 'lucide-react';
import { HabitsApi, NotesApi, SettingsApi } from '@/lib/api';
import { useReplaceRoutine } from '@/lib/hooks/routine';
import { qk } from '@/lib/hooks/keys';
import { Button, Input, Textarea, useToast } from '@/components/ui';
import { Constellation } from '@/components/atlas/Constellation';
import { AtlasLoadingScreen } from '@/components/atlas/AtlasLoadingScreen';
import {
  answersToNotes,
  buildRoutine,
  HABIT_SEEDS,
  minToTime,
  timeToMin,
  type OnboardingAnswers,
} from '@/lib/onboarding';

/**
 * First-run onboarding v2: a warm, conversational form — one screen at a time,
 * real inputs instead of multiple choice, three free-text steps that become
 * pinned notes (always in the AI's context, auto-embedded for recall). The
 * more you tell Atlas here, the better it runs your life — and everything is
 * still skippable.
 */

type StepId = 'welcome' | 'sleep' | 'week' | 'about' | 'goals' | 'context' | 'habits';

const STEPS: StepId[] = ['welcome', 'sleep', 'week', 'about', 'goals', 'context', 'habits'];

const BUILD_MESSAGES = [
  'Mapping your week…',
  'Learning about you…',
  'Preparing your day…',
];

export function OnboardingWizard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const replaceRoutine = useReplaceRoutine();

  const [step, setStep] = useState(0);
  const [building, setBuilding] = useState(false);

  const [name, setName] = useState('');
  const [bedtime, setBedtime] = useState('23:00');
  const [wake, setWake] = useState('07:00');
  const [weekday, setWeekday] = useState<OnboardingAnswers['weekday']>('flexible');
  const [workStart, setWorkStart] = useState('09:00');
  const [workEnd, setWorkEnd] = useState('17:00');
  const [exercise, setExercise] = useState<OnboardingAnswers['exercise']>('none');
  const [meals, setMeals] = useState<OnboardingAnswers['meals']>('regular');
  const [about, setAbout] = useState('');
  const [goals, setGoals] = useState('');
  const [context, setContext] = useState('');
  const [habitPicks, setHabitPicks] = useState<Set<string>>(new Set());
  const [customHabit, setCustomHabit] = useState('');

  const id: StepId = STEPS[step]!;
  const last = step === STEPS.length - 1;
  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  function toggleHabit(h: string) {
    setHabitPicks((prev) => {
      const nextSet = new Set(prev);
      if (nextSet.has(h)) nextSet.delete(h);
      else nextSet.add(h);
      return nextSet;
    });
  }

  function addCustomHabit() {
    const h = customHabit.trim();
    if (!h) return;
    setHabitPicks((prev) => new Set(prev).add(h));
    setCustomHabit('');
  }

  async function finish() {
    setBuilding(true);
    try {
      const answers: OnboardingAnswers = {
        bedtimeMin: timeToMin(bedtime),
        wakeMin: timeToMin(wake),
        weekday,
        workStartMin: timeToMin(workStart),
        workEndMin: timeToMin(workEnd),
        exercise,
        meals,
      };
      const work: Promise<unknown>[] = [replaceRoutine.mutateAsync(buildRoutine(answers))];
      if (name.trim()) work.push(SettingsApi.update({ displayName: name.trim() }));
      for (const note of answersToNotes({ about, goals, context })) work.push(NotesApi.create(note));
      for (const h of habitPicks) work.push(HabitsApi.create({ name: h }));
      await Promise.all(work);
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.habits }),
        qc.invalidateQueries({ queryKey: qk.notes }),
        qc.invalidateQueries({ queryKey: qk.settings }),
        qc.invalidateQueries({ queryKey: qk.me }),
      ]);
      toast(`Your week is mapped${name.trim() ? `, ${name.trim()}` : ''}. Welcome to Atlas.`, 'success');
    } catch {
      toast('Could not save everything — you can adjust it later in Settings.', 'error');
      setBuilding(false);
    }
  }

  if (building) {
    return (
      <section className="onb" aria-label="Setting up Atlas">
        <div className="onb-step">
          <AtlasLoadingScreen
            messages={BUILD_MESSAGES}
            sublabel="Sleep, focus, movement — Atlas now knows the shape of your days."
          />
        </div>
      </section>
    );
  }

  return (
    <section className="onb" aria-label="Set up Atlas">
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
        <button type="button" className="onb-skip" onClick={() => (last ? finish() : next())}>
          Skip
        </button>
      </header>

      <div className="onb-step" key={id}>
        {id === 'welcome' && (
          <>
            <Constellation size={72} animated />
            <h1 className="onb-q">Welcome. Atlas runs on what it knows about you.</h1>
            <p className="onb-hint">
              A few minutes now and Atlas can plan your days, watch your patterns, and actually
              help. Everything stays yours, and every step is skippable.
            </p>
            <form
              className="onb-name-row"
              onSubmit={(e) => {
                e.preventDefault();
                next();
              }}
            >
              <Input
                autoFocus
                placeholder="What should Atlas call you?"
                aria-label="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Button type="submit">Continue</Button>
            </form>
          </>
        )}

        {id === 'sleep' && (
          <OnbForm onNext={next}>
            <h1 className="onb-q">When does your day start and end?</h1>
            <p className="onb-hint">Sleep anchors everything — Atlas fills your day around it.</p>
            <div className="onb-field-row">
              <label className="onb-field">
                <span>Usually asleep by</span>
                <Input
                  type="time"
                  value={bedtime}
                  aria-label="Bedtime"
                  onChange={(e) => e.target.value && setBedtime(e.target.value)}
                />
              </label>
              <label className="onb-field">
                <span>Awake around</span>
                <Input
                  type="time"
                  value={wake}
                  aria-label="Wake time"
                  onChange={(e) => e.target.value && setWake(e.target.value)}
                />
              </label>
            </div>
          </OnbForm>
        )}

        {id === 'week' && (
          <OnbForm onNext={next}>
            <h1 className="onb-q">What does a normal week look like?</h1>
            <div className="onb-field-col">
              <label className="onb-field">
                <span>Weekdays are mostly…</span>
                <select
                  className="input"
                  aria-label="Weekday shape"
                  value={weekday}
                  onChange={(e) => setWeekday(e.target.value as OnboardingAnswers['weekday'])}
                >
                  <option value="office">A fixed job (9–5-ish)</option>
                  <option value="school">School / classes</option>
                  <option value="shifts">Shifts — it varies</option>
                  <option value="flexible">Flexible — I set my own time</option>
                </select>
              </label>
              {(weekday === 'office' || weekday === 'school') && (
                <div className="onb-field-row">
                  <label className="onb-field">
                    <span>From</span>
                    <Input
                      type="time"
                      value={workStart}
                      aria-label="Workday start"
                      onChange={(e) => e.target.value && setWorkStart(e.target.value)}
                    />
                  </label>
                  <label className="onb-field">
                    <span>Until</span>
                    <Input
                      type="time"
                      value={workEnd}
                      aria-label="Workday end"
                      onChange={(e) => e.target.value && setWorkEnd(e.target.value)}
                    />
                  </label>
                </div>
              )}
              <label className="onb-field">
                <span>Movement / exercise</span>
                <select
                  className="input"
                  aria-label="Exercise time"
                  value={exercise}
                  onChange={(e) => setExercise(e.target.value as OnboardingAnswers['exercise'])}
                >
                  <option value="morning">Mornings, after waking</option>
                  <option value="lunch">Midday break</option>
                  <option value="evening">Evenings</option>
                  <option value="none">Not right now</option>
                </select>
              </label>
              <label className="onb-field">
                <span>Meals</span>
                <select
                  className="input"
                  aria-label="Meal regularity"
                  value={meals}
                  onChange={(e) => setMeals(e.target.value as OnboardingAnswers['meals'])}
                >
                  <option value="regular">Fairly regular times</option>
                  <option value="chaotic">Honestly, all over the place</option>
                </select>
              </label>
            </div>
          </OnbForm>
        )}

        {id === 'about' && (
          <OnbForm onNext={next}>
            <h1 className="onb-q">Tell Atlas about yourself.</h1>
            <p className="onb-hint">
              Work, school, family, what a normal week feels like — write it like you&apos;d tell a
              friend. Atlas remembers all of it.
            </p>
            <Textarea
              autoFocus
              rows={5}
              className="onb-textarea"
              placeholder="I'm a student juggling co-op applications, I live with…"
              aria-label="About you"
              value={about}
              onChange={(e) => setAbout(e.target.value)}
            />
          </OnbForm>
        )}

        {id === 'goals' && (
          <OnbForm onNext={next}>
            <h1 className="onb-q">What are you working toward right now?</h1>
            <p className="onb-hint">
              Big or small — shipping a project, getting stronger, sleeping better. Atlas keeps
              these in view when it plans and nudges.
            </p>
            <Textarea
              autoFocus
              rows={5}
              className="onb-textarea"
              placeholder="Finish the app I'm building, work out 3× a week…"
              aria-label="Your goals"
              value={goals}
              onChange={(e) => setGoals(e.target.value)}
            />
          </OnbForm>
        )}

        {id === 'context' && (
          <OnbForm onNext={next}>
            <h1 className="onb-q">Anything else Atlas should know?</h1>
            <p className="onb-hint">
              Health stuff, commitments, how you like to be reminded — anything that helps Atlas
              fit your life instead of fighting it. Optional, always editable later.
            </p>
            <Textarea
              autoFocus
              rows={5}
              className="onb-textarea"
              placeholder="I have ADHD so short scannable plans work best…"
              aria-label="Anything else"
              value={context}
              onChange={(e) => setContext(e.target.value)}
            />
          </OnbForm>
        )}

        {id === 'habits' && (
          <>
            <h1 className="onb-q">Anything you want to track daily?</h1>
            <div className="onb-chips">
              {[...HABIT_SEEDS, ...[...habitPicks].filter((h) => !HABIT_SEEDS.includes(h as never))].map(
                (h) => {
                  const on = habitPicks.has(h);
                  return (
                    <button
                      key={h}
                      type="button"
                      className={`onb-chip ${on ? 'picked' : ''}`}
                      aria-pressed={on}
                      onClick={() => toggleHabit(h)}
                    >
                      <span className="onb-chip-label">
                        {on && <Check size={14} aria-hidden />} {h}
                      </span>
                    </button>
                  );
                },
              )}
            </div>
            <form
              className="onb-name-row"
              onSubmit={(e) => {
                e.preventDefault();
                addCustomHabit();
              }}
            >
              <Input
                placeholder="Or add your own…"
                aria-label="Custom habit"
                value={customHabit}
                onChange={(e) => setCustomHabit(e.target.value)}
              />
              <Button type="submit" variant="secondary" aria-label="Add habit">
                <Plus size={15} aria-hidden />
              </Button>
            </form>
            <Button onClick={finish} style={{ marginTop: 14 }}>
              Build my week
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

/** Step scaffold: content + a Continue submit so Enter always advances. */
function OnbForm({ children, onNext }: { children: React.ReactNode; onNext: () => void }) {
  return (
    <form
      className="onb-form"
      onSubmit={(e) => {
        e.preventDefault();
        onNext();
      }}
    >
      {children}
      <Button type="submit" style={{ marginTop: 6 }}>
        Continue
      </Button>
    </form>
  );
}
