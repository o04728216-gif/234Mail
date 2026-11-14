import React, { useEffect, useState } from 'react';
import { Check, Download, Monitor, X } from 'lucide-react';
import { type DesktopInstallPlatform, usePWAInstall } from '../utils/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isDesktop, platform, install, markInstalled } =
    usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [selectedTab, setSelectedTab] = useState<DesktopInstallPlatform>(platform);

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

  // Strictly PC/Mac desktop only — completely hidden on mobile/tablet and hidden once installed
  if (!isDesktop || isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
      return;
    }
    setSelectedTab(platform);
    setShowGuide(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        title="Install 234Mail App on your computer"
        className="hidden lg:inline-flex px-3.5 py-1.5 min-h-[38px] rounded-lg border border-cyan-500/35 bg-cyan-500/10 hover:bg-cyan-500/20 text-xs font-mono font-semibold text-cyan-700 dark:text-cyan-300 items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span>Install App</span>
      </button>

      {showGuide && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-modal-title"
          onClick={() => setShowGuide(false)}
          className="hidden lg:flex fixed inset-0 z-50 items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-[#0d1119] p-6 shadow-2xl space-y-4 text-left"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl border border-cyan-500/35 bg-cyan-500/15 flex items-center justify-center shrink-0">
                  <img
                    src="/favicon.png?v=apple4"
                    alt="234Mail Rocket"
                    className="w-6 h-6 object-contain"
                  />
                </div>
                <div className="min-w-0">
                  <h2
                    id="pwa-install-modal-title"
                    className="text-lg font-bold font-display text-slate-900 dark:text-white"
                  >
                    Install 234Mail App
                  </h2>
                  <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    Install 234Mail directly on your PC or Mac desktop
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

            {/* Desktop Platform Switcher Tabs (PC & Mac Only) */}
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-[#141923] text-xs font-mono">
              {(
                [
                  { id: 'pc' as const, label: 'PC (Windows / Linux)' },
                  { id: 'mac' as const, label: 'Mac (macOS)' },
                ] as const
              ).map((tab) => {
                const active = selectedTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSelectedTab(tab.id)}
                    className={`py-2 px-2.5 rounded-lg font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      active
                        ? 'bg-cyan-500 text-slate-950'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Monitor className="w-3.5 h-3.5 shrink-0" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Step-by-Step Desktop Instructions */}
            <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#121722] p-4 text-xs font-mono text-slate-700 dark:text-slate-200 space-y-2.5 leading-relaxed">
              {selectedTab === 'pc' ? (
                <>
                  <div className="font-bold text-cyan-700 dark:text-cyan-400">
                    Install App on Windows / Linux PC:
                  </div>
                  <p>
                    1. In <strong>Chrome</strong>, <strong>Edge</strong>, or <strong>Brave</strong>,
                    click the <strong>Install</strong> icon on the right side of the address bar.
                  </p>
                  <p>
                    2. Or open the browser menu (<strong>⋮</strong> or <strong>⋯</strong>) →{' '}
                    <strong>Save and Share / Apps</strong> → <strong>Install 234Mail</strong>.
                  </p>
                </>
              ) : (
                <>
                  <div className="font-bold text-cyan-700 dark:text-cyan-400">
                    Install App on Mac:
                  </div>
                  <p>
                    • <strong>Chrome / Edge / Brave:</strong> Click the{' '}
                    <strong>Install 234Mail</strong> icon on the right side of the address bar (or{' '}
                    <strong>⋮ Menu → Save and Share → Install 234Mail…</strong>).
                  </p>
                  <p>
                    • <strong>Safari (macOS):</strong> Click <strong>File</strong> in the top menu
                    bar → <strong>Add to Dock…</strong>.
                  </p>
                </>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  markInstalled();
                  setShowGuide(false);
                }}
                className="min-h-[38px] px-3.5 py-2 rounded-xl border border-emerald-500/35 bg-emerald-500/10 hover:bg-emerald-500/20 text-xs font-mono font-semibold text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>I&apos;ve Installed It</span>
              </button>

              <div className="flex items-center gap-2">
                {isInstallable && (
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await install();
                      if (ok) setShowGuide(false);
                    }}
                    className="min-h-[38px] px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-mono font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Install App</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowGuide(false)}
                  className="min-h-[38px] px-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141a26] hover:bg-slate-100 dark:hover:bg-white/10 text-xs font-mono font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
