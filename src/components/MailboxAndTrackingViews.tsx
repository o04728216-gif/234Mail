import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Inbox,
  MailCheck,
  RefreshCw,
  Search,
  Server,
  Settings,
  Trash2,
} from 'lucide-react';
import type {
  DashboardSnapshot,
  DraftItem,
  InboxMessage,
  InboxSyncInfo,
  TrackingRecord,
} from '../types';
import { apiRequest, downloadCsvReport } from '../utils/api';

interface SentCampaignsViewProps {
  token: string;
  snapshot: DashboardSnapshot;
  onJobsDeleted: (deletedIds: string[]) => void;
}

export const SentCampaignsView: React.FC<SentCampaignsViewProps> = ({
  token,
  snapshot,
  onJobsDeleted,
}) => {
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return snapshot.jobs;
    return snapshot.jobs.filter(
      (j) => j.subject.toLowerCase().includes(q) || j.fromEmail.toLowerCase().includes(q)
    );
  }, [snapshot.jobs, search]);

  const handleDeleteOne = async (jobId: string) => {
    setErrorMsg(null);
    setDeletingId(jobId);
    try {
      const res = await apiRequest<{ deletedIds: string[] }>(
        `/api/jobs/${jobId}`,
        { method: 'DELETE' },
        token
      );
      onJobsDeleted(res.deletedIds?.length ? res.deletedIds : [jobId]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not delete sent email');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteAll = async () => {
    setErrorMsg(null);
    setClearingAll(true);
    try {
      const res = await apiRequest<{ deletedIds: string[] }>(
        '/api/jobs',
        { method: 'DELETE' },
        token
      );
      onJobsDeleted(res.deletedIds || snapshot.jobs.map((j) => j.id));
      setConfirmClearAll(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not delete sent emails');
    } finally {
      setClearingAll(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-display tracking-tight text-slate-900 dark:text-white">
            Sent
          </h1>
          <p className="text-xs sm:text-sm font-mono text-slate-600 dark:text-slate-400 mt-1">
            All email campaigns you have sent. Deleting an item here also removes it from Email Queue.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-60 min-w-[180px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sent..."
              className="w-full min-h-[40px] pl-8 pr-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1119] text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          <button
            type="button"
            onClick={() =>
              downloadCsvReport(
                '234mail-sent.csv',
                filtered.map((j) => ({
                  Subject: j.subject,
                  From: j.fromEmail,
                  Mode: j.mode,
                  Sent: j.sentCount,
                  Failed: j.failedCount,
                  Status: j.status,
                  Date: j.createdAt,
                }))
              )
            }
            className="min-h-[40px] px-3.5 py-2 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-mono text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>

          {snapshot.jobs.length > 0 && !confirmClearAll && (
            <button
              type="button"
              onClick={() => setConfirmClearAll(true)}
              className="min-h-[40px] px-3.5 py-2 rounded-lg border border-rose-500/35 bg-rose-500/10 hover:bg-rose-500/20 text-xs font-mono font-semibold text-rose-600 dark:text-rose-400 inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete All Sent</span>
            </button>
          )}

          {snapshot.jobs.length > 0 && confirmClearAll && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={clearingAll}
                onClick={handleDeleteAll}
                className="min-h-[40px] px-3.5 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-xs font-mono font-bold text-white inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{clearingAll ? 'Deleting...' : 'Confirm Delete All'}</span>
              </button>
              <button
                type="button"
                disabled={clearingAll}
                onClick={() => setConfirmClearAll(false)}
                className="min-h-[40px] px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-mono text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="px-4 py-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs font-mono text-rose-700 dark:text-rose-300">
          {errorMsg}
        </div>
      )}

      {/* Mobile Card List (< md) */}
      <div className="md:hidden space-y-3">
        {filtered.map((j) => (
          <div
            key={j.id}
            className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1119] p-4 space-y-2.5"
          >
            <div className="flex items-start justify-between gap-2.5">
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900 dark:text-white break-words">
                  {j.subject}
                </div>
                <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5 break-all">
                  From: {j.fromEmail}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`px-2 py-0.5 rounded border text-[10px] font-mono font-bold uppercase ${
                    j.status === 'failed'
                      ? 'border-rose-500/35 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                      : j.status === 'completed' && j.failedCount === 0
                        ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : j.status === 'running'
                          ? 'border-cyan-500/35 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400'
                          : 'border-amber-500/35 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {j.status}
                </span>
                <button
                  type="button"
                  disabled={deletingId === j.id}
                  onClick={() => handleDeleteOne(j.id)}
                  title="Delete from Sent & Email Queue"
                  className="min-h-[32px] px-2.5 py-1 rounded-lg border border-rose-500/35 bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-50 text-[11px] font-mono font-semibold text-rose-600 dark:text-rose-400 inline-flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>{deletingId === j.id ? '...' : 'Delete'}</span>
                </button>
              </div>
            </div>

            {j.status === 'paused' && (
              <div className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 font-mono text-[11px] text-amber-700 dark:text-amber-300 leading-snug break-words">
                {j.pauseReason ||
                  'Reason: Paused manually by you — stays paused until you click Resume.'}
              </div>
            )}

            {j.lastSmtpError && (
              <div className="p-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 font-mono text-[11px] text-rose-700 dark:text-rose-300 leading-snug break-words">
                SMTP Error: {j.lastSmtpError}
              </div>
            )}

            <div className="pt-2 border-t border-slate-100 dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums">
              <div className="flex items-center gap-3">
                <span className="uppercase text-cyan-600 dark:text-cyan-400 font-semibold">
                  {j.mode}
                </span>
                <span className="text-emerald-600 dark:text-emerald-400">
                  Sent: {j.sentCount.toLocaleString()}
                </span>
                <span className="text-rose-500">Failed: {j.failedCount}</span>
              </div>
              <span className="text-slate-400 dark:text-slate-500">{j.createdAt}</span>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1119] py-12 text-center text-xs font-mono text-slate-500">
            No sent campaigns match your search.
          </div>
        )}
      </div>

      {/* Desktop Sent Table (md+) */}
      <div className="hidden md:block rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1119] overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-[#111621]">
              <th className="py-3 px-4 font-medium">Subject</th>
              <th className="py-3 px-4 font-medium">From</th>
              <th className="py-3 px-4 font-medium">Mode</th>
              <th className="py-3 px-4 font-medium text-right">Sent</th>
              <th className="py-3 px-4 font-medium text-right">Failed</th>
              <th className="py-3 px-4 font-medium">Status</th>
              <th className="py-3 px-4 font-medium text-right">Date</th>
              <th className="py-3 px-4 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/[0.05] font-mono tabular-nums">
            {filtered.map((j) => (
              <tr key={j.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                <td className="py-3 px-4 font-sans font-semibold text-slate-900 dark:text-white max-w-md">
                  <div className="truncate">{j.subject}</div>
                  {j.status === 'paused' && (
                    <div className="mt-1 font-mono font-normal text-[11px] text-amber-600 dark:text-amber-400 whitespace-normal leading-snug break-words">
                      {j.pauseReason ||
                        'Reason: Paused manually by you — stays paused until you click Resume.'}
                    </div>
                  )}
                  {j.lastSmtpError && (
                    <div className="mt-1 font-mono font-normal text-[11px] text-rose-600 dark:text-rose-400 whitespace-normal leading-snug break-words">
                      SMTP Error: {j.lastSmtpError}
                    </div>
                  )}
                </td>
                <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{j.fromEmail}</td>
                <td className="py-3 px-4 uppercase text-cyan-600 dark:text-cyan-400">{j.mode}</td>
                <td className="py-3 px-4 text-right text-emerald-600 dark:text-emerald-400">
                  {j.sentCount.toLocaleString()}
                </td>
                <td className="py-3 px-4 text-right text-rose-500">{j.failedCount}</td>
                <td className="py-3 px-4 uppercase">
                  <span
                    className={
                      j.status === 'failed'
                        ? 'text-rose-600 dark:text-rose-400 font-semibold'
                        : j.status === 'completed' && j.failedCount === 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : j.status === 'running'
                            ? 'text-cyan-600 dark:text-cyan-400'
                            : 'text-amber-500'
                    }
                  >
                    {j.status}
                  </span>
                </td>
                <td className="py-3 px-4 text-right text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  {j.createdAt}
                </td>
                <td className="py-3 px-4 text-right whitespace-nowrap">
                  <button
                    type="button"
                    disabled={deletingId === j.id}
                    onClick={() => handleDeleteOne(j.id)}
                    title="Delete from Sent & Email Queue"
                    className="min-h-[32px] px-2.5 py-1 rounded-lg border border-rose-500/35 bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-50 text-[11px] font-mono font-semibold text-rose-600 dark:text-rose-400 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>{deletingId === j.id ? '...' : 'Delete'}</span>
                  </button>
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-500">
                  No sent campaigns match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ============================================================================
// TRACKING VIEW WITH 100-PER-PAGE PAGINATION
// ============================================================================
const TRACKING_PAGE_SIZE = 100;

interface TrackingViewProps {
  token: string;
  snapshot: DashboardSnapshot;
  onRefresh: () => Promise<void>;
  onRecordUpdated: (record: TrackingRecord) => void;
}

export const TrackingView: React.FC<TrackingViewProps> = ({ snapshot, onRefresh }) => {
  const [selectedJobId, setSelectedJobId] = useState<string>('all');
  const [searchEmail, setSearchEmail] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [refreshing, setRefreshing] = useState(false);

  const filteredRecords = useMemo(() => {
    const q = searchEmail.trim().toLowerCase();
    return snapshot.tracking.filter((r) => {
      if (selectedJobId !== 'all' && r.jobId !== selectedJobId) return false;
      if (q && !r.recipientEmail.toLowerCase().includes(q) && !r.campaignName.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [snapshot.tracking, selectedJobId, searchEmail]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / TRACKING_PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedRecords = useMemo(() => {
    const startIdx = (safePage - 1) * TRACKING_PAGE_SIZE;
    return filteredRecords.slice(startIdx, startIdx + TRACKING_PAGE_SIZE);
  }, [filteredRecords, safePage]);

  const startItemNum = filteredRecords.length === 0 ? 0 : (safePage - 1) * TRACKING_PAGE_SIZE + 1;
  const endItemNum = Math.min(safePage * TRACKING_PAGE_SIZE, filteredRecords.length);

  const trackedJobs = snapshot.jobs.filter((j) => j.mode === 'tracking');
  const totalTracked =
    selectedJobId === 'all' && !searchEmail.trim()
      ? Math.max(
          trackedJobs.reduce((acc, j) => acc + j.sentCount, 0),
          filteredRecords.length
        )
      : filteredRecords.length;
  const totalOpened = filteredRecords.filter((r) => r.opens > 0).length;
  const unopened = Math.max(0, totalTracked - totalOpened);
  const openRatePct = totalTracked > 0 ? Math.round((totalOpened / totalTracked) * 100) : 0;

  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const maxButtons = 7;
    let start = Math.max(1, safePage - 3);
    const end = Math.min(totalPages, start + maxButtons - 1);
    start = Math.max(1, end - maxButtons + 1);
    for (let p = start; p <= end; p++) {
      pages.push(p);
    }
    return pages;
  }, [safePage, totalPages]);

  const renderPaginationBar = () => (
    <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/70 dark:bg-[#111621] text-xs font-mono">
      <div className="text-slate-500 dark:text-slate-400 tabular-nums">
        Showing{' '}
        <span className="font-semibold text-slate-900 dark:text-white">
          {startItemNum.toLocaleString()}–{endItemNum.toLocaleString()}
        </span>{' '}
        of{' '}
        <span className="font-semibold text-cyan-600 dark:text-cyan-400">
          {filteredRecords.length.toLocaleString()}
        </span>{' '}
        tracked emails ({TRACKING_PAGE_SIZE} per page)
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => setCurrentPage((p) => Math.max(1, Math.min(p, totalPages) - 1))}
          className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1119] text-slate-700 dark:text-slate-300 hover:border-cyan-500/40 disabled:opacity-40 inline-flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>Prev</span>
        </button>

        {pageNumbers.map((pageNum) => (
          <button
            key={pageNum}
            type="button"
            onClick={() => setCurrentPage(pageNum)}
            className={`min-h-[38px] min-w-[36px] px-2.5 py-1.5 rounded-lg border text-center tabular-nums transition-colors cursor-pointer ${
              pageNum === safePage
                ? 'border-cyan-500 bg-cyan-500 text-slate-950 font-bold'
                : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1119] text-slate-700 dark:text-slate-300 hover:border-cyan-500/40'
            }`}
          >
            {pageNum}
          </button>
        ))}

        <button
          type="button"
          disabled={safePage >= totalPages}
          onClick={() => setCurrentPage((p) => Math.min(totalPages, Math.min(p, totalPages) + 1))}
          className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1119] text-slate-700 dark:text-slate-300 hover:border-cyan-500/40 disabled:opacity-40 inline-flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed"
        >
          <span>Next</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-display tracking-tight text-slate-900 dark:text-white">
            Email Tracking
          </h1>
          <p className="text-xs sm:text-sm font-mono text-slate-600 dark:text-slate-400 mt-1">
            Who opened your tracked emails — paginated at 100 emails per page.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            downloadCsvReport(
              '234mail-tracking.csv',
              filteredRecords.map((r) => ({
                Recipient: r.recipientEmail,
                Opens: r.opens,
                FirstOpened: r.firstOpenedAt || '',
                LastOpened: r.lastOpenedAt || '',
                Campaign: r.campaignName,
              }))
            )
          }
          className="w-full sm:w-auto min-h-[42px] px-3.5 py-2 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-mono text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 inline-flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Download CSV</span>
        </button>
      </div>

      {/* 4 Summary Cards (2x2 on mobile, 4-col on desktop) */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1119] p-4 sm:p-5">
          <div className="text-[11px] sm:text-xs font-mono text-slate-500 dark:text-slate-400">
            Total Tracked
          </div>
          <div className="mt-1.5 sm:mt-2 text-2xl sm:text-3xl font-extrabold font-mono tabular-nums text-cyan-500 dark:text-cyan-400">
            {totalTracked.toLocaleString()}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1119] p-4 sm:p-5">
          <div className="text-[11px] sm:text-xs font-mono text-slate-500 dark:text-slate-400">
            Opened
          </div>
          <div className="mt-1.5 sm:mt-2 text-2xl sm:text-3xl font-extrabold font-mono tabular-nums text-emerald-500 dark:text-emerald-400">
            {totalOpened.toLocaleString()}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1119] p-4 sm:p-5">
          <div className="text-[11px] sm:text-xs font-mono text-slate-500 dark:text-slate-400">
            Unopened
          </div>
          <div className="mt-1.5 sm:mt-2 text-2xl sm:text-3xl font-extrabold font-mono tabular-nums text-rose-500 dark:text-rose-400">
            {unopened.toLocaleString()}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1119] p-4 sm:p-5">
          <div className="text-[11px] sm:text-xs font-mono text-slate-500 dark:text-slate-400">
            Open Rate
          </div>
          <div className="mt-1.5 sm:mt-2 text-2xl sm:text-3xl font-extrabold font-mono tabular-nums text-amber-500">
            {openRatePct}%
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 w-full lg:w-auto">
          <label
            htmlFor="tracking-campaign-select"
            className="text-xs font-mono text-slate-500 dark:text-slate-400 shrink-0"
          >
            Campaign:
          </label>
          <select
            id="tracking-campaign-select"
            value={selectedJobId}
            onChange={(e) => {
              setSelectedJobId(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full sm:w-auto sm:min-w-[220px] sm:max-w-xs min-h-[42px] px-3.5 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1119] text-xs font-mono text-slate-900 dark:text-white"
          >
            <option value="all">All Campaigns</option>
            {snapshot.jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.subject}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={async () => {
              setRefreshing(true);
              await onRefresh();
              setRefreshing(false);
            }}
            className="min-h-[42px] px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-400 to-indigo-400 text-slate-950 text-xs font-display font-bold inline-flex items-center justify-center gap-1.5 hover:opacity-95 cursor-pointer shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        <div className="relative w-full lg:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchEmail}
            onChange={(e) => {
              setSearchEmail(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Filter recipient email..."
            className="w-full min-h-[42px] pl-8 pr-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1119] text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1119] overflow-hidden">
        <div className="border-b border-slate-200 dark:border-white/[0.08]">
          {renderPaginationBar()}
        </div>

        {/* Mobile Tracked Recipient Cards (< md) */}
        <div className="md:hidden divide-y divide-slate-100 dark:divide-white/[0.06]">
          {paginatedRecords.map((rec, idx) => {
            const rowNumber = (safePage - 1) * TRACKING_PAGE_SIZE + idx + 1;
            return (
              <div key={rec.id} className="p-4 space-y-2 text-xs font-mono">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums mr-1.5">
                      #{rowNumber}
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-white break-all">
                      {rec.recipientEmail}
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded border text-[10px] font-bold shrink-0 tabular-nums ${
                      rec.opens > 0
                        ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'border-slate-200 dark:border-white/10 text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {rec.opens > 0 ? `Opened ${rec.opens}×` : 'Unopened'}
                  </span>
                </div>

                <div className="font-sans text-xs text-slate-600 dark:text-slate-300 truncate">
                  {rec.campaignName}
                </div>

                {rec.opens > 0 && (
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
                    <span>First: {rec.firstOpenedAt || '—'}</span>
                    <span>Last: {rec.lastOpenedAt || '—'}</span>
                  </div>
                )}
              </div>
            );
          })}

          {paginatedRecords.length === 0 && (
            <div className="py-12 px-4 text-center text-xs font-mono text-slate-500">
              No tracked emails match your filter.
            </div>
          )}
        </div>

        {/* Desktop Table (md+) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-[#0f141e]">
                <th className="py-3 px-4 font-medium w-14">#</th>
                <th className="py-3 px-4 font-medium">Recipient</th>
                <th className="py-3 px-4 font-medium text-right">Opens</th>
                <th className="py-3 px-4 font-medium">First Opened</th>
                <th className="py-3 px-4 font-medium">Last Opened</th>
                <th className="py-3 px-4 font-medium">Campaign</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.05] font-mono tabular-nums">
              {paginatedRecords.map((rec, idx) => {
                const rowNumber = (safePage - 1) * TRACKING_PAGE_SIZE + idx + 1;
                return (
                  <tr key={rec.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                    <td className="py-3 px-4 text-slate-400 dark:text-slate-500">{rowNumber}</td>
                    <td className="py-3 px-4 text-slate-900 dark:text-white">
                      {rec.recipientEmail}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold">
                      <span
                        className={
                          rec.opens > 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-400 dark:text-slate-500'
                        }
                      >
                        {rec.opens}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-500 dark:text-slate-400">
                      {rec.firstOpenedAt || '—'}
                    </td>
                    <td className="py-3 px-4 text-slate-500 dark:text-slate-400">
                      {rec.lastOpenedAt || '—'}
                    </td>
                    <td className="py-3 px-4 font-sans text-slate-600 dark:text-slate-300 truncate max-w-[200px]">
                      {rec.campaignName}
                    </td>
                  </tr>
                );
              })}

              {paginatedRecords.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    No tracked emails match your filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filteredRecords.length > TRACKING_PAGE_SIZE && (
          <div className="border-t border-slate-200 dark:border-white/[0.08]">
            {renderPaginationBar()}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// INBOX VIEW — LIVE SYNC FROM ANY CHOSEN CONFIGURED SMTP ACCOUNT
// ============================================================================
interface InboxViewProps {
  token: string;
  snapshot: DashboardSnapshot;
  onInboxUpdated: (inbox: InboxMessage[], inboxSync?: InboxSyncInfo) => void;
  onNavigateSmtp: () => void;
}

export const InboxView: React.FC<InboxViewProps> = ({
  token,
  snapshot,
  onInboxUpdated,
  onNavigateSmtp,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(snapshot.inbox[0]?.id || null);
  const [mobileReaderOpen, setMobileReaderOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [switchingSmtpId, setSwitchingSmtpId] = useState<string | null>(null);
  const [viewRichHtml, setViewRichHtml] = useState(true);
  const autoSyncedOnceRef = useRef(false);

  const smtpAccounts = useMemo(() => {
    if (snapshot.smtpPool && snapshot.smtpPool.length > 0) {
      return snapshot.smtpPool;
    }
    if (snapshot.smtp.useRealSmtp && snapshot.smtp.username) {
      return [snapshot.smtp];
    }
    return [];
  }, [snapshot.smtpPool, snapshot.smtp]);

  const activeInboxSmtpId = useMemo(() => {
    if (switchingSmtpId && smtpAccounts.some((a) => a.id === switchingSmtpId)) {
      return switchingSmtpId;
    }
    if (
      snapshot.inboxSync.smtpId &&
      smtpAccounts.some((a) => a.id === snapshot.inboxSync.smtpId)
    ) {
      return snapshot.inboxSync.smtpId;
    }
    const primary = smtpAccounts.find((a) => a.isPrimary) || smtpAccounts[0];
    return primary?.id || '';
  }, [switchingSmtpId, snapshot.inboxSync.smtpId, smtpAccounts]);

  const currentInboxAccount = useMemo(
    () =>
      smtpAccounts.find((a) => a.id === activeInboxSmtpId) ||
      (snapshot.smtp.useRealSmtp ? snapshot.smtp : null),
    [smtpAccounts, activeInboxSmtpId, snapshot.smtp]
  );

  const selectedMsg =
    snapshot.inbox.find((m) => m.id === selectedId) || snapshot.inbox[0] || null;

  const handleSyncFromSmtp = async (targetSmtpId?: string) => {
    const cleanTargetId =
      typeof targetSmtpId === 'string' && targetSmtpId.trim()
        ? targetSmtpId.trim()
        : activeInboxSmtpId || undefined;
    const isSwitching = Boolean(
      cleanTargetId && snapshot.inboxSync.smtpId && cleanTargetId !== snapshot.inboxSync.smtpId
    );

    if (cleanTargetId) {
      setSwitchingSmtpId(cleanTargetId);
    }
    if (isSwitching) {
      setSelectedId(null);
      setMobileReaderOpen(false);
    }
    setSyncing(true);

    try {
      const res = await apiRequest<{ inbox: InboxMessage[]; inboxSync: InboxSyncInfo }>(
        '/api/inbox/sync',
        {
          method: 'POST',
          body: JSON.stringify({ smtpId: cleanTargetId }),
        },
        token
      );
      onInboxUpdated(res.inbox, res.inboxSync);
      if (isSwitching) {
        setSelectedId(res.inbox[0]?.id || null);
      } else if (res.inbox.length > 0 && !selectedId) {
        setSelectedId(res.inbox[0].id);
      }
    } catch {
      // Error details are captured in inboxSync.lastError on server
    } finally {
      setSwitchingSmtpId(null);
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (!autoSyncedOnceRef.current && smtpAccounts.length > 0) {
      autoSyncedOnceRef.current = true;
      void handleSyncFromSmtp(activeInboxSmtpId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smtpAccounts.length]);

  const handleSelectMessage = async (msg: InboxMessage) => {
    setSelectedId(msg.id);
    setMobileReaderOpen(true);
    if (msg.unread) {
      const res = await apiRequest<{ inbox: InboxMessage[] }>(
        `/api/inbox/${msg.id}/read`,
        { method: 'PATCH' },
        token
      );
      onInboxUpdated(res.inbox);
    }
  };

  const smtpConnected = smtpAccounts.length > 0;
  const displayedUsername =
    currentInboxAccount?.username ||
    snapshot.inboxSync.connectedAccount ||
    snapshot.smtp.username;
  const displayedHost =
    (switchingSmtpId ? currentInboxAccount?.host : snapshot.inboxSync.sourceHost) ||
    currentInboxAccount?.host ||
    snapshot.smtp.host;

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-display tracking-tight text-slate-900 dark:text-white">
            Inbox
          </h1>
          <p className="text-xs sm:text-sm font-mono text-slate-600 dark:text-slate-400 mt-1">
            Choose any plugged-in SMTP account below to view its incoming emails.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2.5 w-full lg:w-auto">
          {smtpAccounts.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
              <label
                htmlFor="inbox-smtp-selector"
                className="text-xs font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap"
              >
                SMTP Inbox:
              </label>
              <select
                id="inbox-smtp-selector"
                value={activeInboxSmtpId}
                disabled={syncing}
                onChange={(e) => {
                  const nextId = e.target.value;
                  if (nextId) {
                    void handleSyncFromSmtp(nextId);
                  }
                }}
                className="w-full sm:w-auto sm:min-w-[220px] sm:max-w-[320px] min-h-[42px] px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1119] text-xs font-mono font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-60 cursor-pointer"
              >
                {smtpAccounts.map((acc, idx) => (
                  <option key={acc.id} value={acc.id}>
                    #{idx + 1} {acc.label || `SMTP #${idx + 1}`} — {acc.username}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              disabled={syncing}
              onClick={() => void handleSyncFromSmtp()}
              className="min-h-[42px] px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-400 to-indigo-400 text-slate-950 text-xs font-display font-bold inline-flex items-center justify-center gap-1.5 hover:opacity-95 disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${syncing ? 'animate-spin' : ''}`} />
              <span className="truncate">{syncing ? 'Syncing...' : 'Sync Inbox'}</span>
            </button>

            <button
              type="button"
              onClick={onNavigateSmtp}
              className="min-h-[42px] px-3.5 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1119] text-xs font-mono text-slate-700 dark:text-slate-300 hover:border-cyan-500/40 inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
              <span className="truncate">SMTP Settings</span>
            </button>
          </div>
        </div>
      </div>

      {/* Quick-Switch Bar when 2 or more SMTPs are plugged in */}
      {smtpAccounts.length > 1 && (
        <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1119] p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400">
            <span>
              Switch SMTP Inbox ({smtpAccounts.length} accounts connected):
            </span>
            <span className="hidden sm:inline">
              Viewing another inbox does not interrupt active sending.
            </span>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar sm:flex-wrap pb-0.5">
            {smtpAccounts.map((acc, idx) => {
              const isSelected = acc.id === activeInboxSmtpId;
              return (
                <button
                  key={acc.id}
                  type="button"
                  disabled={syncing}
                  onClick={() => void handleSyncFromSmtp(acc.id)}
                  className={`shrink-0 min-h-[38px] px-3 py-2 rounded-lg border text-xs font-mono transition-colors inline-flex items-center gap-2 cursor-pointer disabled:opacity-60 ${
                    isSelected
                      ? 'border-cyan-500 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 font-bold'
                      : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#121722] text-slate-700 dark:text-slate-300 hover:border-cyan-500/40'
                  }`}
                >
                  <span className="text-[11px] opacity-75">#{idx + 1}</span>
                  <span>{acc.label || `SMTP #${idx + 1}`}</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[150px] sm:max-w-[180px]">
                    ({acc.username})
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* SMTP Connection Status Bar */}
      <div
        className={`px-4 py-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono ${
          smtpConnected && !snapshot.inboxSync.lastError
            ? 'border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-700 dark:text-emerald-300'
            : snapshot.inboxSync.lastError && smtpConnected
              ? 'border-amber-500/30 bg-amber-500/[0.06] text-slate-700 dark:text-slate-200'
              : 'border-cyan-500/25 bg-cyan-500/[0.05] text-slate-700 dark:text-slate-300'
        }`}
      >
        <div className="flex items-start sm:items-center gap-2.5 min-w-0">
          {smtpConnected && !snapshot.inboxSync.lastError ? (
            <MailCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5 sm:mt-0" />
          ) : (
            <Server className="w-4 h-4 text-cyan-500 shrink-0 mt-0.5 sm:mt-0" />
          )}
          <div className="space-y-0.5 min-w-0">
            <div className="break-words">
              {smtpConnected ? (
                <>
                  Viewing Inbox:{' '}
                  {currentInboxAccount?.label && (
                    <span className="font-semibold text-cyan-600 dark:text-cyan-400">
                      [{currentInboxAccount.label}]{' '}
                    </span>
                  )}
                  <strong className="text-slate-900 dark:text-white break-all">
                    {displayedUsername}
                  </strong>{' '}
                  via{' '}
                  <span className="text-cyan-600 dark:text-cyan-400 break-all">
                    {displayedHost}
                  </span>
                </>
              ) : (
                <span>
                  Plug in your real SMTP Host, Username, and Password in{' '}
                  <strong className="text-slate-900 dark:text-white">SMTP Settings</strong> to
                  pull live incoming emails into your Inbox.
                </span>
              )}
            </div>
            {!switchingSmtpId && snapshot.inboxSync.lastError && (
              <div className="text-amber-600 dark:text-amber-400 break-words">
                {snapshot.inboxSync.lastError}
              </div>
            )}
          </div>
        </div>

        {snapshot.inboxSync.lastSyncedAt && !switchingSmtpId && (
          <div className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">
            Synced: {snapshot.inboxSync.lastSyncedAt}
          </div>
        )}
      </div>

      {switchingSmtpId || snapshot.inbox.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1119] py-14 sm:py-16 px-4 sm:px-6 text-center space-y-4">
          {syncing ? (
            <>
              <RefreshCw className="w-9 h-9 text-cyan-500 mx-auto animate-spin" />
              <div className="space-y-1">
                <div className="text-sm font-semibold text-slate-900 dark:text-white break-all">
                  Loading incoming emails from {displayedUsername}...
                </div>
                <p className="text-xs font-mono text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  Connecting to {currentInboxAccount?.label || 'your mail server'} inbox via IMAP...
                </p>
              </div>
            </>
          ) : (
            <>
              <Inbox className="w-10 h-10 text-cyan-500 mx-auto" />
              <div className="space-y-1">
                <div className="text-sm font-semibold text-slate-900 dark:text-white break-words">
                  {smtpConnected
                    ? snapshot.inboxSync.lastError
                      ? `Could not reach incoming mailbox for ${displayedUsername}`
                      : `Inbox for ${displayedUsername} is currently empty (0 messages)`
                    : 'Your SMTP Inbox is ready to connect'}
                </div>
                <p className="text-xs font-mono text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  {smtpConnected
                    ? snapshot.inboxSync.lastError
                      ? 'If your incoming server uses a custom address (e.g. imap.yourdomain.com), set "IMAP Host for Inbox" for this SMTP in SMTP Settings.'
                      : 'Click "Sync Inbox" above anytime to check for new incoming messages, or switch to another SMTP account.'
                    : 'Save your Gmail, Outlook, cPanel, or custom SMTP login in SMTP Settings and click "Sync Inbox".'}
                </p>
              </div>
              <button
                type="button"
                onClick={onNavigateSmtp}
                className="min-h-[42px] px-4 py-2.5 rounded-xl bg-cyan-500 text-slate-950 text-xs font-mono font-bold inline-flex items-center justify-center gap-1.5 hover:opacity-95 cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>{smtpConnected ? 'Open SMTP / IMAP Settings →' : 'Connect SMTP Account →'}</span>
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 xl:gap-6 items-start">
          {/* Master Message List (Full-width on mobile until a message is tapped; left pane on lg+) */}
          <div
            className={`${
              mobileReaderOpen ? 'hidden lg:block' : 'block'
            } lg:col-span-4 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1119] divide-y divide-slate-100 dark:divide-white/[0.06] max-h-[68dvh] lg:max-h-[calc(100dvh-210px)] overflow-y-auto`}
          >
            {snapshot.inbox.map((msg) => (
              <button
                key={msg.id}
                type="button"
                onClick={() => handleSelectMessage(msg)}
                className={`w-full text-left p-4 transition-colors cursor-pointer ${
                  selectedMsg?.id === msg.id
                    ? 'bg-cyan-500/[0.09]'
                    : 'hover:bg-slate-50 dark:hover:bg-white/[0.02]'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-slate-900 dark:text-white truncate">
                    {msg.unread ? `• ${msg.fromName}` : msg.fromName}
                  </span>
                  <span className="font-mono text-[11px] text-slate-400 shrink-0 tabular-nums">
                    {msg.receivedAt}
                  </span>
                </div>
                <div className="text-xs font-medium text-cyan-700 dark:text-cyan-400 mt-1 truncate">
                  {msg.subject}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
                  {msg.snippet}
                </div>
              </button>
            ))}
          </div>

          {/* Message Detail Reader (Opens full-screen card on mobile when tapped; wide right pane on lg+) */}
          <div
            className={`${
              mobileReaderOpen ? 'block' : 'hidden lg:block'
            } lg:col-span-8 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1119] p-4 sm:p-6 xl:p-8`}
          >
            {selectedMsg ? (
              <div className="space-y-4">
                {/* Mobile Back-to-List Navigation Bar */}
                <div className="lg:hidden pb-3 border-b border-slate-100 dark:border-white/[0.07] flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setMobileReaderOpen(false)}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#141925] text-xs font-mono font-semibold text-cyan-600 dark:text-cyan-400 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Back to Inbox ({snapshot.inbox.length})</span>
                  </button>

                  {selectedMsg.htmlBody && (
                    <button
                      type="button"
                      onClick={() => setViewRichHtml((v) => !v)}
                      className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-[11px] font-mono text-cyan-600 dark:text-cyan-400 shrink-0 cursor-pointer"
                    >
                      {viewRichHtml ? 'Plain Text' : 'HTML View'}
                    </button>
                  )}
                </div>

                <div className="border-b border-slate-100 dark:border-white/[0.07] pb-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white break-words">
                      {selectedMsg.subject}
                    </h2>
                    <div className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1 break-words">
                      From: {selectedMsg.fromName} ({selectedMsg.fromEmail}) ·{' '}
                      {selectedMsg.receivedAt}
                    </div>
                    {selectedMsg.toEmail && (
                      <div className="text-[11px] font-mono text-slate-400 dark:text-slate-500 mt-0.5 break-words">
                        To: {selectedMsg.toEmail}
                      </div>
                    )}
                  </div>

                  {selectedMsg.htmlBody && (
                    <button
                      type="button"
                      onClick={() => setViewRichHtml((v) => !v)}
                      className="hidden lg:inline-flex min-h-[34px] items-center px-2.5 py-1 rounded-lg border border-slate-200 dark:border-white/10 text-[11px] font-mono text-cyan-600 dark:text-cyan-400 shrink-0 cursor-pointer"
                    >
                      {viewRichHtml ? 'Plain Text' : 'HTML View'}
                    </button>
                  )}
                </div>

                {selectedMsg.htmlBody && viewRichHtml ? (
                  <EmailHtmlReaderFrame
                    key={selectedMsg.id}
                    title={selectedMsg.subject}
                    rawHtml={selectedMsg.htmlBody}
                  />
                ) : (
                  <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words overflow-x-auto leading-relaxed font-mono">
                    {selectedMsg.body}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-slate-500">Tap an email to read its full contents.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface EmailHtmlReaderFrameProps {
  title: string;
  rawHtml: string;
}

const EmailHtmlReaderFrame: React.FC<EmailHtmlReaderFrameProps> = ({ title, rawHtml }) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const wrappedSrcDoc = useMemo(() => {
    const baseResetCss = `
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <base target="_blank" rel="noopener noreferrer" />
      <style>
        html, body {
          margin: 0 !important;
          padding: 16px !important;
          height: auto !important;
          min-height: 0 !important;
          max-height: none !important;
          overflow-y: visible !important;
          overflow-x: auto !important;
          background-color: #ffffff;
          color: #0f172a;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          font-size: 16px;
          line-height: 1.6;
          -webkit-text-size-adjust: 100%;
          text-size-adjust: 100%;
          touch-action: manipulation;
          word-wrap: break-word;
          box-sizing: border-box;
        }
        img {
          max-width: 100% !important;
          height: auto !important;
        }
        pre {
          white-space: pre-wrap !important;
          word-break: break-word !important;
        }
      </style>
    `;

    if (/<head[\s>]/i.test(rawHtml)) {
      return rawHtml.replace(/<head([^>]*)>/i, `<head$1>${baseResetCss}`);
    }
    if (/<html[\s>]/i.test(rawHtml)) {
      return rawHtml.replace(/<html([^>]*)>/i, `<html$1><head>${baseResetCss}</head>`);
    }
    return `<!doctype html><html><head>${baseResetCss}</head><body>${rawHtml}</body></html>`;
  }, [rawHtml]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let resizeObserver: ResizeObserver | null = null;
    const timers: number[] = [];

    const updateIframeHeight = () => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc || !doc.documentElement) return;
        const bodyHeight = doc.body ? doc.body.scrollHeight : 0;
        const docHeight = doc.documentElement.scrollHeight || 0;
        const fullHeight = Math.max(bodyHeight, docHeight, 320);
        iframe.style.height = `${fullHeight + 24}px`;
      } catch {
        // Fallback minimum height remains active if cross-origin restricted
      }
    };

    const handleLoad = () => {
      updateIframeHeight();
      timers.push(window.setTimeout(updateIframeHeight, 120));
      timers.push(window.setTimeout(updateIframeHeight, 450));
      timers.push(window.setTimeout(updateIframeHeight, 1200));

      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc?.body && typeof ResizeObserver !== 'undefined') {
          resizeObserver?.disconnect();
          resizeObserver = new ResizeObserver(() => {
            updateIframeHeight();
          });
          resizeObserver.observe(doc.body);
          resizeObserver.observe(doc.documentElement);
        }
        if (doc) {
          const imgs = Array.from(doc.querySelectorAll('img'));
          for (const img of imgs) {
            img.addEventListener('load', updateIframeHeight);
          }
        }
      } catch {
        // Ignore observer errors
      }
    };

    iframe.addEventListener('load', handleLoad);
    updateIframeHeight();

    return () => {
      iframe.removeEventListener('load', handleLoad);
      resizeObserver?.disconnect();
      for (const tId of timers) {
        window.clearTimeout(tId);
      }
    };
  }, [wrappedSrcDoc]);

  return (
    <iframe
      ref={iframeRef}
      title={title}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={wrappedSrcDoc}
      className="w-full min-h-[360px] rounded-lg border border-slate-200 dark:border-white/10 bg-white block"
    />
  );
};

interface DraftsViewProps {
  token: string;
  snapshot: DashboardSnapshot;
  onLoadDraft: (draft: DraftItem) => void;
  onDraftsUpdated: (drafts: DraftItem[]) => void;
}

export const DraftsView: React.FC<DraftsViewProps> = ({
  token,
  snapshot,
  onLoadDraft,
  onDraftsUpdated,
}) => {
  const removeDraft = async (id: string) => {
    const res = await apiRequest<{ drafts: DraftItem[] }>(
      `/api/drafts/${id}`,
      { method: 'DELETE' },
      token
    );
    onDraftsUpdated(res.drafts);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold font-display tracking-tight text-slate-900 dark:text-white">
          Drafts
        </h1>
        <p className="text-xs sm:text-sm font-mono text-slate-600 dark:text-slate-400 mt-1">
          Saved emails you can open and finish sending anytime.
        </p>
      </div>

      {snapshot.drafts.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1119] py-16 text-center text-sm font-mono text-slate-500">
          No saved drafts yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 xl:gap-5">
          {snapshot.drafts.map((d) => (
            <div
              key={d.id}
              className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1119] p-4 sm:p-5 flex flex-col justify-between gap-4"
            >
              <div>
                <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                  Saved {d.updatedAt}
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mt-1 break-words">
                  {d.subject}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 line-clamp-2 font-mono break-words">
                  {d.body}
                </p>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => onLoadDraft(d)}
                  className="min-h-[40px] px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Draft</span>
                </button>
                <button
                  type="button"
                  onClick={() => removeDraft(d.id)}
                  className="min-h-[40px] min-w-[40px] rounded-lg text-rose-500 hover:bg-rose-500/10 inline-flex items-center justify-center cursor-pointer"
                  title="Delete draft"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
