import React, { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Database,
  Download,
  Eye,
  EyeOff,
  FileText,
  Globe,
  List,
  Mail,
  Pause,
  Play,
  RefreshCw,
  Search,
  Send,
  Server,
  Square,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import type {
  AdminCampaignItem,
  AdminRecipientListEntry,
  AdminSmtpEntry,
} from '../types';

export function downloadTextFile(
  filename: string,
  content: string,
  mimeType = 'text/plain;charset=utf-8'
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeCsvCell(val: string | number | boolean | null | undefined): string {
  const str = val == null ? '' : String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

interface AdminConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  busy?: boolean;
  checkboxLabel?: string;
  checkboxChecked?: boolean;
  onCheckboxChange?: (checked: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export const AdminConfirmModal: React.FC<AdminConfirmModalProps> = ({
  open,
  title,
  description,
  confirmLabel = 'Confirm Delete',
  busy = false,
  checkboxLabel,
  checkboxChecked = false,
  onCheckboxChange,
  onCancel,
  onConfirm,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0c1017] p-5 sm:p-6 space-y-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-display font-extrabold text-slate-900 dark:text-white">
            {title}
          </h3>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs font-mono text-slate-600 dark:text-slate-300 leading-relaxed">
          {description}
        </p>

        {checkboxLabel && onCheckboxChange && (
          <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-xs font-mono text-slate-700 dark:text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={checkboxChecked}
              onChange={(e) => onCheckboxChange(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-rose-500 shrink-0"
            />
            <span>{checkboxLabel}</span>
          </label>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-1 text-xs font-mono">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="min-h-[38px] px-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white whitespace-nowrap cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="min-h-[38px] px-4 py-2 rounded-xl bg-rose-600 text-white font-bold hover:bg-rose-500 disabled:opacity-50 whitespace-nowrap cursor-pointer"
          >
            {busy ? 'Deleting...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 1. SAVED USER SMTP's DIRECTORY SECTION
// ============================================================================
interface AdminSmtpsSectionProps {
  smtps: AdminSmtpEntry[];
  listsCount: number;
  filterOwnerId: string | null;
  filterOwnerLabel?: string | null;
  onClearOwnerFilter: () => void;
  onSwitchToLists: () => void;
  onLoginAsUserById: (ownerId: string) => void;
  onTestSmtp: (archiveKey: string) => Promise<void>;
  onRequestDeleteSmtp: (entry: AdminSmtpEntry) => void;
  onRefreshData: () => Promise<void>;
  testingArchiveKey: string | null;
  refreshing: boolean;
  onNotify: (ok: boolean, text: string) => void;
}

export const AdminSmtpsSection: React.FC<AdminSmtpsSectionProps> = ({
  smtps,
  listsCount,
  filterOwnerId,
  filterOwnerLabel,
  onClearOwnerFilter,
  onSwitchToLists,
  onLoginAsUserById,
  onTestSmtp,
  onRequestDeleteSmtp,
  onRefreshData,
  testingArchiveKey,
  refreshing,
  onNotify,
}) => {
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<
    'all' | 'verified' | 'errors' | 'live' | 'archived'
  >('all');
  const [showAllPasswords, setShowAllPasswords] = useState(true);
  const [passwordVisibilityOverrides, setPasswordVisibilityOverrides] = useState<
    Record<string, boolean>
  >({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyText = async (key: string, text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 1800);
    } catch {
      onNotify(false, `Could not copy ${label} to clipboard.`);
    }
  };

  const smtpStats = useMemo(() => {
    const total = smtps.length;
    const verified = smtps.filter((s) => s.verified && s.status !== 'error').length;
    const errors = smtps.filter((s) => !s.verified || s.status === 'error').length;
    const totalSent = smtps.reduce((sum, s) => sum + (s.sentCount || 0), 0);
    return { total, verified, errors, totalSent };
  }, [smtps]);

  const filteredSmtps = useMemo(() => {
    const q = search.trim().toLowerCase();
    return smtps.filter((s) => {
      if (filterOwnerId && s.ownerId !== filterOwnerId) return false;
      if (filterMode === 'verified' && (!s.verified || s.status === 'error')) return false;
      if (filterMode === 'errors' && s.verified && s.status !== 'error') return false;
      if (filterMode === 'live' && !s.isLiveInWorkspace) return false;
      if (filterMode === 'archived' && s.isLiveInWorkspace) return false;

      if (!q) return true;
      return (
        s.host.toLowerCase().includes(q) ||
        s.username.toLowerCase().includes(q) ||
        s.ownerUsername.toLowerCase().includes(q) ||
        s.ownerEmail.toLowerCase().includes(q) ||
        s.label.toLowerCase().includes(q) ||
        s.imapHost.toLowerCase().includes(q) ||
        String(s.port).includes(q) ||
        `#${s.ownerNumber}`.includes(q)
      );
    });
  }, [smtps, search, filterMode, filterOwnerId]);

  const handleCopyAllCombos = async () => {
    if (filteredSmtps.length === 0) return;
    const lines = filteredSmtps.map(
      (s) => `${s.host}:${s.port}|${s.username}|${s.password}`
    );
    await copyText('all_combos', lines.join('\n'), 'all SMTP combos');
    onNotify(true, `Copied ${filteredSmtps.length} SMTP server combo(s) to clipboard.`);
  };

  const handleExportTxt = () => {
    if (filteredSmtps.length === 0) return;
    const lines = filteredSmtps.map(
      (s) =>
        `${s.host}:${s.port}|${s.encryption.toUpperCase()}|${s.username}|${s.password}|user:${s.ownerUsername}`
    );
    downloadTextFile(
      `234mail-user-smtps-${new Date().toISOString().slice(0, 10)}.txt`,
      lines.join('\n')
    );
    onNotify(true, `Exported ${filteredSmtps.length} SMTP entries as .txt.`);
  };

  const handleExportCsv = () => {
    if (filteredSmtps.length === 0) return;
    const header = [
      'User #',
      'Username',
      'User Email',
      'Label',
      'SMTP Host',
      'Port',
      'Encryption',
      'SMTP Username',
      'SMTP Password',
      'IMAP Host',
      'Verified',
      'Status',
      'Sent Count',
      'Workspace State',
      'Saved At',
    ].join(',');
    const rows = filteredSmtps.map((s) =>
      [
        s.ownerNumber,
        s.ownerUsername,
        s.ownerEmail,
        s.label,
        s.host,
        s.port,
        s.encryption.toUpperCase(),
        s.username,
        s.password,
        s.imapHost,
        s.verified ? 'Yes' : 'No',
        s.status,
        s.sentCount,
        s.isLiveInWorkspace ? 'Live' : 'Removed by User',
        s.updatedAt || s.savedAt,
      ]
        .map(escapeCsvCell)
        .join(',')
    );
    downloadTextFile(
      `234mail-user-smtps-${new Date().toISOString().slice(0, 10)}.csv`,
      [header, ...rows].join('\n'),
      'text/csv;charset=utf-8'
    );
    onNotify(true, `Exported ${filteredSmtps.length} SMTP entries as .csv.`);
  };

  return (
    <div className="space-y-5">
      {/* Header + Quick Switch to Lists */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold font-display tracking-tight text-slate-900 dark:text-white">
              All Plugged-In SMTP&apos;s
            </h1>
            <button
              type="button"
              onClick={onSwitchToLists}
              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111622] text-[11px] font-mono text-cyan-600 dark:text-cyan-400 hover:border-cyan-500/40 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <List className="w-3.5 h-3.5" />
              <span>Email Lists ({listsCount}) →</span>
            </button>
          </div>
          <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1">
            Every SMTP server plugged into 234Mail (all existing user &amp; system SMTPs plus all new entries, with full credentials &amp; passwords).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setShowAllPasswords((prev) => !prev);
              setPasswordVisibilityOverrides({});
            }}
            className="min-h-[38px] px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1118] text-xs font-mono text-slate-700 dark:text-slate-300 hover:border-cyan-500/40 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            {showAllPasswords ? (
              <EyeOff className="w-3.5 h-3.5 text-cyan-500" />
            ) : (
              <Eye className="w-3.5 h-3.5 text-cyan-500" />
            )}
            <span>{showAllPasswords ? 'Hide Passwords' : 'Show Passwords'}</span>
          </button>

          <button
            type="button"
            disabled={filteredSmtps.length === 0}
            onClick={handleCopyAllCombos}
            className="min-h-[38px] px-3 py-2 rounded-xl border border-cyan-500/35 bg-cyan-500/10 text-xs font-mono font-semibold text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/20 disabled:opacity-40 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            {copiedKey === 'all_combos' ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span>Copy Combos</span>
          </button>

          <button
            type="button"
            disabled={filteredSmtps.length === 0}
            onClick={handleExportTxt}
            className="min-h-[38px] px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1118] text-xs font-mono text-slate-700 dark:text-slate-300 hover:border-cyan-500/40 disabled:opacity-40 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-cyan-500" />
            <span>Export .TXT</span>
          </button>

          <button
            type="button"
            disabled={filteredSmtps.length === 0}
            onClick={handleExportCsv}
            className="min-h-[38px] px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1118] text-xs font-mono text-slate-700 dark:text-slate-300 hover:border-cyan-500/40 disabled:opacity-40 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-emerald-500" />
            <span>Export .CSV</span>
          </button>

          <button
            type="button"
            disabled={refreshing}
            onClick={onRefreshData}
            className="min-h-[38px] px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1118] text-xs font-mono text-slate-700 dark:text-slate-300 hover:border-cyan-500/40 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-cyan-500' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-4">
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
            ALL PLUGGED-IN SMTPS
          </div>
          <div className="mt-1.5 text-2xl sm:text-3xl font-display font-extrabold tabular-nums text-cyan-500 dark:text-cyan-400">
            {smtpStats.total}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-4">
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
            VERIFIED READY
          </div>
          <div className="mt-1.5 text-2xl sm:text-3xl font-display font-extrabold tabular-nums text-emerald-500 dark:text-emerald-400">
            {smtpStats.verified}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-4">
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
            AUTH / RELAY WARNINGS
          </div>
          <div className="mt-1.5 text-2xl sm:text-3xl font-display font-extrabold tabular-nums text-amber-500 dark:text-amber-400">
            {smtpStats.errors}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-4">
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
            EMAILS DISPATCHED VIA SMTPS
          </div>
          <div className="mt-1.5 text-2xl sm:text-3xl font-display font-extrabold tabular-nums text-slate-900 dark:text-white">
            {smtpStats.totalSent.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search host, username, owner, port or IMAP..."
            className="w-full min-h-[40px] pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1118] text-xs font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'verified', label: 'Verified' },
              { id: 'errors', label: 'Warnings' },
              { id: 'live', label: 'Live in Pool' },
              { id: 'archived', label: 'Removed by User' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterMode(tab.id)}
              className={`min-h-[34px] px-3 py-1.5 rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                filterMode === tab.id
                  ? 'border-cyan-500 bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 font-semibold'
                  : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1118] text-slate-600 dark:text-slate-400 hover:border-cyan-500/35'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {filterOwnerId && (
        <div className="px-3.5 py-2.5 rounded-xl border border-cyan-500/35 bg-cyan-500/10 flex items-center justify-between gap-3 text-xs font-mono text-cyan-700 dark:text-cyan-300">
          <span>Showing saved SMTPs for {filterOwnerLabel || filterOwnerId}</span>
          <button
            type="button"
            onClick={onClearOwnerFilter}
            className="px-2.5 py-1 rounded-md border border-cyan-500/35 hover:bg-cyan-500/15 whitespace-nowrap cursor-pointer"
          >
            Show All Users
          </button>
        </div>
      )}

      {/* SMTP Cards Grid */}
      {filteredSmtps.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] py-16 px-4 text-center space-y-2">
          <Server className="w-7 h-7 text-slate-400 mx-auto" />
          <div className="text-sm font-display font-bold text-slate-800 dark:text-slate-200">
            No saved SMTP entries found
          </div>
          <div className="text-xs font-mono text-slate-500 max-w-md mx-auto">
            Whenever any user saves or updates an SMTP server in SMTP Settings, it appears here automatically in real time.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filteredSmtps.map((entry) => {
            const isRevealed =
              entry.archiveKey in passwordVisibilityOverrides
                ? passwordVisibilityOverrides[entry.archiveKey]
                : showAllPasswords;
            const isTesting = testingArchiveKey === entry.archiveKey;
            const comboStr = `${entry.host}:${entry.port}|${entry.username}|${entry.password}`;

            return (
              <div
                key={entry.archiveKey}
                className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-4 sm:p-5 flex flex-col justify-between gap-4 hover:border-cyan-500/30 transition-colors"
              >
                <div className="space-y-3.5">
                  {/* Top Meta Row */}
                  <div className="flex flex-wrap items-start justify-between gap-2.5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        <span>USER #{entry.ownerNumber || '—'}</span>
                        <span>·</span>
                        <span className="text-cyan-600 dark:text-cyan-400 font-bold">
                          {entry.ownerUsername}
                        </span>
                        {entry.ownerEmail && (
                          <span className="truncate max-w-[180px] lowercase">
                            ({entry.ownerEmail})
                          </span>
                        )}
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="text-base sm:text-lg font-display font-extrabold text-slate-900 dark:text-white break-all">
                          {entry.host}:{entry.port}
                        </span>
                        <span className="px-2 py-0.5 rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#141925] text-[10px] font-mono uppercase text-slate-600 dark:text-slate-300">
                          {entry.encryption.toUpperCase()}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400">
                          {entry.label}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <span
                        className={`px-2 py-0.5 rounded border text-[10px] font-mono font-bold uppercase ${
                          entry.verified && entry.status !== 'error'
                            ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'border-amber-500/35 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {entry.verified && entry.status !== 'error' ? 'Verified' : 'Unverified'}
                      </span>

                      <span
                        className={`px-2 py-0.5 rounded border text-[10px] font-mono uppercase ${
                          entry.isLiveInWorkspace
                            ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-300'
                            : 'border-slate-300 dark:border-white/10 bg-slate-100 dark:bg-white/[0.04] text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {entry.isLiveInWorkspace ? 'Plugged In' : 'Archived'}
                      </span>
                    </div>
                  </div>

                  {/* Credentials Grid */}
                  <div className="rounded-xl border border-slate-200 dark:border-white/[0.07] bg-slate-50 dark:bg-[#111622] p-3 space-y-2.5 text-xs font-mono">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[10px] uppercase text-slate-400 block">
                          SMTP Username / From
                        </span>
                        <span className="text-slate-900 dark:text-slate-100 break-all">
                          {entry.username}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          copyText(`usr_${entry.archiveKey}`, entry.username, 'username')
                        }
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0c1017] text-slate-500 hover:text-cyan-500 shrink-0 cursor-pointer"
                        title="Copy SMTP Username"
                      >
                        {copiedKey === `usr_${entry.archiveKey}` ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/80 dark:border-white/[0.06]">
                      <div className="min-w-0">
                        <span className="text-[10px] uppercase text-slate-400 block">
                          SMTP Password
                        </span>
                        <span className="text-cyan-700 dark:text-cyan-300 font-semibold break-all">
                          {isRevealed ? entry.password : '••••••••••••••'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setPasswordVisibilityOverrides((prev) => ({
                              ...prev,
                              [entry.archiveKey]: !isRevealed,
                            }))
                          }
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0c1017] text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                          title={isRevealed ? 'Hide password' : 'Show password'}
                        >
                          {isRevealed ? (
                            <EyeOff className="w-3.5 h-3.5" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            copyText(`pw_${entry.archiveKey}`, entry.password, 'password')
                          }
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0c1017] text-slate-500 hover:text-cyan-500 cursor-pointer"
                          title="Copy SMTP Password"
                        >
                          {copiedKey === `pw_${entry.archiveKey}` ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Secondary Details + Error Reason */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    <span>
                      IMAP: <strong className="text-slate-700 dark:text-slate-300">{entry.imapHost || 'Auto'}</strong>
                    </span>
                    <span className="tabular-nums">
                      Sent: <strong className="text-slate-700 dark:text-slate-300">{entry.sentCount.toLocaleString()}</strong>
                    </span>
                    <span className="tabular-nums">
                      Saved: {entry.updatedAt || entry.savedAt || '—'}
                    </span>
                  </div>

                  {entry.statusReason && (
                    <div className="px-3 py-2 rounded-xl border border-amber-500/30 bg-amber-500/10 text-[11px] font-mono text-amber-700 dark:text-amber-300 break-words">
                      {entry.statusReason}
                    </div>
                  )}
                </div>

                {/* Bottom Action Strip */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-white/[0.06] text-xs font-mono">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      disabled={isTesting}
                      onClick={() => onTestSmtp(entry.archiveKey)}
                      className="min-h-[34px] px-2.5 py-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      <RefreshCw className={`w-3 h-3 ${isTesting ? 'animate-spin' : ''}`} />
                      <span>{isTesting ? 'Testing...' : 'Test Live'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        copyText(`combo_${entry.archiveKey}`, comboStr, 'SMTP combo')
                      }
                      className="min-h-[34px] px-2.5 py-1.5 rounded-lg border border-cyan-500/35 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/20 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      {copiedKey === `combo_${entry.archiveKey}` ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                      <span>Copy Combo</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onLoginAsUserById(entry.ownerId)}
                      className="min-h-[34px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-600 dark:text-slate-300 hover:border-cyan-500/40 inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                    >
                      <Zap className="w-3 h-3 text-cyan-500" />
                      <span>Login As User</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => onRequestDeleteSmtp(entry)}
                    className="min-h-[34px] px-2.5 py-1.5 rounded-lg border border-rose-500/35 bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 2. SAVED RECIPIENT EMAIL LISTS & MASTER VAULT SECTION
// ============================================================================
interface AdminListsSectionProps {
  lists: AdminRecipientListEntry[];
  smtpsCount: number;
  filterOwnerId: string | null;
  filterOwnerLabel?: string | null;
  onClearOwnerFilter: () => void;
  onSwitchToSmtps: () => void;
  onLoginAsUserById: (ownerId: string) => void;
  onRequestDeleteList: (entry: AdminRecipientListEntry) => void;
  onNotify: (ok: boolean, text: string) => void;
}

interface MasterVaultContact {
  email: string;
  firstName: string;
  domain: string;
  ownerUsername: string;
  ownerNumber: number;
  savedAt: string;
}

export const AdminListsSection: React.FC<AdminListsSectionProps> = ({
  lists,
  smtpsCount,
  filterOwnerId,
  filterOwnerLabel,
  onClearOwnerFilter,
  onSwitchToSmtps,
  onLoginAsUserById,
  onRequestDeleteList,
  onNotify,
}) => {
  const [viewMode, setViewMode] = useState<'lists' | 'master'>('lists');
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'campaign' | 'draft'>('all');
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [previewList, setPreviewList] = useState<AdminRecipientListEntry | null>(null);
  const [previewSearch, setPreviewSearch] = useState('');

  // Build deduplicated Master Vault across all saved lists
  const masterContacts = useMemo<MasterVaultContact[]>(() => {
    const map = new Map<string, MasterVaultContact>();
    for (const lst of lists) {
      if (filterOwnerId && lst.ownerId !== filterOwnerId) continue;
      for (const r of lst.recipients) {
        const cleanEmail = (r.email || '').trim();
        const lower = cleanEmail.toLowerCase();
        if (!lower || !lower.includes('@')) continue;
        const existing = map.get(lower);
        const domain = lower.split('@')[1] || '';
        if (!existing) {
          map.set(lower, {
            email: cleanEmail,
            firstName: r.firstName || '',
            domain,
            ownerUsername: lst.ownerUsername,
            ownerNumber: lst.ownerNumber,
            savedAt: lst.savedAt,
          });
        } else if (!existing.firstName && r.firstName) {
          existing.firstName = r.firstName;
        }
      }
    }
    return Array.from(map.values());
  }, [lists, filterOwnerId]);

  const topDomains = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of masterContacts) {
      if (c.domain) counts.set(c.domain, (counts.get(c.domain) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [masterContacts]);

  const filteredLists = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lists.filter((lst) => {
      if (filterOwnerId && lst.ownerId !== filterOwnerId) return false;
      if (sourceFilter !== 'all' && lst.sourceType !== sourceFilter) return false;
      if (selectedDomain && !lst.uniqueDomains.includes(selectedDomain)) return false;
      if (!q) return true;
      return (
        lst.title.toLowerCase().includes(q) ||
        lst.subject.toLowerCase().includes(q) ||
        lst.ownerUsername.toLowerCase().includes(q) ||
        lst.ownerEmail.toLowerCase().includes(q) ||
        lst.fromEmail.toLowerCase().includes(q) ||
        lst.uniqueDomains.some((d) => d.includes(q)) ||
        lst.recipients.some((r) => r.email.toLowerCase().includes(q))
      );
    });
  }, [lists, search, sourceFilter, selectedDomain, filterOwnerId]);

  const filteredMasterContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return masterContacts.filter((c) => {
      if (selectedDomain && c.domain !== selectedDomain) return false;
      if (!q) return true;
      return (
        c.email.toLowerCase().includes(q) ||
        c.firstName.toLowerCase().includes(q) ||
        c.domain.includes(q) ||
        c.ownerUsername.toLowerCase().includes(q)
      );
    });
  }, [masterContacts, search, selectedDomain]);

  const copyEmailsArray = async (emails: string[], label: string) => {
    if (emails.length === 0) return;
    try {
      await navigator.clipboard.writeText(emails.join('\n'));
      onNotify(true, `Copied ${emails.length.toLocaleString()} email(s) from ${label}.`);
    } catch {
      onNotify(false, 'Clipboard copy was blocked by browser.');
    }
  };

  const exportListCsv = (
    rows: { email: string; firstName: string; extraOwner?: string }[],
    filenameBase: string
  ) => {
    if (rows.length === 0) return;
    const header = rows[0].extraOwner !== undefined ? 'Email,FirstName,UploadedBy' : 'Email,FirstName';
    const csvLines = rows.map((r) =>
      r.extraOwner !== undefined
        ? [escapeCsvCell(r.email), escapeCsvCell(r.firstName), escapeCsvCell(r.extraOwner)].join(',')
        : [escapeCsvCell(r.email), escapeCsvCell(r.firstName)].join(',')
    );
    downloadTextFile(
      `${filenameBase}.csv`,
      [header, ...csvLines].join('\n'),
      'text/csv;charset=utf-8'
    );
    onNotify(true, `Downloaded ${rows.length.toLocaleString()} contacts as CSV.`);
  };

  const exportListTxt = (emails: string[], filenameBase: string) => {
    if (emails.length === 0) return;
    downloadTextFile(`${filenameBase}.txt`, emails.join('\n'));
    onNotify(true, `Downloaded ${emails.length.toLocaleString()} emails as TXT.`);
  };

  const totalRawEntries = useMemo(
    () => lists.reduce((sum, l) => sum + (l.totalCount || 0), 0),
    [lists]
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold font-display tracking-tight text-slate-900 dark:text-white">
              Saved Email Lists
            </h1>
            <button
              type="button"
              onClick={onSwitchToSmtps}
              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111622] text-[11px] font-mono text-cyan-600 dark:text-cyan-400 hover:border-cyan-500/40 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Server className="w-3.5 h-3.5" />
              <span>← Saved SMTP&apos;s ({smtpsCount})</span>
            </button>
          </div>
          <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1">
            All recipient lists submitted across campaigns and drafts, plus a deduplicated Master Email Vault.
          </p>
        </div>

        {/* Mode Switcher */}
        <div className="inline-flex p-1 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1118] text-xs font-mono self-start lg:self-auto">
          <button
            type="button"
            onClick={() => setViewMode('lists')}
            className={`min-h-[34px] px-3.5 py-1.5 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
              viewMode === 'lists'
                ? 'bg-cyan-500 text-slate-950 font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>User Lists ({lists.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('master')}
            className={`min-h-[34px] px-3.5 py-1.5 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
              viewMode === 'master'
                ? 'bg-cyan-500 text-slate-950 font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Master Vault ({masterContacts.length.toLocaleString()})</span>
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-4">
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
            SUBMITTED LISTS
          </div>
          <div className="mt-1.5 text-2xl sm:text-3xl font-display font-extrabold tabular-nums text-cyan-500 dark:text-cyan-400">
            {lists.length}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-4">
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
            UNIQUE MASTER EMAILS
          </div>
          <div className="mt-1.5 text-2xl sm:text-3xl font-display font-extrabold tabular-nums text-emerald-500 dark:text-emerald-400">
            {masterContacts.length.toLocaleString()}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-4">
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
            TOTAL RECIPIENT ROWS
          </div>
          <div className="mt-1.5 text-2xl sm:text-3xl font-display font-extrabold tabular-nums text-slate-900 dark:text-white">
            {totalRawEntries.toLocaleString()}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-4">
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
            TOP RECIPIENT DOMAIN
          </div>
          <div className="mt-1.5 text-lg sm:text-xl font-display font-extrabold truncate text-amber-500 dark:text-amber-400">
            {topDomains[0] ? `${topDomains[0][0]} (${topDomains[0][1]})` : '—'}
          </div>
        </div>
      </div>

      {/* Top Domain Filter Bar */}
      {topDomains.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] font-mono">
          <span className="text-slate-400 inline-flex items-center gap-1 shrink-0 mr-1">
            <Globe className="w-3.5 h-3.5" />
            <span>Domains:</span>
          </span>
          <button
            type="button"
            onClick={() => setSelectedDomain(null)}
            className={`px-2.5 py-1 rounded-md border whitespace-nowrap cursor-pointer ${
              selectedDomain === null
                ? 'border-cyan-500 bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 font-bold'
                : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1118] text-slate-500'
            }`}
          >
            All Domains
          </button>
          {topDomains.map(([domain, count]) => (
            <button
              key={domain}
              type="button"
              onClick={() => setSelectedDomain((d) => (d === domain ? null : domain))}
              className={`px-2.5 py-1 rounded-md border whitespace-nowrap cursor-pointer ${
                selectedDomain === domain
                  ? 'border-cyan-500 bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 font-bold'
                  : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1118] text-slate-600 dark:text-slate-300 hover:border-cyan-500/35'
              }`}
            >
              {domain} ({count})
            </button>
          ))}
        </div>
      )}

      {/* Search & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              viewMode === 'lists'
                ? 'Search campaign title, user, sender or recipient...'
                : 'Search email address, first name, domain or user...'
            }
            className="w-full min-h-[40px] pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1118] text-xs font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>

        {viewMode === 'lists' ? (
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
            {(
              [
                { id: 'all', label: 'All Lists' },
                { id: 'campaign', label: 'Campaigns' },
                { id: 'draft', label: 'Drafts' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSourceFilter(f.id)}
                className={`min-h-[34px] px-3 py-1.5 rounded-lg border whitespace-nowrap cursor-pointer ${
                  sourceFilter === f.id
                    ? 'border-cyan-500 bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 font-semibold'
                    : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1118] text-slate-600 dark:text-slate-400'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            <button
              type="button"
              disabled={filteredMasterContacts.length === 0}
              onClick={() =>
                copyEmailsArray(
                  filteredMasterContacts.map((c) => c.email),
                  'Master Vault'
                )
              }
              className="min-h-[36px] px-3 py-1.5 rounded-xl border border-cyan-500/35 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy {filteredMasterContacts.length.toLocaleString()} Emails</span>
            </button>
            <button
              type="button"
              disabled={filteredMasterContacts.length === 0}
              onClick={() =>
                exportListTxt(
                  filteredMasterContacts.map((c) => c.email),
                  `234mail-master-emails-${new Date().toISOString().slice(0, 10)}`
                )
              }
              className="min-h-[36px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1118] text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-cyan-500" />
              <span>.TXT</span>
            </button>
            <button
              type="button"
              disabled={filteredMasterContacts.length === 0}
              onClick={() =>
                exportListCsv(
                  filteredMasterContacts.map((c) => ({
                    email: c.email,
                    firstName: c.firstName,
                    extraOwner: c.ownerUsername,
                  })),
                  `234mail-master-contacts-${new Date().toISOString().slice(0, 10)}`
                )
              }
              className="min-h-[36px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1118] text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-emerald-500" />
              <span>.CSV</span>
            </button>
          </div>
        )}
      </div>

      {filterOwnerId && (
        <div className="px-3.5 py-2.5 rounded-xl border border-cyan-500/35 bg-cyan-500/10 flex items-center justify-between gap-3 text-xs font-mono text-cyan-700 dark:text-cyan-300">
          <span>Showing saved lists for {filterOwnerLabel || filterOwnerId}</span>
          <button
            type="button"
            onClick={onClearOwnerFilter}
            className="px-2.5 py-1 rounded-md border border-cyan-500/35 hover:bg-cyan-500/15 whitespace-nowrap cursor-pointer"
          >
            Show All Users
          </button>
        </div>
      )}

      {/* Body: Submitted Lists vs Master Vault */}
      {viewMode === 'lists' ? (
        filteredLists.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] py-16 px-4 text-center space-y-2">
            <List className="w-7 h-7 text-slate-400 mx-auto" />
            <div className="text-sm font-display font-bold text-slate-800 dark:text-slate-200">
              No saved recipient lists yet
            </div>
            <div className="text-xs font-mono text-slate-500 max-w-md mx-auto">
              Recipient lists submitted by users in Send Email or saved in Drafts appear here automatically.
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {filteredLists.map((lst) => (
              <div
                key={lst.id}
                className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-4 sm:p-5 flex flex-col justify-between gap-4 hover:border-cyan-500/30 transition-colors"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-400">
                        <span>USER #{lst.ownerNumber || '—'}</span>
                        <span>·</span>
                        <span className="text-cyan-600 dark:text-cyan-400 font-bold">
                          {lst.ownerUsername}
                        </span>
                        <span>·</span>
                        <span>{lst.savedAt || '—'}</span>
                      </div>
                      <h3 className="text-base font-display font-extrabold text-slate-900 dark:text-white truncate mt-1">
                        {lst.title}
                      </h3>
                      {lst.fromEmail && (
                        <div className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          From: {lst.fromEmail}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="px-2.5 py-1 rounded-md border border-cyan-500/35 bg-cyan-500/10 text-xs font-mono font-bold tabular-nums text-cyan-600 dark:text-cyan-300">
                        {lst.totalCount.toLocaleString()} emails
                      </span>
                      <span className="text-[10px] font-mono uppercase text-slate-400">
                        {lst.sourceType}
                      </span>
                    </div>
                  </div>

                  {/* Preview Sample */}
                  <div className="rounded-xl border border-slate-200 dark:border-white/[0.07] bg-slate-50 dark:bg-[#111622] p-3 text-xs font-mono space-y-1">
                    {lst.recipients.slice(0, 3).map((r, i) => (
                      <div
                        key={`${lst.id}_${i}`}
                        className="flex items-center justify-between gap-2 text-slate-700 dark:text-slate-300 truncate"
                      >
                        <span className="truncate">{r.email}</span>
                        {r.firstName && (
                          <span className="text-[11px] text-slate-400 shrink-0">{r.firstName}</span>
                        )}
                      </div>
                    ))}
                    {lst.recipients.length > 3 && (
                      <div className="text-[11px] text-cyan-600 dark:text-cyan-400 pt-0.5">
                        + {(lst.totalCount - 3).toLocaleString()} more recipient(s)
                      </div>
                    )}
                  </div>

                  {lst.uniqueDomains.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {lst.uniqueDomains.slice(0, 5).map((dom) => (
                        <span
                          key={dom}
                          className="px-2 py-0.5 rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#141925] text-[10px] font-mono text-slate-500 dark:text-slate-400"
                        >
                          @{dom}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Action Strip */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-white/[0.06] text-xs font-mono">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewList(lst);
                        setPreviewSearch('');
                      }}
                      className="min-h-[34px] px-2.5 py-1.5 rounded-lg border border-cyan-500/35 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/20 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View List</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        copyEmailsArray(
                          lst.recipients.map((r) => r.email),
                          lst.title
                        )
                      }
                      className="min-h-[34px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-700 dark:text-slate-300 hover:border-cyan-500/40 inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        exportListCsv(
                          lst.recipients,
                          `list-${lst.ownerUsername}-${lst.id.slice(-6)}`
                        )
                      }
                      className="min-h-[34px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-700 dark:text-slate-300 hover:border-cyan-500/40 inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                    >
                      <Download className="w-3 h-3 text-emerald-500" />
                      <span>.CSV</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onLoginAsUserById(lst.ownerId)}
                      className="min-h-[34px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-600 dark:text-slate-300 hover:border-cyan-500/40 inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                    >
                      <Zap className="w-3 h-3 text-cyan-500" />
                      <span>User</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => onRequestDeleteList(lst)}
                    className="min-h-[34px] px-2.5 py-1.5 rounded-lg border border-rose-500/35 bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* Master Vault Table */
        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] overflow-hidden">
          {filteredMasterContacts.length === 0 ? (
            <div className="py-16 px-4 text-center text-xs font-mono text-slate-500">
              No contacts match your current filter.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-[#121722] text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="py-3 px-4">Email Address</th>
                    <th className="py-3 px-4">First Name</th>
                    <th className="py-3 px-4">Domain</th>
                    <th className="py-3 px-4">Uploaded By</th>
                    <th className="py-3 px-4">Saved At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/[0.05]">
                  {filteredMasterContacts.slice(0, 500).map((c) => (
                    <tr
                      key={c.email}
                      className="hover:bg-slate-50 dark:hover:bg-white/[0.02]"
                    >
                      <td className="py-2.5 px-4 text-slate-900 dark:text-slate-100 font-semibold">
                        {c.email}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">
                        {c.firstName || '—'}
                      </td>
                      <td className="py-2.5 px-4 text-cyan-600 dark:text-cyan-400">
                        @{c.domain}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">
                        #{c.ownerNumber} · {c.ownerUsername}
                      </td>
                      <td className="py-2.5 px-4 text-slate-400 tabular-nums">
                        {c.savedAt || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredMasterContacts.length > 500 && (
                <div className="py-2.5 px-4 border-t border-slate-200 dark:border-white/[0.07] text-[11px] font-mono text-slate-500 text-center">
                  Showing first 500 of {filteredMasterContacts.length.toLocaleString()} contacts — use Export .CSV or .TXT above to download the full set.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* List Preview Modal */}
      {previewList && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
          onClick={() => setPreviewList(null)}
        >
          <div
            className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0c1017] overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-white/[0.08] flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-mono uppercase text-cyan-600 dark:text-cyan-400">
                  USER #{previewList.ownerNumber} · {previewList.ownerUsername} · {previewList.sourceType}
                </div>
                <h3 className="text-base sm:text-lg font-display font-extrabold text-slate-900 dark:text-white truncate mt-0.5">
                  {previewList.title} ({previewList.totalCount.toLocaleString()} recipients)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewList(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 sm:px-5 border-b border-slate-200 dark:border-white/[0.07] flex flex-wrap items-center justify-between gap-2">
              <input
                type="text"
                value={previewSearch}
                onChange={(e) => setPreviewSearch(e.target.value)}
                placeholder="Filter recipients inside this list..."
                className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-xs font-mono text-slate-900 dark:text-white"
              />
              <div className="flex items-center gap-1.5 text-xs font-mono">
                <button
                  type="button"
                  onClick={() =>
                    copyEmailsArray(
                      previewList.recipients.map((r) => r.email),
                      previewList.title
                    )
                  }
                  className="px-3 py-1.5 rounded-lg bg-cyan-500 text-slate-950 font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy All</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    exportListTxt(
                      previewList.recipients.map((r) => r.email),
                      `list-${previewList.ownerUsername}-${previewList.id.slice(-6)}`
                    )
                  }
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  .TXT
                </button>
                <button
                  type="button"
                  onClick={() =>
                    exportListCsv(
                      previewList.recipients,
                      `list-${previewList.ownerUsername}-${previewList.id.slice(-6)}`
                    )
                  }
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  .CSV
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-white/[0.05] text-xs font-mono">
              {previewList.recipients
                .filter((r) => {
                  const q = previewSearch.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    r.email.toLowerCase().includes(q) ||
                    (r.firstName || '').toLowerCase().includes(q)
                  );
                })
                .slice(0, 1000)
                .map((r, idx) => (
                  <div
                    key={`${r.email}_${idx}`}
                    className="px-4 sm:px-5 py-2.5 flex items-center justify-between gap-3"
                  >
                    <span className="text-slate-900 dark:text-slate-100 break-all">
                      {r.email}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400 shrink-0">
                      {r.firstName || '—'}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 3. CROSS-TENANT GLOBAL CAMPAIGNS & QUEUE CONTROL SECTION
// ============================================================================
interface AdminCampaignsSectionProps {
  campaigns: AdminCampaignItem[];
  onJobAction: (
    jobId: string,
    action: 'pause' | 'resume' | 'stop' | 'start_now'
  ) => Promise<void>;
  onRequestDeleteJob: (job: AdminCampaignItem) => void;
  onLoginAsUserById: (ownerId: string) => void;
  busyJobId: string | null;
}

export const AdminCampaignsSection: React.FC<AdminCampaignsSectionProps> = ({
  campaigns,
  onJobAction,
  onRequestDeleteJob,
  onLoginAsUserById,
  busyJobId,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'running' | 'paused' | 'scheduled' | 'completed'
  >('all');

  const stats = useMemo(() => {
    const total = campaigns.length;
    const running = campaigns.filter((c) => c.status === 'running').length;
    const paused = campaigns.filter(
      (c) => c.status === 'paused' || c.status === 'failed'
    ).length;
    const totalSent = campaigns.reduce((s, c) => s + (c.sentCount || 0), 0);
    const totalOpened = campaigns.reduce((s, c) => s + (c.openedCount || 0), 0);
    return { total, running, paused, totalSent, totalOpened };
  }, [campaigns]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return campaigns.filter((c) => {
      if (statusFilter === 'running' && c.status !== 'running') return false;
      if (statusFilter === 'paused' && c.status !== 'paused' && c.status !== 'failed') {
        return false;
      }
      if (statusFilter === 'scheduled' && c.status !== 'scheduled') return false;
      if (
        statusFilter === 'completed' &&
        c.status !== 'completed' &&
        c.status !== 'stopped'
      ) {
        return false;
      }

      if (!q) return true;
      return (
        c.subject.toLowerCase().includes(q) ||
        c.campaignName.toLowerCase().includes(q) ||
        c.ownerUsername.toLowerCase().includes(q) ||
        c.fromEmail.toLowerCase().includes(q) ||
        `#${c.ownerNumber}`.includes(q)
      );
    });
  }, [campaigns, search, statusFilter]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold font-display tracking-tight text-slate-900 dark:text-white">
          Live Global Campaigns
        </h1>
        <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1">
          Monitor, pause, resume, or inspect outbound email campaigns across every user account in real time.
        </p>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-4">
          <div className="text-[10px] font-mono uppercase text-slate-500">ALL CAMPAIGNS</div>
          <div className="mt-1.5 text-2xl sm:text-3xl font-display font-extrabold tabular-nums text-cyan-500 dark:text-cyan-400">
            {stats.total}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-4">
          <div className="text-[10px] font-mono uppercase text-slate-500">RUNNING LIVE</div>
          <div className="mt-1.5 text-2xl sm:text-3xl font-display font-extrabold tabular-nums text-emerald-500 dark:text-emerald-400">
            {stats.running}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-4">
          <div className="text-[10px] font-mono uppercase text-slate-500">PAUSED / ERROR</div>
          <div className="mt-1.5 text-2xl sm:text-3xl font-display font-extrabold tabular-nums text-amber-500 dark:text-amber-400">
            {stats.paused}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-4">
          <div className="text-[10px] font-mono uppercase text-slate-500">TOTAL SENT</div>
          <div className="mt-1.5 text-2xl sm:text-3xl font-display font-extrabold tabular-nums text-slate-900 dark:text-white">
            {stats.totalSent.toLocaleString()}
          </div>
        </div>
        <div className="col-span-2 sm:col-span-1 rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-4">
          <div className="text-[10px] font-mono uppercase text-slate-500">TOTAL OPENS</div>
          <div className="mt-1.5 text-2xl sm:text-3xl font-display font-extrabold tabular-nums text-cyan-500 dark:text-cyan-400">
            {stats.totalOpened.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search subject, sender email, or username..."
            className="w-full min-h-[40px] pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1118] text-xs font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'running', label: 'Running' },
              { id: 'paused', label: 'Paused / Error' },
              { id: 'scheduled', label: 'Scheduled' },
              { id: 'completed', label: 'Completed' },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={`min-h-[34px] px-3 py-1.5 rounded-lg border whitespace-nowrap cursor-pointer ${
                statusFilter === f.id
                  ? 'border-cyan-500 bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 font-semibold'
                  : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1118] text-slate-600 dark:text-slate-400'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Campaigns List */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] py-16 px-4 text-center space-y-2">
          <Send className="w-7 h-7 text-slate-400 mx-auto" />
          <div className="text-sm font-display font-bold text-slate-800 dark:text-slate-200">
            No campaigns match your filter
          </div>
          <div className="text-xs font-mono text-slate-500">
            Outbound campaigns queued by any user appear here live.
          </div>
        </div>
      ) : (
        <div className="space-y-3.5">
          {filtered.map((job) => {
            const pct =
              job.totalRecipients > 0
                ? Math.min(100, Math.round((job.processedCount / job.totalRecipients) * 100))
                : 0;
            const isBusy = busyJobId === job.id;

            const statusBadge =
              job.status === 'running'
                ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : job.status === 'completed'
                  ? 'border-cyan-500/35 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400'
                  : job.status === 'paused' || job.status === 'scheduled'
                    ? 'border-amber-500/35 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    : 'border-rose-500/35 bg-rose-500/10 text-rose-600 dark:text-rose-400';

            return (
              <div
                key={job.id}
                className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-4 sm:p-5 space-y-3.5"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-400">
                      <span>USER #{job.ownerNumber || '—'}</span>
                      <span>·</span>
                      <span className="text-cyan-600 dark:text-cyan-400 font-bold">
                        {job.ownerUsername}
                      </span>
                      <span>·</span>
                      <span>{job.createdAt}</span>
                      {job.activeSmtpLabel && (
                        <>
                          <span>·</span>
                          <span className="text-emerald-600 dark:text-emerald-400">
                            Relay: {job.activeSmtpLabel}
                          </span>
                        </>
                      )}
                    </div>
                    <h3 className="text-base font-display font-extrabold text-slate-900 dark:text-white mt-1 break-words">
                      {job.subject}
                    </h3>
                    <div className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        <span>
                          {job.fromName ? `${job.fromName} <${job.fromEmail}>` : job.fromEmail}
                        </span>
                      </span>
                      <span>·</span>
                      <span className="uppercase">{job.mode}</span>
                    </div>
                  </div>

                  <span
                    className={`px-2.5 py-1 rounded-md border text-[10px] font-mono font-bold uppercase self-start shrink-0 ${statusBadge}`}
                  >
                    {job.status}
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums">
                    <span className="text-slate-700 dark:text-slate-300">
                      Sent <strong>{job.sentCount.toLocaleString()}</strong> /{' '}
                      {job.totalRecipients.toLocaleString()} ({pct}%)
                      {job.failedCount > 0 ? ` · Failed: ${job.failedCount}` : ''}
                    </span>
                    <span className="text-cyan-600 dark:text-cyan-400">
                      Opens: <strong>{job.openedCount.toLocaleString()}</strong>
                      {job.failoverCount ? ` · Failovers: ${job.failoverCount}` : ''}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-[#151b28] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {(job.pauseReason || job.lastSmtpError) && (
                  <div className="px-3 py-2 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs font-mono text-amber-700 dark:text-amber-300 break-words">
                    {job.pauseReason || job.lastSmtpError}
                  </div>
                )}

                {/* Controls */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs font-mono">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {job.status === 'running' && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => onJobAction(job.id, 'pause')}
                        className="min-h-[34px] px-3 py-1.5 rounded-lg border border-amber-500/35 bg-amber-500/10 text-amber-600 dark:text-amber-400 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                      >
                        <Pause className="w-3 h-3" />
                        <span>Pause</span>
                      </button>
                    )}

                    {(job.status === 'paused' || job.status === 'failed') && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => onJobAction(job.id, 'resume')}
                        className="min-h-[34px] px-3 py-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                      >
                        <Play className="w-3 h-3" />
                        <span>Resume</span>
                      </button>
                    )}

                    {job.status === 'scheduled' && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => onJobAction(job.id, 'start_now')}
                        className="min-h-[34px] px-3 py-1.5 rounded-lg border border-cyan-500/35 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                      >
                        <Play className="w-3 h-3" />
                        <span>Start Now</span>
                      </button>
                    )}

                    {(job.status === 'running' ||
                      job.status === 'paused' ||
                      job.status === 'scheduled') && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => onJobAction(job.id, 'stop')}
                        className="min-h-[34px] px-3 py-1.5 rounded-lg border border-rose-500/35 bg-rose-500/10 text-rose-600 dark:text-rose-400 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                      >
                        <Square className="w-3 h-3" />
                        <span>Stop</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onLoginAsUserById(job.ownerId)}
                      className="min-h-[34px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-600 dark:text-slate-300 hover:border-cyan-500/40 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      <Zap className="w-3 h-3 text-cyan-500" />
                      <span>Login As User</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onRequestDeleteJob(job)}
                    className="min-h-[34px] px-3 py-1.5 rounded-lg border border-rose-500/35 bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
