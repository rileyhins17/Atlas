'use client';

import { useEffect, useState } from 'react';
import { HomeCapture } from '@/components/home/HomeCapture';
import { useAtlasUi } from '@/components/atlas/AtlasUiProvider';
import { Button } from '@/components/ui';
import { OnboardingWizard } from './OnboardingWizard';

/** First value uses the same capture and persistence path as every later day. */
export function FirstRunWelcome() {
  const [routineFirst, setRoutineFirst] = useState(false);
  const { setFocusMode } = useAtlasUi();
  useEffect(() => {
    setFocusMode(true);
    return () => setFocusMode(false);
  }, [setFocusMode]);

  if (routineFirst) return <OnboardingWizard />;

  return (
    <section className="onb" aria-label="Start using Atlas">
      <div className="onb-step stack">
        <h1 className="onb-q">What do you want to get off your mind?</h1>
        <p className="onb-hint">
          Start with one task or plan. Atlas saves it where it belongs, so you can decide what comes next.
        </p>
        <HomeCapture examples={['buy milk', 'call mum tomorrow', 'gym at 6']} />
        <p className="onb-help">
          Capture and day planning work without an AI key. You can connect AI and your calendar later in Settings.
        </p>
        <Button variant="secondary" onClick={() => setRoutineFirst(true)}>Set up my routine first</Button>
        <p className="onb-sub">Sleep and work hours help Atlas find realistic time for your plans. You can set them up now or later.</p>
      </div>
    </section>
  );
}
