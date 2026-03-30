import './globals.css';
import Script from 'next/script';
import { Analytics } from '@vercel/analytics/next';
import ServiceWorkerRegistration from 'components/ServiceWorkerRegistration';

export const metadata = {
  title: 'JIITStudyMaterial',
  description: 'Production-ready study material platform',
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
    title: 'JIIT Study Material'
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
          {`try{if(localStorage.getItem('jaypee_theme')==='dark'){document.documentElement.classList.add('dark')}}catch(_e){}`}
        </Script>
        <ServiceWorkerRegistration />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
