import './globals.css';
import Script from 'next/script';
import { Analytics } from '@vercel/analytics/next';
import ServiceWorkerRegistration from 'components/ServiceWorkerRegistration';
import PageTracker from 'components/PageTracker';

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
      <body className="font-[var(--font-manrope)]">
        <Script id="theme-init" strategy="beforeInteractive">
          {`try{const saved=localStorage.getItem('jaypee_theme');const useDark=saved?saved==='dark':true;document.documentElement.classList.toggle('dark',useDark);if(!saved)localStorage.setItem('jaypee_theme','dark')}catch(_e){}`}
        </Script>
        <ServiceWorkerRegistration />
        <PageTracker />
        {children}
        <footer className="fixed bottom-0 left-0 right-0 z-20 flex h-8 items-center justify-center border-t border-slate-200/60 bg-white/90 text-[11px] text-muted-foreground backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/90">
          Made with ❤️ for JiitPeers by{' '}
          <a
            href="https://www.DhirenderChoudhary.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1 font-semibold text-cyan-600 hover:underline dark:text-cyan-400"
          >
            Dhirender Choudhary
          </a>
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
