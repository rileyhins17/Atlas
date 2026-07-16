import type { MetadataRoute } from 'next';

// Web App Manifest so Atlas can be "Added to Home Screen" on phone and laptop.
// Icons are added in Phase 1 (PNG assets); an SVG icon works for install prompts
// in most modern browsers.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Atlas — Life OS',
    short_name: 'Atlas',
    description: 'Your personal life OS: tasks, calendar, habits, journal, finance.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0e1116',
    theme_color: '#0e1116',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
