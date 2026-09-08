'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useReplaceRoutine } from '@/lib/hooks/routine';
import { qk } from '@/lib/hooks/keys';
import { Button, Input, useToast } from '@/components/ui';
import { useAtlasUi } from '@/components/atlas/AtlasUiProvider';
import { AtlasLoadingScreen } from '@/components/atlas/AtlasLoadingScreen';
import { buildRoutine, timeToMin, type OnboardingAnswers } from '@/lib/onboarding';

/** Optional routine setup. Provider connections live in Settings. */
type StepId = 'sleep' | 'week';
const STEPS: StepId[] = ['sleep', 'week'];

const BUILD_MESSAGES = [
  'Mapping your week…',
  'Learning about you…',
  'Preparing your day…',
];

export function OnboardingWizard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const replaceRoutine = useReplaceRoutine();
  const { setFocusMode } = useAtlasUi();

  // The wizard owns the screen while it is up. It used to render underneath the
  // capture dock and the bottom nav, so a brand-new account was asked when it
  // sleeps while being offered a box to type anything into and four ways to
  // leave a three-step flow. Cleared on unmount, including on Skip.
  useEffect(() => {
    setFocusMode(true);
    return () => setFocusMode(false);
  }, [setFocusMode]);

  const [step, setStep] = useState(0);
  const [building, setBuilding] = useState(false);

  const [bedtime, setBedtime] = useState('23:00');
  const [wake, setWake] = useState('07:00');
  const [weekday, setWeekday] = useState<OnboardingAnswers['weekday']>('flexible');
  const [workStart, setWorkStart] = useState('09:00');
  const [workEnd, setWorkEnd] = useState('17:00');
  const [exercise, setExercise] = useState<OnboardingAnswers['exercise']>('none');
  const [meals, setMeals] = useState<OnboardingAnswers['meals']>('regular');
  const id: StepId = STEPS[step]!;
  const last = step === STEPS.length - 1;
  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));



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
      await Promise.all(work);
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.habits }),
        qc.invalidateQueries({ queryKey: qk.notes }),
        qc.invalidateQueries({ queryKey: qk.settings }),
        qc.invalidateQueries({ queryKey: qk.me }),
      ]);
      toast('Your week is mapped. Welcome to Atlas.', 'success');
      // The routine cache update makes Today leave first use. Connections
      // remain available in Settings after this successful handoff.
      setBuilding(false);
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
          <OnbForm onNext={() => void finish()} label="Build my week">
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





      </div>
    </section>
  );
}

/** Step scaffold: content + a Continue submit so Enter always advances. */
function OnbForm({ children, onNext, label = 'Continue' }: { children: React.ReactNode; onNext: () => void; label?: string }) {
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
        {label}
      </Button>
    </form>
  );
}
