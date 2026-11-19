import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Database,
  Download,
  Eye,
  EyeOff,
  HardDrive,
  Lock,
  Megaphone,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Server,
  Shield,
  ShieldAlert,
  Square,
  Trash2,
  Unlock,
  Upload,
  Users,
  Zap,
} from 'lucide-react';
import type {
  AdminPortalData,
  AdminSystemStatus,
  DashboardSnapshot,
  PlatformSettings,
  SmtpEncryption,
  UserProfile,
} from '../types';
import { apiRequest } from '../utils/api';
import { AdminConfirmModal } from './AdminPortalSections';

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatUptime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

export interface ParsedSnapshotPreview {
  rawObject: Record<string, unknown>;
  filename: string;
  fileSizeBytes: number;
  formatLabel: string;
  sourceHost: string;
  exportedAt: string | null;
  hasChecksum: boolean;
  usersCount: number;
  adminsCount: number;
  smtpsCount: number;
  listsCount: number;
  campaignsCount: number;
  draftsCount: number;
  walletAddress: string;
}

export function inspectSnapshotJsonFile(
  rawText: string,
  filename: string,
  fileSizeBytes: number
): ParsedSnapshotPreview {
  const parsed = JSON.parse(rawText) as Record<string, unknown>;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Selected file does not contain a valid JSON object.');
  }

  let stateObj: Record<string, unknown>;
  let formatLabel = 'Raw esp-store.json';
  let sourceHost = 'esp-store.json';
  let exportedAt: string | null = null;
  let hasChecksum = false;

  if (parsed.format === '234mail-vps-snapshot' && parsed.state && typeof parsed.state === 'object') {
    stateObj = parsed.state as Record<string, unknown>;
    formatLabel = '234Mail Portable VPS Snapshot v1';
    sourceHost = typeof parsed.sourceHost === 'string' ? parsed.sourceHost : 'unknown';
    exportedAt = typeof parsed.exportedAt === 'string' ? parsed.exportedAt : null;
    hasChecksum = typeof parsed.checksumSha256 === 'string' && parsed.checksumSha256.length > 0;
  } else if (Array.isArray(parsed.users) && typeof parsed.platformSettings === 'object') {
    stateObj = parsed;
  } else {
    throw new Error(
      'Unrecognized backup file. Choose a 234Mail Portable VPS Snapshot (.json) or esp-store.json.'
    );
  }

  const usersArr = Array.isArray(stateObj.users)
    ? (stateObj.users as Array<{ role?: string }>)
    : [];
  if (usersArr.length === 0) {
    throw new Error('This backup file contains 0 users and cannot be restored.');
  }
  const adminsCount = usersArr.filter((u) => u && u.role === 'admin').length;
  if (adminsCount === 0) {
    throw new Error('This backup file has no Admin account and cannot be restored.');
  }

  const summary =
    parsed.summary && typeof parsed.summary === 'object'
      ? (parsed.summary as Record<string, number>)
      : null;

  const smtpsCount =
    typeof summary?.smtpsCount === 'number'
      ? summary.smtpsCount
      : Array.isArray(stateObj.adminSmtpArchive)
        ? stateObj.adminSmtpArchive.length
        : 0;

  const listsCount =
    typeof summary?.listsCount === 'number'
      ? summary.listsCount
      : Array.isArray(stateObj.adminListsArchive)
        ? stateObj.adminListsArchive.length
        : 0;

  const campaignsCount =
    typeof summary?.campaignsCount === 'number'
      ? summary.campaignsCount
      : Array.isArray(stateObj.jobs)
        ? stateObj.jobs.length
        : 0;

  const draftsCount =
    typeof summary?.draftsCount === 'number'
      ? summary.draftsCount
      : Array.isArray(stateObj.drafts)
        ? stateObj.drafts.length
        : 0;

  const ps =
    stateObj.platformSettings && typeof stateObj.platformSettings === 'object'
      ? (stateObj.platformSettings as Record<string, unknown>)
      : {};

  return {
    rawObject: parsed,
    filename,
    fileSizeBytes,
    formatLabel,
    sourceHost,
    exportedAt,
    hasChecksum,
    usersCount: usersArr.length,
    adminsCount,
    smtpsCount,
    listsCount,
    campaignsCount,
    draftsCount,
    walletAddress: typeof ps.usdtWalletAddress === 'string' ? ps.usdtWalletAddress : '—',
  };
}

interface AdminBackupControlSectionProps {
  token: string;
  users: UserProfile[];
  platformSettings: PlatformSettings;
  onPlatformSettingsUpdated: (settings: PlatformSettings) => void;
  onUsersUpdated: (users: UserProfile[]) => void;
  onAdminDataUpdated: (data: AdminPortalData) => void;
  onFullRestoreCompleted: (nextToken: string, nextSnapshot: DashboardSnapshot) => void;
  onNotify: (ok: boolean, text: string) => void;
}

