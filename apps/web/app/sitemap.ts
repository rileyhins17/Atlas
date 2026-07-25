import type { MetadataRoute } from 'next';

/**
 * One entry, because there is genuinely one public page. Listing auth-gated
 * routes would be a lie to the crawler and a self-inflicted duplicate-content
 * problem. This grows when real public content does (pricing, a changelog).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://atlaslife.app/',
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
  ];
}
