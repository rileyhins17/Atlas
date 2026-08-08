'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { useConnectDeepSeek } from '@/lib/hooks/ai';
import { useReplaceRoutine } from '@/lib/hooks/routine';
import { useGoogleConnectStart, useGoogleStatus } from '@/lib/hooks/google';
import { qk } from '@/lib/hooks/keys';
import { Button, Input, useToast } from '@/components/ui';
import { useAtlasUi } from '@/components/atlas/AtlasUiProvider';
import { AtlasLoadingScreen } from '@/components/atlas/AtlasLoadingScreen';
import { buildRoutine, timeToMin, type OnboardingAnswers } from '@/lib/onboarding';

/**
 * First-run onboarding v2: a warm, conversational form — one screen at a time,
 * real inputs instead of multiple choice, three free-text steps that become
 * pinned notes (always in the AI's context, auto-embedded for recall). The
 * more you tell Atlas here, the better it runs your life — and everything is
 * still skippable.
 */

type StepId = 'sleep' | 'week' | 'ai';

/**
 * Three questions, not eight.
 *
 * The wizard used to ask for a name, free-text about-you, goals, context and a
 * habit list before the product had demonstrated anything — eight chances to
 * leave, in exchange for data Atlas can just as easily ask for later, when it
 * has earned the right to. Everything dropped here is still collected: the asks
 * bell raises it at the moment it becomes relevant.
 *
 * What survives is the set that cannot wait. Sleep and work hours are what make
 * Today's free-time calculation correct rather than confidently wrong, and the
 * API key is what makes the AI exist at all.
 */
const STEPS: StepId[] = ['sleep', 'week', 'ai'];

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
  const [offerCalendar, setOfferCalendar] = useState(false);
  const googleConnect = useGoogleConnectStart();
  const googleStatus = useGoogleStatus();
  const [building, setBuilding] = useState(false);

  const [bedtime, setBedtime] = useState('23:00');
  const [wake, setWake] = useState('07:00');
  const [weekday, setWeekday] = useState<OnboardingAnswers['weekday']>('flexible');
  const [workStart, setWorkStart] = useState('09:00');
  const [workEnd, setWorkEnd] = useState('17:00');
  const [exercise, setExercise] = useState<OnboardingAnswers['exercise']>('none');
  const [meals, setMeals] = useState<OnboardingAnswers['meals']>('regular');
  const [aiKey, setAiKey] = useState('');
  const [aiSaved, setAiSaved] = useState(false);
  const connectAi = useConnectDeepSeek();

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
      // Offer the calendar only AFTER everything is saved. Connecting Google is
      // a full-page redirect, so asking mid-wizard would throw away every
      // answer the user had just typed.
      setOfferCalendar(true);
    } catch {
      toast('Could not save everything — you can adjust it later in Settings.', 'error');
      setBuilding(false);
    }
  }

  // Everything is persisted by now, so leaving for Google's consent screen is
  // safe. Skipping is a first-class choice: the app is fully usable without it.
  if (offerCalendar) {
    return (
      <section className="onb" aria-label="Connect your calendar">
        <div className="onb-step">
          <h1 className="onb-q">One last thing.</h1>
          <p className="onb-help">
            Connect Google Calendar and Atlas can plan around the meetings you already
            have, instead of guessing your day is empty. Two-way — events you add here
            go back to Google.
          </p>
          <div className="onb-cal-actions">
            <Button
              onClick={() =>
                googleConnect.mutate(undefined, {
                  onSuccess: ({ url }) => {
                    window.location.href = url;
                  },
                })
              }
              disabled={googleConnect.isPending || googleStatus.data?.configured === false}
            >
              {googleConnect.isPending ? 'Opening Google…' : 'Connect Google Calendar'}
            </Button>
            <Button variant="ghost" onClick={() => setOfferCalendar(false)}>
              Skip for now
            </Button>
          </div>
          {googleStatus.data?.configured === false && (
            <p className="onb-help">
              This server has no Google client configured — you can connect later from
              Settings.
            </p>
          )}
        </div>
      </section>
    );
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




        {id === 'ai' && (
          <>
            {/* Named plainly. "Want Atlas to think?" was clever and told a
                newcomer nothing about what they were being asked for, or that
                without it the intelligence in the product does not exist. */}
            <h1 className="onb-q">Add your DeepSeek API key</h1>
            <p className="onb-sub">
              <strong>This key is what powers everything intelligent in Atlas.</strong> Understanding
              what you type and filing it in the right place, your morning brief, planning your day
              around the hours you actually have, the weekly review, and every pattern it notices
              across your training, sleep and work — all of it runs on this key.
            </p>
            <p className="onb-sub">
              It is <strong>yours, not ours</strong>. You get it from DeepSeek, you pay DeepSeek
              directly — a few cents a month for normal use — and Atlas never bills you or marks it
              up. That is also why your data never goes through our account.
            </p>
            <form
              className="onb-name-row"
              onSubmit={(e) => {
                e.preventDefault();
                const key = aiKey.trim();
                if (!key || connectAi.isPending) return;
                connectAi.mutate(key, { onSuccess: () => setAiSaved(true) });
              }}
            >
              <Input
                type="password"
                placeholder="sk-…"
                aria-label="DeepSeek API key"
                autoComplete="off"
                value={aiKey}
                onChange={(e) => setAiKey(e.target.value)}
              />
              <Button type="submit" variant="secondary" disabled={!aiKey.trim() || connectAi.isPending}>
                {connectAi.isPending ? 'Checking…' : 'Save'}
              </Button>
            </form>
            {aiSaved && (
              <p className="onb-sub" style={{ color: 'var(--success-text)' }}>
                Connected. Atlas will brief you from tomorrow morning.
              </p>
            )}
            {connectAi.isError && (
              <p className="onb-sub" style={{ color: 'var(--danger-role)' }}>
                {errorMessage(connectAi.error, 'That key was not accepted.')}
              </p>
            )}
            <p className="onb-sub" style={{ fontSize: 12 }}>
              Get one free at <strong>platform.deepseek.com</strong> — sign up, open API keys,
              create one, paste it here. Stored encrypted; it never leaves your Atlas.
            </p>
            {/* Skipping has to be honest about the cost. Saying "everything
                still works" was not true — capture, the brief, planning and the
                weekly review are the product. */}
            <p className="onb-sub" style={{ fontSize: 12 }}>
              You can skip and add it later in Settings. Atlas still records and organises
              everything you enter, and typing “gym at 6” still lands on your calendar — but it
              will not brief you, plan for you, or notice anything until a key is in place.
            </p>
            {/* The last step needs its own way forward. Leaving "Skip" in the
                header as the only exit means someone who has just pasted a key
                has to press Skip to continue, which reads like discarding it. */}
            <Button style={{ marginTop: 14 }} onClick={() => void finish()}>
              {aiSaved ? 'Build my week' : 'Build my week — I’ll add a key later'}
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
