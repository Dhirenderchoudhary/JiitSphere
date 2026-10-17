'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from 'components/ui/button';
import { Input } from 'components/ui/input';
import { redeemPhoneLinkCode } from 'lib/api';
import saveSignedInSession from '../portal/saveSignedInSession';

export default function LinkPhonePage() {
  const { replace } = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [linking, setLinking] = useState(false);
  const tried = useRef(false);

  const link = async (value) => {
    setLinking(true);
    setError('');
    try {
      const { data } = await redeemPhoneLinkCode(value);
      saveSignedInSession(data.token, data.user.userId);
      replace('/portal');
    } catch (err) {
      setError(err?.message || 'Could not link this phone. Try a new code.');
      setLinking(false);
    }
  };

  // A scanned QR code opens this page with the code already in the address.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('code') || '';
    if (!fromUrl || tried.current) return;
    tried.current = true;
    setCode(fromUrl);
    link(fromUrl);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-[380px] space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Link this phone</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            On a computer signed in to JiitSphere, choose <strong>Use on phone</strong> at the top
            of the portal, then scan the QR code or type the code here.
          </p>
        </div>

        <form
          className="space-y-3 rounded-2xl border border-border/40 bg-card p-6"
          onSubmit={(event) => {
            event.preventDefault();
            link(code);
          }}
        >
          <label htmlFor="link-code" className="text-xs font-medium text-muted-foreground">
            Code
          </label>
          <Input
            id="link-code"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            maxLength={8}
            autoComplete="one-time-code"
            autoCapitalize="characters"
            placeholder="8 characters"
            className="h-12 rounded-xl text-center font-mono text-lg tracking-[0.25em]"
          />
          {error ? (
            <p aria-live="polite" className="text-xs font-medium text-red-500">
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            disabled={linking || code.trim().length !== 8}
            className="h-12 w-full rounded-xl font-bold"
          >
            {linking ? 'Linking…' : 'Link phone'}
          </Button>
        </form>
      </div>
    </main>
  );
}
