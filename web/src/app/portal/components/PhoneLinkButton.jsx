'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Smartphone, X } from 'lucide-react';
import { Button } from 'components/ui/button';
import { createPhoneLinkCode } from 'lib/api';

// panel: null (closed) | { status: 'loading' } | { status: 'error', message }
//        | { status: 'ready', code, qr, expiresAt }
export default function PhoneLinkButton({ token }) {
  const [panel, setPanel] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  const requestCode = async () => {
    setPanel({ status: 'loading' });
    try {
      const { data } = await createPhoneLinkCode(token);
      const url = `${window.location.origin}/link?code=${data.code}`;
      const qr = await QRCode.toDataURL(url, { margin: 1, width: 220 });
      setNow(Date.now());
      setPanel({ status: 'ready', code: data.code, qr, expiresAt: Date.parse(data.expiresAt) });
    } catch (err) {
      setPanel({ status: 'error', message: err?.message || 'Could not create a code' });
    }
  };

  useEffect(() => {
    if (panel?.status !== 'ready') return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [panel?.status]);

  const secondsLeft =
    panel?.status === 'ready' ? Math.max(0, Math.round((panel.expiresAt - now) / 1000)) : 0;

  return (
    <div className="relative hidden md:block">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => (panel ? setPanel(null) : requestCode())}
        className="h-9 gap-2 shadow-sm rounded-lg font-bold"
      >
        <Smartphone className="w-3.5 h-3.5" />
        Use on phone
      </Button>

      {panel ? (
        <div
          role="region"
          aria-label="Link a phone"
          className="absolute right-0 top-11 z-50 w-72 rounded-2xl border border-border bg-card p-4 shadow-lg"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">Use JiitSphere on your phone</p>
            <button
              type="button"
              onClick={() => setPanel(null)}
              aria-label="Close"
              className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          {panel.status === 'loading' ? (
            <p className="mt-6 mb-4 text-center text-xs text-muted-foreground">Creating a code…</p>
          ) : null}

          {panel.status === 'error' ? (
            <p className="mt-3 text-xs text-red-500">{panel.message}</p>
          ) : null}

          {panel.status === 'ready' && secondsLeft > 0 ? (
            <>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Scan this with your phone&apos;s camera, or open jiitsphere.com/link and enter the
                code.
              </p>
              <img
                src={panel.qr}
                alt="QR code that signs your phone in"
                className="mx-auto mt-3 size-44 rounded-lg bg-white p-1"
              />
              <p className="mt-3 text-center font-mono text-lg font-bold tracking-[0.25em] text-foreground">
                {panel.code}
              </p>
              <p className="text-center text-[11px] text-muted-foreground">
                Works once, for {secondsLeft} more seconds.
              </p>
            </>
          ) : null}

          {(panel.status === 'ready' && secondsLeft === 0) || panel.status === 'error' ? (
            <Button size="sm" onClick={requestCode} className="mt-3 w-full rounded-lg font-bold">
              Get a new code
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
