'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ProgressPanel } from '@/components/panels/ProgressPanel';
import { HistoryPanel } from '@/components/panels/HistoryPanel';

/**
 * One screen for "how did it actually go".
 *
 * Progress (charts) and History (the raw feed) were separate destinations
 * answering the same question, sitting in the same section. Two places to look
 * back is one place too many, and the feed — a reverse-chronological log of
 * every row written — is a developer's view of the data far more often than a
 * person's.
 *
 * So the feed is still here and still complete, but folded away. What leads is
 * what you can act on: the weekly decisions and the connection card, both of
 * which already live at the top of Progress.
 */
export function LookingBackPanel() {
  const [showFeed, setShowFeed] = useState(false);

  return (
    <>
      <ProgressPanel />

      <section className="lb-feed" aria-label="Everything that happened">
        <button
          type="button"
          className="ov-disclose"
          aria-expanded={showFeed}
          onClick={() => setShowFeed((v) => !v)}
        >
          <ChevronDown size={14} aria-hidden className={showFeed ? 'open' : undefined} />
          Everything that happened
        </button>
        {/* Mounted only when opened: the feed is a paginated query, and paying
            for it on every visit to a screen most people open for the summary
            is the kind of cost that makes a page feel slow for no reason. */}
        {showFeed && <HistoryPanel />}
      </section>
    </>
  );
}
