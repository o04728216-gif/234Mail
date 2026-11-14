import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  BarChart2,
  Clock,
  CreditCard,
  FileText,
  Inbox,
  LogOut,
  Mail,
  Menu,
  Send,
  Settings,
  User,
  X,
  Zap,
} from 'lucide-react';
import { AdminDashboardView, AdminLoginView } from './components/AdminDashboardView';
import { ComposeEmailView, QueueMonitorView } from './components/ComposeAndQueueView';
import {
  AccountAndSubscriptionView,
  SmtpSettingsView,
} from './components/InfrastructureAndAccountViews';
import { LandingAuthView } from './components/LandingAuthView';
import {
  DraftsView,
  InboxView,
  SentCampaignsView,
  TrackingView,
} from './components/MailboxAndTrackingViews';
import { OverviewView } from './components/OverviewAndAnalytics';
import { PWAInstallButton } from './components/PWAInstallButton';
import { LANGUAGE_LABELS, THEME_OPTIONS, t } from './i18n';
import type {
  AdminResetSmtpConfig,
  DashboardSnapshot,
  DeliveryErrorLog,
  DraftItem,
  InboxMessage,
  InboxSyncInfo,
  LanguageCode,
  PlatformSettings,
  QueueJob,
  SmtpConfig,
  ThemeId,
  TrackingRecord,
  UserProfile,
} from './types';
import { apiRequest } from './utils/api';

type WorkspaceTab =
  | 'overview'
  | 'compose'
  | 'queue'
  | 'inbox'
  | 'sent'
  | 'drafts'
  | 'smtp'
  | 'account'
  | 'subscription'
  | 'tracking';

const STORAGE_TOKEN_KEY = '234mail_session_token';
const STORAGE_ADMIN_RETURN_KEY = '234mail_admin_return_token';
const STORAGE_THEME_KEY = '234mail_theme';
const STORAGE_LEGACY_DARK_KEY = '234mail_dark_mode';
const STORAGE_LANG_KEY = '234mail_lang';

const VALID_THEME_IDS = new Set<ThemeId>([
  'dark',
  'light',
  'red',
  'gold',
  'green',
  'blue',
  'silver',
]);

function isValidThemeId(val: unknown): val is ThemeId {
  return typeof val === 'string' && VALID_THEME_IDS.has(val as ThemeId);
}

function getUserThemeStorageKey(userId: string): string {
  return `234mail_user_theme_${userId}`;
}

function userIsPaidAndActive(user: UserProfile): boolean {
  return (
    user.role === 'admin' ||
    (user.subscriptionStatus === 'active' &&
      user.daysLeft > 0 &&
      (user.paymentsCount || 0) > 0)
  );
}

function userCanAccessWorkspace(user: UserProfile): boolean {
  return user.subscriptionStatus !== 'suspended';
}

function checkIsAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

