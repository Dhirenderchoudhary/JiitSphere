'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from 'components/ui/button';
import { buttonVariants } from 'components/ui/button.utils';
import { cn } from 'lib/utils';
import {
  loginPortalDemo,
  loginPortalWithGoogle,
  portalSdkLogin,
  fetchPortalAttendanceMeta,
  fetchPortalSdkSession,
  fetchPortalExams,
  fetchPortalSubjects,
} from 'lib/api';
import { TOKEN_KEY, LAST_PORTAL_USER_ID, PORTAL_VERIFIED_KEY } from '../constants';

const EXTENSION_URL =
  'https://chromewebstore.google.com/detail/jiitsphere-connect/eccflpifjeiapgoimdmnkfiafbchkfgo';

// The JIIT portal only signs students in with Google, and only on its own
// page, so portal sign-in goes through the JiitSphere Connect extension.
// `route` is which way this browser can get there.
const ROUTE_HINTS = {
  extension: 'Signs you in through the official JIIT portal with your college Google account.',
  'needs-extension':
    'The JIIT portal signs students in with Google only. Add JiitSphere Connect to Chrome or Edge, then reload this page.',
  phone:
    'The JIIT portal signs students in with Google only, which needs JiitSphere Connect on a computer with Chrome or Edge.',
};

