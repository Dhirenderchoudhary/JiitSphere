'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

const API_BASE = '/api/backend';

export default function PageTracker() {
  const pathname = usePathname();
  const lastTracked = useRef('');

  useEffect(() => {
    if (pathname === lastTracked.current) return;
    lastTracked.current = pathname;

    // Skip tracking for API routes and static assets
    if (pathname.startsWith('/api') || pathname.startsWith('/_next')) return;

    const body = JSON.stringify({ page: pathname, referrer: document.referrer || '' });

    // Use sendBeacon for non-blocking, or fall back to fetch
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(`${API_BASE}/track`, blob);
    } else {
      fetch(`${API_BASE}/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  }, [pathname]);

  return null;
}
