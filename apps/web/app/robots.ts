import type { MetadataRoute } from 'next';

const SITE = 'https://atlaslife.app';

/**
 * Only the landing page is worth crawling. Every app route is behind auth and
 * would return the sign-in gate to a bot, so indexing them would fill search
 * results with identical login pages competing against the one page that
 * actually says what Atlas is.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/today',
          '/tasks',
          '/calendar',
          '/habits',
          '/journal',
          '/notes',
          '/fitness',
          '/finance',
          '/progress',
          '/history',
          '/settings',
          '/ai',
          '/timeline',
        ],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
