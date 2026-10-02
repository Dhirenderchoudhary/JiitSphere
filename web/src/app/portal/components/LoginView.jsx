'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Button } from 'components/ui/button';
import { Input } from 'components/ui/input';
import {
  fetchPortalGoogleConfig,
  fetchPortalRelayCaptcha,
  loginPortalDemo,
  loginPortalWithGoogle,
  loginUser,
  portalSdkLogin,
  startPortalRelaySession,
  tryPortalRelayLogin,
  fetchPortalAttendanceMeta,
  fetchPortalSdkSession,
  fetchPortalExams,
  fetchPortalSubjects,
} from 'lib/api';
import {
  TOKEN_KEY,
  LAST_PORTAL_USER_ID,
  PORTAL_VERIFIED_KEY,
  ALLOW_UNVERIFIED_PORTAL_LOGIN,
  SHOW_PORTAL_LOGIN_DIAGNOSTICS,
} from '../constants';
import { extractRelayMessage, relayAttemptLooksAuthenticated } from '../utils';

export default function LoginView({ onAuth }) {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [captchaValue, setCaptchaValue] = useState('');
  const [captchaImage, setCaptchaImage] = useState('');
  const [relaySessionId, setRelaySessionId] = useState('');
  const [token, setToken] = useState('');
  const [probeMessage, setProbeMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attemptDiagnostics, setAttemptDiagnostics] = useState([]);
  const [accountType, setAccountType] = useState('S');
  const [googleConfigLoaded, setGoogleConfigLoaded] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [googleClientId, setGoogleClientId] = useState('');
  const [gsiReady, setGsiReady] = useState(false);
  const googleButtonRef = useRef(null);
  const googleHandlerRef = useRef(null);

  const normalizeUiError = (message) => {
    const text = String(message || '').trim();
    if (!text) return 'Try again.';
    if (/unavailable|timeout|network|fetch failed|bad gateway/i.test(text)) {
      return 'Official Portal is currently unavailable. Please try again later.';
    }
    if (
      /official portal credentials verification failed|invalid credentials|invalid login|invalid user/i.test(
        text
      )
    ) {
      return 'Invalid Credentials. Please check your enrollment number and password.';
    }
    return text;
  };

  const fetchCaptchaChallenge = async (activeToken, activeRelaySessionId) => {
    const captchaResponse = await fetchPortalRelayCaptcha(activeToken, {
      sessionId: activeRelaySessionId,
    });

    const image =
      captchaResponse?.data?.response?.response?.captcha?.image ||
      captchaResponse?.data?.response?.captcha?.image ||
      captchaResponse?.data?.captcha?.image ||
      '';
    if (image) {
      const normalizedImage = String(image).startsWith('data:image')
        ? String(image)
        : `data:image/png;base64,${image}`;
      setCaptchaImage(normalizedImage);
      setProbeMessage('Try again.');
    } else {
      setProbeMessage('Portal requested captcha. Please retry once in a few seconds.');
    }
  };

  useEffect(() => {
    setUserId(window.localStorage.getItem(LAST_PORTAL_USER_ID) || '');
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchPortalGoogleConfig()
      .then((config) => {
        if (cancelled) return;
        const enabled = Boolean(config?.data?.enabled && config?.data?.clientId);
        setGoogleEnabled(enabled);
        setGoogleClientId(enabled ? String(config.data.clientId) : '');
        setGoogleConfigLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setGoogleEnabled(false);
          setGoogleConfigLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!googleEnabled) return undefined;
    if (window.google?.accounts?.id) {
      setGsiReady(true);
      return undefined;
    }
    const existing = document.querySelector('script[data-gsi-client]');
    if (existing) {
      existing.addEventListener('load', () => setGsiReady(true), { once: true });
      return undefined;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.dataset.gsiClient = '1';
    script.onload = () => setGsiReady(true);
    script.onerror = () => setError('Google sign-in could not be loaded. Refresh and try again.');
    document.head.appendChild(script);
    return undefined;
  }, [googleEnabled]);

  const finishPortalSession = (activeToken, activeUserId, relaySessionId) => {
    portalSdkLogin(activeToken, {
      userId: activeUserId,
      relaySessionId,
    })
      .then(() => {
        fetchPortalSdkSession(activeToken, false).catch(() => {});
        fetchPortalAttendanceMeta(activeToken).catch(() => {});
        fetchPortalExams(activeToken, false).catch(() => {});
        fetchPortalSubjects(activeToken, '', false).catch(() => {});
      })
      .catch(() => {});

    window.localStorage.setItem(TOKEN_KEY, activeToken);
    window.localStorage.setItem(LAST_PORTAL_USER_ID, activeUserId);
    window.localStorage.setItem(PORTAL_VERIFIED_KEY, 'true');
    window.localStorage.setItem('jaypee_buddy_identity_mode', 'portal');
    window.localStorage.removeItem('jaypee_buddy_cached_photo');
    window.localStorage.removeItem('jaypee_buddy_cached_profile_name');
    window.dispatchEvent(new Event('jaypee-buddy-identity-updated'));
    onAuth(activeToken);
  };

  const handleGoogleCredential = async (credentialResponse) => {
    if (loading) return;
    const googleToken = String(credentialResponse?.credential || '');
    if (!googleToken) {
      setError('Google sign-in did not finish. Try again.');
      return;
    }

    setLoading(true);
    setError('');
    setProbeMessage('Signing in with your college account...');

    try {
      const auth = await loginPortalWithGoogle(googleToken);
      const activeToken = auth?.data?.token || '';
      const activeRelaySessionId = auth?.data?.relaySessionId || '';
      const activeUserId = String(auth?.data?.user?.userId || '').trim();
      if (!activeToken || !activeRelaySessionId || !activeUserId) {
        throw new Error('College portal did not start a session');
      }
      setProbeMessage('Finalizing session...');
      finishPortalSession(activeToken, activeUserId, activeRelaySessionId);
    } catch (err) {
      setError(normalizeUiError(err?.message || 'Google sign-in failed'));
      setProbeMessage('');
    } finally {
      setLoading(false);
    }
  };

  googleHandlerRef.current = handleGoogleCredential;

  useEffect(() => {
    if (accountType !== 'S' || !googleEnabled || !gsiReady || !googleClientId) return undefined;
    const el = googleButtonRef.current;
    const google = window.google?.accounts?.id;
    if (!el || !google) return undefined;

    el.innerHTML = '';
    google.initialize({
      client_id: googleClientId,
      callback: (response) => {
        googleHandlerRef.current?.(response);
      },
      ux_mode: 'popup',
      auto_select: false,
      cancel_on_tap_outside: true,
    });
    google.renderButton(el, {
      theme: 'filled_blue',
      size: 'large',
      type: 'standard',
      shape: 'rectangular',
      text: 'signin_with',
      logo_alignment: 'center',
      width: 280,
    });
    return undefined;
  }, [accountType, googleEnabled, gsiReady, googleClientId]);

  const handleTryDemo = async () => {
    setLoading(true);
    setError('');
    setProbeMessage('Starting public demo...');

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
    } catch (err) {
      setError(normalizeUiError(err?.message || 'Unable to start public demo'));
      setProbeMessage('');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setError('');
    setProbeMessage('');
    setAttemptDiagnostics([]);

    try {
      const normalizedUserId = String(userId || '').trim();
      const effectiveUserType = accountType === 'P' ? 'P' : 'S';

      let activeToken = token;
      let activeRelaySessionId = relaySessionId;

      if (!activeToken) {
        setProbeMessage('Authenticating...');
        try {
          const auth = await loginUser({ userId: normalizedUserId, password, portalMode: true });
          activeToken = auth?.data?.token || '';
          if (!activeToken) throw new Error('Authentication token missing');

          // The login response now carries the relay session, saving a round
          // trip. Fall back for backends that predate that.
          activeRelaySessionId = auth?.data?.relaySessionId || '';
          if (!activeRelaySessionId) {
            const relay = await startPortalRelaySession(activeToken);
            activeRelaySessionId = relay?.data?.sessionId || '';
          }
        } catch (authErr) {
          throw new Error('Invalid Credentials. Please check your enrollment number and password.');
        }
        setToken(activeToken);
        setRelaySessionId(activeRelaySessionId);
      }

      if (activeToken && activeRelaySessionId) {
        const sanitizedCaptcha = String(captchaValue || '')
          .trim()
          .replace(/[^a-z0-9]/gi, '')
          .slice(0, 10);

        if (captchaImage && !sanitizedCaptcha) {
          throw new Error('Please enter the captcha shown above.');
        }

        setProbeMessage('Verifying credentials...');
        const probe = await tryPortalRelayLogin(activeToken, {
          sessionId: activeRelaySessionId,
          userId: normalizedUserId,
          password,
          captcha: sanitizedCaptcha || undefined,
          usertype: effectiveUserType,
        }).catch((err) => {
          throw new Error('Official Portal is currently unavailable. Please try again later.');
        });

        const attempts = probe?.data?.attempts || [];
        setAttemptDiagnostics(
          attempts.map((attempt) => ({
            strategy: attempt?.strategy || '-',
            phase: attempt?.phase || '-',
            endpoint: attempt?.endpoint || '-',
            status: attempt?.status,
            message: String(attempt?.message || extractRelayMessage(attempt?.response) || ''),
          }))
        );

        const relayFailure =
          String(probe?.data?.failureMessage || '').trim() ||
          attempts
            .map((attempt) =>
              String(attempt?.message || extractRelayMessage(attempt?.response) || '').trim()
            )
            .find(Boolean) ||
          '';

        const anyOk =
          Boolean(probe?.data?.authenticated) || attempts.some(relayAttemptLooksAuthenticated);

        if (!anyOk) {
          // Total wipe of stale state to break locks
          setToken('');
          setRelaySessionId('');
          setCaptchaValue('');

          if (/captcha|challenge/i.test(relayFailure)) {
            await fetchCaptchaChallenge(activeToken, activeRelaySessionId).catch(() => {});
            throw new Error('Verification required. Please enter the captcha.');
          } else if (/unavailable|timeout|network|bad gateway/i.test(relayFailure)) {
            setCaptchaImage('');
            throw new Error('Official Portal is currently unavailable. Please try again later.');
          } else {
            setCaptchaImage('');
            throw new Error(
              'Invalid Credentials. Please check your enrollment number and password.'
            );
          }
        }
      }

      setProbeMessage('Finalizing session...');
      // Start background tasks so they warm the cache/network channel implicitly before navigating
      // Do not await them to block UI transition
      portalSdkLogin(activeToken, {
        userId: normalizedUserId,
        relaySessionId: activeRelaySessionId,
      })
        .then(() => {
          fetchPortalSdkSession(activeToken, false).catch(() => {});
          fetchPortalAttendanceMeta(activeToken).catch(() => {});
          fetchPortalExams(activeToken, false).catch(() => {});
          fetchPortalSubjects(activeToken, '', false).catch(() => {});
        })
        .catch(() => {});

      window.localStorage.setItem(TOKEN_KEY, activeToken);
      window.localStorage.setItem(LAST_PORTAL_USER_ID, normalizedUserId);
      window.localStorage.setItem(PORTAL_VERIFIED_KEY, 'true');
      window.localStorage.setItem('jaypee_buddy_identity_mode', 'portal');
      window.localStorage.removeItem('jaypee_buddy_cached_photo');
      window.localStorage.removeItem('jaypee_buddy_cached_profile_name');
      window.dispatchEvent(new Event('jaypee-buddy-identity-updated'));
      onAuth(activeToken);
    } catch (err) {
      setToken('');
      setRelaySessionId('');
      if (!err?.message?.includes('Verification required')) {
        setCaptchaImage('');
        setCaptchaValue('');
      }
      setError(normalizeUiError(err?.message));
      setProbeMessage('');
    } finally {
      setLoading(false);
    }
  };

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
            {!googleConfigLoaded
              ? 'Sign in to your college portal.'
              : googleEnabled && accountType === 'S'
                ? 'Students sign in with their JIIT college Google account.'
                : 'Sign in with your WebPortal credentials to access your dashboard.'}
          </p>
        </div>

        <div className="rounded-2xl border border-border/40 bg-card shadow-lg">
          <div className="p-8">
            <form
              onSubmit={(event) => {
                if (!googleConfigLoaded || (googleEnabled && accountType === 'S')) {
                  event.preventDefault();
                  return;
                }
                handleLogin(event);
              }}
              className="space-y-5"
            >
              <fieldset className="flex items-center gap-5">
                <legend className="sr-only">Account type</legend>
                <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <input
                    type="radio"
                    name="portal-account-type"
                    value="S"
                    checked={accountType === 'S'}
                    onChange={() => setAccountType('S')}
                    className="accent-primary"
                  />
                  Student
                </label>
                <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <input
                    type="radio"
                    name="portal-account-type"
                    value="P"
                    checked={accountType === 'P'}
                    onChange={() => setAccountType('P')}
                    className="accent-primary"
                  />
                  Parent
                </label>
              </fieldset>

              {!googleConfigLoaded ? (
                <p className="text-xs font-medium text-muted-foreground text-center">
                  Checking college sign-in...
                </p>
              ) : null}

              {googleConfigLoaded && googleEnabled && accountType === 'S' ? (
                <div className="space-y-3">
                  <div ref={googleButtonRef} className="flex min-h-11 justify-center" />
                  {!gsiReady || loading ? (
                    <p className="text-xs font-medium text-muted-foreground text-center">
                      {loading ? 'Signing in...' : 'Loading Google sign-in...'}
                    </p>
                  ) : null}
                  <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
                    Use the college email on your JIIT Google account.
                  </p>
                </div>
              ) : null}

              {googleConfigLoaded && !(googleEnabled && accountType === 'S') ? (
                <>
              <div className="space-y-1.5">
                <label
                  htmlFor="portal-enrollment"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Enrollment Number
                </label>
                <Input
                  id="portal-enrollment"
                  placeholder="e.g. 9921103XXX"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  required
                  autoComplete="username"
                  className="rounded-xl border-border/50 bg-secondary/30 h-12 font-medium focus:border-primary transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="portal-password"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Password
                </label>
                <Input
                  id="portal-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="rounded-xl border-border/50 bg-secondary/30 h-12 font-medium focus:border-primary transition-all"
                />
              </div>

              {captchaImage ? (
                <div className="space-y-3 rounded-xl border border-border/40 p-4 bg-secondary/20">
                  <div className="flex justify-between items-center">
                    <p className="text-xs font-bold text-foreground">Captcha Verification</p>
                    <span className="text-[9px] font-medium text-muted-foreground">Required</span>
                  </div>
                  <div className="rounded-lg border border-border/40 bg-white p-2 overflow-hidden">
                    <Image
                      src={captchaImage}
                      alt="Portal captcha"
                      width={320}
                      height={48}
                      unoptimized
                      className="h-10 w-full object-contain filter grayscale contrast-125"
                    />
                  </div>
                  <Input
                    id="portal-captcha"
                    placeholder="Enter captcha"
                    value={captchaValue}
                    onChange={(e) => setCaptchaValue(e.target.value)}
                    required={Boolean(captchaImage)}
                    className="rounded-xl border-border/50 bg-secondary/30 h-10 font-medium focus:border-primary text-center tracking-widest"
                  />
                </div>
              ) : null}
                </>
              ) : null}

              {error ? (
                <div
                  aria-live="polite"
                  className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs font-medium text-red-500"
                >
                  {error}
                </div>
              ) : null}

              {SHOW_PORTAL_LOGIN_DIAGNOSTICS && probeMessage && (
                <p className="text-xs font-medium text-muted-foreground text-center animate-pulse">
                  {probeMessage}
                </p>
              )}

              {googleConfigLoaded && !(googleEnabled && accountType === 'S') ? (
                <Button
                  className="w-full h-12 rounded-xl font-bold text-sm shadow-sm"
                  disabled={loading || (Boolean(captchaImage) && !String(captchaValue || '').trim())}
                >
                  {loading ? 'Signing in...' : captchaImage ? 'Verify & Sign In' : 'Sign In'}
                </Button>
              ) : null}

              <div className="space-y-2 pt-1">
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-border/60" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70">
                    or
                  </span>
                  <div className="h-px flex-1 bg-border/60" />
                </div>
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
                  Public student mode: no college ID or password required.
                </p>
              </div>
            </form>
          </div>
        </div>

        <div className="flex justify-center">
          <span className="text-[10px] text-muted-foreground/40">JiitSphere v2.5</span>
        </div>
      </div>
    </main>
  );
}
