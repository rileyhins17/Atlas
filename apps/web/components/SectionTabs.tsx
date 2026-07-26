'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { sectionFor, tabFor } from '@/lib/sections';

/**
 * The second level of navigation: which part of this section you are in.
 *
 * Rendered by the shell rather than by each page, so every section gets the
 * same affordance in the same place. A section with one tab renders nothing —
 * a tab strip you cannot switch is decoration.
 */
export function SectionTabs() {
  const pathname = usePathname();
  const section = sectionFor(pathname);
  if (!section || section.tabs.length < 2) return null;
  const active = tabFor(section, pathname);

  return (
    <div className="section-tabs" role="navigation" aria-label={`${section.label} sections`}>
      {section.tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={`section-tab ${active === tab.key ? 'on' : ''}`}
          aria-current={active === tab.key ? 'page' : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
