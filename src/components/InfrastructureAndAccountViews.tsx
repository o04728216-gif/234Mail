import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Edit3,
  ExternalLink,
  MessageCircle,
  Plus,
  RefreshCw,
  Save,
  Server,
  Settings,
  Trash2,
  User,
  Zap,
} from 'lucide-react';
import type {
  DashboardSnapshot,
  InboxMessage,
  InboxSyncInfo,
  SmtpConfig,
  SmtpEncryption,
  UserProfile,
} from '../types';
import { apiRequest } from '../utils/api';

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

// ============================================================================
// 1. MULTI-SMTP SETTINGS (Plug in 4+ SMTPs + Instant Auto-Switch Failover)
// ============================================================================
interface SmtpSettingsViewProps {
  token: string;
  snapshot: DashboardSnapshot;
  onSmtpUpdated: (
    smtp: SmtpConfig,
    smtpPool: SmtpConfig[],
    inboxSync?: InboxSyncInfo,
    inbox?: InboxMessage[]
  ) => void;
}

export const SmtpSettingsView: React.FC<SmtpSettingsViewProps> = ({
  token,
  snapshot,
  onSmtpUpdated,
}) => {
  const pool = snapshot.smtpPool || [];

  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('587');
  const [username, setUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [encryption, setEncryption] = useState<SmtpEncryption>('tls');
  const [imapHost, setImapHost] = useState('');
  const [makeActive, setMakeActive] = useState(false);

  const [statusMsg, setStatusMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [checkingNodeId, setCheckingNodeId] = useState<string | null>(null);
  const [checkingAll, setCheckingAll] = useState(false);
  const [nodeChecks, setNodeChecks] = useState<
    Record<string, { ok: boolean; text: string; latencyMs?: number }>
  >({});

  const resetFormForNew = () => {
    setEditingId(null);
    setLabel('');
    setHost('');
    setPort('587');
    setUsername('');
    setNewPassword('');
    setEncryption('tls');
    setImapHost('');
    setMakeActive(pool.length === 0);
  };

  const startEditNode = (node: SmtpConfig) => {
    setEditingId(node.id);
    setLabel(node.label || '');
    setHost(node.host || '');
    setPort(String(node.port || 587));
    setUsername(node.username || '');
    setNewPassword('');
    setEncryption(node.encryption || 'tls');
    setImapHost(node.imapHost || '');
    setMakeActive(Boolean(node.isPrimary));
    setStatusMsg(null);
  };

  const handleSaveSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setStatusMsg(null);
    try {
      const res = await apiRequest<{
        smtp: SmtpConfig;
        smtpPool: SmtpConfig[];
        verification: { verified: boolean; useRealSmtp: boolean; message: string };
        inbox?: InboxMessage[];
        inboxSync?: InboxSyncInfo;
      }>(
        '/api/smtp/pool',
        {
          method: 'POST',
          body: JSON.stringify({
            id: editingId || undefined,
            label: label.trim() || undefined,
            host: host.trim(),
            port: Number(port) || 587,
            encryption,
            username: username.trim(),
            newPassword: newPassword || undefined,
            imapHost: imapHost.trim(),
            makeActive: editingId ? makeActive : pool.length === 0 || makeActive,
          }),
        },
        token
      );

      onSmtpUpdated(res.smtp, res.smtpPool, res.inboxSync, res.inbox);
      const wasEditing = Boolean(editingId);
      resetFormForNew();

      if (res.verification.verified) {
        setStatusMsg({
          ok: true,
          text: `${
            wasEditing ? 'SMTP updated!' : `SMTP added! (${res.smtpPool.length} total in auto-switch pool)`
          } — ${res.verification.message}`,
        });
      } else {
        setStatusMsg({
          ok: false,
          text: `Saved to pool, but connection check reported a warning: ${res.verification.message}`,
        });
      }
    } catch (err) {
      setStatusMsg({
        ok: false,
        text: err instanceof Error ? err.message : 'Could not save SMTP account.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleTestConnection = async () => {
    setBusy(true);
    setStatusMsg(null);
    try {
      const res = await apiRequest<{ verified: boolean; message: string }>(
        '/api/smtp/verify',
        {
          method: 'POST',
          body: JSON.stringify({
            id: editingId || undefined,
            host: host.trim(),
            port: Number(port) || 587,
            encryption,
            username: username.trim(),
            password: newPassword || undefined,
          }),
        },
        token
      );
      setStatusMsg({ ok: res.verified, text: res.message });
    } catch (err) {
      setStatusMsg({
        ok: false,
        text: err instanceof Error ? err.message : 'Connection test failed.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleActivateNode = async (nodeId: string) => {
    setRowBusyId(nodeId);
    setStatusMsg(null);
    try {
      const res = await apiRequest<{
        smtp: SmtpConfig;
        smtpPool: SmtpConfig[];
        inbox?: InboxMessage[];
        inboxSync?: InboxSyncInfo;
      }>(`/api/smtp/pool/${nodeId}/activate`, { method: 'POST' }, token);
      onSmtpUpdated(res.smtp, res.smtpPool, res.inboxSync, res.inbox);
      setStatusMsg({
        ok: true,
        text: `Switched active sender to ${res.smtp.label} (${res.smtp.host}) and synced Inbox.`,
      });
    } catch (err) {
      setStatusMsg({
        ok: false,
        text: err instanceof Error ? err.message : 'Could not switch SMTP.',
      });
    } finally {
      setRowBusyId(null);
    }
  };

  const handleResetNodeStatus = async (nodeId: string) => {
    setRowBusyId(nodeId);
    setStatusMsg(null);
    try {
      const res = await apiRequest<{
        smtp: SmtpConfig;
        smtpPool: SmtpConfig[];
      }>(`/api/smtp/pool/${nodeId}/reset`, { method: 'POST' }, token);
      onSmtpUpdated(res.smtp, res.smtpPool);
      setStatusMsg({
        ok: true,
        text: 'SMTP marked Ready again for automatic sending.',
      });
    } catch (err) {
      setStatusMsg({
        ok: false,
        text: err instanceof Error ? err.message : 'Could not reset SMTP status.',
      });
    } finally {
      setRowBusyId(null);
    }
  };

  const handleDeleteNode = async (nodeId: string) => {
    setRowBusyId(nodeId);
    setStatusMsg(null);
    try {
      const res = await apiRequest<{
        smtp: SmtpConfig;
        smtpPool: SmtpConfig[];
        inbox?: InboxMessage[];
        inboxSync?: InboxSyncInfo;
      }>(`/api/smtp/pool/${nodeId}`, { method: 'DELETE' }, token);
      if (editingId === nodeId) {
        resetFormForNew();
      }
      onSmtpUpdated(res.smtp, res.smtpPool, res.inboxSync, res.inbox);
      setStatusMsg({
        ok: true,
        text: 'SMTP removed from pool.',
      });
    } catch (err) {
      setStatusMsg({
        ok: false,
        text: err instanceof Error ? err.message : 'Could not remove SMTP.',
      });
    } finally {
      setRowBusyId(null);
    }
  };

  const handleCheckNode = async (node: SmtpConfig) => {
    setCheckingNodeId(node.id);
    setStatusMsg(null);
    try {
      const res = await apiRequest<{
        verified: boolean;
        latencyMs: number;
        message: string;
        checkedAt: string;
        smtp: SmtpConfig;
        smtpPool: SmtpConfig[];
      }>(`/api/smtp/pool/${node.id}/check`, { method: 'POST' }, token);

      onSmtpUpdated(res.smtp, res.smtpPool);
      const summaryText = res.verified
        ? `Active & connecting (${res.latencyMs}ms)`
        : res.message;
      setNodeChecks((prev) => ({
        ...prev,
        [node.id]: {
          ok: res.verified,
          text: summaryText,
          latencyMs: res.latencyMs,
        },
      }));
      setStatusMsg({
        ok: res.verified,
        text: `${node.label || node.host}: ${res.message}`,
      });
    } catch (err) {
      const errText = err instanceof Error ? err.message : 'Connection check failed.';
      setNodeChecks((prev) => ({
        ...prev,
        [node.id]: {
          ok: false,
          text: errText,
        },
      }));
      setStatusMsg({
        ok: false,
        text: `${node.label || node.host}: ${errText}`,
      });
    } finally {
      setCheckingNodeId(null);
    }
  };

  const handleCheckAllNodes = async () => {
    if (pool.length === 0 || checkingAll) return;
    setCheckingAll(true);
    setStatusMsg(null);
    let okCount = 0;
    let latestSmtp = snapshot.smtp;
    let latestPool = pool;

    try {
      for (const node of pool) {
        setCheckingNodeId(node.id);
        try {
          const res = await apiRequest<{
            verified: boolean;
            latencyMs: number;
            message: string;
            smtp: SmtpConfig;
            smtpPool: SmtpConfig[];
          }>(`/api/smtp/pool/${node.id}/check`, { method: 'POST' }, token);

          latestSmtp = res.smtp;
          latestPool = res.smtpPool;
          if (res.verified) okCount += 1;
          setNodeChecks((prev) => ({
            ...prev,
            [node.id]: {
              ok: res.verified,
              text: res.verified ? `Active & connecting (${res.latencyMs}ms)` : res.message,
              latencyMs: res.latencyMs,
            },
          }));
        } catch (err) {
          const errText = err instanceof Error ? err.message : 'Connection check failed.';
          setNodeChecks((prev) => ({
            ...prev,
            [node.id]: { ok: false, text: errText },
          }));
        }
      }
      onSmtpUpdated(latestSmtp, latestPool);
      setStatusMsg({
        ok: okCount === pool.length,
        text: `Checked all ${pool.length} plugged-in SMTP account(s): ${okCount} active & connecting, ${pool.length - okCount} failed.`,
      });
    } finally {
      setCheckingNodeId(null);
      setCheckingAll(false);
    }
  };

  const readyCount = pool.filter((n) => !n.status || n.status === 'ready').length;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <div className="flex items-center gap-2.5">
          <Settings className="w-6 h-6 text-cyan-500" />
          <h1 className="text-2xl sm:text-3xl font-extrabold font-display tracking-tight text-slate-900 dark:text-white">
            SMTP Settings
          </h1>
        </div>
        <p className="text-xs sm:text-sm font-mono text-slate-600 dark:text-slate-400 mt-1.5">
          Plug in 4 or more SMTP accounts. If one hits a limit or stops, 234Mail automatically switches to the next available SMTP and continues sending nonstop.
        </p>
      </div>

      {/* Multi-SMTP Auto-Failover Banner */}
      <div className="px-4 py-3.5 rounded-xl border border-cyan-500/25 bg-cyan-500/[0.05] flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-slate-700 dark:text-slate-300">
        <div className="flex items-center gap-3">
          <Server className="w-4 h-4 text-cyan-500 shrink-0" />
          <span>
            Auto-Failover Rotation: Plug in Gmail, Outlook, Hostinger, Zoho, cPanel, or any SMTP.
          </span>
        </div>
        <span
          className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase shrink-0 tabular-nums ${
            pool.length > 0
              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
          }`}
        >
          {pool.length > 0
            ? `${pool.length} Plugged In · ${readyCount} Ready`
            : 'Demo Mode · 0 Live SMTPs'}
        </span>
      </div>

      {statusMsg && (
        <div
          className={`px-4 py-3 rounded-xl border text-xs font-mono leading-relaxed ${
            statusMsg.ok
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
          }`}
        >
          {statusMsg.text}
        </div>
      )}

      {/* Plugged-In SMTP Pool List */}
      {pool.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1119] p-4 sm:p-5 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-display font-bold text-slate-900 dark:text-white">
                Your Plugged-In SMTP Accounts ({pool.length})
              </h2>
              <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                Sending goes in order (#1 → #2 → #3 → #4...). If the active SMTP stops, the next Ready one takes over immediately.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {pool.length > 1 && (
                <button
                  type="button"
                  disabled={checkingAll || Boolean(checkingNodeId)}
                  onClick={handleCheckAllNodes}
                  className="px-3 py-1.5 min-h-[38px] rounded-lg border border-cyan-500/35 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 text-xs font-mono font-semibold hover:bg-cyan-500/20 disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${checkingAll ? 'animate-spin' : ''}`} />
                  <span>{checkingAll ? 'Checking All...' : 'Check All SMTPs'}</span>
                </button>
              )}
              {editingId && (
                <button
                  type="button"
                  onClick={resetFormForNew}
                  className="px-3 py-1.5 min-h-[38px] rounded-lg bg-cyan-500 text-slate-950 text-xs font-mono font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add New SMTP</span>
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2.5">
            {pool.map((node, index) => {
              const st = node.status || 'ready';
              const isCheckingThis = checkingNodeId === node.id;
              const isRowBusy = rowBusyId === node.id || isCheckingThis || checkingAll;
              const checkInfo = nodeChecks[node.id];

              return (
                <div
                  key={node.id}
                  className={`p-3.5 rounded-xl border transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    node.isPrimary && st === 'ready'
                      ? 'border-emerald-500/40 bg-emerald-500/[0.05]'
                      : editingId === node.id
                        ? 'border-cyan-500/50 bg-cyan-500/[0.06]'
                        : 'border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-[#121722]'
                  }`}
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-slate-200/80 dark:bg-white/10 text-[10px] font-mono font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                        #{index + 1}
                      </span>
                      <span className="text-xs font-display font-bold text-slate-900 dark:text-white break-all">
                        {node.label || `SMTP #${index + 1}`}
                      </span>
                      <span className="text-xs font-mono text-slate-500 dark:text-slate-400 break-all">
                        {node.host}:{node.port}
                      </span>

                      {node.isPrimary && st === 'ready' ? (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-mono font-bold">
                          ● Active Now
                        </span>
                      ) : st === 'ready' ? (
                        <span className="px-2 py-0.5 rounded-md bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 text-[10px] font-mono font-semibold">
                          ● Standby Ready
                        </span>
                      ) : st === 'cooling_down' ? (
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-mono font-semibold">
                          ● Cooling Down 15m (Switched)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-700 dark:text-rose-300 text-[10px] font-mono font-semibold">
                          ● Limit / Stopped (Switched)
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      <span className="break-all">User: {node.username}</span>
                      <span>·</span>
                      <span className="tabular-nums">{(node.sentCount || 0).toLocaleString()} sent</span>
                      {node.statusReason && (
                        <>
                          <span>·</span>
                          <span className="text-amber-600 dark:text-amber-400 break-words">
                            {node.statusReason}
                          </span>
                        </>
                      )}
                    </div>

                    {checkInfo && (
                      <div
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-mono ${
                          checkInfo.ok
                            ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                        }`}
                      >
                        {checkInfo.ok ? (
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span className="break-words">{checkInfo.text}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200/70 dark:border-white/[0.06]">
                    <button
                      type="button"
                      disabled={isRowBusy}
                      onClick={() => handleCheckNode(node)}
                      className="px-3 py-1.5 min-h-[38px] rounded-lg border border-emerald-500/35 bg-emerald-500/10 text-[11px] font-mono font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className={`w-3 h-3 ${isCheckingThis ? 'animate-spin' : ''}`} />
                      <span>{isCheckingThis ? 'Checking...' : 'Check'}</span>
                    </button>

                    {st !== 'ready' && (
                      <button
                        type="button"
                        disabled={isRowBusy}
                        onClick={() => handleResetNodeStatus(node.id)}
                        className="px-3 py-1.5 min-h-[38px] rounded-lg border border-emerald-500/35 bg-emerald-500/10 text-[11px] font-mono font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Re-enable</span>
                      </button>
                    )}

                    {!node.isPrimary && (
                      <button
                        type="button"
                        disabled={isRowBusy}
                        onClick={() => handleActivateNode(node.id)}
                        className="px-3 py-1.5 min-h-[38px] rounded-lg border border-cyan-500/35 bg-cyan-500/10 text-[11px] font-mono font-semibold text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/20 cursor-pointer"
                      >
                        Use Now
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={isRowBusy}
                      onClick={() => startEditNode(node)}
                      className="px-3 py-1.5 min-h-[38px] rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1119] text-[11px] font-mono text-slate-700 dark:text-slate-300 hover:border-cyan-500/40 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Edit</span>
                    </button>

                    <button
                      type="button"
                      disabled={isRowBusy}
                      onClick={() => handleDeleteNode(node.id)}
                      className="px-3 py-1.5 min-h-[38px] rounded-lg border border-rose-500/30 bg-rose-500/[0.07] text-[11px] font-mono text-rose-600 dark:text-rose-400 hover:bg-rose-500/15 inline-flex items-center gap-1 cursor-pointer"
                      aria-label={`Remove ${node.label}`}
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Remove</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Another SMTP (or Edit Selected SMTP) Form */}
      <form
        onSubmit={handleSaveSmtp}
        className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1119] p-4 sm:p-6 space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-display font-bold text-slate-900 dark:text-white flex items-center gap-2">
              {editingId ? (
                <>
                  <Edit3 className="w-4 h-4 text-cyan-500" />
                  <span>Edit {label || 'SMTP Account'}</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 text-cyan-500" />
                  <span>Add SMTP Account #{pool.length + 1}</span>
                </>
              )}
            </h2>
            <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
              {editingId
                ? 'Update credentials below and save.'
                : pool.length < 4
                  ? `You have ${pool.length} SMTP${pool.length === 1 ? '' : 's'} saved — add 4 or more so sending automatically switches if one stops.`
                  : 'Add another backup SMTP to expand your automatic rotation pool.'}
            </p>
          </div>

          {editingId && (
            <button
              type="button"
              onClick={resetFormForNew}
              className="text-xs font-mono text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              Cancel Edit
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label
              htmlFor="smtp-label-input"
              className="block text-[11px] font-mono text-slate-500 dark:text-slate-400 mb-1.5"
            >
              Label <span className="text-slate-400">(Optional)</span>
            </label>
            <input
              id="smtp-label-input"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={`SMTP #${pool.length + 1}`}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#141821] text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          <div>
            <label
              htmlFor="smtp-host-input"
              className="block text-[11px] font-mono text-slate-500 dark:text-slate-400 mb-1.5"
            >
              SMTP Host
            </label>
            <input
              id="smtp-host-input"
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="smtp.yourdomain.com"
              required
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#141821] text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          <div>
            <label
              htmlFor="smtp-port-input"
              className="block text-[11px] font-mono text-slate-500 dark:text-slate-400 mb-1.5"
            >
              Port
            </label>
            <input
              id="smtp-port-input"
              type="number"
              value={port}
              onChange={(e) => {
                const nextPort = e.target.value;
                setPort(nextPort);
                if (nextPort === '465') setEncryption('ssl');
                if (nextPort === '587') setEncryption('tls');
              }}
              placeholder="587"
              required
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#141821] text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="smtp-user-input"
              className="block text-[11px] font-mono text-slate-500 dark:text-slate-400 mb-1.5"
            >
              Username / Email
            </label>
            <input
              id="smtp-user-input"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="user@yourdomain.com"
              required
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#141821] text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          <div>
            <label
              htmlFor="smtp-pass-input"
              className="block text-[11px] font-mono text-slate-500 dark:text-slate-400 mb-1.5"
            >
              Password {editingId ? '(Leave blank to keep saved)' : ''}
            </label>
            <input
              id="smtp-pass-input"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={editingId ? '••••••••••••' : 'Enter mail password'}
              required={!editingId}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#141821] text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="smtp-enc-select"
              className="block text-[11px] font-mono text-slate-500 dark:text-slate-400 mb-1.5"
            >
              Encryption
            </label>
            <select
              id="smtp-enc-select"
              value={encryption}
              onChange={(e) => {
                const val = e.target.value as SmtpEncryption;
                setEncryption(val);
                if (val === 'ssl' && port === '587') setPort('465');
                if (val === 'tls' && port === '465') setPort('587');
              }}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#141821] text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="tls">TLS (Port 587)</option>
              <option value="ssl">SSL (Port 465)</option>
              <option value="none">None</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="smtp-imap-input"
              className="block text-[11px] font-mono text-slate-500 dark:text-slate-400 mb-1.5"
            >
              IMAP Host for Inbox <span className="text-slate-400">(Optional)</span>
            </label>
            <input
              id="smtp-imap-input"
              type="text"
              value={imapHost}
              onChange={(e) => setImapHost(e.target.value)}
              placeholder="Auto-detected (e.g. imap.gmail.com)"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#141821] text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3 pt-1">
          <button
            type="submit"
            disabled={busy}
            className="w-full sm:w-auto min-h-[46px] px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-400 to-indigo-400 text-slate-950 font-display font-extrabold text-xs sm:text-sm hover:opacity-95 disabled:opacity-50 inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>
              {busy
                ? 'Saving...'
                : editingId
                  ? 'Update SMTP Account'
                  : `Save & Plug In SMTP #${pool.length + 1}`}
            </span>
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={handleTestConnection}
            className="w-full sm:w-auto min-h-[46px] px-5 py-3 rounded-xl border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-[#141821] text-slate-900 dark:text-white font-display font-bold text-xs sm:text-sm hover:border-cyan-500/50 disabled:opacity-50 inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <Zap className="w-4 h-4 text-cyan-500" />
            <span>Test Connection</span>
          </button>
        </div>
      </form>
    </div>
  );
};

// ============================================================================
// 2. SIMPLE ACCOUNT & SUBSCRIPTION / IMMEDIATE PAYMENT PAGE
// ============================================================================
interface AccountAndSubscriptionProps {
  mode: 'account' | 'subscription';
  token: string;
  snapshot: DashboardSnapshot;
  onCurrentUserUpdated: (user: UserProfile) => void;
}

export const AccountAndSubscriptionView: React.FC<AccountAndSubscriptionProps> = ({
  mode,
  token,
  snapshot,
  onCurrentUserUpdated,
}) => {
  const { platformSettings, user } = snapshot;
  const walletAddress =
    platformSettings?.usdtWalletAddress || 'TEuJWuY2b6a5ixmz7nbKaM4V3gYNNUU6ed';
  const monthlyPrice = platformSettings?.monthlyPriceUsd || 50;
  const durationDays = platformSettings?.planDurationDays || 30;
  const networkLabel = platformSettings?.paymentNetwork || 'TRC20 Network Only';

  const isPaidActive =
    user.role === 'admin' ||
    (user.subscriptionStatus === 'active' &&
      user.daysLeft > 0 &&
      (user.paymentsCount || 0) > 0);

  const isFreeTrial =
    !isPaidActive &&
    ((user.subscriptionStatus === 'pending' && (!user.expiresAt || user.daysLeft > 0)) ||
      (user.subscriptionStatus === 'active' && user.daysLeft > 0));

  const [copiedWallet, setCopiedWallet] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyFeedback, setVerifyFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleVerifyPayment = async () => {
    setVerifying(true);
    setVerifyFeedback(null);
    try {
      const res = await apiRequest<{ user: UserProfile; message: string }>(
        '/api/subscription/verify',
        {
          method: 'POST',
          body: JSON.stringify({ txHash }),
        },
        token
      );
      onCurrentUserUpdated(res.user);
      setVerifyFeedback({
        ok: true,
        msg:
          res.message ||
          `Payment verified! +${durationDays} days added — your account is now Paid & Active.`,
      });
    } catch (err) {
      setVerifyFeedback({
        ok: false,
        msg: err instanceof Error ? err.message : 'Could not verify payment.',
      });
    } finally {
      setVerifying(false);
    }
  };

  if (mode === 'subscription') {
    const statusTitle = isPaidActive
      ? 'Paid & Active Plan'
      : isFreeTrial
        ? 'Free Trial — Activate Paid Plan to Send Emails'
        : user.subscriptionStatus === 'suspended'
          ? 'Account Suspended — Payment Required'
          : 'Subscription Expired — Renewal Required';

    return (
      <div className="max-w-xl mx-auto space-y-5 sm:space-y-6">
        <div
          className={`rounded-xl border px-4 sm:px-5 py-3.5 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 ${
            isPaidActive
              ? 'border-cyan-500/25 bg-cyan-500/[0.05]'
              : isFreeTrial
                ? 'border-amber-500/35 bg-amber-500/10'
                : 'border-rose-500/35 bg-rose-500/10'
          }`}
        >
          <div>
            <div
              className={`text-xs font-mono font-semibold ${
                isPaidActive
                  ? 'text-cyan-600 dark:text-cyan-400'
                  : isFreeTrial
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {statusTitle}
            </div>
            <div className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400 mt-0.5">
              {isPaidActive
                ? `Expires: ${user.expiresAt ? formatDayMonthYear(user.expiresAt) : 'Active'} (${user.daysLeft} days left) · Email sending unlocked`
                : isFreeTrial
                  ? `${user.daysLeft > 0 ? `${user.daysLeft} trial day(s) remaining · ` : ''}Complete payment below to make your account Paid & Active and unlock email sending`
                  : user.expiresAt
                    ? `Expired on ${formatDayMonthYear(user.expiresAt)} — Complete payment below to reactivate your account`
                    : 'Complete payment below to activate your account immediately'}
            </div>
          </div>
          {isPaidActive ? (
            <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1 shrink-0 self-start sm:self-auto">
              <CheckCircle2 className="w-4 h-4" />
              <span>Paid &amp; Active</span>
            </span>
          ) : (
            <span
              className={`text-xs font-mono uppercase font-bold inline-flex items-center gap-1 shrink-0 self-start sm:self-auto ${
                isFreeTrial
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              <AlertCircle className="w-4 h-4" />
              <span>{isFreeTrial ? 'Free Trial' : user.subscriptionStatus}</span>
            </span>
          )}
        </div>

        <div>
          <h1 className="text-xl sm:text-3xl font-extrabold font-display tracking-tight text-slate-900 dark:text-white">
            {isPaidActive ? 'Extend Paid Subscription' : 'Activate Paid Plan to Send Emails'}
          </h1>
          <p className="text-xs sm:text-sm font-mono text-slate-600 dark:text-slate-400 mt-1">
            {isPaidActive
              ? 'Send USDT (TRC20) to add access time. Payments automatically stack on your current expiration date.'
              : isFreeTrial
                ? 'You are signed in on a Free Trial. To dispatch bulk or single emails, complete USDT payment below to upgrade your account to Paid & Active.'
                : 'Your account is not currently active. Send USDT below and verify your transaction ID to unlock bulk email sending, SMTP Inbox, and tracking right away.'}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.09] bg-white dark:bg-[#0d1119] p-4 sm:p-8 space-y-5 sm:space-y-6">
          <div className="text-xs font-mono text-slate-500 dark:text-slate-400">Payment Details</div>

          <div className="flex flex-wrap items-baseline gap-2.5 sm:gap-3">
            <span className="text-3xl sm:text-5xl font-extrabold font-display text-cyan-500 dark:text-cyan-400 tabular-nums">
              ${monthlyPrice}
            </span>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
              = {durationDays} Days Paid &amp; Active Access
            </span>
          </div>

          <div className="text-xs font-mono text-emerald-600 dark:text-emerald-400">
            {networkLabel}
          </div>

          <div>
            <div className="text-xs font-mono text-slate-500 dark:text-slate-400 mb-2">
              Send to this wallet:
            </div>
            <div className="p-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#121722] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
              <code className="text-xs font-mono text-cyan-700 dark:text-cyan-300 break-all">
                {walletAddress}
              </code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(walletAddress);
                  setCopiedWallet(true);
                  setTimeout(() => setCopiedWallet(false), 2000);
                }}
                className="w-full sm:w-auto min-h-[38px] px-3.5 py-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-xs font-mono font-semibold text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/20 shrink-0 cursor-pointer"
              >
                {copiedWallet ? 'Copied!' : 'Copy Wallet'}
              </button>
            </div>
          </div>

          <ol className="space-y-2.5 text-xs font-mono text-slate-600 dark:text-slate-300 leading-relaxed">
            <li>1. Open your crypto wallet (Trust Wallet, Binance, etc.)</li>
            <li>
              2. Send <strong className="text-slate-900 dark:text-white">${monthlyPrice} USDT</strong>{' '}
              (or multiples) on{' '}
              <strong className="text-slate-900 dark:text-white">{networkLabel}</strong>
            </li>
            <li>
              3. Paste your transaction ID below and click{' '}
              <strong className="text-slate-900 dark:text-white">Verify My Payment</strong>
            </li>
          </ol>

          <input
            type="text"
            value={txHash}
            onChange={(e) => setTxHash(e.target.value)}
            placeholder="Paste TRC20 transaction ID (min 12 chars)..."
            className="w-full min-h-[44px] px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#121722] text-xs font-mono text-slate-900 dark:text-white"
          />

          {verifyFeedback && (
            <div
              className={`p-3 rounded-lg border text-xs font-mono ${
                verifyFeedback.ok
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
              }`}
            >
              {verifyFeedback.msg}
            </div>
          )}

          <button
            type="button"
            disabled={verifying}
            onClick={handleVerifyPayment}
            className="w-full min-h-[48px] py-3.5 px-6 rounded-xl bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-400 text-slate-950 font-display font-extrabold text-sm hover:opacity-95 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
          >
            <Zap className="w-4 h-4" />
            <span>{verifying ? 'Checking Payment...' : 'Verify My Payment'}</span>
          </button>
        </div>

        {/* Payment Page Footer — Contact Admin for Support */}
        <footer className="rounded-2xl border border-slate-200 dark:border-white/[0.09] bg-white dark:bg-[#0d1119] px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
          <div className="font-semibold text-slate-900 dark:text-white text-center sm:text-left">
            Need help with payment or instant activation?
          </div>

          <a
            href="https://t.me/paraxait"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto min-h-[42px] px-4 py-2 rounded-xl border border-cyan-500/35 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 font-bold inline-flex items-center justify-center gap-2 hover:bg-cyan-500/20 transition-colors shrink-0"
          >
            <MessageCircle className="w-4 h-4 shrink-0" />
            <span>Contact Admin for Support</span>
            <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-75" />
          </a>
        </footer>
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-5 sm:space-y-6">
      <div>
        <div className="flex items-center gap-2.5">
          <User className="w-6 h-6 text-cyan-500" />
          <h1 className="text-2xl sm:text-3xl font-extrabold font-display tracking-tight text-slate-900 dark:text-white">
            Account
          </h1>
        </div>
        <p className="text-xs sm:text-sm font-mono text-slate-600 dark:text-slate-400 mt-1">
          Your profile and plan information.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1119] p-4 sm:p-6">
        <dl className="divide-y divide-slate-100 dark:divide-white/[0.06] text-xs font-mono">
          <div className="py-3.5 flex items-center justify-between gap-3">
            <dt className="text-slate-500 dark:text-slate-400 shrink-0">Username</dt>
            <dd className="text-slate-900 dark:text-white font-semibold text-right break-all">
              {user.username}
            </dd>
          </div>
          <div className="py-3.5 flex items-center justify-between gap-3">
            <dt className="text-slate-500 dark:text-slate-400 shrink-0">Email</dt>
            <dd className="text-slate-900 dark:text-white text-right break-all">{user.email}</dd>
          </div>
          <div className="py-3.5 flex items-center justify-between gap-3">
            <dt className="text-slate-500 dark:text-slate-400 shrink-0">Plan Status</dt>
            <dd
              className={
                isPaidActive
                  ? 'text-emerald-600 dark:text-emerald-400 font-semibold text-right'
                  : isFreeTrial
                    ? 'text-amber-600 dark:text-amber-400 font-semibold text-right'
                    : 'text-rose-600 dark:text-rose-400 font-semibold uppercase text-right'
              }
            >
              {isPaidActive
                ? `Paid & Active (${user.daysLeft} days left)`
                : isFreeTrial
                  ? `Free Trial${user.daysLeft > 0 ? ` (${user.daysLeft}d left)` : ''} — Pay to Send`
                  : user.subscriptionStatus}
            </dd>
          </div>
          <div className="py-3.5 flex items-center justify-between gap-3">
            <dt className="text-slate-500 dark:text-slate-400 shrink-0">Email Sending</dt>
            <dd
              className={
                isPaidActive
                  ? 'text-emerald-600 dark:text-emerald-400 font-semibold text-right'
                  : 'text-amber-600 dark:text-amber-400 font-semibold text-right'
              }
            >
              {isPaidActive ? 'Unlocked' : 'Locked until Paid & Active'}
            </dd>
          </div>
          <div className="py-3.5 flex items-center justify-between gap-3">
            <dt className="text-slate-500 dark:text-slate-400 shrink-0">Joined</dt>
            <dd className="text-slate-700 dark:text-slate-300 tabular-nums text-right">
              {formatDayMonthYear(user.joinedAt)}
            </dd>
          </div>
          <div className="py-3.5 flex items-center justify-between gap-3">
            <dt className="text-slate-500 dark:text-slate-400 shrink-0">Last Login</dt>
            <dd className="text-slate-700 dark:text-slate-300 tabular-nums text-right">
              {formatDayMonthYear(user.lastLoginAt, true)}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
};
