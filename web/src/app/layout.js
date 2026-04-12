import './globals.css';
import { cn } from 'lib/utils';
import Script from 'next/script';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import ServiceWorkerRegistration from 'components/ServiceWorkerRegistration';
import PageTracker from 'components/PageTracker';
import Footer from 'components/Footer';
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

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={cn(
        "flex min-h-screen flex-col bg-background",
        inter.variable,
        instrumentSans.variable
      )}>
        <Script id="theme-init" strategy="beforeInteractive">
          {`
            (function() {
              try {
                const theme = localStorage.getItem('jiitsphere-theme') || 'dark';
                const accentName = localStorage.getItem('jiitsphere-accent') || 'yellow';
                
                // Set Theme Class
                if (theme === 'dark') {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }

                // Set Accent Variables
                const root = document.documentElement;
                if (theme === 'light') {
                  root.style.setProperty('--primary', '0 0% 0%');
                  root.style.setProperty('--primary-foreground', '0 0% 100%');
                  root.style.setProperty('--ring', '0 0% 0%');
                } else {
                  const accents = {
                    'yellow': { p: '45 93% 47%', f: '0 0% 0%' },
                    'blue': { p: '217 91% 60%', f: '0 0% 100%' },
                    'red': { p: '0 84% 60%', f: '0 0% 100%' },
                    'grey': { p: '240 5% 34%', f: '0 0% 100%' }
                  };
                  const acc = accents[accentName] || accents['yellow'];
                  root.style.setProperty('--primary', acc.p);
                  root.style.setProperty('--primary-foreground', acc.f);
                  root.style.setProperty('--ring', acc.p);
                }
              } catch (e) {}
            })();
          `}
        </Script>
        <ServiceWorkerRegistration />
        <PageTracker />
        <div className="flex-1">{children}</div>
        <Footer />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
