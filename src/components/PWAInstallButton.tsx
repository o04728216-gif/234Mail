import React, { useEffect, useState } from 'react';
import { Download, Monitor, Smartphone, X } from 'lucide-react';
import { type InstallPlatform, usePWAInstall } from '../utils/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'header' | 'sidebar';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'header' }) => {
  const { isInstallable, isInstalled, platform, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [selectedTab, setSelectedTab] = useState<InstallPlatform>(platform);

  useEffect(() => {
    setSelectedTab(platform);
  }, [platform]);

  useEffect(() => {
    if (!showGuide) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowGuide(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showGuide]);

  // Automatically hide once running as an installed Dock / Taskbar / Home Screen app
  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      const installed = await install();
      if (!installed) {
        // User dismissed native dialog; no need to force modal
      }
      return;
    }
    setSelectedTab(platform);
    setShowGuide(true);
  };

  const buttonLabel =
    platform === 'mac'
      ? 'Add to Dock'
      : platform === 'ios' || platform === 'android'
        ? 'Install App'
        : 'Install to Dock';

  return (
    <>
      {variant === 'sidebar' ? (
        <button
          type="button"
          onClick={handleClick}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 h-8 rounded-lg border border-cyan-500/35 bg-cyan-500/10 text-[11px] font-mono font-semibold text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/20 transition-colors cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{buttonLabel}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          title="Install 234Mail to your Mac Dock, PC Taskbar, or Phone Home Screen"
          className="px-2.5 sm:px-3.5 py-1.5 min-h-[38px] rounded-lg border border-cyan-500/35 bg-cyan-500/10 hover:bg-cyan-500/20 text-xs font-mono font-semibold text-cyan-700 dark:text-cyan-300 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">{buttonLabel}</span>
          <span className="sm:hidden">Install</span>
        </button>
      )}

      {showGuide && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-modal-title"
          onClick={() => setShowGuide(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-[#0d1119] p-5 sm:p-6 shadow-2xl space-y-4 text-left"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl border border-cyan-500/35 bg-cyan-500/15 flex items-center justify-center shrink-0">
                  <img
                    src="/favicon.png?v=apple2"
                    alt="234Mail Rocket"
                    className="w-6 h-6 object-contain"
                  />
                </div>
                <div className="min-w-0">
                  <h2
                    id="pwa-install-modal-title"
                    className="text-base sm:text-lg font-bold font-display text-slate-900 dark:text-white"
                  >
                    Install 234Mail App
                  </h2>
                  <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    Pin to Mac Dock, PC Taskbar, or Mobile Home Screen
                  </p>
                </div>
              </div>

              <button
                type="button"
                aria-label="Close install guide"
                onClick={() => setShowGuide(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Device Switcher Tabs */}
            <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#141923] text-[11px] font-mono">
              {(
                [
                  { id: 'mac' as const, label: 'Mac', icon: Monitor },
                  { id: 'pc' as const, label: 'PC', icon: Monitor },
                  { id: 'ios' as const, label: 'iOS', icon: Smartphone },
                  { id: 'android' as const, label: 'Android', icon: Smartphone },
                ] as const
              ).map((tab) => {
                const Icon = tab.icon;
                const active = selectedTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSelectedTab(tab.id)}
                    className={`py-2 px-1.5 rounded-lg font-semibold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                      active
                        ? 'bg-cyan-500 text-slate-950'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon className="w-3 h-3 shrink-0" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Step-by-Step Instructions */}
            <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#121722] p-4 text-xs font-mono text-slate-700 dark:text-slate-200 space-y-2.5 leading-relaxed">
              {selectedTab === 'mac' && (
                <>
                  <div className="font-bold text-cyan-700 dark:text-cyan-400">
                    Add to macOS Dock:
                  </div>
                  <p>
                    • <strong>Safari (macOS):</strong> Click <strong>File</strong> in the top menu
                    bar → <strong>Add to Dock…</strong> (or click the <strong>Share</strong> button
                    → <strong>Add to Dock</strong>).
                  </p>
                  <p>
                    • <strong>Chrome / Edge / Brave:</strong> Click the{' '}
                    <strong>Install 234Mail</strong> icon on the right side of the address bar (or{' '}
                    <strong>⋮ Menu → Save and Share → Install 234Mail…</strong>).
                  </p>
                </>
              )}

              {selectedTab === 'pc' && (
                <>
                  <div className="font-bold text-cyan-700 dark:text-cyan-400">
                    Pin to Windows / Linux Taskbar &amp; Desktop:
                  </div>
                  <p>
                    1. In <strong>Chrome</strong> or <strong>Microsoft Edge</strong>, click the{' '}
                    <strong>Install</strong> icon on the right side of the address bar.
                  </p>
                  <p>
                    2. Or open the browser menu (<strong>⋮</strong> or <strong>⋯</strong>) →{' '}
                    <strong>Save and Share / Apps</strong> → <strong>Install 234Mail</strong>, then
                    check <strong>Pin to taskbar</strong>.
                  </p>
                </>
              )}

              {selectedTab === 'ios' && (
                <>
                  <div className="font-bold text-cyan-700 dark:text-cyan-400">
                    Add to iPhone / iPad Home Screen:
                  </div>
                  <p>
                    1. Open 234Mail in <strong>Safari</strong> and tap the <strong>Share</strong>{' '}
                    button in the toolbar.
                  </p>
                  <p>
                    2. Scroll down and tap <strong>Add to Home Screen</strong>, then tap{' '}
                    <strong>Add</strong>.
                  </p>
                </>
              )}

              {selectedTab === 'android' && (
                <>
                  <div className="font-bold text-cyan-700 dark:text-cyan-400">
                    Add to Android Home Screen:
                  </div>
                  <p>
                    1. Tap the <strong>⋮ Menu</strong> button in the top-right corner of Chrome.
                  </p>
                  <p>
                    2. Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>, then
                    confirm <strong>Install</strong>.
                  </p>
                </>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              {isInstallable && (
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await install();
                    if (ok) setShowGuide(false);
                  }}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-mono font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Install Now</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141a26] hover:bg-slate-100 dark:hover:bg-white/10 text-xs font-mono font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
