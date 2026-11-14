import React from 'react';
import { ArrowRight, Check, Clock, Mail, Send, Settings } from 'lucide-react';
import { t } from '../i18n';
import type { DashboardSnapshot, LanguageCode } from '../types';

const FULL_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function formatDayMonthYear(raw: string, includeTime = false): string {
  if (!raw || !raw.trim()) return '—';
  const trimmed = raw.trim();
  const datePart = trimmed.slice(0, 10);
  const timePart = trimmed.length > 10 ? trimmed.slice(11, 16) : '';
  const parts = datePart.split('-');
  if (parts.length !== 3) return trimmed;
  const year = parts[0];
  const monthIdx = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  if (monthIdx < 0 || monthIdx > 11 || Number.isNaN(day) || day <= 0) return trimmed;
  const base = `${day} ${FULL_MONTHS[monthIdx]} ${year}`;
  return includeTime && timePart ? `${base}, ${timePart}` : base;
}

interface OverviewViewProps {
  snapshot: DashboardSnapshot;
  lang: LanguageCode;
  onNavigate: (tab: string) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({ snapshot, lang, onNavigate }) => {
  const { user, smtp, jobs, platformSettings } = snapshot;
  const isPaidActive =
    user.role === 'admin' ||
    (user.subscriptionStatus === 'active' &&
      user.daysLeft > 0 &&
      (user.paymentsCount || 0) > 0);
  const isFreeTrial =
    !isPaidActive &&
    user.subscriptionStatus !== 'expired' &&
    user.subscriptionStatus !== 'suspended';
  const isTrialLimitReached = isFreeTrial && (user.campaignsCount || 0) >= 5;
  const runningOrScheduled = jobs.filter((j) => j.status === 'running' || j.status === 'scheduled');
  const totalSent = jobs.reduce((sum, j) => sum + j.sentCount, 0);
  const totalOpened = jobs.reduce((sum, j) => sum + j.openedCount, 0);

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Simple Welcome Header matching Screenshot 7 */}
      <div>
        <h1 className="text-xl sm:text-3xl font-extrabold font-display tracking-tight text-slate-900 dark:text-white break-words">
          {t(lang, 'welcomeBack')}, {user.username}
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1 font-mono">
          {t(lang, 'commandCenterSub')}
        </p>
      </div>

