import './globals.css';
import { cn } from 'lib/utils';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import ServiceWorkerRegistration from 'components/ServiceWorkerRegistration';
import InstallAppBanner from 'components/InstallAppBanner';
import PageTracker from 'components/PageTracker';
import { Toaster } from 'components/ui/sonner';
import { Inter, Instrument_Sans } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-instrument-sans',
  display: 'swap',
});

export const metadata = {
  title: {
    default: 'JiitSphere',
    template: '%s | JiitSphere',
  },
  description:
    'Study material & student portal for JIIT students. Access attendance, grades, exams, and 1300+ study resources.',
  // Must match the file in public/ — /api/manifest has no route and 404s,
  // which silently blocks the install prompt and PWA icons.
  manifest: '/manifest.webmanifest',
  metadataBase: new URL('https://jiitsphere.com'),
  openGraph: {
    title: 'JiitSphere',
    description: 'The academic dashboard for JIIT students.',
    siteName: 'JiitSphere',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'JiitSphere - The academic dashboard for JIIT students.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'JiitSphere',
    description: 'The academic dashboard for JIIT students.',
    images: ['/og-image.png'],
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'JiitSphere',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafafa' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
        <link rel="dns-prefetch" href="https://docs.google.com" />
        <script
          defer
          src="https://cloud.umami.is/script.js"
          data-website-id="c1d3c6b0-aad5-4fd2-a1e9-7bfbe0ed0313"
        />
      </head>
      <body
        className={cn(
          'flex min-h-screen flex-col bg-background',
          inter.variable,
          instrumentSans.variable
        )}
      >
        <ServiceWorkerRegistration />
        <PageTracker />
        <div className="flex-1">{children}</div>
        <Toaster />
        <InstallAppBanner />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