export default function App() {
  const [routePath, setRoutePath] = useState<string>(() => window.location.pathname);
  const [resetTokenParam, setResetTokenParam] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get('reset_token')
  );

  const navigateTo = useCallback((nextPath: string) => {
    const url = new URL(nextPath, window.location.origin);
    const full = `${url.pathname}${url.search}`;
    if (`${window.location.pathname}${window.location.search}` !== full) {
      window.history.pushState({}, '', full);
    }
    setRoutePath(url.pathname);
    setResetTokenParam(url.searchParams.get('reset_token'));
  }, []);

  const clearResetTokenParam = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('reset_token');
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
    setResetTokenParam(null);
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setRoutePath(window.location.pathname);
      setResetTokenParam(new URLSearchParams(window.location.search).get('reset_token'));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const isAdminRoute = checkIsAdminPath(routePath);

  const [theme, setTheme] = useState<ThemeId>(() => {
    const savedTheme = localStorage.getItem(STORAGE_THEME_KEY);
    if (isValidThemeId(savedTheme)) {
      return savedTheme;
    }
    const legacyDark = localStorage.getItem(STORAGE_LEGACY_DARK_KEY);
    return legacyDark === 'false' ? 'light' : 'dark';
  });

  const [lang, setLang] = useState<LanguageCode>(() => {
    const saved = localStorage.getItem(STORAGE_LANG_KEY) as LanguageCode | null;
    return saved && LANGUAGE_LABELS[saved] ? saved : 'en';
  });

  const [token, setToken] = useState<string | null>(() => localStorage.getItem(STORAGE_TOKEN_KEY));
  const [adminReturnToken, setAdminReturnToken] = useState<string | null>(() =>
    sessionStorage.getItem(STORAGE_ADMIN_RETURN_KEY)
  );
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [booting, setBooting] = useState<boolean>(() =>
    Boolean(localStorage.getItem(STORAGE_TOKEN_KEY))
  );
  const [loggedOutMessage, setLoggedOutMessage] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('compose');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [draftToEdit, setDraftToEdit] = useState<DraftItem | null>(null);

  useEffect(() => {
    if (resetTokenParam) {
      localStorage.removeItem(STORAGE_TOKEN_KEY);
      sessionStorage.removeItem(STORAGE_ADMIN_RETURN_KEY);
      setAdminReturnToken(null);
      setToken(null);
      setSnapshot(null);
      setBooting(false);
    }
  }, [resetTokenParam]);

  useEffect(() => {
    const isLoggedIn = Boolean(token && snapshot && !resetTokenParam);
    const effectiveTheme: ThemeId = isLoggedIn ? theme : 'dark';
    const isDarkSurface = effectiveTheme !== 'light';
    document.documentElement.classList.toggle('dark', isDarkSurface);
    document.documentElement.setAttribute('data-theme', effectiveTheme);
    if (isLoggedIn) {
      localStorage.setItem(STORAGE_THEME_KEY, theme);
      localStorage.setItem(STORAGE_LEGACY_DARK_KEY, String(isDarkSurface));
    }
  }, [theme, token, snapshot, resetTokenParam]);

  useEffect(() => {
    localStorage.setItem(STORAGE_LANG_KEY, lang);
  }, [lang]);

  const applyUserPreferences = useCallback(
    (user: UserProfile, authToken?: string | null) => {
      const localUserTheme = localStorage.getItem(getUserThemeStorageKey(user.id));
      const resolvedTheme: ThemeId | null = isValidThemeId(user.theme)
        ? user.theme
        : isValidThemeId(localUserTheme)
          ? localUserTheme
          : null;

      if (resolvedTheme) {
        setTheme(resolvedTheme);
        localStorage.setItem(getUserThemeStorageKey(user.id), resolvedTheme);
        if (!user.theme && authToken) {
          void apiRequest(
            '/api/account/preferences',
            {
              method: 'PATCH',
              body: JSON.stringify({ theme: resolvedTheme }),
            },
            authToken
          ).catch(() => {});
        }
      }

      if (user.preferredLanguage && LANGUAGE_LABELS[user.preferredLanguage]) {
        setLang(user.preferredLanguage);
      }
    },
    []
  );

  const handleSelectTheme = useCallback(
    (nextTheme: ThemeId) => {
      if (!isValidThemeId(nextTheme)) return;
      setTheme(nextTheme);
      if (snapshot?.user) {
        localStorage.setItem(getUserThemeStorageKey(snapshot.user.id), nextTheme);
        setSnapshot((prev) =>
          prev
            ? {
                ...prev,
                user: { ...prev.user, theme: nextTheme },
              }
            : prev
        );
      }
      if (token) {
        void apiRequest<{ user: UserProfile }>(
          '/api/account/preferences',
          {
            method: 'PATCH',
            body: JSON.stringify({ theme: nextTheme }),
          },
          token
        ).catch(() => {});
      }
    },
    [snapshot?.user, token]
  );

  const handleSelectLanguage = useCallback(
    (nextLang: LanguageCode) => {
      if (!LANGUAGE_LABELS[nextLang]) return;
      setLang(nextLang);
      if (snapshot?.user) {
        setSnapshot((prev) =>
          prev
            ? {
                ...prev,
                user: { ...prev.user, preferredLanguage: nextLang },
              }
            : prev
        );
      }
      if (token) {
        void apiRequest<{ user: UserProfile }>(
          '/api/account/preferences',
          {
            method: 'PATCH',
            body: JSON.stringify({ preferredLanguage: nextLang }),
          },
          token
        ).catch(() => {});
      }
    },
    [snapshot?.user, token]
  );

  const fetchBootstrap = useCallback(
    async (authToken: string) => {
      try {
        const data = await apiRequest<DashboardSnapshot>('/api/bootstrap', {}, authToken);
        setSnapshot(data);
        applyUserPreferences(data.user, authToken);
        if (!userCanAccessWorkspace(data.user)) {
          setActiveTab('subscription');
        }
      } catch {
        localStorage.removeItem(STORAGE_TOKEN_KEY);
        sessionStorage.removeItem(STORAGE_ADMIN_RETURN_KEY);
        setAdminReturnToken(null);
        setToken(null);
        setSnapshot(null);
      } finally {
        setBooting(false);
      }
    },
    [applyUserPreferences]
  );

  useEffect(() => {
    if (token && !snapshot) {
      void fetchBootstrap(token);
    } else {
      setBooting(false);
    }
  }, [token, snapshot, fetchBootstrap]);

  // Live WebSocket updates for sending progress, tracking opens, admin user updates, and SMTP inbox sync
  useEffect(() => {
    if (!token) return;

    let ws: WebSocket | null = null;
    let reconnectTimeout: number | undefined;
    let unmounted = false;

    const connect = () => {
      if (unmounted) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${protocol}//${window.location.host}/api/ws?token=${encodeURIComponent(token)}`);

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data) as { event: string; payload: unknown };
          setSnapshot((prev) => {
            if (!prev) return prev;
            switch (msg.event) {
              case 'job:created': {
                const incoming = msg.payload as QueueJob;
                if (prev.jobs.some((j) => j.id === incoming.id)) return prev;
                return { ...prev, jobs: [incoming, ...prev.jobs] };
              }
              case 'job:updated': {
                const updated = msg.payload as QueueJob;
                return {
                  ...prev,
                  jobs: prev.jobs.map((j) => (j.id === updated.id ? updated : j)),
                };
              }
              case 'tracking:updated': {
                const rec = msg.payload as TrackingRecord;
                const exists = prev.tracking.some((r) => r.id === rec.id);
                return {
                  ...prev,
                  tracking: exists
                    ? prev.tracking.map((r) => (r.id === rec.id ? rec : r))
                    : [rec, ...prev.tracking],
                };
              }
              case 'user:updated': {
                const updatedUser = msg.payload as UserProfile;
                return {
                  ...prev,
                  user: prev.user.id === updatedUser.id ? updatedUser : prev.user,
                  users: prev.users.map((u) => (u.id === updatedUser.id ? updatedUser : u)),
                };
              }
              case 'users:updated': {
                if (prev.user.role !== 'admin') return prev;
                const updatedList = msg.payload as UserProfile[];
                const updatedSelf = updatedList.find((u) => u.id === prev.user.id);
                return {
                  ...prev,
                  user: updatedSelf || prev.user,
                  users: updatedList,
                };
              }
              case 'settings:updated': {
                const platformSettings = msg.payload as PlatformSettings;
                return {
                  ...prev,
                  platformSettings,
                };
              }
              case 'adminResetSmtp:updated': {
                if (prev.user.role !== 'admin') return prev;
                const adminResetSmtp = msg.payload as AdminResetSmtpConfig;
                return {
                  ...prev,
                  adminResetSmtp,
                };
              }
              case 'inbox:synced': {
                const synced = msg.payload as {
                  inbox: InboxMessage[];
                  inboxSync: InboxSyncInfo;
                };
                return {
                  ...prev,
                  inbox: synced.inbox,
                  inboxSync: synced.inboxSync,
                };
              }
              case 'smtpPool:updated': {
                const updatedPool = msg.payload as {
                  smtp: SmtpConfig;
                  smtpPool: SmtpConfig[];
                };
                return {
                  ...prev,
                  smtp: updatedPool.smtp,
                  smtpPool: updatedPool.smtpPool,
                };
              }
              case 'error:logged': {
                const errEntry = msg.payload as DeliveryErrorLog;
                if (prev.errors.some((e) => e.id === errEntry.id)) return prev;
                return {
                  ...prev,
                  errors: [errEntry, ...prev.errors].slice(0, 200),
                };
              }
              case 'jobs:deleted': {
                const { jobIds } = msg.payload as { jobIds: string[] };
                const idSet = new Set(jobIds);
                return {
                  ...prev,
                  jobs: prev.jobs.filter((j) => !idSet.has(j.id)),
                  errors: prev.errors.filter((e) => !idSet.has(e.jobId)),
                  tracking: prev.tracking.filter((r) => !idSet.has(r.jobId)),
                };
              }
              default:
                return prev;
            }
          });
        } catch {
          // Ignore malformed frame
        }
      };

      ws.onclose = () => {
        if (!unmounted) {
          reconnectTimeout = window.setTimeout(connect, 2000);
        }
      };
    };

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimeout) window.clearTimeout(reconnectTimeout);
      ws?.close();
    };
  }, [token]);

  const handleAuthenticated = (newToken: string, initialSnapshot: DashboardSnapshot) => {
    localStorage.setItem(STORAGE_TOKEN_KEY, newToken);
    sessionStorage.removeItem(STORAGE_ADMIN_RETURN_KEY);
    setAdminReturnToken(null);
    setToken(newToken);
    setSnapshot(initialSnapshot);
    applyUserPreferences(initialSnapshot.user, newToken);
    setLoggedOutMessage(null);
    if (!userCanAccessWorkspace(initialSnapshot.user)) {
      setActiveTab('subscription');
    } else {
      setActiveTab('compose');
    }
  };

  const handleImpersonateUser = (
    impersonatedToken: string,
    impersonatedSnapshot: DashboardSnapshot
  ) => {
    if (token && !adminReturnToken) {
      sessionStorage.setItem(STORAGE_ADMIN_RETURN_KEY, token);
      setAdminReturnToken(token);
    }
    localStorage.setItem(STORAGE_TOKEN_KEY, impersonatedToken);
    setToken(impersonatedToken);
    setSnapshot(impersonatedSnapshot);
    applyUserPreferences(impersonatedSnapshot.user, impersonatedToken);
    setActiveTab(
      userCanAccessWorkspace(impersonatedSnapshot.user) ? 'compose' : 'subscription'
    );
    navigateTo('/');
  };

  const handleReturnToAdmin = async () => {
    if (!adminReturnToken) return;
    setBooting(true);
    try {
      const adminSnap = await apiRequest<DashboardSnapshot>(
        '/api/bootstrap',
        {},
        adminReturnToken
      );
      localStorage.setItem(STORAGE_TOKEN_KEY, adminReturnToken);
      sessionStorage.removeItem(STORAGE_ADMIN_RETURN_KEY);
      setToken(adminReturnToken);
      setAdminReturnToken(null);
      setSnapshot(adminSnap);
      applyUserPreferences(adminSnap.user, adminReturnToken);
      navigateTo('/admin');
    } catch {
      sessionStorage.removeItem(STORAGE_ADMIN_RETURN_KEY);
      setAdminReturnToken(null);
    } finally {
      setBooting(false);
    }
  };

  const handleLogout = async () => {
    if (token) {
      try {
        await apiRequest('/api/auth/logout', { method: 'POST' }, token);
      } catch {
        // Ignore network error on logout
      }
    }
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    sessionStorage.removeItem(STORAGE_ADMIN_RETURN_KEY);
    setAdminReturnToken(null);
    setToken(null);
    setSnapshot(null);
    setLoggedOutMessage('You have been logged out successfully.');
  };

  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center esp-grid-bg bg-slate-50 dark:bg-[#07090e] text-sm font-mono text-slate-500">
        Loading 234Mail...
      </div>
    );
  }

  // ============================================================================
  // DEDICATED /admin ROUTE (Separate Full-Page Admin Link)
  // ============================================================================
  if (isAdminRoute) {
    if (resetTokenParam || !token || !snapshot || snapshot.user.role !== 'admin') {
      return (
        <AdminLoginView
          currentNonAdminUsername={snapshot?.user.username || null}
          resetToken={resetTokenParam}
          onClearResetToken={clearResetTokenParam}
          onNavigateUrl={navigateTo}
          onAuthenticatedAdmin={(adminToken, adminSnap) => {
            clearResetTokenParam();
            localStorage.setItem(STORAGE_TOKEN_KEY, adminToken);
            sessionStorage.removeItem(STORAGE_ADMIN_RETURN_KEY);
            setAdminReturnToken(null);
            setToken(adminToken);
            setSnapshot(adminSnap);
            applyUserPreferences(adminSnap.user, adminToken);
            setLoggedOutMessage(null);
          }}
          onNavigateHome={() => navigateTo('/')}
        />
      );
    }

    return (
      <div className="min-h-[100dvh] flex flex-col bg-slate-50 text-slate-900 dark:bg-[#07090e] dark:text-slate-100 transition-colors">
        <header className="min-h-14 shrink-0 px-3.5 sm:px-6 lg:px-10 py-2 border-b border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#090c13] flex items-center justify-between gap-2 sm:gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
            <a
              href="/"
              onClick={(e) => {
                if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                  e.preventDefault();
                  navigateTo('/');
                }
              }}
              className="text-base sm:text-lg font-extrabold font-display tracking-tight whitespace-nowrap shrink-0"
            >
              <span className="text-slate-900 dark:text-white">234</span>
              <span className="text-cyan-600 dark:text-cyan-400">Mail</span>
            </a>

            <a
              href="/"
              onClick={(e) => {
                if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                  e.preventDefault();
                  navigateTo('/');
                }
              }}
              className="text-xs font-mono text-slate-500 dark:text-slate-400 hover:text-cyan-500 dark:hover:text-cyan-400 transition-colors whitespace-nowrap truncate"
            >
              <span className="sm:hidden">← Mail</span>
              <span className="hidden sm:inline">← Open Mail App</span>
            </a>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 text-xs font-mono shrink-0">
            <PWAInstallButton />
            <select
              aria-label="Admin Theme"
              value={theme}
              onChange={(e) => handleSelectTheme(e.target.value as ThemeId)}
              className="esp-compact-select h-7 w-[92px] sm:w-[112px] px-1.5 py-0.5 rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121722] text-[11px] font-mono text-slate-700 dark:text-slate-200 truncate cursor-pointer"
            >
              {THEME_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {t(lang, opt.labelKey)}
                </option>
              ))}
            </select>
            <select
              aria-label="Admin Language"
              value={lang}
              onChange={(e) => handleSelectLanguage(e.target.value as LanguageCode)}
              className="esp-compact-select h-7 w-[78px] sm:w-[92px] px-1.5 py-0.5 rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121722] text-[11px] font-mono text-slate-700 dark:text-slate-200 truncate cursor-pointer"
            >
              {(Object.keys(LANGUAGE_LABELS) as LanguageCode[]).map((code) => (
                <option key={code} value={code}>
                  {LANGUAGE_LABELS[code]}
                </option>
              ))}
            </select>

            <span className="hidden md:inline-flex px-3 py-1.5 rounded-full border border-rose-500/35 bg-rose-500/10 text-rose-600 dark:text-rose-400 font-semibold items-center gap-1.5">
              <Settings className="w-3.5 h-3.5" />
              <span>Admin</span>
            </span>

            <button
              type="button"
              onClick={handleLogout}
              className="px-2.5 sm:px-3.5 py-1.5 min-h-[38px] rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1118] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white whitespace-nowrap cursor-pointer"
            >
              {t(lang, 'logout')}
            </button>
          </div>
        </header>

        <main className="flex-1 esp-grid-bg p-3.5 sm:p-6 lg:p-8 xl:px-12 overflow-y-auto">
          <div className="max-w-[1480px] w-full mx-auto">
            <AdminDashboardView
              token={token}
              snapshot={snapshot}
              onUsersUpdated={(users, updatedSelf) =>
                setSnapshot((prev) =>
                  prev
                    ? {
                        ...prev,
                        users,
                        user: updatedSelf || prev.user,
                      }
                    : prev
                )
              }
              onPlatformSettingsUpdated={(platformSettings) =>
                setSnapshot((prev) => (prev ? { ...prev, platformSettings } : prev))
              }
              onAdminResetSmtpUpdated={(adminResetSmtp) =>
                setSnapshot((prev) => (prev ? { ...prev, adminResetSmtp } : prev))
              }
              onImpersonateUser={handleImpersonateUser}
            />
          </div>
        </main>
      </div>
    );
  }

  // ============================================================================
  // REGULAR USER APP ROUTE (/)
  // ============================================================================
  if (resetTokenParam || !token || !snapshot) {
    return (
      <LandingAuthView
        loggedOutMessage={loggedOutMessage}
        onDismissLoggedOutMessage={() => setLoggedOutMessage(null)}
        resetToken={resetTokenParam}
        onClearResetToken={clearResetTokenParam}
        onNavigateUrl={navigateTo}
        onAuthenticated={(newTok, snap) => {
          clearResetTokenParam();
          handleAuthenticated(newTok, snap);
        }}
      />
    );
  }

  const isPaidAndActive = userIsPaidAndActive(snapshot.user);
  const canAccessWorkspace = userCanAccessWorkspace(snapshot.user);

  const renderImpersonationBanner = () =>
    adminReturnToken ? (
      <div className="px-3.5 sm:px-4 py-2 bg-cyan-500/15 border-b border-cyan-500/30 flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-cyan-800 dark:text-cyan-200">
        <span className="truncate">
          Viewing user: <strong>{snapshot.user.username}</strong> (#{snapshot.user.userNumber})
        </span>
        <button
          type="button"
          onClick={handleReturnToAdmin}
          className="px-2.5 py-1 min-h-[34px] rounded-lg bg-cyan-500 text-slate-950 font-bold inline-flex items-center gap-1.5 hover:opacity-95 whitespace-nowrap cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Exit Preview</span>
        </button>
      </div>
    ) : null;

  // ============================================================================
  // IMMEDIATE PAYMENT PAGE GATE FOR EXPIRED OR SUSPENDED ACCOUNTS
  // ============================================================================
  if (!canAccessWorkspace) {
    return (
      <div className="min-h-[100dvh] flex flex-col bg-slate-50 text-slate-900 dark:bg-[#07090e] dark:text-slate-100 transition-colors">
        {renderImpersonationBanner()}
        <header className="min-h-14 shrink-0 px-3.5 sm:px-6 lg:px-8 py-2 border-b border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#090c13] flex items-center justify-between gap-2 sm:gap-4 sticky top-0 z-30">
          <div className="text-base sm:text-lg font-extrabold font-display tracking-tight whitespace-nowrap shrink-0">
            <span className="text-slate-900 dark:text-white">234</span>
            <span className="text-cyan-600 dark:text-cyan-400">Mail</span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 text-xs font-mono shrink-0">
            <PWAInstallButton />
            <select
              aria-label="Theme"
              value={theme}
              onChange={(e) => handleSelectTheme(e.target.value as ThemeId)}
              className="esp-compact-select h-7 w-[92px] sm:w-[112px] px-1.5 py-0.5 rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121722] text-[11px] font-mono text-slate-700 dark:text-slate-200 truncate cursor-pointer"
            >
              {THEME_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {t(lang, opt.labelKey)}
                </option>
              ))}
            </select>
            <select
              aria-label="Language"
              value={lang}
              onChange={(e) => handleSelectLanguage(e.target.value as LanguageCode)}
              className="esp-compact-select h-7 w-[78px] sm:w-[92px] px-1.5 py-0.5 rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121722] text-[11px] font-mono text-slate-700 dark:text-slate-200 truncate cursor-pointer"
            >
              {(Object.keys(LANGUAGE_LABELS) as LanguageCode[]).map((code) => (
                <option key={code} value={code}>
                  {LANGUAGE_LABELS[code]}
                </option>
              ))}
            </select>
            <span className="hidden xs:inline-block px-2 py-1 rounded-md border border-rose-500/35 bg-rose-500/10 text-rose-600 dark:text-rose-400 font-semibold uppercase text-[10px] sm:text-xs">
              {snapshot.user.subscriptionStatus}
            </span>
            <span className="hidden sm:inline text-slate-700 dark:text-slate-300 max-w-[140px] truncate">
              {snapshot.user.username}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="px-2.5 sm:px-3 py-1.5 min-h-[38px] rounded-lg border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white whitespace-nowrap cursor-pointer"
            >
              {t(lang, 'logout')}
            </button>
          </div>
        </header>

        <main className="flex-1 esp-grid-bg p-3.5 sm:p-8 lg:p-10 overflow-y-auto">
          <AccountAndSubscriptionView
            mode="subscription"
            token={token}
            snapshot={snapshot}
            onCurrentUserUpdated={(updatedUser) => {
              setSnapshot((prev) =>
                prev
                  ? {
                      ...prev,
                      user: updatedUser,
                      users: prev.users.map((u) => (u.id === updatedUser.id ? updatedUser : u)),
                    }
                  : prev
              );
              if (userCanAccessWorkspace(updatedUser)) {
                setActiveTab('compose');
              }
            }}
          />
        </main>
      </div>
    );
  }

  const runningCount = snapshot.jobs.filter(
    (j) => j.status === 'running' || j.status === 'scheduled'
  ).length;
  const unreadInbox = snapshot.inbox.filter((m) => m.unread).length;

  const navGroups: {
    group: string;
    items: {
      id: WorkspaceTab;
      label: string;
      icon: React.ComponentType<{ className?: string }>;
      count?: number;
    }[];
  }[] = [
    {
      group: 'Main',
      items: [{ id: 'overview', label: t(lang, 'overview'), icon: Zap }],
    },
    {
      group: 'Compose',
      items: [
        { id: 'compose', label: t(lang, 'sendEmail'), icon: Mail },
        { id: 'queue', label: t(lang, 'queueJobs'), icon: Clock, count: runningCount || undefined },
      ],
    },
    {
      group: 'Mailbox',
      items: [
        { id: 'inbox', label: t(lang, 'inbox'), icon: Inbox, count: unreadInbox || undefined },
        { id: 'sent', label: t(lang, 'sent'), icon: Send },
        {
          id: 'drafts',
          label: t(lang, 'drafts'),
          icon: FileText,
          count: snapshot.drafts.length || undefined,
        },
      ],
    },
    {
      group: 'Settings',
      items: [
        { id: 'smtp', label: t(lang, 'smtpSettings'), icon: Settings },
        { id: 'account', label: t(lang, 'account'), icon: User },
        { id: 'subscription', label: t(lang, 'subscription'), icon: CreditCard },
      ],
    },
    {
      group: 'System',
      items: [{ id: 'tracking', label: t(lang, 'tracking'), icon: BarChart2 }],
    },
  ];

  const selectTab = (tab: WorkspaceTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full justify-between px-3.5 py-4 overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-0.5">
        {navGroups.map((grp) => (
          <div key={grp.group}>
            <div className="px-3 mb-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {grp.group}
            </div>
            <div className="space-y-1.5">
              {grp.items.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectTab(item.id)}
                    className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl text-xs font-mono transition-colors whitespace-nowrap cursor-pointer ${
                      active
                        ? 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.04] hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 truncate">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {typeof item.count === 'number' && item.count > 0 && (
                      <span className="font-mono tabular-nums text-[11px] text-cyan-600 dark:text-cyan-400">
                        {item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Pinned Bottom Controls: Compact Side-by-Side Theme & Language, Followed by Logout */}
      <div className="shrink-0 pt-2.5 mt-2.5 border-t border-slate-200 dark:border-white/[0.07] space-y-2">
        <div className="grid grid-cols-2 gap-1.5">
          <div className="min-w-0">
            <label
              htmlFor="sidebar-theme-select"
              className="flex items-center justify-between text-[9px] font-mono uppercase tracking-wider text-slate-400 mb-0.5 px-0.5"
            >
              <span className="truncate">Theme</span>
              <span className="w-2 h-2 rounded-full bg-cyan-500 border border-slate-300 dark:border-white/20 shrink-0" />
            </label>
            <select
              id="sidebar-theme-select"
              value={theme}
              onChange={(e) => handleSelectTheme(e.target.value as ThemeId)}
              className="esp-compact-select w-full h-7 px-1.5 py-0.5 rounded-md border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#121722] text-[11px] font-mono text-slate-800 dark:text-slate-200 truncate cursor-pointer"
            >
              {THEME_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {t(lang, opt.labelKey)}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-0">
            <label
              htmlFor="sidebar-lang-select"
              className="block text-[9px] font-mono uppercase tracking-wider text-slate-400 mb-0.5 px-0.5 truncate"
            >
              Language
            </label>
            <select
              id="sidebar-lang-select"
              value={lang}
              onChange={(e) => handleSelectLanguage(e.target.value as LanguageCode)}
              className="esp-compact-select w-full h-7 px-1.5 py-0.5 rounded-md border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#121722] text-[11px] font-mono text-slate-800 dark:text-slate-200 truncate cursor-pointer"
            >
              {(Object.keys(LANGUAGE_LABELS) as LanguageCode[]).map((code) => (
                <option key={code} value={code}>
                  {LANGUAGE_LABELS[code]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 h-8 rounded-lg border border-rose-500/25 bg-rose-500/[0.06] text-[11px] font-mono font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/15 transition-colors cursor-pointer"
        >
          <LogOut className="w-3 h-3" />
          <span>{t(lang, 'logout')}</span>
        </button>
      </div>
    </div>
  );

  const flatMobileTabs = navGroups.flatMap((grp) => grp.items);

  return (
    <div className="h-[100dvh] overflow-hidden flex flex-col bg-slate-50 text-slate-900 dark:bg-[#07090e] dark:text-slate-100 transition-colors">
      {renderImpersonationBanner()}

      {/* Clean Top Bar (Compact 48px-56px height on mobile, >=44px touch hitboxes) */}
      <header className="h-13 sm:h-14 shrink-0 px-3 sm:px-4 lg:px-6 border-b border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#090c13] flex items-center justify-between gap-2.5 sm:gap-4 z-30">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((o) => !o)}
            className="lg:hidden min-h-[42px] min-w-[42px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={() => selectTab('overview')}
            className="text-base sm:text-lg font-extrabold font-display tracking-tight whitespace-nowrap cursor-pointer"
          >
            <span className="text-slate-900 dark:text-white">234</span>
            <span className="text-cyan-600 dark:text-cyan-400">Mail</span>
          </button>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 text-xs font-mono shrink-0">
          <PWAInstallButton />
          {isPaidAndActive ? (
            <button
              type="button"
              onClick={() => selectTab('subscription')}
              className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 min-h-[34px] rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 tabular-nums cursor-pointer"
            >
              <span>✓ Paid · {snapshot.user.daysLeft}d</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => selectTab('subscription')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 min-h-[36px] rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold whitespace-nowrap hover:bg-amber-500/20 transition-colors cursor-pointer"
            >
              <span>Free Trial</span>
              <span className="hidden sm:inline">· Pay to Send</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => selectTab('account')}
            className="min-h-[40px] px-1 flex items-center gap-2 hover:opacity-90 cursor-pointer"
          >
            <span className="w-7 h-7 rounded-full bg-indigo-500 text-white font-display font-extrabold text-xs flex items-center justify-center shrink-0">
              {snapshot.user.username.slice(0, 1).toUpperCase()}
            </span>
            <span className="hidden md:inline text-slate-800 dark:text-slate-200 max-w-[140px] truncate">
              {snapshot.user.username}
            </span>
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="px-2.5 sm:px-3 py-1.5 min-h-[38px] rounded-lg border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white whitespace-nowrap cursor-pointer"
          >
            <span>{t(lang, 'logout')}</span>
          </button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        <aside className="hidden lg:flex lg:flex-col lg:w-64 xl:w-68 shrink-0 h-full border-r border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#090c13]">
          {renderSidebarContent()}
        </aside>

        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 top-13 sm:top-14 z-40 flex">
            <div className="w-[min(82vw,272px)] bg-white dark:bg-[#090c13] border-r border-slate-200 dark:border-white/10 h-full shadow-2xl pb-safe">
              {renderSidebarContent()}
            </div>
            <button
              type="button"
              aria-label="Close mobile menu"
              onClick={() => setMobileMenuOpen(false)}
              className="flex-1 bg-black/55 backdrop-blur-[1px]"
            />
          </div>
        )}

        <main className="flex-1 min-w-0 h-full esp-grid-bg p-3.5 sm:p-6 lg:p-8 xl:p-10 overflow-y-auto">
          <div className="max-w-[1440px] w-full mx-auto">
            {/* Touch-Scrollable Quick Navigation Strip on Mobile & Tablet (< lg) — Zero Extra Sticky Height */}
            <div className="lg:hidden mb-4 -mx-1 px-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
              {flatMobileTabs.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectTab(item.id)}
                    className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-mono inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                      active
                        ? 'border-cyan-500 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 font-semibold'
                        : 'border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1119] text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{item.label}</span>
                    {typeof item.count === 'number' && item.count > 0 && (
                      <span className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400 tabular-nums">
                        {item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {activeTab === 'overview' && (
              <OverviewView
                snapshot={snapshot}
                lang={lang}
                onNavigate={(tab) => selectTab(tab as WorkspaceTab)}
              />
            )}

            {/* Persistently mounted so switching to Sent / Inbox / SMTP never wipes Send Email */}
            <div className={activeTab === 'compose' ? 'block' : 'hidden'}>
              <ComposeEmailView
                token={token}
                snapshot={snapshot}
                lang={lang}
                isActive={activeTab === 'compose'}
                initialDraft={draftToEdit}
                onClearInitialDraft={() => setDraftToEdit(null)}
                onJobCreated={(job) =>
                  setSnapshot((prev) =>
                    prev
                      ? {
                          ...prev,
                          jobs: prev.jobs.some((j) => j.id === job.id)
                            ? prev.jobs
                            : [job, ...prev.jobs],
                        }
                      : prev
                  )
                }
                onDraftsUpdated={(drafts) =>
                  setSnapshot((prev) => (prev ? { ...prev, drafts } : prev))
                }
                onNavigateQueue={() => selectTab('queue')}
                onNavigateSmtp={() => selectTab('smtp')}
                onNavigateSubscription={() => selectTab('subscription')}
              />
            </div>

            {activeTab === 'queue' && (
              <QueueMonitorView
                token={token}
                snapshot={snapshot}
                onNavigateSmtp={() => selectTab('smtp')}
                onJobUpdated={(job) =>
                  setSnapshot((prev) =>
                    prev
                      ? { ...prev, jobs: prev.jobs.map((j) => (j.id === job.id ? job : j)) }
                      : prev
                  )
                }
                onJobCreated={(job) =>
                  setSnapshot((prev) =>
                    prev
                      ? {
                          ...prev,
                          jobs: prev.jobs.some((j) => j.id === job.id)
                            ? prev.jobs
                            : [job, ...prev.jobs],
                        }
                      : prev
                  )
                }
                onJobsDeleted={(deletedIds) => {
                  const idSet = new Set(deletedIds);
                  setSnapshot((prev) =>
                    prev
                      ? {
                          ...prev,
                          jobs: prev.jobs.filter((j) => !idSet.has(j.id)),
                          errors: prev.errors.filter((e) => !idSet.has(e.jobId)),
                          tracking: prev.tracking.filter((r) => !idSet.has(r.jobId)),
                        }
                      : prev
                  );
                }}
              />
            )}

            {activeTab === 'sent' && (
              <SentCampaignsView
                token={token}
                snapshot={snapshot}
                onJobsDeleted={(deletedIds) => {
                  const idSet = new Set(deletedIds);
                  setSnapshot((prev) =>
                    prev
                      ? {
                          ...prev,
                          jobs: prev.jobs.filter((j) => !idSet.has(j.id)),
                          errors: prev.errors.filter((e) => !idSet.has(e.jobId)),
                          tracking: prev.tracking.filter((r) => !idSet.has(r.jobId)),
                        }
                      : prev
                  );
                }}
              />
            )}

            {activeTab === 'tracking' && (
              <TrackingView
                token={token}
                snapshot={snapshot}
                onRefresh={() => fetchBootstrap(token)}
                onRecordUpdated={(record) =>
                  setSnapshot((prev) =>
                    prev
                      ? {
                          ...prev,
                          tracking: prev.tracking.map((r) => recOrMatch(r, record)),
                        }
                      : prev
                  )
                }
              />
            )}

            {activeTab === 'inbox' && (
              <InboxView
                token={token}
                snapshot={snapshot}
                onInboxUpdated={(inbox, inboxSync) =>
                  setSnapshot((prev) =>
                    prev
                      ? {
                          ...prev,
                          inbox,
                          inboxSync: inboxSync || prev.inboxSync,
                        }
                      : prev
                  )
                }
                onNavigateSmtp={() => selectTab('smtp')}
              />
            )}

            {activeTab === 'drafts' && (
              <DraftsView
                token={token}
                snapshot={snapshot}
                onLoadDraft={(draft) => {
                  setDraftToEdit(draft);
                  selectTab('compose');
                }}
                onDraftsUpdated={(drafts) =>
                  setSnapshot((prev) => (prev ? { ...prev, drafts } : prev))
                }
              />
            )}

            {activeTab === 'smtp' && (
              <SmtpSettingsView
                token={token}
                snapshot={snapshot}
                onSmtpUpdated={(smtp, smtpPool, inboxSync, inbox) =>
                  setSnapshot((prev) =>
                    prev
                      ? {
                          ...prev,
                          smtp,
                          smtpPool,
                          inboxSync: inboxSync || prev.inboxSync,
                          inbox: inbox || prev.inbox,
                        }
                      : prev
                  )
                }
              />
            )}

            {(activeTab === 'account' || activeTab === 'subscription') && (
              <AccountAndSubscriptionView
                mode={activeTab}
                token={token}
                snapshot={snapshot}
                onCurrentUserUpdated={(user) =>
                  setSnapshot((prev) =>
                    prev
                      ? {
                          ...prev,
                          user,
                          users: prev.users.map((u) => (u.id === user.id ? user : u)),
                        }
                      : prev
                  )
                }
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function recOrMatch(existing: TrackingRecord, updated: TrackingRecord): TrackingRecord {
  return existing.id === updated.id ? updated : existing;
}
