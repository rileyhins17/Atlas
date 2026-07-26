import type { MetadataRoute } from 'next';

/**
 * The public pages, and only those. Listing auth-gated routes would be a lie to
 * the crawler and a self-inflicted duplicate-content problem. This grows when
 * real public content does (pricing, a changelog).
 *
 * Privacy and Terms are here because Google's OAuth review fetches the privacy
 * URL, and because a legal page nobody can find is not much of a legal page.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: 'https://atlaslife.app/', lastModified, changeFrequency: 'weekly', priority: 1 },
    { url: 'https://atlaslife.app/privacy', lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: 'https://atlaslife.app/terms', lastModified, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
