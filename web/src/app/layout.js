import './globals.css';
import { cn } from 'lib/utils';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import ServiceWorkerRegistration from 'components/ServiceWorkerRegistration';
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
  title: 'JiitSphere',
  description: 'Study material & student portal for JIIT students',
  manifest: '/manifest.webmanifest',
  other: {
    'mobile-web-app-capable': 'yes'
  },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' }
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }]
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'JiitSphere'
  }
};

export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#eef6f9' },
    { media: '(prefers-color-scheme: dark)', color: '#111827' }
  ]
};

const themeScript = `(function(){try{var r=document.documentElement;r.classList.add('dark');r.style.setProperty('--primary','45 93% 47%');r.style.setProperty('--primary-foreground','0 0% 0%');r.style.setProperty('--ring','45 93% 47%');}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={cn(
        "flex min-h-screen flex-col bg-background",
        inter.variable,
        instrumentSans.variable
      )}>
        <ServiceWorkerRegistration />
        <PageTracker />
        <div className="flex-1">{children}</div>
        <Toaster />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
