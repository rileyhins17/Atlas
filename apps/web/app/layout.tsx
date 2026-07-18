import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';
import { ServiceWorkerRegistrar } from '@/components/ServiceWorkerRegistrar';

export const metadata: Metadata = {
  title: 'Atlas',
  description: 'Your personal life OS.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Atlas', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  themeColor: '#0e1116',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  // Lets content extend into notch/home-bar areas so the safe-area env()
  // paddings in globals.css can manage them (PWA standalone mode).
  viewportFit: 'cover',
};

// Runs before first paint so the saved (or system) theme is applied with no
// flash. Kept tiny and dependency-free; the base CSS is dark, so any failure
// falls back to dark.
const themeScript = `(function(){try{var t=localStorage.getItem('atlas-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The theme script sets data-theme on <html> before hydration; suppress the
    // expected attribute mismatch it causes (standard theme-flash pattern).
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <Providers>{children}</Providers>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
