import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { ServiceWorkerRegistrar } from '@/components/ServiceWorkerRegistrar';
import { DEFAULT_PALETTE, palettesCss } from '@/lib/theme/palettes';

// Self-hosted at build (no runtime request to Google; CSP/offline-safe). A warm,
// friendly geometric sans — carries the "warm & cozy" feel.
const sans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: 'Atlas',
  description: 'Your personal life OS.',
  manifest: '/manifest.webmanifest',
  // iOS ignores the manifest almost entirely — the home-screen install is driven
  // by these tags plus a PNG apple-touch-icon (it will NOT render an SVG one,
  // which is why the icon files are rasterised).
  appleWebApp: { capable: true, title: 'Atlas', statusBarStyle: 'black-translucent' },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  // Next 15 emits the standardised `mobile-web-app-capable` and no longer emits
  // the Apple-prefixed one, which is the only name older iOS Safari reads. On
  // those devices the home-screen icon opens in a browser tab with the address
  // bar and the tab strip, which is precisely the difference between "an app"
  // and "a bookmark" — and this is a PWA whose whole distribution story is Add
  // to Home Screen. Verified missing from the served HTML before adding it.
  other: { 'apple-mobile-web-app-capable': 'yes' },
  // Safari surfaces this when the page is shared or added to the home screen.
  openGraph: {
    title: 'Atlas — your life OS',
    description: 'One place for your day, your tasks, your habits and your money.',
    type: 'website',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#0e1116',
  width: 'device-width',
  initialScale: 1,
  // No maximumScale. Pinning it to 1 disables pinch-zoom, which fails WCAG
  // 1.4.4 for anyone who needs to magnify — on a PWA that is meant to live on
  // a phone home screen. It was there to stop iOS auto-zooming when a small
  // input takes focus; the fields are 16px now, which fixes that at the source.
  // Lets content extend into notch/home-bar areas so the safe-area env()
  // paddings in globals.css can manage them (PWA standalone mode).
  viewportFit: 'cover',
};

// Runs before first paint so the saved (or system) theme is applied with no
// flash. Kept tiny and dependency-free; the base CSS is dark, so any failure
// falls back to dark.
const themeScript = `(function(){try{var d=document.documentElement;var t=localStorage.getItem('atlas-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}d.setAttribute('data-theme',t);var p=localStorage.getItem('atlas-palette');d.setAttribute('data-palette',p&&/^[a-z]{2,16}$/.test(p)?p:'${DEFAULT_PALETTE}');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The theme script sets data-theme on <html> before hydration; suppress the
    // expected attribute mismatch it causes (standard theme-flash pattern).
    <html lang="en" className={sans.variable} suppressHydrationWarning>
      <head>
        {/*
          Every palette, as static CSS, generated from one source of truth in
          lib/theme/palettes.ts. Generated rather than hand-written because ten
          palettes across light and dark is 280 colours that each have to clear
          WCAG AA, and axe can only ever scan the one that happens to be active
          — nine broken themes would sit under a green run. The values are
          solved for contrast and re-checked by test/palette-contrast.test.ts.

          Inline rather than a stylesheet link so the palette is present in the
          first paint alongside the no-flash script below; it is a few KB of
          static text and compresses to almost nothing.
        */}
        <style dangerouslySetInnerHTML={{ __html: palettesCss() }} />
      </head>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <Providers>{children}</Providers>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
