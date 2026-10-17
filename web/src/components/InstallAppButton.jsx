'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, Share2 } from 'lucide-react';
import { Button } from 'components/ui/button';

const isIosUserAgent = (userAgent = '') => /iphone|ipad|ipod/i.test(userAgent);
const isSafariBrowser = (userAgent = '') =>
  /safari/i.test(userAgent) && !/crios|fxios|edgios|android/i.test(userAgent);

// The browser's install prompt can be shown once. The navbar button and the
// phone banner both hold it, so whichever uses it tells the other to let go.
export const INSTALL_PROMPT_USED = 'jiitsphere-install-prompt-used';

export default function InstallAppButton({ className = '' }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [hintOpen, setHintOpen] = useState(false);
  const [hintText, setHintText] = useState('');
  const [isIosSafari, setIsIosSafari] = useState(false);
  const [isStandalone, setIsStandalone] = useState(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );
  });

  useEffect(() => {
    const userAgent = window.navigator.userAgent || '';
    setIsIosSafari(isIosUserAgent(userAgent) && isSafariBrowser(userAgent));

    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
    };

    const onInstalled = () => {
      setDeferredPrompt(null);
      setHintOpen(false);
      setIsStandalone(true);
    };

    const onPromptUsed = () => setDeferredPrompt(null);

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener(INSTALL_PROMPT_USED, onPromptUsed);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener(INSTALL_PROMPT_USED, onPromptUsed);
    };
  }, []);

  const shouldRender = useMemo(() => !isStandalone, [isStandalone]);

  const handleInstall = async () => {
    if (deferredPrompt) {
      window.dispatchEvent(new Event(INSTALL_PROMPT_USED));
      try {
        await deferredPrompt.prompt();
      } catch {
        setDeferredPrompt(null);
        return;
      }
      const choice = await deferredPrompt.userChoice;
      if (choice?.outcome === 'accepted') {
        setDeferredPrompt(null);
      }
      return;
    }

    if (isIosSafari) {
      setHintText('On iPhone/iPad Safari: tap Share, then "Add to Home Screen".');
      setHintOpen((prev) => !prev);
      return;
    }

    setHintText('Open browser menu and choose "Install app" or "Add to Home screen".');
    setHintOpen((prev) => !prev);
  };

  if (!shouldRender) return null;

  return (
    <div className="relative">
      <Button
        type="button"
        variant="secondary"
        size="icon"
        onClick={handleInstall}
        className={className}
        aria-label="Install app"
        title="Install app"
      >
        <Download className="size-4" />
      </Button>
      {hintOpen ? (
        <div className="absolute right-0 top-12 z-40 w-64 rounded-xl border border-border bg-card/95 p-3 text-xs text-muted-foreground shadow-lg backdrop-blur">
          <p className="font-semibold text-foreground">Install this app</p>
          <p className="mt-1">{hintText}</p>
          {isIosSafari ? (
            <p className="mt-2 inline-flex items-center gap-1.5 text-foreground">
              <Share2 className="size-[3.5]" />
              Use Safari Share menu
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
