import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Eye,
  EyeOff,
  Mail,
  MessageCircle,
  X,
} from 'lucide-react';
import type { DashboardSnapshot } from '../types';
import { ApiError, apiRequest } from '../utils/api';
import { PWAInstallButton } from './PWAInstallButton';

const USER_LOCK_STORAGE_KEY = '234mail_login_lock_user';
const RATE_LIMIT_MESSAGE = 'Too many tries, retry after 10 minutes.';

function formatTinyCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.ceil(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

interface LandingAuthViewProps {
  loggedOutMessage: string | null;
  onDismissLoggedOutMessage?: () => void;
  resetToken?: string | null;
  onClearResetToken?: () => void;
  onNavigateUrl?: (nextPath: string) => void;
  onAuthenticated: (token: string, snapshot: DashboardSnapshot) => void;
}

type AuthMode = 'signin' | 'register' | 'forgot' | 'new_password';

export const LandingAuthView: React.FC<LandingAuthViewProps> = ({
  loggedOutMessage,
  onDismissLoggedOutMessage,
  resetToken,
  onClearResetToken,
  onNavigateUrl,
  onAuthenticated,
}) => {
  const [authTab, setAuthTab] = useState<AuthMode>(() =>
    resetToken ? 'new_password' : 'signin'
  );
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [verifyingToken, setVerifyingToken] = useState(false);
  const [verifiedAccount, setVerifiedAccount] = useState<{
    username: string;
    email: string;
  } | null>(null);

  const [lockUntilMs, setLockUntilMs] = useState<number | null>(() => {
    try {
      const saved = Number(localStorage.getItem(USER_LOCK_STORAGE_KEY) || '0');
      return saved > Date.now() ? saved : null;
    } catch {
      return null;
    }
  });
  const [nowTickMs, setNowTickMs] = useState<number>(() => Date.now());

  const [error, setError] = useState<string | null>(() => {
    if (resetToken) return null;
    try {
      const saved = Number(localStorage.getItem(USER_LOCK_STORAGE_KEY) || '0');
      return saved > Date.now() ? RATE_LIMIT_MESSAGE : null;
    } catch {
      return null;
    }
  });
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const [magicLinkSentInfo, setMagicLinkSentInfo] = useState<{
    email: string;
    message: string;
    magicLink?: string;
  } | null>(null);

  const [publicPriceUsd, setPublicPriceUsd] = useState<number>(15);
  const [publicDurationDays, setPublicDurationDays] = useState<number>(30);

  const remainingLockSeconds =
    lockUntilMs && lockUntilMs > nowTickMs ? Math.ceil((lockUntilMs - nowTickMs) / 1000) : 0;
  const isSignInLocked = remainingLockSeconds > 0;

  // Fetch live platform pricing set in /admin so landing page always matches immediately
  useEffect(() => {
    let cancelled = false;
    const loadPublicPricing = () => {
      apiRequest<{
        monthlyPriceUsd?: number;
        planDurationDays?: number;
      }>('/api/public/pricing')
        .then((data) => {
          if (cancelled) return;
          if (typeof data.monthlyPriceUsd === 'number' && data.monthlyPriceUsd >= 1) {
            setPublicPriceUsd(data.monthlyPriceUsd);
          }
          if (typeof data.planDurationDays === 'number' && data.planDurationDays >= 1) {
            setPublicDurationDays(Math.round(data.planDurationDays));
          }
        })
        .catch(() => {
          // Keep fallback pricing on transient network error
        });
    };

    loadPublicPricing();
    const onFocus = () => loadPublicPricing();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // Sync login rate-limit status with server on load
  useEffect(() => {
    let cancelled = false;
    apiRequest<{
      rateLimited: boolean;
      lockedUntil: number | null;
      retryAfterSeconds: number;
    }>('/api/auth/login-status?portal=user')
      .then((status) => {
        if (cancelled) return;
        if (status.rateLimited && status.lockedUntil && status.lockedUntil > Date.now()) {
          setLockUntilMs(status.lockedUntil);
          setNowTickMs(Date.now());
          try {
            localStorage.setItem(USER_LOCK_STORAGE_KEY, String(status.lockedUntil));
          } catch {
            // ignore storage errors
          }
          setError((prev) => prev || RATE_LIMIT_MESSAGE);
        } else {
          setLockUntilMs(null);
          try {
            localStorage.removeItem(USER_LOCK_STORAGE_KEY);
          } catch {
            // ignore storage errors
          }
          setError((prev) => (prev === RATE_LIMIT_MESSAGE ? null : prev));
        }
      })
      .catch(() => {
        // ignore network check failure
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Tick down lockout timer every second and auto-unlock at 00:00
  useEffect(() => {
    if (!lockUntilMs) return;
    const tick = () => {
      const now = Date.now();
      setNowTickMs(now);
      if (now >= lockUntilMs) {
        setLockUntilMs(null);
        try {
          localStorage.removeItem(USER_LOCK_STORAGE_KEY);
        } catch {
          // ignore storage errors
        }
        setError((prev) => (prev === RATE_LIMIT_MESSAGE ? null : prev));
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [lockUntilMs]);

  // Automatically verify magic link token whenever ?reset_token=... is opened
  useEffect(() => {
    if (!resetToken) {
      setVerifiedAccount(null);
      setAuthTab((prev) => (prev === 'new_password' ? 'signin' : prev));
      return;
    }

    let cancelled = false;
    setAuthTab('new_password');
    setError(null);
    setResetSuccess(null);
    setMagicLinkSentInfo(null);
    setVerifyingToken(true);

    apiRequest<{ ok: boolean; username: string; email: string }>(
      `/api/auth/verify-reset-token?token=${encodeURIComponent(resetToken)}`
    )
      .then((res) => {
        if (!cancelled) {
          setVerifiedAccount({ username: res.username, email: res.email });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setVerifiedAccount(null);
          setError(
            err instanceof Error
              ? err.message
              : 'This magic link is invalid or has expired. Please request a new one.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setVerifyingToken(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [resetToken]);

  const switchTab = (next: 'signin' | 'register') => {
    if (resetToken && onClearResetToken) {
      onClearResetToken();
    }
    setAuthTab(next);
    if (next === 'signin' && lockUntilMs && lockUntilMs > Date.now()) {
      setError(RATE_LIMIT_MESSAGE);
    } else {
      setError(null);
    }
    setMagicLinkSentInfo(null);
    if (next === 'register') {
      setResetSuccess(null);
    }
  };

  const jumpToAuthCard = (mode: 'signin' | 'register') => {
    switchTab(mode);
    document
      .getElementById('auth-card-anchor')
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => {
      document.getElementById('auth-username-input')?.focus();
    }, 200);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResetSuccess(null);

    // Step 1: Forgot Password — ONLY asks for Email Address or Username, sends Magic Link
    if (authTab === 'forgot') {
      if (!identifier.trim()) {
        setError('Please enter your email address or username.');
        return;
      }
      setLoading(true);
      setMagicLinkSentInfo(null);
      try {
        const res = await apiRequest<{
          ok: boolean;
          email: string;
          username: string;
          sentViaLiveSmtp: boolean;
          magicLink?: string;
          message: string;
        }>('/api/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({
            identifier: identifier.trim(),
            origin: window.location.origin,
            returnPath: '/',
          }),
        });
        setMagicLinkSentInfo({
          email: res.email,
          message: res.message,
          magicLink: res.magicLink,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not send magic link.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Step 2: Magic Link Opened — Choose & Confirm New Password
    if (authTab === 'new_password') {
      if (!resetToken) {
        setError('Missing magic reset link. Please request a new link.');
        return;
      }
      if (newPassword.length < 4) {
        setError('New password must be at least 4 characters.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setError('New password and confirm password do not match.');
        return;
      }
      setLoading(true);
      try {
        const res = await apiRequest<{ ok: boolean; username: string; message: string }>(
          '/api/auth/reset-password',
          {
            method: 'POST',
            body: JSON.stringify({ token: resetToken, newPassword }),
          }
        );
        onClearResetToken?.();
        setIdentifier(res.username);
        setPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setVerifiedAccount(null);
        setAuthTab('signin');
        setResetSuccess(res.message);
        setTimeout(() => {
          document.getElementById('auth-password-input')?.focus();
        }, 50);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not update password.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Standard Sign In or Register
    if (authTab === 'signin' && lockUntilMs && lockUntilMs > Date.now()) {
      setNowTickMs(Date.now());
      setError(RATE_LIMIT_MESSAGE);
      return;
    }

    setLoading(true);
    try {
      if (authTab === 'signin') {
        const res = await apiRequest<{ token: string; snapshot: DashboardSnapshot }>(
          '/api/auth/login',
          {
            method: 'POST',
            body: JSON.stringify({ identifier, password }),
          }
        );
        setLockUntilMs(null);
        try {
          localStorage.removeItem(USER_LOCK_STORAGE_KEY);
        } catch {
          // ignore storage errors
        }
        onAuthenticated(res.token, res.snapshot);
      } else {
        const res = await apiRequest<{ token: string; snapshot: DashboardSnapshot }>(
          '/api/auth/register',
          {
            method: 'POST',
            body: JSON.stringify({ username: identifier, email, password }),
          }
        );
        onAuthenticated(res.token, res.snapshot);
      }
    } catch (err) {
      if (
        authTab === 'signin' &&
        err instanceof ApiError &&
        (err.status === 429 || err.rateLimited)
      ) {
        const until =
          err.lockedUntil && err.lockedUntil > Date.now()
            ? err.lockedUntil
            : Date.now() + (err.retryAfterSeconds || 600) * 1000;
        setLockUntilMs(until);
        setNowTickMs(Date.now());
        try {
          localStorage.setItem(USER_LOCK_STORAGE_KEY, String(until));
        } catch {
          // ignore storage errors
        }
        setError(RATE_LIMIT_MESSAGE);
      } else {
        setError(
          err instanceof Error ? err.message : 'Could not sign in. Please check your details.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      id="top"
      className="min-h-[100dvh] flex flex-col esp-grid-bg bg-slate-50 text-slate-900 dark:bg-[#07090e] dark:text-slate-100 transition-colors"
    >
      {/* Clean 3-Zone Top Header — Wide Desktop Container */}
      <header className="border-b border-slate-200 dark:border-white/[0.07] bg-white/85 dark:bg-[#07090e]/85 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-[1400px] w-full mx-auto flex items-center justify-between gap-4 sm:gap-8 px-4 sm:px-8 lg:px-12 xl:px-16 py-3.5 sm:py-4">
          <a
            href="#top"
            onClick={(e) => {
              if (resetToken) {
                e.preventDefault();
                switchTab('signin');
              }
            }}
            className="text-lg sm:text-xl font-extrabold tracking-tight font-display whitespace-nowrap shrink-0"
          >
            <span className="text-slate-900 dark:text-white">234</span>
            <span className="text-cyan-600 dark:text-cyan-400">Mail</span>
          </a>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600 dark:text-slate-400">
            <a
              href="#how-it-works"
              className="hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              What You Get
            </a>
            <a
              href="#pricing"
              className="hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Pricing
            </a>
            <a
              href="#support"
              className="hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Support
            </a>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <PWAInstallButton />
            <button
              type="button"
              onClick={() => jumpToAuthCard('signin')}
              className="px-4 py-2 min-h-[40px] text-xs font-semibold rounded-lg bg-slate-900 text-white dark:bg-cyan-400 dark:text-slate-950 hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
            >
              Sign In
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Quick Jump Strip */}
      <div className="md:hidden flex items-center justify-center gap-5 px-4 py-2.5 border-b border-slate-200/80 dark:border-white/[0.06] bg-white/60 dark:bg-[#0b0f17]/60 text-xs font-medium text-slate-600 dark:text-slate-400">
        <a href="#pricing" className="hover:text-cyan-600 dark:hover:text-cyan-400 whitespace-nowrap">
          ${publicPriceUsd}/mo Pricing
        </a>
        <span aria-hidden="true">·</span>
        <a href="#support" className="hover:text-cyan-600 dark:hover:text-cyan-400 whitespace-nowrap">
          Support
        </a>
      </div>

      <main className="flex-1">
        {/* =====================================================================
            HERO + SIGN IN / REGISTER (WIDE DESKTOP / PC RESPONSIVE)
            ===================================================================== */}
        <section
          id="how-it-works"
          className="scroll-mt-20 max-w-[1400px] w-full mx-auto px-4 sm:px-8 lg:px-12 xl:px-16 py-8 sm:py-14 lg:py-20 grid grid-cols-1 lg:grid-cols-12 gap-8 sm:gap-12 xl:gap-16 items-center"
        >
          {/* Left Column — Plain, Simple Everyday Language (Theme option removed for logged-out visitors) */}
          <div className="lg:col-span-7 space-y-5 sm:space-y-6 min-w-0">
            <h1 className="font-display font-extrabold tracking-tight leading-[1.08] text-3xl sm:text-5xl xl:text-[4rem] text-balance text-slate-900 dark:text-white">
              Send Emails Easily From{' '}
              <span className="bg-gradient-to-r from-cyan-500 via-sky-500 to-indigo-500 dark:from-cyan-300 dark:via-cyan-400 dark:to-indigo-400 bg-clip-text text-transparent">
                Any Address
              </span>
            </h1>

            <p className="text-sm sm:text-base lg:text-lg text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
              Sign in, connect your email account, and send messages to one person or thousands of
              people in minutes. No complicated setup — easy for anyone to use.
            </p>

            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 pt-2 text-sm text-slate-700 dark:text-slate-300">
              {[
                'Use any sender name & email address',
                'Send all at once or schedule for later',
                'Write plain emails or paste nice designs',
                'Preview how emails look on PC & Phone',
                'See who opened your emails live',
                'Read replies right inside your Inbox',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Right Column — Sign In / Register Card */}
          <div className="lg:col-span-5 min-w-0" id="auth-card-anchor">
            <div className="rounded-2xl border border-slate-200 dark:border-white/[0.09] bg-white dark:bg-[#0d1119] p-5 sm:p-8">
              {loggedOutMessage && (
                <div className="mb-5 px-3.5 py-2.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-xs text-cyan-700 dark:text-cyan-300 flex items-center justify-between gap-3">
                  <span className="leading-snug">{loggedOutMessage}</span>
                  <button
                    type="button"
                    aria-label="Dismiss logout notification"
                    onClick={() => onDismissLoggedOutMessage?.()}
                    className="p-1 rounded-md text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/20 inline-flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {resetSuccess && (
                <div className="mb-5 px-4 py-3 rounded-lg border border-emerald-500/35 bg-emerald-500/10 text-xs text-emerald-700 dark:text-emerald-300">
                  {resetSuccess}
                </div>
              )}

              {error && (
                <div className="mb-5 px-4 py-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-xs text-rose-700 dark:text-rose-300">
                  <div>{error}</div>
                  {authTab === 'signin' && isSignInLocked && (
                    <div className="mt-1 text-[10px] leading-none font-mono tabular-nums opacity-80">
                      Retry in {formatTinyCountdown(remainingLockSeconds)}
                    </div>
                  )}
                </div>
              )}

              {/* 2 Tabs: Sign In | Register */}
              <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-100 dark:bg-[#141923] mb-6">
                <button
                  type="button"
                  onClick={() => switchTab('signin')}
                  className={`py-2.5 px-3 min-h-[40px] text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    authTab === 'signin'
                      ? 'bg-cyan-500 dark:bg-cyan-400 text-white dark:text-slate-950'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => switchTab('register')}
                  className={`py-2.5 px-3 min-h-[40px] text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    authTab === 'register'
                      ? 'bg-cyan-500 dark:bg-cyan-400 text-white dark:text-slate-950'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Create Account
                </button>
              </div>

              {/* FORGOT PASSWORD */}
              {authTab === 'forgot' && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-sm font-display font-bold text-slate-900 dark:text-white">
                      Forgot Password
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Enter your email address or username and we&apos;ll send a link to reset your
                      password.
                    </p>
                  </div>

                  {magicLinkSentInfo ? (
                    <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-4 space-y-3">
                      <div className="flex items-start gap-2.5">
                        <Mail className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        <div className="text-xs text-emerald-800 dark:text-emerald-200 leading-relaxed">
                          {magicLinkSentInfo.message}
                        </div>
                      </div>

                      {magicLinkSentInfo.magicLink && (
                        <a
                          href={magicLinkSentInfo.magicLink}
                          onClick={(e) => {
                            if (
                              onNavigateUrl &&
                              !e.metaKey &&
                              !e.ctrlKey &&
                              !e.shiftKey &&
                              !e.altKey
                            ) {
                              e.preventDefault();
                              const u = new URL(magicLinkSentInfo.magicLink!);
                              onNavigateUrl(`${u.pathname}${u.search}`);
                            }
                          }}
                          className="w-full py-2.5 px-3.5 rounded-lg bg-emerald-500 text-slate-950 text-xs font-bold inline-flex items-center justify-center gap-1.5 hover:opacity-95 transition-opacity"
                        >
                          <span>Open Link to Set New Password</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <label
                          htmlFor="forgot-identifier-input"
                          className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"
                        >
                          Email Address or Username
                        </label>
                        <input
                          id="forgot-identifier-input"
                          type="text"
                          value={identifier}
                          onChange={(e) => setIdentifier(e.target.value)}
                          placeholder="you@example.com or username"
                          required
                          className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-[#e8eff7] dark:text-slate-900 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3.5 px-4 rounded-xl font-display font-extrabold text-sm text-slate-950 bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-400 hover:opacity-95 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <span>{loading ? 'Sending Link...' : 'Send Reset Link'}</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </form>
                  )}

                  <button
                    type="button"
                    onClick={() => switchTab('signin')}
                    className="w-full text-center text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer pt-1"
                  >
                    ← Back to Sign In
                  </button>
                </div>
              )}

              {/* SET NEW PASSWORD */}
              {authTab === 'new_password' && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-sm font-display font-bold text-slate-900 dark:text-white">
                      Set New Password
                    </h2>
                    {verifiedAccount && (
                      <p className="text-xs text-cyan-700 dark:text-cyan-400 mt-1">
                        Account: <strong>{verifiedAccount.username}</strong> ({verifiedAccount.email})
                      </p>
                    )}
                  </div>

                  {verifyingToken ? (
                    <div className="py-6 text-center text-xs text-slate-500">
                      Checking your reset link...
                    </div>
                  ) : verifiedAccount ? (
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <label
                          htmlFor="auth-new-password-input"
                          className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"
                        >
                          New Password
                        </label>
                        <div className="relative">
                          <input
                            id="auth-new-password-input"
                            type={showNewPassword ? 'text' : 'password'}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Enter new password (min 4 characters)"
                            required
                            className="w-full pl-3.5 pr-11 py-2.5 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-[#e8eff7] dark:text-slate-900 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPassword((v) => !v)}
                            aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                            title={showNewPassword ? 'Hide password' : 'Show password'}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-500 hover:text-slate-800 cursor-pointer"
                          >
                            {showNewPassword ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor="auth-confirm-password-input"
                          className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"
                        >
                          Confirm New Password
                        </label>
                        <div className="relative">
                          <input
                            id="auth-confirm-password-input"
                            type={showConfirmPassword ? 'text' : 'password'}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Re-enter new password"
                            required
                            className="w-full pl-3.5 pr-11 py-2.5 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-[#e8eff7] dark:text-slate-900 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword((v) => !v)}
                            aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                            title={showConfirmPassword ? 'Hide password' : 'Show password'}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-500 hover:text-slate-800 cursor-pointer"
                          >
                            {showConfirmPassword ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3.5 px-4 rounded-xl font-display font-extrabold text-sm text-slate-950 bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-400 hover:opacity-95 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <span>{loading ? 'Saving...' : 'Save New Password'}</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        onClearResetToken?.();
                        setError(null);
                        setAuthTab('forgot');
                      }}
                      className="w-full py-3 px-4 rounded-xl font-display font-extrabold text-sm text-slate-950 bg-cyan-400 hover:opacity-95 cursor-pointer"
                    >
                      Request a New Reset Link
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => switchTab('signin')}
                    className="w-full text-center text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer pt-1"
                  >
                    ← Back to Sign In
                  </button>
                </div>
              )}

              {/* SIGN IN & REGISTER FORMS */}
              {(authTab === 'signin' || authTab === 'register') && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label
                      htmlFor="auth-username-input"
                      className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"
                    >
                      {authTab === 'register' ? 'Choose a Username' : 'Email or Username'}
                    </label>
                    <input
                      id="auth-username-input"
                      type="text"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder={authTab === 'register' ? 'Choose a username' : 'you@example.com or username'}
                      required
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-[#e8eff7] dark:text-slate-900 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>

                  {authTab === 'register' && (
                    <div>
                      <label
                        htmlFor="auth-email-input"
                        className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"
                      >
                        Your Email
                      </label>
                      <input
                        id="auth-email-input"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        required
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-[#e8eff7] dark:text-slate-900 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      />
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label
                        htmlFor="auth-password-input"
                        className="block text-xs font-medium text-slate-600 dark:text-slate-400"
                      >
                        Password
                      </label>
                      {authTab === 'signin' && (
                        <button
                          type="button"
                          onClick={() => {
                            setAuthTab('forgot');
                            setError(null);
                            setResetSuccess(null);
                            setMagicLinkSentInfo(null);
                          }}
                          className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
                        >
                          Forgot Password?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        id="auth-password-input"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••••"
                        required
                        className="w-full pl-3.5 pr-11 py-2.5 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-[#e8eff7] dark:text-slate-900 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        title={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-500 hover:text-slate-800 cursor-pointer"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {authTab === 'register' && (
                    <p className="text-xs text-cyan-700 dark:text-cyan-300 bg-cyan-500/10 border border-cyan-500/25 rounded-lg px-3 py-2 leading-relaxed">
                      Create your account in seconds to get started right away.
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={loading || (authTab === 'signin' && isSignInLocked)}
                    className="w-full py-3.5 px-4 rounded-xl font-display font-extrabold text-sm text-slate-950 bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-400 hover:opacity-95 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>
                      {loading
                        ? 'Signing in...'
                        : authTab === 'signin'
                          ? 'Sign In'
                          : 'Start Free Trial'}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              )}
            </div>
          </div>
        </section>

        {/* =====================================================================
            SIMPLE PRICING SECTION (LIVE DYNAMIC PRICE FROM /admin)
            ===================================================================== */}
        <section
          id="pricing"
          className="scroll-mt-20 border-t border-slate-200 dark:border-white/[0.07] bg-white/70 dark:bg-[#090c13]/80"
        >
          <div className="max-w-[1400px] w-full mx-auto px-4 sm:px-8 lg:px-12 xl:px-16 py-14 sm:py-20 space-y-10">
            <div className="max-w-2xl space-y-2">
              <h2 className="font-display font-extrabold tracking-tight text-2xl sm:text-4xl text-slate-900 dark:text-white">
                Simple Pricing — ${publicPriceUsd} / Month
              </h2>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                Get started in seconds. Unlock unlimited access for {publicDurationDays} days at one
                simple ${publicPriceUsd}/month flat price.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 xl:gap-8 items-stretch">
              {/* Free Trial Card */}
              <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1119] p-6 sm:p-8 flex flex-col justify-between gap-8">
                <div className="space-y-5">
                  <div className="flex items-baseline justify-between gap-4">
                    <div>
                      <h3 className="text-xl sm:text-2xl font-display font-bold text-slate-900 dark:text-white">
                        Free Trial
                      </h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        Look around and set up your account for free.
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-3xl sm:text-4xl font-display font-extrabold text-slate-900 dark:text-white tabular-nums">
                        $0
                      </span>
                    </div>
                  </div>

                  <ul className="space-y-3 pt-4 border-t border-slate-200 dark:border-white/[0.07] text-sm text-slate-700 dark:text-slate-300">
                    {[
                      'Create your account in seconds',
                      'Connect and test your email account',
                      'Write emails, test designs & save drafts',
                      'Open and read messages in your Inbox',
                    ].map((feat) => (
                      <li key={feat} className="flex items-start gap-2.5">
                        <Check className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() => jumpToAuthCard('register')}
                  className="w-full min-h-[46px] py-3 px-5 rounded-xl border border-slate-300 dark:border-white/15 bg-slate-50 dark:bg-[#141923] text-slate-900 dark:text-white font-display font-bold text-sm hover:border-cyan-500/50 transition-colors flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
                >
                  <span>Start Free Trial</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {/* Dynamic Full Access Card */}
              <div className="rounded-2xl border border-cyan-500/40 dark:border-cyan-400/35 bg-white dark:bg-[#0d1119] p-6 sm:p-8 flex flex-col justify-between gap-8">
                <div className="space-y-5">
                  <div className="flex items-baseline justify-between gap-4">
                    <div>
                      <h3 className="text-xl sm:text-2xl font-display font-extrabold text-slate-900 dark:text-white">
                        Full Access Plan
                      </h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        Everything unlocked for {publicDurationDays} days — send as many emails as
                        you want.
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-3xl sm:text-5xl font-display font-extrabold text-cyan-600 dark:text-cyan-400 tabular-nums">
                        ${publicPriceUsd}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400 block">
                        per {publicDurationDays} days
                      </span>
                    </div>
                  </div>

                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-slate-200 dark:border-white/[0.07] text-sm text-slate-700 dark:text-slate-200">
                    {[
                      'Send unlimited bulk & single emails',
                      'Use any sender name & email address',
                      'Send right away or schedule for later',
                      'Connect multiple email accounts',
                      'See who opens your emails live',
                      'No extra fees per email sent',
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2.5">
                        <Check className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() => jumpToAuthCard('register')}
                  className="w-full min-h-[46px] py-3 px-6 rounded-xl bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-400 text-slate-950 font-display font-extrabold text-sm hover:opacity-95 transition-opacity inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
                >
                  <span>Get Started — ${publicPriceUsd}/month</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* =====================================================================
            SIMPLE SUPPORT SECTION (https://t.me/paraxait)
            ===================================================================== */}
        <section
          id="support"
          className="scroll-mt-20 border-t border-slate-200 dark:border-white/[0.07]"
        >
          <div className="max-w-[1400px] w-full mx-auto px-4 sm:px-8 lg:px-12 xl:px-16 py-12 sm:py-16">
            <div className="rounded-2xl border border-slate-200 dark:border-white/[0.09] bg-white dark:bg-[#0d1119] p-6 sm:p-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-2 max-w-2xl">
                <h2 className="font-display font-extrabold tracking-tight text-xl sm:text-3xl text-slate-900 dark:text-white">
                  Need Help? Chat With Support
                </h2>
                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                  Have a question about setting up your account, connecting your email, or
                  activating your ${publicPriceUsd}/month plan? Message us directly on Telegram and
                  we&apos;ll help you right away.
                </p>
              </div>

              <a
                href="https://t.me/paraxait"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full lg:w-auto min-h-[48px] py-3.5 px-7 rounded-xl bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-400 text-slate-950 font-display font-extrabold text-sm hover:opacity-95 transition-opacity inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
              >
                <MessageCircle className="w-4 h-4 shrink-0" />
                <span>Chat With Support on Telegram</span>
                <ArrowUpRight className="w-4 h-4 shrink-0" />
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Clean Footer */}
      <footer className="border-t border-slate-200 dark:border-white/[0.07] py-6 px-4 sm:px-8 lg:px-12 xl:px-16 text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-[1400px] w-full mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-display font-extrabold text-slate-900 dark:text-white">
              234<span className="text-cyan-600 dark:text-cyan-400">Mail</span>
            </span>
            <span aria-hidden="true">·</span>
            <span>Simple bulk email sender for everyone.</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-5 font-medium">
            <a
              href="#pricing"
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap"
            >
              Pricing (${publicPriceUsd}/mo)
            </a>
            <a
              href="https://t.me/paraxait"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors whitespace-nowrap"
            >
              Support
            </a>
            <button
              type="button"
              onClick={() => jumpToAuthCard('signin')}
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap cursor-pointer"
            >
              Sign In
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
