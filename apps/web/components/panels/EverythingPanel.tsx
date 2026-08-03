'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { EVERYTHING } from '@/lib/sections';
import { PageHeader } from '@/components/PageHeader';

/**
 * The domain pages, one level down.
 *
 * They are complete and unchanged — they simply stopped competing with the
 * question you opened the app to answer. Each carries a line saying what it is
 * for, because "Journal" and "Notes" sitting side by side told nobody which was
 * which.
 */
export function EverythingPanel() {
  return (
    <>
      <PageHeader
        title="Everything"
        subtitle="Every part of Atlas, whole. Most days you will not need to come here."
      />
      <ul className="evy-list">
        {EVERYTHING.map((d) => (
          <li key={d.href}>
            <Link className="evy-item" href={d.href}>
              <span className="evy-body">
                <span className="evy-label">{d.label}</span>
                <span className="evy-blurb">{d.blurb}</span>
              </span>
              <ArrowRight size={15} aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
