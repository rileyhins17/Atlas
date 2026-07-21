'use client';

import { Feed } from '@/components/stream/Feed';
import { PageHeader } from '@/components/PageHeader';

/**
 * History — the reverse-chron log of everything that happened, filterable by
 * domain (the v3 stream feed, now a dedicated surface; Home is the Day Canvas).
 */
export function HistoryPanel() {
  return (
    <div className="stream">
      <PageHeader
        title="History"
        subtitle="Everything Atlas has seen happen, newest first."
      />
      <Feed />
    </div>
  );
}
