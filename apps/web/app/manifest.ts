import type { MetadataRoute } from 'next';

// Web App Manifest so Atlas can be "Added to Home Screen" on phone and laptop.
// SVG icons ('any' sizes) satisfy install criteria in modern browsers; the
// maskable variant keeps the glyph inside the safe zone on adaptive-icon OSes.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Atlas — Life OS',
    short_name: 'Atlas',
    description: 'Your personal life OS: tasks, calendar, habits, journal, finance.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0e1116',
    theme_color: '#0e1116',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
