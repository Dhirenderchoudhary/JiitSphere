'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Button } from 'components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/ui/card';
import { Input } from 'components/ui/input';
import {
  fetchPortalRelayCaptcha,
  loginUser,
  portalSdkLogin,
  startPortalRelaySession,
  tryPortalRelayLogin
} from 'lib/api';
import {
  TOKEN_KEY,
  LAST_PORTAL_USER_ID,
  PORTAL_VERIFIED_KEY,
  ALLOW_UNVERIFIED_PORTAL_LOGIN,
  SHOW_PORTAL_LOGIN_DIAGNOSTICS
} from '../constants';
import {
  extractRelayMessage,
  relayAttemptLooksAuthenticated,
  relayNeedsEncryptedPayload
} from '../utils';

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

  const fetchCaptchaChallenge = async (activeToken, activeRelaySessionId) => {
    const captchaResponse = await fetchPortalRelayCaptcha(activeToken, {
      sessionId: activeRelaySessionId
    });

    const image = captchaResponse?.data?.response?.response?.captcha?.image || '';
    if (image) {
      setCaptchaImage(`data:image/png;base64,${image}`);
      setProbeMessage('Captcha challenge loaded from portal. Enter captcha and sign in again.');
    }
  };

  useEffect(() => {
    setUserId(window.localStorage.getItem(LAST_PORTAL_USER_ID) || '');
  }, []);

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setProbeMessage('');
    setAttemptDiagnostics([]);

    try {
      let activeToken = token;
      let activeRelaySessionId = relaySessionId;

      if (!activeToken) {
        const auth = await loginUser({ userId, password, portalMode: true });
        activeToken = auth?.data?.token;
        if (!activeToken) throw new Error('Authentication token missing');

        const relay = await startPortalRelaySession(activeToken);
        activeRelaySessionId = relay?.data?.sessionId || '';
        setToken(activeToken);
        setRelaySessionId(activeRelaySessionId);
      }

      if (activeToken && activeRelaySessionId) {
        const sanitizedCaptcha = String(captchaValue || '')
          .trim()
          .replace(/[^a-z0-9]/gi, '')
          .slice(0, 10);

        const probe = await tryPortalRelayLogin(activeToken, {
          sessionId: activeRelaySessionId,
          userId,
          password,
          captcha: sanitizedCaptcha || undefined,
          usertype: 'S'
        });
        const attempts = probe?.data?.attempts || [];
        setAttemptDiagnostics(
          attempts.map((attempt) => ({
            strategy: attempt?.strategy || '-',
            phase: attempt?.phase || '-',
            endpoint: attempt?.endpoint || '-',
            status: attempt?.status,
            message: extractRelayMessage(attempt?.response) || ''
          }))
        );
        const anyOk = Boolean(probe?.data?.authenticated) || attempts.some(relayAttemptLooksAuthenticated);
        const latestMessage =
          attempts
            .map((attempt) => extractRelayMessage(attempt.response))
            .find(Boolean) || '';
        const encryptedRequired = relayNeedsEncryptedPayload(attempts);
        const resolvedFailureMessage =
          probe?.data?.failureMessage ||
          (encryptedRequired
            ? 'Official portal needs encrypted login payload. Plain credential relay is rejected by the portal.'
            : (latestMessage || 'Invalid portal credentials or captcha'));

        setProbeMessage(anyOk ? 'Verifying credentials...' : 'Unable to verify credentials. Please retry.');

        if (!anyOk) {
          if (!captchaValue || !captchaImage) {
            await fetchCaptchaChallenge(activeToken, activeRelaySessionId);
          }
          if (ALLOW_UNVERIFIED_PORTAL_LOGIN) {
            setProbeMessage('Portal auth verification failed, but bypass mode is enabled.');
          }
          throw new Error(resolvedFailureMessage);
        }
      }

      await portalSdkLogin(activeToken, { userId, password, relaySessionId: activeRelaySessionId });
      window.localStorage.setItem(TOKEN_KEY, activeToken);
      window.localStorage.setItem(LAST_PORTAL_USER_ID, userId);
      window.localStorage.setItem(PORTAL_VERIFIED_KEY, 'true');
      onAuth(activeToken);
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl items-center bg-[radial-gradient(circle_at_10%_0%,rgba(14,165,233,0.08),transparent_35%),radial-gradient(circle_at_90%_100%,rgba(251,191,36,0.08),transparent_30%)] px-4 py-10 sm:px-6 lg:px-8">
      <Card className="mx-auto w-full max-w-md border-slate-200/70 dark:border-slate-700/70 bg-white/90 dark:bg-slate-900/70 shadow-[0_18px_60px_-28px_rgba(15,23,42,0.45)]">
        <CardHeader>
          <CardTitle className="font-[var(--font-archivo)] text-3xl font-black">JPortal</CardTitle>
          <CardDescription>Sign in with enrollment number and password.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <Input
              placeholder="Enrollment Number"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {captchaImage ? (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Portal Captcha</p>
                <Image
                  src={captchaImage}
                  alt="Portal captcha"
                  width={320}
                  height={48}
                  unoptimized
                  className="h-12 w-full rounded border border-border object-contain"
                />
                <Input
                  placeholder="Enter captcha"
                  value={captchaValue}
                  onChange={(e) => setCaptchaValue(e.target.value)}
                />
              </div>
            ) : null}
            {SHOW_PORTAL_LOGIN_DIAGNOSTICS && probeMessage ? <p className="text-xs text-muted-foreground">{probeMessage}</p> : null}
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {SHOW_PORTAL_LOGIN_DIAGNOSTICS && attemptDiagnostics.length ? (
              <div className="max-h-44 space-y-2 overflow-auto rounded-lg border border-border p-3 text-xs">
                {attemptDiagnostics.map((row, idx) => (
                  <div key={`${row.endpoint}-${idx}`} className="rounded border border-border/60 p-2">
                    <p className="font-semibold text-foreground">{row.phase} • {row.strategy}</p>
                    <p className="text-muted-foreground">{row.endpoint}</p>
                    <p className="text-muted-foreground">HTTP {row.status ?? '-'}</p>
                    {row.message ? <p className="text-muted-foreground">{row.message}</p> : null}
                  </div>
                ))}
              </div>
            ) : null}
            <Button className="w-full bg-cyan-700 hover:bg-cyan-800" size="lg" disabled={loading}>
              {loading ? 'Signing in...' : captchaImage ? 'Verify Captcha & Sign In' : 'Continue'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
