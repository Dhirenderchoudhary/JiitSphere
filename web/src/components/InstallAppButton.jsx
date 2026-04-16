'use client';

import { useEffect, useMemo, useState } from 'react';
import { Smartphone, Share2 } from 'lucide-react';
import { Button } from 'components/ui/button';
import { toast } from 'sonner';

const isIosUserAgent = (userAgent = '') => /iphone|ipad|ipod/i.test(userAgent);
const isSafariBrowser = (userAgent = '') => /safari/i.test(userAgent) && !/crios|fxios|edgios|android/i.test(userAgent);

export default function InstallAppButton({ className = '' }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isIosSafari, setIsIosSafari] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const userAgent = window.navigator.userAgent || '';
    const standaloneMatch = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    setIsStandalone(standaloneMatch);
    setIsIosSafari(isIosUserAgent(userAgent) && isSafariBrowser(userAgent));

    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
      
      // Proactive invite via Toast
      toast("Install JiitSphere App", {
        description: "Experience JiitSphere as a native app on your home screen.",
        action: {
          label: "Install Now",
          onClick: () => {
             event.prompt();
             setDeferredPrompt(null);
          }
        },
        duration: 10000
      });
    };

    const onInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
      toast.success("App installed successfully! Enjoy JiitSphere.");
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const shouldRender = useMemo(() => !isStandalone, [isStandalone]);

  const handleInstall = async () => {
    // If we have the native prompt, show a toast to trigger it
    if (deferredPrompt) {
      toast("Ready to Install?", {
        description: "This will add JiitSphere to your home screen or dock.",
        action: {
          label: "Install",
          onClick: () => {
             deferredPrompt.prompt();
             setDeferredPrompt(null);
          }
        }
      });
      return;
    }

    if (isIosSafari) {
      toast.info("Install on iOS", {
        description: 'Tap the Share icon, then scroll down and select "Add to Home Screen".',
        duration: 8000
      });
      return;
    }

    toast.info("Installation", {
      description: 'Open your browser menu and choose "Install app" or "Add to Home screen" to continue.',
      duration: 6000
    });
  };

  if (!shouldRender) return null;

  return (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      onClick={handleInstall}
      className={className}
      aria-label="Install app"
      title="Install app"
    >
      <Smartphone className="h-4 w-4" />
    </Button>
  );
}
