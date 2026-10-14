'use client';

import { useEffect, useState } from 'react';
import { Download, Share, SquarePlus, X } from 'lucide-react';
import { Button } from 'components/ui/button';

const DISMISS_KEY = 'jiitsphere-install-dismissed-at';
const DISMISS_FOR_MS = 14 * 24 * 60 * 60 * 1000;

// iPadOS Safari reports itself as a Mac, so a touch screen gives it away.
const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

const isAndroid = () => /android/i.test(navigator.userAgent);

const isInstalled = () =>
  window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

const dismissedRecently = () => {
  try {
    const at = Number(window.localStorage.getItem(DISMISS_KEY));
    return Boolean(at) && Date.now() - at < DISMISS_FOR_MS;
  } catch {
    return false;
  }
};

export default function InstallAppBanner() {
  const [platform, setPlatform] = useState(null);
  const [installPrompt, setInstallPrompt] = useState(null);

  useEffect(() => {
    if (isInstalled() || dismissedRecently()) return undefined;
    if (isIos()) setPlatform('ios');
    else if (isAndroid()) setPlatform('android');
    else return undefined;

    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const onInstalled = () => setPlatform(null);

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!platform) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Private mode: the banner just comes back on the next visit.
    }
    setPlatform(null);
  };

  const install = async () => {
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (outcome === 'accepted') setPlatform(null);
  };

  let instructions = (
    <>
      Open the browser menu and tap <strong className="text-foreground">Install app</strong> or{' '}
      <strong className="text-foreground">Add to Home screen</strong>.
    </>
  );
  if (platform === 'ios') {
    instructions = (
      <>
        Tap <Share className="inline size-3.5 align-[-2px] text-foreground" aria-label="Share" />{' '}
        then <strong className="text-foreground">Add to Home Screen</strong>{' '}
        <SquarePlus className="inline size-3.5 align-[-2px] text-foreground" aria-hidden="true" />
      </>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div
        role="dialog"
        aria-label="Install JiitSphere"
        className="mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-border bg-card/95 p-3 shadow-2xl backdrop-blur"
      >
        <img src="/icon-192.png" alt="" className="size-11 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Get the JiitSphere app</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {installPrompt ? 'Opens full screen from your home screen.' : instructions}
          </p>
        </div>
        {installPrompt ? (
          <Button type="button" size="sm" onClick={install} className="shrink-0">
            <Download className="size-4" />
            Install
          </Button>
        ) : null}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
