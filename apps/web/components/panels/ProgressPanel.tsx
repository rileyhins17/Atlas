'use client';

import { EmptyState } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';

/**
 * Progress — the long arc across every domain. Phase C fills this with the
 * stats rollups (tiles, deltas, heatmap, trends); the surface exists now so
 * the v4 information architecture lands whole.
 */
export function ProgressPanel() {
  return (
    <div className="stream">
      <PageHeader title="Progress" subtitle="How your life is trending, across everything." />
      <EmptyState
        title="Your long arc is coming"
        hint="Atlas is learning your patterns — tasks, habits, mood and money will chart here soon."
      />
    </div>
  );
}
