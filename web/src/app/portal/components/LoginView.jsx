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
  relayAttemptLooksAuthenticated
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
      setProbeMessage('Try again.');
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
        setProbeMessage(anyOk ? 'Verifying credentials...' : 'Try again.');

        if (!anyOk) {
          await fetchCaptchaChallenge(activeToken, activeRelaySessionId);
          setCaptchaValue('');
          if (ALLOW_UNVERIFIED_PORTAL_LOGIN) {
            setProbeMessage('Try again.');
          } else {
            throw new Error('Try again.');
          }
        }
      }

      await portalSdkLogin(activeToken, { userId, password, relaySessionId: activeRelaySessionId });
      window.localStorage.setItem(TOKEN_KEY, activeToken);
      window.localStorage.setItem(LAST_PORTAL_USER_ID, userId);
      window.localStorage.setItem(PORTAL_VERIFIED_KEY, 'true');
      onAuth(activeToken);
    } catch (_err) {
      setError('Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {/* Logo + Title */}
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg">
            <span className="text-2xl font-black">J</span>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Student Portal</p>
            <h1 className="mt-0.5 font-[var(--font-archivo)] text-3xl font-black tracking-tight">JPortal</h1>
          </div>
        </div>

        {/* Login Card */}
        <Card className="gradient-border bg-card/95 backdrop-blur shadow-[0_18px_60px_-28px_rgba(15,23,42,0.35)]">
          <CardHeader className="pb-2">
            <CardDescription>Sign in with your enrollment number and password.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Enrollment Number</label>
                <Input
                  placeholder="e.g. 9923102082"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Password</label>
                <Input
                  type="password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {captchaImage ? (
                <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Portal Captcha</p>
                  <Image
                    src={captchaImage}
                    alt="Portal captcha"
                    width={320}
                    height={48}
                    unoptimized
                    className="h-12 w-full rounded-lg border border-border object-contain bg-white"
                  />
                  <Input
                    placeholder="Enter captcha"
                    value={captchaValue}
                    onChange={(e) => setCaptchaValue(e.target.value)}
                  />
                </div>
              ) : null}
              {SHOW_PORTAL_LOGIN_DIAGNOSTICS && probeMessage ? <p className="text-xs text-muted-foreground">{probeMessage}</p> : null}
              {error ? (
                <div className="rounded-xl border border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950/50 px-4 py-2.5 text-sm text-red-600 dark:text-red-300 font-medium">
                  {error}
                </div>
              ) : null}
              {SHOW_PORTAL_LOGIN_DIAGNOSTICS && attemptDiagnostics.length ? (
                <div className="max-h-44 space-y-2 overflow-auto rounded-xl border border-border bg-muted/20 p-3 text-xs">
                  {attemptDiagnostics.map((row, idx) => (
                    <div key={`${row.endpoint}-${idx}`} className="rounded-lg border border-border/60 p-2">
                      <p className="font-semibold text-foreground">{row.phase} • {row.strategy}</p>
                      <p className="text-muted-foreground">{row.endpoint}</p>
                      <p className="text-muted-foreground">HTTP {row.status ?? '-'}</p>
                      {row.message ? <p className="text-muted-foreground">{row.message}</p> : null}
                    </div>
                  ))}
                </div>
              ) : null}
              <Button className="w-full" size="lg" disabled={loading}>
                {loading ? 'Signing in...' : captchaImage ? 'Verify Captcha & Sign In' : 'Continue'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
