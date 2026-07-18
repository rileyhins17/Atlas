import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