      {/* 4 Simple Cards (2x2 compact grid on mobile phones, 4-col row on desktop/PC) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4 xl:gap-5">
        <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1119] p-4 sm:p-5">
          <div className="text-[11px] sm:text-xs font-mono text-slate-500 dark:text-slate-400">
            {t(lang, 'statusActive')}
          </div>
          <div
            className={`mt-1.5 sm:mt-2 text-lg sm:text-2xl font-extrabold font-display uppercase truncate ${
              isPaidActive
                ? 'text-emerald-600 dark:text-emerald-400'
                : isFreeTrial
                  ? 'text-amber-500 dark:text-amber-400'
                  : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {isPaidActive ? 'ACTIVE' : isFreeTrial ? 'FREE TRIAL' : user.subscriptionStatus}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1119] p-4 sm:p-5">
          <div className="text-[11px] sm:text-xs font-mono text-slate-500 dark:text-slate-400">
            {t(lang, 'daysLeft')}
          </div>
          <div className="mt-1.5 sm:mt-2 text-2xl sm:text-3xl font-extrabold font-mono tabular-nums text-cyan-500 dark:text-cyan-400">
            {user.daysLeft}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1119] p-4 sm:p-5">
          <div className="text-[11px] sm:text-xs font-mono text-slate-500 dark:text-slate-400">
            {t(lang, 'expires')}
          </div>
          <div className="mt-1.5 sm:mt-2 text-xs sm:text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white leading-snug break-words">
            {formatDayMonthYear(user.expiresAt)}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('smtp')}
          className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1119] p-4 sm:p-5 text-left hover:border-cyan-500/40 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs font-mono text-slate-500 dark:text-slate-400">
            <span className="truncate">{t(lang, 'smtpStatus')}</span>
            <Settings className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
          </div>
          {(snapshot.smtpPool && snapshot.smtpPool.length > 0) ||
          Boolean(smtp.useRealSmtp && smtp.host) ? (
            <div className="mt-1.5 sm:mt-2 flex items-center gap-1.5 text-xs sm:text-base font-bold font-mono text-emerald-600 dark:text-emerald-400">
              <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="truncate">{t(lang, 'configured')}</span>
            </div>
          ) : (
            <div className="mt-1.5 sm:mt-2 flex items-center gap-1.5 text-xs sm:text-base font-bold font-mono text-amber-500 dark:text-amber-400">
              <span className="truncate">Plug in SMTP →</span>
            </div>
          )}
        </button>
      </div>

      {/* Ready to Send Banner */}
      <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/[0.05] dark:bg-[#0b131e] p-4 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-base sm:text-lg font-extrabold font-display text-slate-900 dark:text-white">
            <Send className="w-4 h-4 text-cyan-500 shrink-0" />
            <span>Ready to Send?</span>
          </div>
          <p className="text-xs sm:text-sm font-mono text-slate-600 dark:text-slate-400 mt-1">
            Use any sender address. Switch between Plain, HTML templates, or Tracking — send up to 10,000/sec or queue by the hour.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('compose')}
          className="w-full md:w-auto min-h-[44px] px-5 py-3 rounded-xl bg-gradient-to-r from-cyan-400 to-indigo-400 text-slate-950 font-display font-extrabold text-xs sm:text-sm hover:opacity-95 transition-opacity inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Mail className="w-4 h-4" />
          <span>{t(lang, 'composeEmail')}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Active Queue Shortcut if emails are currently queued/sending */}
      {runningOrScheduled.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1119] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
          <div className="flex items-start sm:items-center gap-3">
            <Clock className="w-5 h-5 text-cyan-500 shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                {runningOrScheduled.length} Email Queue(s) Running or Scheduled
              </div>
              <div className="text-[11px] sm:text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
                Total Sent So Far: {totalSent.toLocaleString()} · Opened: {totalOpened.toLocaleString()}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('queue')}
            className="w-full sm:w-auto min-h-[40px] px-4 py-2 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-mono text-cyan-600 dark:text-cyan-400 hover:bg-slate-100 dark:hover:bg-white/5 whitespace-nowrap inline-flex items-center justify-center cursor-pointer"
          >
            View Email Queue →
          </button>
        </div>
      )}

      {/* Account & Subscription Two-Column Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1119] p-4 sm:p-6">
          <h2 className="text-xs font-mono font-semibold text-cyan-600 dark:text-cyan-400 mb-3 sm:mb-4">
            Account
          </h2>
          <dl className="divide-y divide-slate-100 dark:divide-white/[0.06] text-xs font-mono">
            <div className="py-3 flex items-center justify-between gap-3">
              <dt className="text-slate-500 dark:text-slate-400 shrink-0">Username</dt>
              <dd className="text-slate-900 dark:text-white font-semibold text-right break-all">
                {user.username}
              </dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-3">
              <dt className="text-slate-500 dark:text-slate-400 shrink-0">Email</dt>
              <dd className="text-slate-900 dark:text-white text-right break-all">{user.email}</dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-3">
              <dt className="text-slate-500 dark:text-slate-400 shrink-0">Joined</dt>
              <dd className="tabular-nums text-slate-700 dark:text-slate-300 text-right">
                {formatDayMonthYear(user.joinedAt)}
              </dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-3">
              <dt className="text-slate-500 dark:text-slate-400 shrink-0">Last login</dt>
              <dd className="tabular-nums text-slate-700 dark:text-slate-300 text-right">
                {formatDayMonthYear(user.lastLoginAt, true)}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1119] p-4 sm:p-6">
          <h2 className="text-xs font-mono font-semibold text-cyan-600 dark:text-cyan-400 mb-3 sm:mb-4">
            Subscription
          </h2>
          <dl className="divide-y divide-slate-100 dark:divide-white/[0.06] text-xs font-mono">
            <div className="py-3 flex items-center justify-between gap-3">
              <dt className="text-slate-500 dark:text-slate-400 shrink-0">Plan</dt>
              <dd className="text-slate-900 dark:text-white font-semibold text-right">
                {isPaidActive
                  ? `Monthly — $${platformSettings?.monthlyPriceUsd || 20} USDT`
                  : 'Free Trial'}
              </dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-3">
              <dt className="text-slate-500 dark:text-slate-400 shrink-0">Status</dt>
              <dd
                className={
                  isPaidActive
                    ? 'text-emerald-600 dark:text-emerald-400 text-right font-semibold'
                    : isFreeTrial
                      ? 'text-amber-600 dark:text-amber-400 text-right font-semibold'
                      : 'text-rose-600 dark:text-rose-400 uppercase text-right'
                }
              >
                {isPaidActive
                  ? 'Paid & Active'
                  : isTrialLimitReached
                    ? 'Payment Required'
                    : isFreeTrial
                      ? 'Free Trial'
                      : user.subscriptionStatus}
              </dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-3">
              <dt className="text-slate-500 dark:text-slate-400 shrink-0">Days left</dt>
              <dd className="tabular-nums text-cyan-600 dark:text-cyan-400 text-right">
                {user.daysLeft}
              </dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-3">
              <dt className="text-slate-500 dark:text-slate-400 shrink-0">Renew</dt>
              <dd className="text-right">
                <button
                  type="button"
                  onClick={() => onNavigate('subscription')}
                  className="text-cyan-600 dark:text-cyan-400 hover:underline py-1 cursor-pointer"
                >
                  Pay here →
                </button>
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
};
