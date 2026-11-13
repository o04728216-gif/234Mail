import React, { useEffect, useState } from 'react';
import { ArrowRight, Check, Mail, Palette } from 'lucide-react';
import { THEME_OPTIONS, t } from '../i18n';
import type { DashboardSnapshot, ThemeId } from '../types';
import { apiRequest } from '../utils/api';

interface LandingAuthViewProps {
  theme: ThemeId;
  onSelectTheme: (nextTheme: ThemeId) => void;
  loggedOutMessage: string | null;
  resetToken?: string | null;
  onClearResetToken?: () => void;
  onNavigateUrl?: (nextPath: string) => void;
  onAuthenticated: (token: string, snapshot: DashboardSnapshot) => void;
}

type AuthMode = 'signin' | 'register' | 'forgot' | 'new_password';

export const LandingAuthView: React.FC<LandingAuthViewProps> = ({
  theme,
  onSelectTheme,
  loggedOutMessage,
  resetToken,
  onClearResetToken,
  onNavigateUrl,
  onAuthenticated,
}) => {
  const [authTab, setAuthTab] = useState<AuthMode>(() =>
    resetToken ? 'new_password' : 'signin'
  );
  const [identifier, setIdentifier] = useState('Geekytycoon');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('demo1234');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [verifyingToken, setVerifyingToken] = useState(false);
  const [verifiedAccount, setVerifiedAccount] = useState<{
    username: string;
    email: string;
  } | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const [magicLinkSentInfo, setMagicLinkSentInfo] = useState<{
    email: string;
    message: string;
    magicLink?: string;
  } | null>(null);

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
    setError(null);
    setMagicLinkSentInfo(null);
    if (next === 'register') {
      setResetSuccess(null);
    }
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
      setError(err instanceof Error ? err.message : 'Could not sign in. Please check your details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col esp-grid-bg bg-slate-50 text-slate-900 dark:bg-[#07090e] dark:text-slate-100 transition-colors">
      {/* Clean 3-Zone Top Header */}
      <header className="flex items-center justify-between gap-4 sm:gap-8 px-4 sm:px-6 lg:px-12 py-3.5 sm:py-4 border-b border-slate-200 dark:border-white/[0.07] bg-white/80 dark:bg-[#07090e]/85 backdrop-blur-md sticky top-0 z-20">
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

        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-400">
          <a
            href="#features"
            className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Features
          </a>
          <a
            href="#pricing"
            className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Pricing
          </a>
          <a
            href="#support"
            className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Support
          </a>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              switchTab('signin');
              document
                .getElementById('auth-card-anchor')
                ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              setTimeout(() => {
                document.getElementById('auth-username-input')?.focus();
              }, 200);
            }}
            className="px-4 py-2 min-h-[40px] text-xs font-semibold rounded-lg bg-slate-900 text-white dark:bg-cyan-400 dark:text-slate-950 hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
          >
            Sign In
          </button>
        </div>
      </header>

      {/* Main Split Hero + Simple Sign In Card */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-12 py-7 sm:py-12 lg:py-20 grid grid-cols-1 lg:grid-cols-12 gap-8 sm:gap-10 lg:gap-12 items-center">
        {/* Left Column */}
        <div className="lg:col-span-7 space-y-5 sm:space-y-6 min-w-0" id="features">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs font-mono text-cyan-700 dark:text-cyan-400">
            <span>Simple Bulk Email Sender</span>
            <span aria-hidden="true">·</span>
            <span>Plug SMTP &amp; Send</span>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 min-h-[34px] rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121722] text-slate-700 dark:text-slate-200">
              <Palette className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
              <select
                aria-label="Select Theme"
                value={theme}
                onChange={(e) => onSelectTheme(e.target.value as ThemeId)}
                className="bg-transparent text-xs font-mono focus:outline-none cursor-pointer"
              >
                {THEME_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {t('en', opt.labelKey)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <h1 className="font-display font-extrabold tracking-tight leading-[1.08] text-3xl sm:text-5xl lg:text-[4.1rem] text-balance text-slate-900 dark:text-white">
            Send Email With{' '}
            <span className="bg-gradient-to-r from-cyan-500 via-sky-500 to-indigo-500 dark:from-cyan-300 dark:via-cyan-400 dark:to-indigo-400 bg-clip-text text-transparent">
              Any Address
            </span>
          </h1>

          <p
            className="text-sm sm:text-base lg:text-lg text-slate-600 dark:text-slate-400 max-w-xl leading-relaxed"
            id="pricing"
          >
            Sign in, plug in your SMTP, and send bulk emails right away. Use any sender
            address, paste HTML templates with a live editable preview, and send up to{' '}
            <strong className="text-slate-900 dark:text-white font-semibold">
              10,000 emails/sec
            </strong>{' '}
            or queue by the hour. Just{' '}
            <strong className="text-slate-900 dark:text-white font-semibold">$50/month</strong>.
          </p>

          <ul className="space-y-2.5 sm:space-y-3 pt-1 text-xs sm:text-sm text-slate-700 dark:text-slate-300 font-mono">
            {[
              'Send from any email address & name',
              'Blast up to 10,000 emails/sec or queue 50 to 1,000/hour',
              'Copy & paste HTML email templates with editable live preview',
              'Pick what time your emails go out',
              'See who opened your emails in real time',
              'Save drafts & view full sent history',
            ].map((item) => (
              <li key={item} className="flex items-start sm:items-center gap-3">
                <span className="w-5 h-5 rounded-full border border-emerald-500/40 bg-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                  <Check className="w-3 h-3 text-emerald-500" />
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Right Sign In / Register Card */}
        <div className="lg:col-span-5 min-w-0" id="auth-card-anchor">
          <div className="rounded-2xl border border-slate-200 dark:border-white/[0.09] bg-white dark:bg-[#0d1119] p-5 sm:p-8 shadow-sm">
            {loggedOutMessage && (
              <div className="mb-5 px-4 py-3 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-xs font-mono text-cyan-700 dark:text-cyan-300">
                {loggedOutMessage}
              </div>
            )}

            {resetSuccess && (
              <div className="mb-5 px-4 py-3 rounded-lg border border-emerald-500/35 bg-emerald-500/10 text-xs font-mono text-emerald-700 dark:text-emerald-300">
                {resetSuccess}
              </div>
            )}

            {error && (
              <div className="mb-5 px-4 py-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-xs text-rose-700 dark:text-rose-300">
                {error}
              </div>
            )}

            {/* Strictly 2 Tabs: Sign In | Register (Reset Password Tab is hidden) */}
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
                Register
              </button>
            </div>

            {/* STEP 1: FORGOT PASSWORD — ONLY EMAIL OR USERNAME, SENDS MAGIC LINK */}
            {authTab === 'forgot' && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-sm font-display font-bold text-slate-900 dark:text-white">
                    Forgot Password
                  </h2>
                  <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1">
                    Enter your email address or username and we&apos;ll send a magic link to your
                    email to set a new password.
                  </p>
                </div>

                {magicLinkSentInfo ? (
                  <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-4 space-y-3">
                    <div className="flex items-start gap-2.5">
                      <Mail className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      <div className="text-xs font-mono text-emerald-800 dark:text-emerald-200 leading-relaxed">
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
                        className="w-full py-2.5 px-3.5 rounded-lg bg-emerald-500 text-slate-950 text-xs font-mono font-bold inline-flex items-center justify-center gap-1.5 hover:opacity-95 transition-opacity"
                      >
                        <span>Open Magic Link to Set New Password</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label
                        htmlFor="forgot-identifier-input"
                        className="block text-xs font-mono text-slate-500 dark:text-slate-400 mb-1.5"
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
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-[#e8eff7] dark:text-slate-900 text-sm text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3.5 px-4 rounded-xl font-display font-extrabold text-sm text-slate-950 bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-400 hover:opacity-95 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>{loading ? 'Sending Magic Link...' : 'Send Magic Link'}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </form>
                )}

                <button
                  type="button"
                  onClick={() => switchTab('signin')}
                  className="w-full text-center text-xs font-mono text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer pt-1"
                >
                  ← Back to Sign In
                </button>
              </div>
            )}

            {/* STEP 2: MAGIC LINK OPENED (?reset_token=...) — SET NEW PASSWORD */}
            {authTab === 'new_password' && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-sm font-display font-bold text-slate-900 dark:text-white">
                    Set New Password
                  </h2>
                  {verifiedAccount && (
                    <p className="text-xs font-mono text-cyan-700 dark:text-cyan-400 mt-1">
                      Account: <strong>{verifiedAccount.username}</strong> ({verifiedAccount.email})
                    </p>
                  )}
                </div>

                {verifyingToken ? (
                  <div className="py-6 text-center text-xs font-mono text-slate-500">
                    Verifying magic link...
                  </div>
                ) : verifiedAccount ? (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label
                        htmlFor="auth-new-password-input"
                        className="block text-xs font-mono text-slate-500 dark:text-slate-400 mb-1.5"
                      >
                        New Password
                      </label>
                      <input
                        id="auth-new-password-input"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter new password (min 4 chars)"
                        required
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-[#e8eff7] dark:text-slate-900 text-sm text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="auth-confirm-password-input"
                        className="block text-xs font-mono text-slate-500 dark:text-slate-400 mb-1.5"
                      >
                        Confirm New Password
                      </label>
                      <input
                        id="auth-confirm-password-input"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter new password"
                        required
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-[#e8eff7] dark:text-slate-900 text-sm text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3.5 px-4 rounded-xl font-display font-extrabold text-sm text-slate-950 bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-400 hover:opacity-95 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>{loading ? 'Saving Password...' : 'Save New Password'}</span>
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
                    Request a New Magic Link
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => switchTab('signin')}
                  className="w-full text-center text-xs font-mono text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer pt-1"
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
                    className="block text-xs font-mono text-slate-500 dark:text-slate-400 mb-1.5"
                  >
                    {authTab === 'register' ? 'Choose a Username' : 'Email or Username'}
                  </label>
                  <input
                    id="auth-username-input"
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="Geekytycoon"
                    required
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-[#e8eff7] dark:text-slate-900 text-sm text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                {authTab === 'register' && (
                  <div>
                    <label
                      htmlFor="auth-email-input"
                      className="block text-xs font-mono text-slate-500 dark:text-slate-400 mb-1.5"
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
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-[#e8eff7] dark:text-slate-900 text-sm text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="auth-password-input"
                      className="block text-xs font-mono text-slate-500 dark:text-slate-400"
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
                        className="text-xs font-mono text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
                      >
                        Forgot Password?
                      </button>
                    )}
                  </div>
                  <input
                    id="auth-password-input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-[#e8eff7] dark:text-slate-900 text-sm text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                {authTab === 'register' && (
                  <p className="text-[11px] font-mono text-cyan-700 dark:text-cyan-300 bg-cyan-500/10 border border-cyan-500/25 rounded-lg px-3 py-2 leading-relaxed">
                    New accounts sign straight into a <strong>Free Trial</strong> workspace.
                    Activate a paid plan anytime to send emails.
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
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
      </main>

      <footer
        id="support"
        className="border-t border-slate-200 dark:border-white/[0.07] py-4 sm:py-5 px-4 sm:px-6 lg:px-12 text-xs text-center sm:text-left text-slate-500 dark:text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-3"
      >
        <span>234Mail — Plug in any SMTP and send bulk emails with ease.</span>
      </footer>
    </div>
  );
};
