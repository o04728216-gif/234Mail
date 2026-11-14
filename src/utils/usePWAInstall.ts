import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export type DesktopInstallPlatform = 'mac' | 'pc';

const INSTALLED_STORAGE_KEY = '234mail_pwa_installed';
const INSTALLED_SYNC_EVENT = '234mail:pwa-installed';

function isMobileOrTabletDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent.toLowerCase();
  const isIPadOS =
    window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1;
  if (
    /iphone|ipad|ipod|android|mobile|webos|blackberry|iemobile|opera mini/.test(ua) ||
    isIPadOS
  ) {
    return true;
  }
  if (window.innerWidth < 1024) {
    return true;
  }
  return false;
}

function detectDesktopPlatform(): DesktopInstallPlatform {
  if (typeof window === 'undefined') return 'pc';
  const ua = window.navigator.userAgent.toLowerCase();
  if (/macintosh|mac os x/.test(ua)) return 'mac';
  return 'pc';
}

function checkIsStandaloneWindow(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function readPersistedInstallFlag(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(INSTALLED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writePersistedInstallFlag(installed: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (installed) {
      window.localStorage.setItem(INSTALLED_STORAGE_KEY, '1');
    } else {
      window.localStorage.removeItem(INSTALLED_STORAGE_KEY);
    }
  } catch {
    // Ignore storage restrictions
  }
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    return checkIsStandaloneWindow() || readPersistedInstallFlag();
  });
  const [isDesktop, setIsDesktop] = useState<boolean>(() => !isMobileOrTabletDevice());
  const [platform, setPlatform] = useState<DesktopInstallPlatform>(() => detectDesktopPlatform());

  const markInstalled = useCallback(() => {
    writePersistedInstallFlag(true);
    setIsInstalled(true);
    setDeferredPrompt(null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(INSTALLED_SYNC_EVENT));
    }
  }, []);

  useEffect(() => {
    const syncViewportAndPlatform = () => {
      setIsDesktop(!isMobileOrTabletDevice());
      setPlatform(detectDesktopPlatform());
    };
    syncViewportAndPlatform();

    const syncInstalledState = () => {
      if (checkIsStandaloneWindow()) {
        writePersistedInstallFlag(true);
        setIsInstalled(true);
        return;
      }
      setIsInstalled(readPersistedInstallFlag());
    };
    syncInstalledState();

    // Check Related Installed Apps API on Chromium desktop when available
    const navWithRelated = window.navigator as Navigator & {
      getInstalledRelatedApps?: () => Promise<Array<{ id?: string; platform?: string; url?: string }>>;
    };
    if (typeof navWithRelated.getInstalledRelatedApps === 'function') {
      navWithRelated
        .getInstalledRelatedApps()
        .then((apps) => {
          if (Array.isArray(apps) && apps.length > 0) {
            markInstalled();
          }
        })
        .catch(() => {});
    }

    const standaloneMq = window.matchMedia('(display-mode: standalone)');
    const wcoMq = window.matchMedia('(display-mode: window-controls-overlay)');
    const handleMediaChange = () => syncInstalledState();
    standaloneMq.addEventListener?.('change', handleMediaChange);
    wcoMq.addEventListener?.('change', handleMediaChange);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      // If Chromium fires beforeinstallprompt, the app is currently NOT installed (or was uninstalled)
      if (!checkIsStandaloneWindow()) {
        writePersistedInstallFlag(false);
        setIsInstalled(false);
      }
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      markInstalled();
    };

    const handleSyncEvent = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('resize', syncViewportAndPlatform);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener(INSTALLED_SYNC_EVENT, handleSyncEvent);

    return () => {
      standaloneMq.removeEventListener?.('change', handleMediaChange);
      wcoMq.removeEventListener?.('change', handleMediaChange);
      window.removeEventListener('resize', syncViewportAndPlatform);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener(INSTALLED_SYNC_EVENT, handleSyncEvent);
    };
  }, [markInstalled]);

  const install = async (): Promise<boolean> => {
    if (!deferredPrompt) return false;
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        markInstalled();
        return true;
      }
    } catch {
      // Fallback to manual instructions if prompt fails
    }
    return false;
  };

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isDesktop,
    platform,
    install,
    markInstalled,
  };
}
