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
    <main className="flex min-h-screen items-center justify-center px-4 py-12 bg-background relative overflow-hidden">
      {/* Background geometric accents */}
      <div className="absolute top-0 right-0 w-1/3 h-1/3 bg-primary/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-1/4 h-1/4 bg-blue-500/5 blur-[100px] pointer-events-none" />

      <div className="w-full max-w-[420px] relative z-10 space-y-8">
        {/* Branding */}
        <div className="space-y-2">
           <div className="flex items-center gap-3">
              <div className="size-10 bg-primary flex items-center justify-center rounded-none shadow-[4px_4px_0px_rgba(0,0,0,0.1)]">
                 <span className="text-primary-foreground font-black text-xl tracking-tighter">J</span>
              </div>
              <div>
                 <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">SECURE ACCESS</p>
                 <h2 className="text-2xl font-black tracking-tightest text-foreground font-[var(--font-instrument-sans)] uppercase">JiitSphere Portal</h2>
              </div>
           </div>
           <p className="text-xs font-bold text-muted-foreground/60 uppercase tracking-widest leading-relaxed">
             Institutional gateway for the Monumental Student OS.
           </p>
        </div>

        {/* Login Form */}
        <Card className="rounded-none border-border/60 bg-card/60 spotlight-card shadow-2xl">
          <CardContent className="p-8">
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="portal-enrollment" className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Enrollment Identity</label>
                <Input
                  id="portal-enrollment"
                  placeholder="ENROLLMENT NO."
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  required
                  autoComplete="username"
                  className="rounded-none border-border/50 bg-background/50 h-12 font-bold focus:border-primary transition-all pr-12"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="portal-password" className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Secret Password</label>
                <Input
                  id="portal-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="rounded-none border-border/50 bg-background/50 h-12 font-bold focus:border-primary transition-all pr-12"
                />
              </div>

              {captchaImage ? (
                <div className="space-y-4 border border-border/40 p-4 bg-muted/10">
                  <div className="flex justify-between items-center">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Relay Challenge</p>
                    <span className="text-[8px] font-bold text-muted-foreground/40 uppercase">VERIFY BOT STATUS</span>
                  </div>
                  <div className="relative border border-border/50 bg-white p-2">
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
                    placeholder="ENTER CAPTCHA"
                    value={captchaValue}
                    onChange={(e) => setCaptchaValue(e.target.value)}
                    className="rounded-none border-border/50 bg-background/50 h-10 font-bold focus:border-primary text-center tracking-[0.5em] uppercase"
                  />
                </div>
              ) : null}

              {error ? (
                <div aria-live="polite" className="border-l-4 border-red-500 bg-red-500/5 px-4 py-3 text-[10px] font-black text-red-500 uppercase tracking-widest">
                  {error}
                </div>
              ) : null}

              {SHOW_PORTAL_LOGIN_DIAGNOSTICS && probeMessage && (
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest text-center animate-pulse">{probeMessage}</p>
              )}

              <Button className="w-full h-14 rounded-none font-black uppercase tracking-[0.2em] shadow-lg active:scale-[0.98] transition-all" disabled={loading}>
                {loading ? 'AUTHENTICATING...' : captchaImage ? 'VERIFY & GRANT ACCESS' : 'ESTABLISH LINK'}
              </Button>
            </form>
          </CardContent>
        </Card>
        
        <div className="flex justify-between items-center opacity-40">
           <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">v2.5 // ARCHITECTURAL</span>
           <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">© 2026 JIITSPHERE</span>
        </div>
      </div>
    </main>
  );
}