export const AdminBackupControlSection: React.FC<AdminBackupControlSectionProps> = ({
  token,
  users,
  platformSettings,
  onPlatformSettingsUpdated,
  onUsersUpdated,
  onAdminDataUpdated,
  onFullRestoreCompleted,
  onNotify,
}) => {
  const [status, setStatus] = useState<AdminSystemStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);

  // Backup & Checkpoint states
  const [backupLabel, setBackupLabel] = useState('');
  const [downloadingBackup, setDownloadingBackup] = useState(false);
  const [creatingCheckpoint, setCreatingCheckpoint] = useState(false);

  // Restore states
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingSnapshot, setPendingSnapshot] = useState<ParsedSnapshotPreview | null>(null);
  const [pauseRunningOnRestore, setPauseRunningOnRestore] = useState(true);
  const [preserveSessionsOnRestore, setPreserveSessionsOnRestore] = useState(false);
  const [confirmRestoreOpen, setConfirmRestoreOpen] = useState(false);
  const [restoringSnapshot, setRestoringSnapshot] = useState(false);

  // Rollback & Checkpoint confirm modals
  const [confirmRollbackOpen, setConfirmRollbackOpen] = useState(false);
  const [checkpointToRestore, setCheckpointToRestore] = useState<string | null>(null);
  const [checkpointToDelete, setCheckpointToDelete] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Bonus Days bulk input
  const [bonusDays, setBonusDays] = useState('3');

  // Platform Access & Announcement Banner controls
  const [allowNewSignups, setAllowNewSignups] = useState(
    platformSettings.allowNewSignups !== false
  );
  const [maintenanceMode, setMaintenanceMode] = useState(
    Boolean(platformSettings.maintenanceMode)
  );
  const [maintenanceMessage, setMaintenanceMessage] = useState(
    platformSettings.maintenanceMessage || ''
  );
  const [announcementBanner, setAnnouncementBanner] = useState(
    platformSettings.announcementBanner || ''
  );
  const [savingAccessControls, setSavingAccessControls] = useState(false);

  // Manual SMTP Injection form (Admin -> Any User's Pool)
  const [injectUserId, setInjectUserId] = useState<string>(() => users[0]?.id || '');
  const [injectLabel, setInjectLabel] = useState('');
  const [injectHost, setInjectHost] = useState('');
  const [injectPort, setInjectPort] = useState('587');
  const [injectEnc, setInjectEnc] = useState<SmtpEncryption>('tls');
  const [injectUsername, setInjectUsername] = useState('');
  const [injectPassword, setInjectPassword] = useState('');
  const [showInjectPass, setShowInjectPass] = useState(false);
  const [injectMakePrimary, setInjectMakePrimary] = useState(true);
  const [injectingSmtp, setInjectingSmtp] = useState(false);

  // Danger confirm for destructive bulk actions
  const [pendingDangerAction, setPendingDangerAction] = useState<{
    action:
      | 'stop_all_campaigns'
      | 'clear_finished_campaigns'
      | 'clear_errors'
      | 'clear_alerts'
      | 'clear_tracking'
      | 'revoke_all_non_admin_sessions'
      | 'reset_all_trial_counters';
    title: string;
    description: string;
    confirmLabel: string;
  } | null>(null);

  useEffect(() => {
    setAllowNewSignups(platformSettings.allowNewSignups !== false);
    setMaintenanceMode(Boolean(platformSettings.maintenanceMode));
    setMaintenanceMessage(platformSettings.maintenanceMessage || '');
    setAnnouncementBanner(platformSettings.announcementBanner || '');
  }, [platformSettings]);

  useEffect(() => {
    if (!injectUserId && users.length > 0) {
      setInjectUserId(users[0].id);
    }
  }, [users, injectUserId]);

  const fetchSystemStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const res = await apiRequest<{ systemStatus: AdminSystemStatus }>(
        '/api/admin/system/status',
        {},
        token
      );
      setStatus(res.systemStatus);
    } catch (err) {
      onNotify(
        false,
        err instanceof Error ? err.message : 'Could not load server control status.'
      );
    } finally {
      setLoadingStatus(false);
    }
  }, [token, onNotify]);

  useEffect(() => {
    void fetchSystemStatus();
  }, [fetchSystemStatus]);

  const handleDownloadSnapshot = async () => {
    setDownloadingBackup(true);
    try {
      const query = backupLabel.trim()
        ? `?label=${encodeURIComponent(backupLabel.trim())}`
        : '';
      const response = await fetch(`/api/admin/backup/export${query}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const errData = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error || `Export failed with status ${response.status}`);
      }
      const blob = await response.blob();
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `234mail-vps-snapshot-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onNotify(
        true,
        `Downloaded Portable VPS Snapshot (${formatBytes(blob.size)}) — safe to restore on any new VPS/IP.`
      );
    } catch (err) {
      onNotify(
        false,
        err instanceof Error ? err.message : 'Could not download VPS snapshot.'
      );
    } finally {
      setDownloadingBackup(false);
    }
  };

  const handleCreateDiskCheckpoint = async () => {
    setCreatingCheckpoint(true);
    try {
      const res = await apiRequest<{
        systemStatus: AdminSystemStatus;
        message: string;
      }>(
        '/api/admin/backup/checkpoints',
        {
          method: 'POST',
          body: JSON.stringify({ label: backupLabel.trim() || undefined }),
        },
        token
      );
      setStatus(res.systemStatus);
      setBackupLabel('');
      onNotify(true, res.message);
    } catch (err) {
      onNotify(
        false,
        err instanceof Error ? err.message : 'Could not save server disk checkpoint.'
      );
    } finally {
      setCreatingCheckpoint(false);
    }
  };

  const handleSelectRestoreFile = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const preview = inspectSnapshotJsonFile(text, file.name, file.size);
      setPendingSnapshot(preview);
      onNotify(
        true,
        `Loaded "${file.name}" (${preview.usersCount} users, ${preview.smtpsCount} SMTPs, ${preview.listsCount} lists). Click "Restore Entire VPS Snapshot Now" to apply.`
      );
    } catch (err) {
      setPendingSnapshot(null);
      onNotify(
        false,
        err instanceof Error ? err.message : 'Invalid backup JSON file.'
      );
    }
  };

  const handleConfirmRestoreUpload = async () => {
    if (!pendingSnapshot) return;
    setRestoringSnapshot(true);
    try {
      const res = await apiRequest<{
        token: string;
        snapshot: DashboardSnapshot;
        systemStatus: AdminSystemStatus;
        message: string;
      }>(
        '/api/admin/backup/restore',
        {
          method: 'POST',
          body: JSON.stringify({
            snapshotData: pendingSnapshot.rawObject,
            pauseRunningCampaigns: pauseRunningOnRestore,
            preserveSessions: preserveSessionsOnRestore,
          }),
        },
        token
      );
      setStatus(res.systemStatus);
      setPendingSnapshot(null);
      setConfirmRestoreOpen(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      onFullRestoreCompleted(res.token, res.snapshot);
      onNotify(true, res.message);
    } catch (err) {
      onNotify(
        false,
        err instanceof Error ? err.message : 'Could not restore VPS snapshot.'
      );
    } finally {
      setRestoringSnapshot(false);
    }
  };

  const handleConfirmRollback = async () => {
    setRestoringSnapshot(true);
    try {
      const res = await apiRequest<{
        token: string;
        snapshot: DashboardSnapshot;
        systemStatus: AdminSystemStatus;
        message: string;
      }>(
        '/api/admin/backup/rollback',
        { method: 'POST' },
        token
      );
      setStatus(res.systemStatus);
      setConfirmRollbackOpen(false);
      onFullRestoreCompleted(res.token, res.snapshot);
      onNotify(true, res.message);
    } catch (err) {
      onNotify(false, err instanceof Error ? err.message : 'Rollback failed.');
    } finally {
      setRestoringSnapshot(false);
    }
  };

  const handleDownloadCheckpoint = async (filename: string) => {
    try {
      const response = await fetch(
        `/api/admin/backup/checkpoints/${encodeURIComponent(filename)}/download`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) throw new Error('Download failed.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onNotify(true, `Downloaded checkpoint ${filename}.`);
    } catch (err) {
      onNotify(false, err instanceof Error ? err.message : 'Could not download checkpoint.');
    }
  };

  const handleConfirmRestoreCheckpoint = async () => {
    if (!checkpointToRestore) return;
    setRestoringSnapshot(true);
    try {
      const res = await apiRequest<{
        token: string;
        snapshot: DashboardSnapshot;
        systemStatus: AdminSystemStatus;
        message: string;
      }>(
        `/api/admin/backup/checkpoints/${encodeURIComponent(checkpointToRestore)}/restore`,
        {
          method: 'POST',
          body: JSON.stringify({
            pauseRunningCampaigns: pauseRunningOnRestore,
            preserveSessions: preserveSessionsOnRestore,
          }),
        },
        token
      );
      setStatus(res.systemStatus);
      setCheckpointToRestore(null);
      onFullRestoreCompleted(res.token, res.snapshot);
      onNotify(true, res.message);
    } catch (err) {
      onNotify(false, err instanceof Error ? err.message : 'Could not restore checkpoint.');
    } finally {
      setRestoringSnapshot(false);
    }
  };

  const handleConfirmDeleteCheckpoint = async () => {
    if (!checkpointToDelete) return;
    setBusyAction('delete_checkpoint');
    try {
      const res = await apiRequest<{
        systemStatus: AdminSystemStatus;
        message: string;
      }>(
        `/api/admin/backup/checkpoints/${encodeURIComponent(checkpointToDelete)}`,
        { method: 'DELETE' },
        token
      );
      setStatus(res.systemStatus);
      setCheckpointToDelete(null);
      onNotify(true, res.message);
    } catch (err) {
      onNotify(false, err instanceof Error ? err.message : 'Could not delete checkpoint.');
    } finally {
      setBusyAction(null);
    }
  };

  const runControlAction = async (
    payload: {
      action: string;
      days?: number;
      sessionId?: string;
      userId?: string;
      rateLimitKey?: string;
    },
    busyKey: string
  ) => {
    setBusyAction(busyKey);
    try {
      const res = await apiRequest<{
        message: string;
        users: UserProfile[];
        adminData: AdminPortalData;
        systemStatus: AdminSystemStatus;
      }>(
        '/api/admin/control/action',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
        token
      );
      setStatus(res.systemStatus);
      onUsersUpdated(res.users);
      onAdminDataUpdated(res.adminData);
      onNotify(true, res.message);
    } catch (err) {
      onNotify(false, err instanceof Error ? err.message : 'Control action failed.');
    } finally {
      setBusyAction(null);
      setPendingDangerAction(null);
    }
  };

  const handleSaveAccessControls = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAccessControls(true);
    try {
      const res = await apiRequest<{
        platformSettings: PlatformSettings;
        users?: UserProfile[];
      }>(
        '/api/admin/settings',
        {
          method: 'PUT',
          body: JSON.stringify({
            allowNewSignups,
            maintenanceMode,
            maintenanceMessage: maintenanceMessage.trim(),
            announcementBanner: announcementBanner.trim(),
          }),
        },
        token
      );
      onPlatformSettingsUpdated(res.platformSettings);
      if (res.users) onUsersUpdated(res.users);
      onNotify(true, 'Platform access, maintenance notice & global announcement saved.');
    } catch (err) {
      onNotify(false, err instanceof Error ? err.message : 'Could not save access controls.');
    } finally {
      setSavingAccessControls(false);
    }
  };

  const handleInjectSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!injectUserId) {
      onNotify(false, 'Select a target user account first.');
      return;
    }
    setInjectingSmtp(true);
    try {
      const res = await apiRequest<{
        verified: boolean;
        message: string;
        adminData: AdminPortalData;
      }>(
        '/api/admin/smtps/inject',
        {
          method: 'POST',
          body: JSON.stringify({
            targetUserId: injectUserId,
            label: injectLabel.trim() || undefined,
            host: injectHost.trim(),
            port: Number(injectPort) || 587,
            encryption: injectEnc,
            username: injectUsername.trim(),
            password: injectPassword,
            makePrimary: injectMakePrimary,
          }),
        },
        token
      );
      onAdminDataUpdated(res.adminData);
      setInjectLabel('');
      setInjectHost('');
      setInjectUsername('');
      setInjectPassword('');
      void fetchSystemStatus();
      onNotify(res.verified, res.message);
    } catch (err) {
      onNotify(false, err instanceof Error ? err.message : 'Could not plug in SMTP.');
    } finally {
      setInjectingSmtp(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-display tracking-tight text-slate-900 dark:text-white">
            VPS Backup, Restore &amp; Manual Control
          </h1>
          <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1">
            Export portable full-server snapshots, migrate cleanly to any new VPS IP, and manually control queues, SMTPs, sessions, rate limits &amp; site access.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void fetchSystemStatus()}
          disabled={loadingStatus}
          className="self-start md:self-auto min-h-[38px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1118] text-xs font-mono text-slate-700 dark:text-slate-200 hover:border-cyan-500/40 inline-flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? 'animate-spin' : ''}`} />
          <span>Refresh Live Status</span>
        </button>
      </div>

      {/* Live VPS Telemetry Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-4">
          <div className="text-[10px] font-mono uppercase text-slate-500">STORE FILE SIZE</div>
          <div className="mt-1.5 text-xl font-display font-extrabold tabular-nums text-cyan-500 dark:text-cyan-400">
            {status ? formatBytes(status.storage.fileSizeBytes) : '—'}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-4">
          <div className="text-[10px] font-mono uppercase text-slate-500">SERVER UPTIME</div>
          <div className="mt-1.5 text-xl font-display font-extrabold tabular-nums text-emerald-500 dark:text-emerald-400">
            {status ? formatUptime(status.uptimeSeconds) : '—'}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-4">
          <div className="text-[10px] font-mono uppercase text-slate-500">ACTIVE SESSIONS</div>
          <div className="mt-1.5 text-xl font-display font-extrabold tabular-nums text-slate-900 dark:text-white">
            {status ? status.counts.activeSessions : '—'}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-4">
          <div className="text-[10px] font-mono uppercase text-slate-500">LOCKED IPS</div>
          <div className="mt-1.5 text-xl font-display font-extrabold tabular-nums text-amber-500 dark:text-amber-400">
            {status ? status.rateLimits.filter((r) => r.locked).length : '—'}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-4">
          <div className="text-[10px] font-mono uppercase text-slate-500">CHECKPOINTS</div>
          <div className="mt-1.5 text-xl font-display font-extrabold tabular-nums text-cyan-500 dark:text-cyan-400">
            {status ? status.storage.checkpoints.length : '—'}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-4">
          <div className="text-[10px] font-mono uppercase text-slate-500">RUNTIME</div>
          <div className="mt-1.5 text-sm font-mono font-bold text-slate-800 dark:text-slate-200 truncate">
            {status ? status.nodeVersion : '—'}
          </div>
          <div className="text-[10px] font-mono text-slate-400 truncate mt-0.5">
            {status ? status.hostname : ''}
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* PORTABLE VPS SNAPSHOT BACKUP & RESTORE GRID                          */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* 1. EXPORT / BACKUP CARD */}
        <div className="rounded-2xl border border-cyan-500/30 bg-white dark:bg-[#0c1017] p-5 sm:p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <HardDrive className="w-5 h-5 text-cyan-500 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-base font-display font-extrabold text-slate-900 dark:text-white">
                  Portable VPS Snapshot Backup
                </h2>
                <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                  Exports 100% of your platform into one SHA-256 verified file — users, passwords, subscriptions, SMTPs (with passwords), email lists, campaigns, drafts, API keys &amp; wallet settings. Move it to any new VPS IP.
                </p>
              </div>
            </div>
          </div>

          {status && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
              <div className="rounded-xl bg-slate-50 dark:bg-[#131822] px-3 py-2">
                <div className="text-[9px] uppercase text-slate-400">Users / Admins</div>
                <div className="font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
                  {status.counts.users} / {status.counts.admins}
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-[#131822] px-3 py-2">
                <div className="text-[9px] uppercase text-slate-400">Saved SMTPs</div>
                <div className="font-bold text-cyan-600 dark:text-cyan-400 tabular-nums mt-0.5">
                  {status.counts.smtps}
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-[#131822] px-3 py-2">
                <div className="text-[9px] uppercase text-slate-400">Email Lists</div>
                <div className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">
                  {status.counts.lists}
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-[#131822] px-3 py-2">
                <div className="text-[9px] uppercase text-slate-400">Campaigns</div>
                <div className="font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
                  {status.counts.campaigns}
                </div>
              </div>
            </div>
          )}

          {status && (
            <div className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#131822] border border-slate-200/80 dark:border-white/[0.06] text-[11px] font-mono text-slate-500 dark:text-slate-400 break-all">
              <div>
                <span className="text-slate-400">Disk Store:</span> {status.storage.dataFile}
              </div>
              <div>
                <span className="text-slate-400">Live Origin:</span> {status.currentOrigin}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-mono uppercase text-slate-500 mb-1">
                Snapshot Label (Optional)
              </label>
              <input
                type="text"
                value={backupLabel}
                onChange={(e) => setBackupLabel(e.target.value)}
                placeholder="e.g. Before VPS Migration, Weekly Backup..."
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-xs font-mono text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2.5 text-xs font-mono">
              <button
                type="button"
                disabled={downloadingBackup}
                onClick={handleDownloadSnapshot}
                className="flex-1 min-h-[40px] px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-400 text-slate-950 font-display font-extrabold hover:opacity-95 disabled:opacity-50 inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>
                  {downloadingBackup
                    ? 'Packaging Snapshot...'
                    : 'Download Portable Snapshot (.json)'}
                </span>
              </button>

              <button
                type="button"
                disabled={creatingCheckpoint}
                onClick={handleCreateDiskCheckpoint}
                className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-[#131822] text-slate-800 dark:text-slate-200 font-semibold hover:border-cyan-500/40 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Database className="w-3.5 h-3.5 text-cyan-500" />
                <span>{creatingCheckpoint ? 'Saving...' : 'Save Disk Checkpoint'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* 2. RESTORE CARD */}
        <div className="rounded-2xl border border-emerald-500/30 bg-white dark:bg-[#0c1017] p-5 sm:p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Upload className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-base font-display font-extrabold text-slate-900 dark:text-white">
                  Restore VPS Snapshot (Any Server / New IP)
                </h2>
                <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                  Upload any 234Mail Portable Snapshot or raw <code className="text-cyan-500">esp-store.json</code>. Automatically verifies integrity, rebinds tracking URLs to this new IP, and keeps you signed in.
                </p>
              </div>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={(e) => void handleSelectRestoreFile(e.target.files?.[0] || null)}
            className="hidden"
          />

          <div
            onDragOver={(e) => {
              e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0] || null;
              void handleSelectRestoreFile(f);
            }}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-xl border-2 border-dashed border-slate-300 dark:border-white/15 hover:border-emerald-500/50 bg-slate-50/70 dark:bg-[#111621] px-4 py-5 text-center cursor-pointer transition-colors"
          >
            <Upload className="w-5 h-5 text-emerald-500 mx-auto mb-1.5" />
            <div className="text-xs font-mono font-semibold text-slate-800 dark:text-slate-200">
              {pendingSnapshot
                ? `Selected: ${pendingSnapshot.filename} (${formatBytes(pendingSnapshot.fileSizeBytes)})`
                : 'Click or Drop Portable VPS Snapshot (.json) Here'}
            </div>
            <div className="text-[10px] font-mono text-slate-500 mt-0.5">
              Supports 234Mail Portable Snapshot v1 &amp; raw esp-store.json backups
            </div>
          </div>

          {pendingSnapshot && (
            <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-3.5 space-y-2 text-xs font-mono">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-emerald-700 dark:text-emerald-300">
                  {pendingSnapshot.formatLabel}
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-[10px] text-emerald-700 dark:text-emerald-300">
                  {pendingSnapshot.hasChecksum ? 'SHA-256 Protected' : 'Raw Store'}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[11px] text-slate-700 dark:text-slate-200">
                <div>
                  Users: <strong>{pendingSnapshot.usersCount}</strong> ({pendingSnapshot.adminsCount} admin)
                </div>
                <div>
                  SMTPs: <strong>{pendingSnapshot.smtpsCount}</strong>
                </div>
                <div>
                  Lists: <strong>{pendingSnapshot.listsCount}</strong>
                </div>
                <div>
                  Campaigns: <strong>{pendingSnapshot.campaignsCount}</strong>
                </div>
                <div>
                  Drafts: <strong>{pendingSnapshot.draftsCount}</strong>
                </div>
                <div className="truncate">
                  From: <strong>{pendingSnapshot.sourceHost}</strong>
                </div>
              </div>
              {pendingSnapshot.exportedAt && (
                <div className="text-[10px] text-slate-500 dark:text-slate-400">
                  Exported: {new Date(pendingSnapshot.exportedAt).toLocaleString()}
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5 text-xs font-mono">
            <label className="flex items-center gap-2 cursor-pointer text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={pauseRunningOnRestore}
                onChange={(e) => setPauseRunningOnRestore(e.target.checked)}
                className="w-4 h-4 accent-cyan-500"
              />
              <span>Safely pause running campaigns during restore (recommended on new IP)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={preserveSessionsOnRestore}
                onChange={(e) => setPreserveSessionsOnRestore(e.target.checked)}
                className="w-4 h-4 accent-cyan-500"
              />
              <span>Keep old user login tokens active (unchecked forces fresh user sign-ins)</span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 text-xs font-mono">
            <button
              type="button"
              disabled={!pendingSnapshot || restoringSnapshot}
              onClick={() => setConfirmRestoreOpen(true)}
              className="flex-1 min-h-[40px] px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 font-display font-extrabold hover:opacity-95 disabled:opacity-40 inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>
                {restoringSnapshot ? 'Restoring VPS...' : 'Restore Entire VPS Snapshot Now'}
              </span>
            </button>

            {status?.storage.hasPreRestoreBackup && (
              <button
                type="button"
                disabled={restoringSnapshot}
                onClick={() => setConfirmRollbackOpen(true)}
                className="min-h-[40px] px-3.5 py-2 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold hover:bg-amber-500/20 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Rollback Last Restore</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* On-Disk Checkpoints Table */}
      {status && status.storage.checkpoints.length > 0 && (
        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-5 sm:p-6 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-cyan-500" />
              <h2 className="text-base font-display font-extrabold text-slate-900 dark:text-white">
                Server Disk Checkpoints ({status.storage.checkpoints.length})
              </h2>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              Stored in {status.storage.dataDir}/snapshots
            </span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-white/[0.06] text-xs font-mono">
            {status.storage.checkpoints.map((cp) => (
              <div
                key={cp.filename}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 dark:text-white break-all">
                    {cp.filename}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
                    <span>{new Date(cp.createdAt).toLocaleString()}</span>
                    <span>·</span>
                    <span>{formatBytes(cp.sizeBytes)}</span>
                    {typeof cp.usersCount === 'number' && (
                      <>
                        <span>·</span>
                        <span>{cp.usersCount} users</span>
                      </>
                    )}
                    {typeof cp.smtpsCount === 'number' && (
                      <>
                        <span>·</span>
                        <span>{cp.smtpsCount} SMTPs</span>
                      </>
                    )}
                    {cp.label && (
                      <>
                        <span>·</span>
                        <span className="text-cyan-600 dark:text-cyan-400">{cp.label}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleDownloadCheckpoint(cp.filename)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-700 dark:text-slate-200 hover:border-cyan-500/40 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3 h-3" />
                    <span>Download</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCheckpointToRestore(cp.filename)}
                    className="px-2.5 py-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Restore</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCheckpointToDelete(cp.filename)}
                    className="px-2.5 py-1.5 rounded-lg border border-rose-500/35 bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* COMPREHENSIVE MANUAL PLATFORM CONTROL DECK                           */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* A. GLOBAL QUEUE, SMTP & SUBSCRIPTION MASTER CONTROLS */}
        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-5 sm:p-6 space-y-5">
          <div className="flex items-center gap-2.5">
            <Zap className="w-4 h-4 text-cyan-500 shrink-0" />
            <div>
              <h2 className="text-base font-display font-extrabold text-slate-900 dark:text-white">
                Global Queue, SMTP &amp; Subscription Controls
              </h2>
              <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                Execute immediate manual overrides across all users, queues, SMTP pools, and logs.
              </p>
            </div>
          </div>

          {/* Queue & SMTP Actions */}
          <div className="space-y-2">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
              Queue &amp; SMTP Relay Master Switches
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() =>
                  void runControlAction({ action: 'pause_all_campaigns' }, 'pause_all_campaigns')
                }
                className="min-h-[38px] px-3 py-2 rounded-xl border border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold hover:bg-amber-500/20 inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Pause className="w-3.5 h-3.5" />
                <span>Pause All Running ({status?.counts.runningCampaigns ?? 0})</span>
              </button>

              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() =>
                  void runControlAction({ action: 'resume_all_campaigns' }, 'resume_all_campaigns')
                }
                className="min-h-[38px] px-3 py-2 rounded-xl border border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold hover:bg-emerald-500/20 inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Resume All Paused ({status?.counts.pausedCampaigns ?? 0})</span>
              </button>

              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() =>
                  setPendingDangerAction({
                    action: 'stop_all_campaigns',
                    title: 'Stop All Active Campaigns?',
                    description:
                      'Immediately stop every running, paused, and scheduled campaign across all user accounts?',
                    confirmLabel: 'Stop All Campaigns',
                  })
                }
                className="min-h-[38px] px-3 py-2 rounded-xl border border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-300 font-semibold hover:bg-rose-500/20 inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Stop All Active Jobs</span>
              </button>

              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() =>
                  void runControlAction(
                    { action: 'reset_all_smtp_cooldowns' },
                    'reset_all_smtp_cooldowns'
                  )
                }
                className="min-h-[38px] px-3 py-2 rounded-xl border border-cyan-500/35 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 font-semibold hover:bg-cyan-500/20 inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Server className="w-3.5 h-3.5" />
                <span>Reset All SMTP Cooldowns</span>
              </button>
            </div>
          </div>

          {/* Bulk Subscription Controls */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-white/[0.06]">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
              Bulk Subscription &amp; Trial Overrides
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
              <input
                type="number"
                min={1}
                max={365}
                value={bonusDays}
                onChange={(e) => setBonusDays(e.target.value)}
                className="w-20 min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-900 dark:text-white text-center font-bold"
              />
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() =>
                  void runControlAction(
                    { action: 'grant_bonus_days_active', days: Math.max(1, Number(bonusDays) || 1) },
                    'grant_bonus_days_active'
                  )
                }
                className="flex-1 min-h-[38px] px-3 py-2 rounded-xl border border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold hover:bg-emerald-500/20 inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add +{Math.max(1, Number(bonusDays) || 1)} Bonus Days to All Paid Users</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() =>
                  void runControlAction(
                    { action: 'sync_all_subscriptions' },
                    'sync_all_subscriptions'
                  )
                }
                className="min-h-[38px] px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-700 dark:text-slate-200 hover:border-cyan-500/40 inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 text-cyan-500" />
                <span>Force Sync Countdowns</span>
              </button>

              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() =>
                  setPendingDangerAction({
                    action: 'reset_all_trial_counters',
                    title: 'Reset All Free-Trial Counters?',
                    description:
                      'Reset every free-trial user back to 0/5 trial campaigns used?',
                    confirmLabel: 'Reset Trial Counters',
                  })
                }
                className="min-h-[38px] px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-700 dark:text-slate-200 hover:border-cyan-500/40 inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Users className="w-3.5 h-3.5 text-amber-500" />
                <span>Reset All Trial Counters (0/5)</span>
              </button>
            </div>
          </div>

          {/* Logs & Cleanup */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-white/[0.06]">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
              Maintenance &amp; Log Cleanup
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() =>
                  setPendingDangerAction({
                    action: 'clear_finished_campaigns',
                    title: 'Clear Completed & Stopped Campaigns?',
                    description:
                      'Removes completed, stopped, and failed campaigns from live queues. All recipient lists stay safely preserved inside Email Lists Vault.',
                    confirmLabel: 'Clear Finished Jobs',
                  })
                }
                className="min-h-[36px] px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-700 dark:text-slate-300 hover:border-rose-500/40 cursor-pointer"
              >
                Clear Finished Jobs
              </button>
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() =>
                  setPendingDangerAction({
                    action: 'clear_errors',
                    title: 'Clear All Delivery Error Logs?',
                    description: `Delete all ${status?.counts.errors ?? 0} delivery error log records across the server?`,
                    confirmLabel: 'Clear Errors',
                  })
                }
                className="min-h-[36px] px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-700 dark:text-slate-300 hover:border-rose-500/40 cursor-pointer"
              >
                Clear Errors ({status?.counts.errors ?? 0})
              </button>
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() =>
                  setPendingDangerAction({
                    action: 'clear_alerts',
                    title: 'Clear All System Alerts?',
                    description: `Delete all ${status?.counts.alerts ?? 0} system alert notifications?`,
                    confirmLabel: 'Clear Alerts',
                  })
                }
                className="min-h-[36px] px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-700 dark:text-slate-300 hover:border-rose-500/40 cursor-pointer"
              >
                Clear Alerts ({status?.counts.alerts ?? 0})
              </button>
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() =>
                  setPendingDangerAction({
                    action: 'clear_tracking',
                    title: 'Clear Open-Tracking Records?',
                    description: `Delete all ${status?.counts.tracking ?? 0} historical open-tracking pixel records?`,
                    confirmLabel: 'Clear Tracking',
                  })
                }
                className="min-h-[36px] px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-700 dark:text-slate-300 hover:border-rose-500/40 cursor-pointer"
              >
                Clear Tracking ({status?.counts.tracking ?? 0})
              </button>
            </div>
          </div>
        </div>

        {/* B. PLATFORM ACCESS, MAINTENANCE & GLOBAL ANNOUNCEMENT BANNER */}
        <form
          onSubmit={handleSaveAccessControls}
          className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-5 sm:p-6 space-y-4 flex flex-col justify-between"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <Megaphone className="w-4 h-4 text-cyan-500 shrink-0" />
              <div>
                <h2 className="text-base font-display font-extrabold text-slate-900 dark:text-white">
                  Site Access, Maintenance &amp; Broadcast Banner
                </h2>
                <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                  Manually pause public signups, display maintenance notices, or broadcast an announcement to every logged-in user.
                </p>
              </div>
            </div>

            <div className="space-y-2.5 text-xs font-mono">
              <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] cursor-pointer">
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">
                    Allow New User Registrations
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Turn off to lock signups (only Admin can create accounts when off)
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={allowNewSignups}
                  onChange={(e) => setAllowNewSignups(e.target.checked)}
                  className="w-4 h-4 accent-cyan-500 shrink-0"
                />
              </label>

              <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] cursor-pointer">
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">
                    Maintenance Notice Mode
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Shows a high-priority amber maintenance banner to regular users
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={maintenanceMode}
                  onChange={(e) => setMaintenanceMode(e.target.checked)}
                  className="w-4 h-4 accent-amber-500 shrink-0"
                />
              </label>

              {maintenanceMode && (
                <div>
                  <label className="block text-[10px] uppercase text-slate-500 mb-1">
                    Maintenance Message
                  </label>
                  <input
                    type="text"
                    value={maintenanceMessage}
                    onChange={(e) => setMaintenanceMessage(e.target.value)}
                    placeholder="Scheduled server upgrade in progress. Sending resumes shortly."
                    className="w-full px-3 py-2 rounded-lg border border-amber-500/40 bg-slate-50 dark:bg-[#131822] text-slate-900 dark:text-white"
                  />
                </div>
              )}

              <div>
                <label className="block text-[10px] uppercase text-slate-500 mb-1">
                  Global User Announcement Banner (Leave blank to hide)
                </label>
                <textarea
                  rows={2}
                  value={announcementBanner}
                  onChange={(e) => setAnnouncementBanner(e.target.value)}
                  placeholder="e.g. New high-speed EU relay online — contact Support on Telegram if you need help."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-900 dark:text-white resize-none"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={savingAccessControls}
              className="min-h-[38px] px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-mono font-bold hover:opacity-95 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{savingAccessControls ? 'Saving...' : 'Apply Access & Banner Settings'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* ==================================================================== */}
      {/* MANUAL SMTP INJECTION DIRECTLY INTO ANY USER ACCOUNT                 */}
      {/* ==================================================================== */}
      <form
        onSubmit={handleInjectSmtp}
        className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-5 sm:p-6 space-y-4"
      >
        <div className="flex items-center gap-2.5">
          <Server className="w-4 h-4 text-cyan-500 shrink-0" />
          <div>
            <h2 className="text-base font-display font-extrabold text-slate-900 dark:text-white">
              Manually Plug In SMTP For Any User
            </h2>
            <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
              Test and inject an SMTP server directly into any user&apos;s workspace pool without signing into their account.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
          <div>
            <label className="block text-[10px] uppercase text-slate-500 mb-1">Target User</label>
            <select
              value={injectUserId}
              onChange={(e) => setInjectUserId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-900 dark:text-white"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  #{u.userNumber} · {u.username} ({u.email})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] uppercase text-slate-500 mb-1">
              SMTP Label (Optional)
            </label>
            <input
              type="text"
              value={injectLabel}
              onChange={(e) => setInjectLabel(e.target.value)}
              placeholder="e.g. Primary Relay"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase text-slate-500 mb-1">SMTP Host</label>
            <input
              type="text"
              required
              value={injectHost}
              onChange={(e) => setInjectHost(e.target.value)}
              placeholder="smtp.domain.com"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-900 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] uppercase text-slate-500 mb-1">Port</label>
              <input
                type="number"
                required
                value={injectPort}
                onChange={(e) => {
                  setInjectPort(e.target.value);
                  if (e.target.value === '465') setInjectEnc('ssl');
                  if (e.target.value === '587') setInjectEnc('tls');
                }}
                className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase text-slate-500 mb-1">Security</label>
              <select
                value={injectEnc}
                onChange={(e) => setInjectEnc(e.target.value as SmtpEncryption)}
                className="w-full px-2 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-900 dark:text-white"
              >
                <option value="tls">TLS</option>
                <option value="ssl">SSL</option>
                <option value="none">None</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase text-slate-500 mb-1">SMTP Username</label>
            <input
              type="text"
              required
              value={injectUsername}
              onChange={(e) => setInjectUsername(e.target.value)}
              placeholder="user@domain.com"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase text-slate-500 mb-1">SMTP Password</label>
            <div className="relative">
              <input
                type={showInjectPass ? 'text' : 'password'}
                required
                value={injectPassword}
                onChange={(e) => setInjectPassword(e.target.value)}
                placeholder="SMTP password"
                className="w-full pl-3 pr-9 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-900 dark:text-white"
              />
              <button
                type="button"
                onClick={() => setShowInjectPass((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-800 dark:hover:text-white cursor-pointer"
                aria-label="Toggle SMTP password visibility"
              >
                {showInjectPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="flex items-end">
            <label className="flex items-center gap-2 min-h-[38px] text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={injectMakePrimary}
                onChange={(e) => setInjectMakePrimary(e.target.checked)}
                className="w-4 h-4 accent-cyan-500"
              />
              <span>Set as Primary SMTP</span>
            </label>
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={injectingSmtp}
              className="w-full min-h-[38px] px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 font-bold hover:opacity-95 disabled:opacity-50 inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{injectingSmtp ? 'Testing & Saving...' : 'Test & Plug In SMTP'}</span>
            </button>
          </div>
        </div>
      </form>

      {/* ==================================================================== */}
      {/* ACTIVE SESSIONS & LOGIN RATE-LIMIT LOCKOUT MANAGER                   */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Active Sessions */}
        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-cyan-500" />
              <h2 className="text-base font-display font-extrabold text-slate-900 dark:text-white">
                Active User Sessions ({status?.sessions.length ?? 0})
              </h2>
            </div>
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() =>
                setPendingDangerAction({
                  action: 'revoke_all_non_admin_sessions',
                  title: 'Sign Out All Non-Admin Users?',
                  description:
                    'Immediately revoke all active non-admin user sessions across the website? Users will need to sign in again.',
                  confirmLabel: 'Kick All Users',
                })
              }
              className="px-2.5 py-1.5 rounded-lg border border-rose-500/35 bg-rose-500/10 text-[11px] font-mono font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 cursor-pointer"
            >
              Kick All Non-Admins
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-white/[0.06] max-h-72 overflow-y-auto text-xs font-mono">
            {!status || status.sessions.length === 0 ? (
              <div className="py-8 text-center text-slate-500">No active sessions.</div>
            ) : (
              status.sessions.map((s) => (
                <div
                  key={s.sessionId}
                  className="py-2.5 flex items-center justify-between gap-2.5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-slate-900 dark:text-white">
                        #{s.userNumber} {s.username}
                      </span>
                      {s.role === 'admin' && (
                        <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-[10px] text-rose-500">
                          ADMIN
                        </span>
                      )}
                      {s.isCurrentSession && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-[10px] text-emerald-500">
                          THIS BROWSER
                        </span>
                      )}
                      {s.isImpersonation && (
                        <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 text-[10px] text-cyan-500">
                          PREVIEW
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {s.email} · {s.tokenPrefix}
                    </div>
                  </div>

                  {!s.isCurrentSession && (
                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() =>
                        void runControlAction(
                          { action: 'revoke_session', sessionId: s.sessionId },
                          `revoke_${s.sessionId}`
                        )
                      }
                      className="px-2.5 py-1 rounded-lg border border-rose-500/30 bg-rose-500/10 text-[11px] text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 shrink-0 cursor-pointer"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Rate-Limited / Locked-Out IPs */}
        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-500" />
              <h2 className="text-base font-display font-extrabold text-slate-900 dark:text-white">
                Login Rate Limits &amp; Locked IPs ({status?.rateLimits.length ?? 0})
              </h2>
            </div>
            <button
              type="button"
              disabled={busyAction !== null || !status || status.rateLimits.length === 0}
              onClick={() =>
                void runControlAction({ action: 'clear_all_rate_limits' }, 'clear_all_rate_limits')
              }
              className="px-2.5 py-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/10 text-[11px] font-mono font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40 inline-flex items-center gap-1 cursor-pointer"
            >
              <Unlock className="w-3 h-3" />
              <span>Unblock All</span>
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-white/[0.06] max-h-72 overflow-y-auto text-xs font-mono">
            {!status || status.rateLimits.length === 0 ? (
              <div className="py-8 text-center text-slate-500">
                No IPs currently have failed login attempts or active 10-minute lockouts.
              </div>
            ) : (
              status.rateLimits.map((rl) => (
                <div key={rl.key} className="py-2.5 flex items-center justify-between gap-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {rl.locked ? (
                        <Lock className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      )}
                      <span className="font-bold text-slate-900 dark:text-white">{rl.ip}</span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-[10px] uppercase">
                        {rl.portal}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {rl.locked
                        ? `Locked out — ${Math.ceil(rl.retryAfterSeconds / 60)}m (${rl.retryAfterSeconds}s) remaining`
                        : `${rl.attempts} / 10 failed tries`}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={busyAction !== null}
                    onClick={() =>
                      void runControlAction(
                        { action: 'unlock_rate_limit', rateLimitKey: rl.key },
                        `unlock_${rl.key}`
                      )
                    }
                    className="px-2.5 py-1 rounded-lg border border-emerald-500/35 bg-emerald-500/10 text-[11px] text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 inline-flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <Unlock className="w-3 h-3" />
                    <span>Unblock</span>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modals */}
      <AdminConfirmModal
        open={confirmRestoreOpen && Boolean(pendingSnapshot)}
        title="Restore Entire VPS Snapshot?"
        description={
          pendingSnapshot
            ? `This replaces all current server data with "${pendingSnapshot.filename}" (${pendingSnapshot.usersCount} users, ${pendingSnapshot.smtpsCount} SMTPs, ${pendingSnapshot.listsCount} lists, ${pendingSnapshot.campaignsCount} campaigns). A pre-restore safety backup of the current server is saved automatically so you can roll back anytime.`
            : ''
        }
        confirmLabel="Restore Snapshot Now"
        busy={restoringSnapshot}
        onCancel={() => setConfirmRestoreOpen(false)}
        onConfirm={handleConfirmRestoreUpload}
      />

      <AdminConfirmModal
        open={confirmRollbackOpen}
        title="Rollback to Pre-Restore Safety Copy?"
        description="Restore the automatic safety backup that was saved immediately before your last VPS Snapshot Restore?"
        confirmLabel="Rollback Now"
        busy={restoringSnapshot}
        onCancel={() => setConfirmRollbackOpen(false)}
        onConfirm={handleConfirmRollback}
      />

      <AdminConfirmModal
        open={Boolean(checkpointToRestore)}
        title="Restore On-Disk Checkpoint?"
        description={
          checkpointToRestore
            ? `Restore full server state from "${checkpointToRestore}"? An automatic safety backup of current state will be created first.`
            : ''
        }
        confirmLabel="Restore Checkpoint"
        busy={restoringSnapshot}
        onCancel={() => setCheckpointToRestore(null)}
        onConfirm={handleConfirmRestoreCheckpoint}
      />

      <AdminConfirmModal
        open={Boolean(checkpointToDelete)}
        title="Delete Disk Checkpoint?"
        description={
          checkpointToDelete
            ? `Permanently delete checkpoint file "${checkpointToDelete}" from server disk?`
            : ''
        }
        confirmLabel="Delete Checkpoint"
        busy={busyAction === 'delete_checkpoint'}
        onCancel={() => setCheckpointToDelete(null)}
        onConfirm={handleConfirmDeleteCheckpoint}
      />

      <AdminConfirmModal
        open={Boolean(pendingDangerAction)}
        title={pendingDangerAction?.title || ''}
        description={pendingDangerAction?.description || ''}
        confirmLabel={pendingDangerAction?.confirmLabel || 'Confirm'}
        busy={busyAction !== null}
        onCancel={() => setPendingDangerAction(null)}
        onConfirm={() => {
          if (pendingDangerAction) {
            void runControlAction(
              { action: pendingDangerAction.action },
              pendingDangerAction.action
            );
          }
        }}
      />
    </div>
  );
};