export default function LoginView({ onAuth }) {
  const [route, setRoute] = useState(null);
  const [waitingOnPortal, setWaitingOnPortal] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const finishPortalGoogleLogin = async (portalLogin) => {
    setWaitingOnPortal(false);
    setLoading(true);
    setError('');
    try {
      const auth = await loginPortalWithGoogle(portalLogin);
      const { token: activeToken, relaySessionId, user } = auth?.data || {};
      // sdk/login swallows portal errors, so realData is the only sign the
      // portal token actually works.
      const sdk = await portalSdkLogin(activeToken, { userId: user.userId, relaySessionId });
      if (!sdk?.data?.realData) throw new Error('Portal returned no data');

      window.localStorage.setItem(TOKEN_KEY, activeToken);
      window.localStorage.setItem(LAST_PORTAL_USER_ID, user.userId);
      window.localStorage.setItem(PORTAL_VERIFIED_KEY, 'true');
      window.localStorage.setItem('jaypee_buddy_identity_mode', 'portal');
      window.localStorage.removeItem('jaypee_buddy_cached_photo');
      window.localStorage.removeItem('jaypee_buddy_cached_profile_name');
      window.dispatchEvent(new Event('jaypee-buddy-identity-updated'));
      onAuth(activeToken);
    } catch (_err) {
      setError(
        'The college portal signed you in, but JiitSphere could not load your data. Try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const onExtensionMessage = useRef(null);
  onExtensionMessage.current = (data) => {
    if (data.jiitsphere === 'here') setRoute('extension');
    if (data.jiitsphere === 'login' && data.login) finishPortalGoogleLogin(data.login);
    if (data.jiitsphere === 'cancelled') {
      setWaitingOnPortal(false);
      setError('The portal tab was closed before sign-in finished.');
    }
  };

  useEffect(() => {
    const listener = (event) => {
      if (event.source === window && event.data?.jiitsphere) onExtensionMessage.current(event.data);
    };
    window.addEventListener('message', listener);
    window.postMessage({ jiitsphere: 'hello' }, window.location.origin);
    // Phones can't run Chrome extensions. The extension's reply, if any,
    // upgrades the route to 'extension'.
    const isPhone =
      /android|iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    setRoute((current) => current || (isPhone ? 'phone' : 'needs-extension'));
    return () => window.removeEventListener('message', listener);
  }, []);

  const handleExtensionGoogle = () => {
    setError('');
    setWaitingOnPortal(true);
    window.postMessage({ jiitsphere: 'connect' }, window.location.origin);
  };

  const handleTryDemo = async () => {
    setLoading(true);
    setError('');

    try {
      const auth = await loginPortalDemo();
      const activeToken = auth?.data?.token;
      const demoUserId = String(auth?.data?.user?.userId || 'dhirender.choudhary@jiitsphere.local');

      if (!activeToken) {
        throw new Error('Demo session token missing');
      }

      await portalSdkLogin(activeToken, { userId: demoUserId });

      // Warm up API cache before navigating
      fetchPortalSdkSession(activeToken, false).catch(() => {});
      fetchPortalAttendanceMeta(activeToken).catch(() => {});
      fetchPortalExams(activeToken, false).catch(() => {});
      fetchPortalSubjects(activeToken, '', false).catch(() => {});

      window.localStorage.setItem(TOKEN_KEY, activeToken);
      window.localStorage.setItem(LAST_PORTAL_USER_ID, demoUserId);
      window.localStorage.setItem(PORTAL_VERIFIED_KEY, 'true');
      window.localStorage.setItem('jaypee_buddy_identity_mode', 'demo');
      window.localStorage.setItem('jaypee_buddy_cached_profile_name', 'Dhirender Choudhary');
      window.localStorage.setItem('jaypee_buddy_cached_photo', '/demo-student-profile.png');
      window.dispatchEvent(new Event('jaypee-buddy-identity-updated'));
      onAuth(activeToken);
    } catch (_err) {
      setError('Could not open the demo. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const hint = waitingOnPortal
    ? 'Choose Continue with Google on the JIIT portal tab. You will come back here once it signs you in.'
    : ROUTE_HINTS[route];

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12 bg-background relative overflow-hidden">
      {/* Background geometric accents */}
      <div className="absolute top-0 right-0 w-1/3 h-1/3 bg-primary/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-1/4 h-1/4 bg-blue-500/5 blur-[100px] pointer-events-none" />

      <div className="w-full max-w-[420px] relative z-10 space-y-8">
        {/* Branding */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="size-10 bg-primary flex items-center justify-center rounded-xl shadow-sm">
              <span className="text-primary-foreground font-black text-xl tracking-tighter">J</span>
            </div>
            <div>
              <p className="text-xs font-bold text-muted-foreground">Secure Access</p>
              <h2 className="text-2xl font-bold tracking-tight text-foreground font-[var(--font-instrument-sans)]">
                JiitSphere Portal
              </h2>
            </div>
          </div>
          <p className="text-xs text-muted-foreground font-medium leading-relaxed">
            Sign in with your JIIT Google account to see your attendance, grades and exams.
          </p>
        </div>

        <div className="rounded-2xl border border-border/40 bg-card shadow-lg">
          <div className="p-8 space-y-5">
            <div className="space-y-3">
              {route === 'extension' ? (
                <GoogleButton onClick={handleExtensionGoogle} disabled={loading || waitingOnPortal}>
                  {waitingOnPortal ? 'Waiting for the portal tab...' : 'Continue with Google'}
                </GoogleButton>
              ) : null}
              {route === 'needs-extension' ? (
                <a
                  href={EXTENSION_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(buttonVariants(), 'w-full h-12 rounded-xl font-bold text-sm')}
                >
                  Add JiitSphere Connect to Chrome
                </a>
              ) : null}
              {hint ? (
                <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
                  {hint}
                </p>
              ) : null}
            </div>

            {error ? (
              <div
                aria-live="polite"
                className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs font-medium text-red-500"
              >
                {error}
              </div>
            ) : null}

            <div className="space-y-2">
              {route === 'phone' ? null : (
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-border/60" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70">
                    or
                  </span>
                  <div className="h-px flex-1 bg-border/60" />
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                className="w-full h-11 rounded-xl font-bold text-sm"
                onClick={() => {
                  handleTryDemo().catch(() => null);
                }}
                disabled={loading}
              >
                {loading ? 'Opening Demo...' : 'Try Demo'}
              </Button>
              <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
                Public student mode: no college account required.
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-center">
          <span className="text-[10px] text-muted-foreground/40">JiitSphere v2.5</span>
        </div>
      </div>
    </main>
  );
}

function GoogleButton({ children, ...props }) {
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full h-12 rounded-xl font-bold text-sm gap-3"
      {...props}
    >
      <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
        <path
          fill="#FFC107"
          d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
        />
        <path
          fill="#FF3D00"
          d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
        />
        <path
          fill="#4CAF50"
          d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
        />
        <path
          fill="#1976D2"
          d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
        />
      </svg>
      {children}
    </Button>
  );
}
