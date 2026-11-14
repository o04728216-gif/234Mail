import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  Plus,
  Search,
  Server,
  Settings,
  Sliders,
  X,
  Zap,
} from 'lucide-react';
import type {
  AdminResetSmtpConfig,
  DashboardSnapshot,
  HourlyRateStep,
  PlatformSettings,
  SmtpEncryption,
  SubscriptionStatus,
  UserOptions,
  UserProfile,
  UserRole,
} from '../types';
import { apiRequest } from '../utils/api';
import { PWAInstallButton } from './PWAInstallButton';

const HOURLY_STEPS: HourlyRateStep[] = [50, 100, 200, 300, 400, 500, 1000];

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function formatHumanDate(isoDate: string): string {
  if (!isoDate || !isoDate.trim()) return '—';
  const clean = isoDate.trim().slice(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) return isoDate;
  const year = parts[0];
  const monthIdx = Number(parts[1]) - 1;
  const day = parts[2];
  if (monthIdx < 0 || monthIdx > 11) return isoDate;
  return `${MONTHS_SHORT[monthIdx]} ${day}, ${year}`;
}

interface AdminDashboardViewProps {
  token: string;
  snapshot: DashboardSnapshot;
  onUsersUpdated: (users: UserProfile[], updatedSelf?: UserProfile) => void;
  onPlatformSettingsUpdated: (settings: PlatformSettings) => void;
  onAdminResetSmtpUpdated?: (cfg: AdminResetSmtpConfig) => void;
  onImpersonateUser: (impersonatedToken: string, impersonatedSnapshot: DashboardSnapshot) => void;
}

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  token,
  snapshot,
  onUsersUpdated,
  onPlatformSettingsUpdated,
  onAdminResetSmtpUpdated,
  onImpersonateUser,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'pending' | 'expired'>('all');

  // Global Platform Settings Drawer
  const [showPlatformOptions, setShowPlatformOptions] = useState(false);
  const [priceUsd, setPriceUsd] = useState(String(snapshot.platformSettings.monthlyPriceUsd));
  const [durationDays, setDurationDays] = useState(
    String(snapshot.platformSettings.planDurationDays)
  );
  const [walletAddr, setWalletAddr] = useState(snapshot.platformSettings.usdtWalletAddress);
  const [networkNote, setNetworkNote] = useState(snapshot.platformSettings.paymentNetwork);
  const [defaultSignupStatus, setDefaultSignupStatus] = useState<'pending' | 'active'>(
    snapshot.platformSettings.newUserDefaultStatus
  );
  const [trialDays, setTrialDays] = useState(String(snapshot.platformSettings.newUserTrialDays));
  const [savingSettings, setSavingSettings] = useState(false);

  // Dedicated Magic Link Reset Email SMTP Panel (/admin)
  const [showResetSmtp, setShowResetSmtp] = useState(false);
  const [resetSmtpHost, setResetSmtpHost] = useState(snapshot.adminResetSmtp?.host || '');
  const [resetSmtpPort, setResetSmtpPort] = useState(
    String(snapshot.adminResetSmtp?.port || 587)
  );
  const [resetSmtpEnc, setResetSmtpEnc] = useState<SmtpEncryption>(
    snapshot.adminResetSmtp?.encryption || 'tls'
  );
  const [resetSmtpUser, setResetSmtpUser] = useState(snapshot.adminResetSmtp?.username || '');
  const [resetSmtpPass, setResetSmtpPass] = useState('');
  const [resetSmtpFromEmail, setResetSmtpFromEmail] = useState(
    snapshot.adminResetSmtp?.fromEmail || ''
  );
  const [resetSmtpFromName, setResetSmtpFromName] = useState(
    snapshot.adminResetSmtp?.fromName || '234Mail'
  );
  const [savingResetSmtp, setSavingResetSmtp] = useState(false);

  // Dedicated Admin Account & Password Panel (/admin)
  const [showAdminAccount, setShowAdminAccount] = useState(false);
  const [adminUsername, setAdminUsername] = useState(snapshot.user.username);
  const [adminEmail, setAdminEmail] = useState(snapshot.user.email);
  const [adminNewPassword, setAdminNewPassword] = useState('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');
  const [savingAdminAccount, setSavingAdminAccount] = useState(false);

  // Create New User Panel
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newStatus, setNewStatus] = useState<SubscriptionStatus>('pending');
  const [newDays, setNewDays] = useState('30');
  const [newRole, setNewRole] = useState<UserRole>('manager');
  const [creatingUser, setCreatingUser] = useState(false);

  useEffect(() => {
    setAdminUsername(snapshot.user.username);
    setAdminEmail(snapshot.user.email);
  }, [snapshot.user.username, snapshot.user.email]);

  // Per-User Expanded Options Editor & Confirm Delete
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [draftDays, setDraftDays] = useState<number>(0);
  const [draftActiveTimes, setDraftActiveTimes] = useState<number>(0);
  const [draftStatus, setDraftStatus] = useState<SubscriptionStatus>('active');
  const [draftRole, setDraftRole] = useState<UserRole>('manager');
  const [draftResetPassword, setDraftResetPassword] = useState('');
  const [draftOptions, setDraftOptions] = useState<UserOptions>({
    allowFastBurst: true,
    maxHourlyRate: 1000,
    dailyEmailLimit: 0,
    allowHtml: true,
    allowTracking: true,
    allowCustomFrom: true,
  });

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null);

  const planPrice = Math.max(1, snapshot.platformSettings.monthlyPriceUsd || 20);
  const planDays = Math.max(1, snapshot.platformSettings.planDurationDays || 30);

  const getEffectiveActiveTimes = (u: UserProfile): number => {
    if (
      u.subscriptionStatus === 'suspended' ||
      u.subscriptionStatus === 'pending' ||
      (u.paymentsCount || 0) === 0
    ) {
      return 0;
    }
    const isUserActive = u.subscriptionStatus === 'active' && u.daysLeft > 0;
    if (!isUserActive) {
      return Math.max(0, u.paymentsCount || 0);
    }
    const periodsFromDays = Math.max(1, Math.ceil(u.daysLeft / planDays));
    return Math.max(u.paymentsCount || 0, periodsFromDays);
  };

  const stats = useMemo(() => {
    const users = snapshot.users;
    const totalUsers = users.length;
    const activeCount = users.filter(
      (u) => u.subscriptionStatus === 'active' && u.daysLeft > 0 && (u.paymentsCount || 0) > 0
    ).length;
    const pendingCount = users.filter(
      (u) =>
        u.subscriptionStatus === 'pending' ||
        (u.subscriptionStatus === 'active' && u.daysLeft > 0 && (u.paymentsCount || 0) === 0)
    ).length;
    const expiredCount = users.filter(
      (u) =>
        u.subscriptionStatus === 'expired' ||
        u.subscriptionStatus === 'suspended' ||
        (u.subscriptionStatus === 'active' && u.daysLeft <= 0)
    ).length;

    const totalActiveTimes = users.reduce((sum, u) => {
      if (
        u.subscriptionStatus === 'suspended' ||
        u.subscriptionStatus === 'pending' ||
        (u.paymentsCount || 0) === 0
      ) {
        return sum;
      }
      const isUserActive = u.subscriptionStatus === 'active' && u.daysLeft > 0;
      if (!isUserActive) {
        return sum + Math.max(0, u.paymentsCount || 0);
      }
      const periodsFromDays = Math.max(1, Math.ceil(u.daysLeft / planDays));
      return sum + Math.max(u.paymentsCount || 0, periodsFromDays);
    }, 0);

    const totalRevenue = totalActiveTimes * planPrice;

    return {
      totalUsers,
      activeCount,
      pendingCount,
      expiredCount,
      totalActiveTimes,
      totalRevenue,
    };
  }, [snapshot.users, planDays, planPrice]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return snapshot.users.filter((u) => {
      const effectiveStatus =
        u.subscriptionStatus === 'active' && u.daysLeft <= 0 ? 'expired' : u.subscriptionStatus;
      const isTrialUser =
        effectiveStatus === 'pending' ||
        (effectiveStatus === 'active' && (u.paymentsCount || 0) === 0 && u.role !== 'admin');
      const isPaidActive =
        effectiveStatus === 'active' && ((u.paymentsCount || 0) > 0 || u.role === 'admin');

      if (statusFilter === 'active' && !isPaidActive) return false;
      if (statusFilter === 'pending' && !isTrialUser) return false;
      if (
        statusFilter === 'expired' &&
        effectiveStatus !== 'expired' &&
        effectiveStatus !== 'suspended'
      ) {
        return false;
      }

      if (!q) return true;
      return (
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q) ||
        `#${u.userNumber}`.includes(q) ||
        String(u.userNumber) === q
      );
    });
  }, [snapshot.users, search, statusFilter]);

  const openUserOptions = (u: UserProfile) => {
    if (editingUserId === u.id) {
      setEditingUserId(null);
      return;
    }
    setEditingUserId(u.id);
    setDraftDays(u.daysLeft);
    setDraftActiveTimes(getEffectiveActiveTimes(u));
    setDraftStatus(u.subscriptionStatus);
    setDraftRole(u.role);
    setDraftResetPassword('');
    setDraftOptions({ ...u.options });
  };

  const handleQuickAction = async (
    user: UserProfile,
    action: 'activate' | 'suspend',
    recordPayment = true
  ) => {
    setBusyUserId(user.id);
    setBanner(null);
    try {
      const res = await apiRequest<{ user: UserProfile; users: UserProfile[] }>(
        `/api/admin/users/${user.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ action, recordPayment }),
        },
        token
      );
      onUsersUpdated(res.users, res.user.id === snapshot.user.id ? res.user : undefined);
      setBanner({
        ok: true,
        text:
          action === 'activate'
            ? `Activated ${user.username} (+${planDays} days · +$${planPrice} revenue, ${res.user.paymentsCount} active time${res.user.paymentsCount === 1 ? '' : 's'}).`
            : `Suspended ${user.username}. Active times reset and user will see the payment page on login.`,
      });
    } catch (err) {
      setBanner({
        ok: false,
        text: err instanceof Error ? err.message : 'Action failed.',
      });
    } finally {
      setBusyUserId(null);
    }
  };

  const handleSaveUserOptions = async (user: UserProfile) => {
    setBusyUserId(user.id);
    setBanner(null);
    try {
      const res = await apiRequest<{ user: UserProfile; users: UserProfile[] }>(
        `/api/admin/users/${user.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            subscriptionStatus: draftStatus,
            daysLeft: draftDays,
            paymentsCount: draftActiveTimes,
            role: draftRole,
            newPassword: draftResetPassword.trim() || undefined,
            options: draftOptions,
          }),
        },
        token
      );
      onUsersUpdated(res.users, res.user.id === snapshot.user.id ? res.user : undefined);
      setEditingUserId(null);
      setBanner({
        ok: true,
        text: `Saved updated options and permissions for ${user.username}.`,
      });
    } catch (err) {
      setBanner({
        ok: false,
        text: err instanceof Error ? err.message : 'Could not update user options.',
      });
    } finally {
      setBusyUserId(null);
    }
  };

  const handleCreditPayment = async (user: UserProfile) => {
    setBusyUserId(user.id);
    setBanner(null);
    try {
      const res = await apiRequest<{ user: UserProfile; users: UserProfile[] }>(
        `/api/admin/users/${user.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            action: 'activate',
            recordPayment: true,
          }),
        },
        token
      );
      onUsersUpdated(res.users, res.user.id === snapshot.user.id ? res.user : undefined);
      setBanner({
        ok: true,
        text: `Recorded $${snapshot.platformSettings.monthlyPriceUsd} payment and added +${snapshot.platformSettings.planDurationDays} days for ${user.username}.`,
      });
    } catch (err) {
      setBanner({
        ok: false,
        text: err instanceof Error ? err.message : 'Could not credit payment.',
      });
    } finally {
      setBusyUserId(null);
    }
  };

  const handleDeleteUser = async (user: UserProfile) => {
    setBusyUserId(user.id);
    setBanner(null);
    try {
      const res = await apiRequest<{ users: UserProfile[] }>(
        `/api/admin/users/${user.id}`,
        { method: 'DELETE' },
        token
      );
      onUsersUpdated(res.users);
      setConfirmDeleteId(null);
      setBanner({ ok: true, text: `Deleted user ${user.username}.` });
    } catch (err) {
      setBanner({
        ok: false,
        text: err instanceof Error ? err.message : 'Could not delete user.',
      });
    } finally {
      setBusyUserId(null);
    }
  };

  const handleLoginAsUser = async (user: UserProfile) => {
    setBusyUserId(user.id);
    setBanner(null);
    try {
      const res = await apiRequest<{ token: string; snapshot: DashboardSnapshot }>(
        `/api/admin/users/${user.id}/impersonate`,
        { method: 'POST' },
        token
      );
      onImpersonateUser(res.token, res.snapshot);
    } catch (err) {
      setBanner({
        ok: false,
        text: err instanceof Error ? err.message : 'Could not switch into user account.',
      });
      setBusyUserId(null);
    }
  };

  const handleSavePlatformSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setBanner(null);
    try {
      const res = await apiRequest<{
        platformSettings: PlatformSettings;
        users?: UserProfile[];
      }>(
        '/api/admin/settings',
        {
          method: 'PUT',
          body: JSON.stringify({
            monthlyPriceUsd: Number(priceUsd) || 20,
            planDurationDays: Number(durationDays) || 30,
            usdtWalletAddress: walletAddr.trim(),
            paymentNetwork: networkNote.trim(),
            newUserDefaultStatus: defaultSignupStatus,
            newUserTrialDays: Number(trialDays) || 0,
          }),
        },
        token
      );
      onPlatformSettingsUpdated(res.platformSettings);
      if (res.users) {
        onUsersUpdated(res.users);
      }
      setShowPlatformOptions(false);
      setBanner({
        ok: true,
        text: 'Global platform payment and signup options saved!',
      });
    } catch (err) {
      setBanner({
        ok: false,
        text: err instanceof Error ? err.message : 'Could not save platform options.',
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingUser(true);
    setBanner(null);
    try {
      const res = await apiRequest<{ user: UserProfile; users: UserProfile[] }>(
        '/api/admin/users',
        {
          method: 'POST',
          body: JSON.stringify({
            username: newUsername.trim(),
            email: newEmail.trim(),
            password: newPassword,
            role: newRole,
            subscriptionStatus: newStatus,
            daysLeft: newStatus === 'active' ? Number(newDays) || 30 : 0,
          }),
        },
        token
      );
      onUsersUpdated(res.users);
      setNewUsername('');
      setNewEmail('');
      setNewPassword('');
      setShowCreateUser(false);
      setBanner({
        ok: true,
        text: `Created user ${res.user.username} (#${res.user.userNumber}).`,
      });
    } catch (err) {
      setBanner({
        ok: false,
        text: err instanceof Error ? err.message : 'Could not create user.',
      });
    } finally {
      setCreatingUser(false);
    }
  };

  const handleSaveResetSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingResetSmtp(true);
    setBanner(null);
    try {
      const res = await apiRequest<{
        adminResetSmtp: AdminResetSmtpConfig;
        verification: { verified: boolean; message: string };
      }>(
        '/api/admin/reset-smtp',
        {
          method: 'PUT',
          body: JSON.stringify({
            host: resetSmtpHost.trim(),
            port: Number(resetSmtpPort) || 587,
            encryption: resetSmtpEnc,
            username: resetSmtpUser.trim(),
            newPassword: resetSmtpPass || undefined,
            fromEmail: resetSmtpFromEmail.trim() || resetSmtpUser.trim(),
            fromName: resetSmtpFromName.trim() || '234Mail',
          }),
        },
        token
      );
      onAdminResetSmtpUpdated?.(res.adminResetSmtp);
      setResetSmtpPass('');
      if (res.verification.verified) {
        setShowResetSmtp(false);
      }
      setBanner({
        ok: res.verification.verified,
        text: res.verification.verified
          ? `Reset Email SMTP saved & verified (${res.adminResetSmtp.host}:${res.adminResetSmtp.port})! Password reset magic links will now send from ${res.adminResetSmtp.fromEmail || res.adminResetSmtp.username}.`
          : `Saved Reset Email SMTP, but server verification reported: ${res.verification.message}`,
      });
    } catch (err) {
      setBanner({
        ok: false,
        text: err instanceof Error ? err.message : 'Could not save Reset Email SMTP.',
      });
    } finally {
      setSavingResetSmtp(false);
    }
  };

  const handleTestResetSmtp = async () => {
    setSavingResetSmtp(true);
    setBanner(null);
    try {
      const res = await apiRequest<{ verified: boolean; message: string }>(
        '/api/admin/reset-smtp/verify',
        {
          method: 'POST',
          body: JSON.stringify({
            host: resetSmtpHost.trim(),
            port: Number(resetSmtpPort) || 587,
            encryption: resetSmtpEnc,
            username: resetSmtpUser.trim(),
            password: resetSmtpPass || undefined,
          }),
        },
        token
      );
      setBanner({ ok: res.verified, text: res.message });
    } catch (err) {
      setBanner({
        ok: false,
        text: err instanceof Error ? err.message : 'Connection test failed.',
      });
    } finally {
      setSavingResetSmtp(false);
    }
  };

  const handleSaveAdminAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setBanner(null);

    if (!adminUsername.trim() || adminUsername.trim().length < 2) {
      setBanner({ ok: false, text: 'Admin username must be at least 2 characters.' });
      return;
    }
    if (!adminEmail.trim() || !adminEmail.trim().includes('@')) {
      setBanner({ ok: false, text: 'Please enter a valid Admin email address.' });
      return;
    }
    if (adminNewPassword.length > 0) {
      if (adminNewPassword.trim().length < 4) {
        setBanner({ ok: false, text: 'New Admin password must be at least 4 characters.' });
        return;
      }
      if (adminNewPassword !== adminConfirmPassword) {
        setBanner({ ok: false, text: 'New Admin passwords do not match.' });
        return;
      }
    }

    setSavingAdminAccount(true);
    try {
      const res = await apiRequest<{
        user: UserProfile;
        users: UserProfile[];
        message: string;
      }>(
        '/api/admin/account',
        {
          method: 'PUT',
          body: JSON.stringify({
            username: adminUsername.trim(),
            email: adminEmail.trim(),
            newPassword: adminNewPassword.trim() || undefined,
          }),
        },
        token
      );
      onUsersUpdated(res.users, res.user);
      setAdminNewPassword('');
      setAdminConfirmPassword('');
      setShowAdminAccount(false);
      setBanner({ ok: true, text: res.message });
    } catch (err) {
      setBanner({
        ok: false,
        text: err instanceof Error ? err.message : 'Could not update Admin credentials.',
      });
    } finally {
      setSavingAdminAccount(false);
    }
  };

  const isResetSmtpConfigured = Boolean(snapshot.adminResetSmtp?.configured);

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-4xl font-extrabold font-display tracking-tight text-slate-900 dark:text-white">
            Admin Dashboard
          </h1>
          <p className="text-xs sm:text-sm font-mono text-slate-500 dark:text-slate-400 mt-1">
            Manage all users, subscriptions and activity.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2.5 w-full lg:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search user, email or ID..."
              className="w-full min-h-[42px] pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1118] text-xs font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => {
                setShowAdminAccount((v) => !v);
                setShowResetSmtp(false);
                setShowPlatformOptions(false);
                setShowCreateUser(false);
              }}
              className={`min-h-[42px] px-3 py-2.5 rounded-xl border text-xs font-mono inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                showAdminAccount
                  ? 'border-cyan-500 bg-cyan-500/15 text-cyan-600 dark:text-cyan-300'
                  : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1118] text-slate-700 dark:text-slate-300 hover:border-cyan-500/40'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
              <span className="truncate">Admin Account</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowResetSmtp((v) => !v);
                setShowAdminAccount(false);
                setShowPlatformOptions(false);
                setShowCreateUser(false);
              }}
              className={`min-h-[42px] px-3 py-2.5 rounded-xl border text-xs font-mono inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                showResetSmtp
                  ? 'border-cyan-500 bg-cyan-500/15 text-cyan-600 dark:text-cyan-300'
                  : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1118] text-slate-700 dark:text-slate-300 hover:border-cyan-500/40'
              }`}
            >
              <Server className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
              <span className="truncate">Reset SMTP</span>
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  isResetSmtpConfigured ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
                title={
                  isResetSmtpConfigured ? 'Reset Email SMTP configured' : 'Reset Email SMTP not set'
                }
              />
            </button>

            <button
              type="button"
              onClick={() => {
                setShowPlatformOptions((v) => !v);
                setShowAdminAccount(false);
                setShowResetSmtp(false);
                setShowCreateUser(false);
              }}
              className={`min-h-[42px] px-3 py-2.5 rounded-xl border text-xs font-mono inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                showPlatformOptions
                  ? 'border-cyan-500 bg-cyan-500/15 text-cyan-600 dark:text-cyan-300'
                  : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1118] text-slate-700 dark:text-slate-300 hover:border-cyan-500/40'
              }`}
            >
              <Settings className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
              <span className="truncate">Platform Options</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowCreateUser((v) => !v);
                setShowAdminAccount(false);
                setShowPlatformOptions(false);
                setShowResetSmtp(false);
              }}
              className="min-h-[42px] px-3.5 py-2.5 rounded-xl bg-cyan-500 text-slate-950 font-mono font-bold text-xs inline-flex items-center justify-center gap-1.5 hover:opacity-95 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Add User</span>
            </button>
          </div>
        </div>
      </div>

      {banner && (
        <div
          className={`px-4 py-3 rounded-xl border text-xs font-mono flex items-center justify-between gap-3 ${
            banner.ok
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
          }`}
        >
          <span>{banner.text}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="p-1 opacity-70 hover:opacity-100 cursor-pointer"
            aria-label="Dismiss message"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Dedicated Admin Account & Password Settings Panel (/admin) */}
      {showAdminAccount && (
        <form
          onSubmit={handleSaveAdminAccount}
          className="rounded-2xl border border-cyan-500/30 bg-white dark:bg-[#0c1017] p-5 sm:p-6 space-y-4"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-display font-bold text-slate-900 dark:text-white">
                Admin Login &amp; Password Settings
              </h2>
              <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                Update the username, recovery email (used for Forgot Password magic links), or password for your Admin account. Saved permanently on persistent disk.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAdminAccount(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-mono">
            <div>
              <label className="block text-slate-500 dark:text-slate-400 mb-1">
                Admin Username
              </label>
              <input
                type="text"
                required
                value={adminUsername}
                onChange={(e) => setAdminUsername(e.target.value)}
                placeholder="Your admin username"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-slate-500 dark:text-slate-400 mb-1">
                Admin Recovery Email
              </label>
              <input
                type="email"
                required
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="admin@yourdomain.com"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-slate-500 dark:text-slate-400 mb-1">
                New Password (Optional)
              </label>
              <input
                type="password"
                value={adminNewPassword}
                onChange={(e) => setAdminNewPassword(e.target.value)}
                placeholder="Leave blank to keep current"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-slate-500 dark:text-slate-400 mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                value={adminConfirmPassword}
                onChange={(e) => setAdminConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-1 text-xs font-mono">
            <button
              type="button"
              onClick={() => setShowAdminAccount(false)}
              className="px-3.5 py-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingAdminAccount}
              className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-bold inline-flex items-center gap-1.5 hover:opacity-95 disabled:opacity-50 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{savingAdminAccount ? 'Saving...' : 'Save Admin Credentials'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Dedicated Reset Magic Link SMTP Panel (/admin) */}
      {showResetSmtp && (
        <form
          onSubmit={handleSaveResetSmtp}
          className="rounded-2xl border border-cyan-500/30 bg-white dark:bg-[#0c1017] p-5 sm:p-6 space-y-4"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-display font-bold text-slate-900 dark:text-white">
                Magic Link Reset Email SMTP
              </h2>
              <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                Dedicated SMTP server used exclusively to send Forgot Password magic links to users.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowResetSmtp(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-mono">
            <div>
              <label className="block text-slate-500 dark:text-slate-400 mb-1">SMTP Host</label>
              <input
                type="text"
                required
                value={resetSmtpHost}
                onChange={(e) => setResetSmtpHost(e.target.value)}
                placeholder="smtp.gmail.com"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-slate-500 dark:text-slate-400 mb-1">Port</label>
              <input
                type="number"
                required
                value={resetSmtpPort}
                onChange={(e) => {
                  const val = e.target.value;
                  setResetSmtpPort(val);
                  if (val === '465') setResetSmtpEnc('ssl');
                  if (val === '587') setResetSmtpEnc('tls');
                }}
                placeholder="587"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-slate-500 dark:text-slate-400 mb-1">Encryption</label>
              <select
                value={resetSmtpEnc}
                onChange={(e) => {
                  const enc = e.target.value as SmtpEncryption;
                  setResetSmtpEnc(enc);
                  if (enc === 'ssl' && resetSmtpPort === '587') setResetSmtpPort('465');
                  if (enc === 'tls' && resetSmtpPort === '465') setResetSmtpPort('587');
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-900 dark:text-white"
              >
                <option value="tls">TLS (Port 587)</option>
                <option value="ssl">SSL (Port 465)</option>
                <option value="none">None</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-500 dark:text-slate-400 mb-1">SMTP Username</label>
              <input
                type="text"
                required
                value={resetSmtpUser}
                onChange={(e) => setResetSmtpUser(e.target.value)}
                placeholder="noreply@yourdomain.com"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-slate-500 dark:text-slate-400 mb-1">
                SMTP Password {snapshot.adminResetSmtp?.hasPassword ? '(Saved)' : ''}
              </label>
              <input
                type="password"
                required={!snapshot.adminResetSmtp?.hasPassword}
                value={resetSmtpPass}
                onChange={(e) => setResetSmtpPass(e.target.value)}
                placeholder={
                  snapshot.adminResetSmtp?.hasPassword ? '••••••••••••' : 'Enter SMTP password'
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-slate-500 dark:text-slate-400 mb-1">
                From Email (Sender)
              </label>
              <input
                type="email"
                value={resetSmtpFromEmail}
                onChange={(e) => setResetSmtpFromEmail(e.target.value)}
                placeholder="Defaults to SMTP Username"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-slate-500 dark:text-slate-400 mb-1">From Name</label>
              <input
                type="text"
                value={resetSmtpFromName}
                onChange={(e) => setResetSmtpFromName(e.target.value)}
                placeholder="234Mail"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex items-end gap-2">
              <button
                type="button"
                disabled={savingResetSmtp}
                onClick={handleTestResetSmtp}
                className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-[#131822] text-slate-800 dark:text-white font-bold hover:border-cyan-500/50 cursor-pointer"
              >
                Test
              </button>
              <button
                type="submit"
                disabled={savingResetSmtp}
                className="flex-1 px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-bold hover:opacity-95 disabled:opacity-50 cursor-pointer"
              >
                {savingResetSmtp ? 'Saving...' : 'Save Reset SMTP'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Global Platform Options Panel */}
      {showPlatformOptions && (
        <form
          onSubmit={handleSavePlatformSettings}
          className="rounded-2xl border border-cyan-500/30 bg-white dark:bg-[#0c1017] p-5 sm:p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-display font-bold text-slate-900 dark:text-white">
                Global Platform &amp; Payment Options
              </h2>
              <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                Changes apply immediately to the Payment Page and new user signups.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowPlatformOptions(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-mono">
            <div>
              <label className="block text-[10px] uppercase text-slate-500 mb-1.5">
                Subscription Price ($ USD)
              </label>
              <input
                type="number"
                min={1}
                value={priceUsd}
                onChange={(e) => setPriceUsd(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase text-slate-500 mb-1.5">
                Access Duration (Days)
              </label>
              <input
                type="number"
                min={1}
                value={durationDays}
                onChange={(e) => setDurationDays(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase text-slate-500 mb-1.5">
                New User Signup Mode
              </label>
              <select
                value={defaultSignupStatus}
                onChange={(e) => setDefaultSignupStatus(e.target.value as 'pending' | 'active')}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-900 dark:text-white"
              >
                <option value="pending">Free Trial (Sign In Free · Pay to Send)</option>
                <option value="active">Free Trial (Sign In Free · Pay to Send)</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] uppercase text-slate-500 mb-1.5">
                Free Trial Duration (Days)
              </label>
              <input
                type="number"
                min={1}
                value={trialDays}
                onChange={(e) => setTrialDays(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-900 dark:text-white"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-[10px] uppercase text-slate-500 mb-1.5">
                USDT Payment Wallet Address
              </label>
              <input
                type="text"
                value={walletAddr}
                onChange={(e) => setWalletAddr(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-cyan-600 dark:text-cyan-300"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase text-slate-500 mb-1.5">
                Network Label
              </label>
              <input
                type="text"
                value={networkNote}
                onChange={(e) => setNetworkNote(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="submit"
              disabled={savingSettings}
              className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 text-xs font-mono font-bold hover:opacity-95 cursor-pointer"
            >
              {savingSettings ? 'Saving...' : 'Save Platform Options'}
            </button>
          </div>
        </form>
      )}

      {/* Create New User Panel */}
      {showCreateUser && (
        <form
          onSubmit={handleCreateUser}
          className="rounded-2xl border border-cyan-500/30 bg-white dark:bg-[#0c1017] p-5 sm:p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-display font-bold text-slate-900 dark:text-white">
              Create New User Account
            </h2>
            <button
              type="button"
              onClick={() => setShowCreateUser(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs font-mono">
            <div>
              <label className="block text-[10px] uppercase text-slate-500 mb-1">Username</label>
              <input
                type="text"
                required
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="Username"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase text-slate-500 mb-1">Email</label>
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="user@gmail.com"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase text-slate-500 mb-1">Password</label>
              <input
                type="text"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 4 chars"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase text-slate-500 mb-1">Status</label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as SubscriptionStatus)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-900 dark:text-white"
              >
                <option value="pending">Free Trial (Pay to Send)</option>
                <option value="active">Paid &amp; Active</option>
                <option value="expired">Expired</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase text-slate-500 mb-1">
                {newStatus === 'active' ? 'Days Active' : 'Role'}
              </label>
              {newStatus === 'active' ? (
                <input
                  type="number"
                  min={1}
                  value={newDays}
                  onChange={(e) => setNewDays(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-900 dark:text-white"
                />
              ) : (
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-900 dark:text-white"
                >
                  <option value="manager">Regular User</option>
                  <option value="admin">Admin</option>
                </select>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={creatingUser}
              className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 text-xs font-mono font-bold hover:opacity-95 cursor-pointer"
            >
              {creatingUser ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      )}

      {/* 5 Top Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <button
          type="button"
          onClick={() => setStatusFilter('all')}
          className={`text-left rounded-2xl border p-4 sm:p-5 transition-colors cursor-pointer ${
            statusFilter === 'all'
              ? 'border-cyan-500/45 bg-white dark:bg-[#0d121a]'
              : 'border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] hover:border-cyan-500/30'
          }`}
        >
          <div className="text-[10px] sm:text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
            TOTAL USERS
          </div>
          <div className="mt-1.5 sm:mt-2 text-2xl sm:text-4xl font-display font-extrabold tabular-nums text-cyan-500 dark:text-cyan-400">
            {stats.totalUsers}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter((f) => (f === 'active' ? 'all' : 'active'))}
          className={`text-left rounded-2xl border p-4 sm:p-5 transition-colors cursor-pointer ${
            statusFilter === 'active'
              ? 'border-emerald-500/45 bg-white dark:bg-[#0d121a]'
              : 'border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] hover:border-emerald-500/30'
          }`}
        >
          <div className="text-[10px] sm:text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
            ACTIVE
          </div>
          <div className="mt-1.5 sm:mt-2 text-2xl sm:text-4xl font-display font-extrabold tabular-nums text-emerald-500 dark:text-emerald-400">
            {stats.activeCount}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter((f) => (f === 'pending' ? 'all' : 'pending'))}
          className={`text-left rounded-2xl border p-4 sm:p-5 transition-colors cursor-pointer ${
            statusFilter === 'pending'
              ? 'border-amber-500/45 bg-white dark:bg-[#0d121a]'
              : 'border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] hover:border-amber-500/30'
          }`}
        >
          <div className="text-[10px] sm:text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
            FREE TRIAL
          </div>
          <div className="mt-1.5 sm:mt-2 text-2xl sm:text-4xl font-display font-extrabold tabular-nums text-amber-500 dark:text-amber-400">
            {stats.pendingCount}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter((f) => (f === 'expired' ? 'all' : 'expired'))}
          className={`text-left rounded-2xl border p-4 sm:p-5 transition-colors cursor-pointer ${
            statusFilter === 'expired'
              ? 'border-rose-500/45 bg-white dark:bg-[#0d121a]'
              : 'border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] hover:border-rose-500/30'
          }`}
        >
          <div className="text-[10px] sm:text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
            EXPIRED
          </div>
          <div className="mt-1.5 sm:mt-2 text-2xl sm:text-4xl font-display font-extrabold tabular-nums text-rose-500 dark:text-rose-400">
            {stats.expiredCount}
          </div>
        </button>

        <div className="col-span-2 sm:col-span-1 rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-4 sm:p-5">
          <div className="text-[10px] sm:text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
            REVENUE
          </div>
          <div className="mt-1.5 sm:mt-2 text-2xl sm:text-4xl font-display font-extrabold tabular-nums text-cyan-500 dark:text-cyan-400">
            ${stats.totalRevenue.toFixed(2)}
          </div>
          <div className="mt-1 text-[10px] font-mono text-slate-400 dark:text-slate-500 tabular-nums">
            {stats.totalActiveTimes} active {stats.totalActiveTimes === 1 ? 'time' : 'times'} × ${planPrice}
          </div>
        </div>
      </div>

      {/* 3-Column User Cards Grid matching Reference Photo */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {filteredUsers.map((u) => {
          const effectiveStatus: SubscriptionStatus =
            u.subscriptionStatus === 'active' && u.daysLeft <= 0
              ? 'expired'
              : u.subscriptionStatus;
          const isEditing = editingUserId === u.id;
          const isConfirmingDelete = confirmDeleteId === u.id;
          const isBusy = busyUserId === u.id;

          const isTrialUser =
            effectiveStatus === 'pending' ||
            (effectiveStatus === 'active' && (u.paymentsCount || 0) === 0 && u.role !== 'admin');

          const badgeClasses = isTrialUser
            ? 'border-amber-500/35 bg-amber-500/10 text-amber-600 dark:text-amber-400'
            : effectiveStatus === 'active'
              ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : effectiveStatus === 'suspended'
                ? 'border-orange-500/35 bg-orange-500/10 text-orange-600 dark:text-orange-400'
                : 'border-rose-500/35 bg-rose-500/10 text-rose-600 dark:text-rose-400';

          return (
            <div
              key={u.id}
              className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-5 flex flex-col justify-between gap-4 hover:border-cyan-500/30 transition-colors"
            >
              <div className="space-y-4">
                {/* Card Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      USER #{u.userNumber} {u.role === 'admin' ? '· ADMIN' : ''}
                    </div>
                    <h3 className="text-lg font-display font-extrabold text-slate-900 dark:text-white truncate mt-0.5">
                      {u.username}
                    </h3>
                    <div className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {u.email}
                    </div>
                  </div>

                  <span
                    className={`px-2.5 py-1 rounded-md border text-[10px] font-mono font-bold uppercase tracking-wider shrink-0 ${badgeClasses}`}
                  >
                    {isTrialUser ? 'free trial' : effectiveStatus}
                  </span>
                </div>

                {/* 2x2 Stats Sub-Grid */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-xl bg-slate-50 dark:bg-[#131822] p-3">
                    <div className="text-[9px] font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      EXPIRES
                    </div>
                    <div className="text-xs font-mono text-slate-800 dark:text-slate-200 mt-1 tabular-nums">
                      {u.expiresAt ? formatHumanDate(u.expiresAt) : '—'}
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-50 dark:bg-[#131822] p-3">
                    <div className="text-[9px] font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      JOINED
                    </div>
                    <div className="text-xs font-mono text-slate-800 dark:text-slate-200 mt-1 tabular-nums">
                      {formatHumanDate(u.joinedAt)}
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-50 dark:bg-[#131822] p-3">
                    <div className="text-[9px] font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      PAYMENTS / ACTIVE TIMES
                    </div>
                    <div className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
                      {getEffectiveActiveTimes(u)}
                      {getEffectiveActiveTimes(u) > 0
                        ? ` ($${getEffectiveActiveTimes(u) * planPrice})`
                        : ''}
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-50 dark:bg-[#131822] p-3">
                    <div className="text-[9px] font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      CAMPAIGNS
                    </div>
                    <div className="text-xs font-mono font-bold text-cyan-600 dark:text-cyan-400 mt-1 tabular-nums">
                      {u.campaignsCount || 0}
                    </div>
                  </div>
                </div>

                {/* Expanded Per-User Options Influencer Panel */}
                {isEditing && (
                  <div className="rounded-xl border border-cyan-500/30 bg-slate-50 dark:bg-[#111621] p-3.5 space-y-3 text-xs font-mono">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-white/10 pb-2">
                      <span className="font-bold text-cyan-600 dark:text-cyan-400">
                        User Options &amp; Limits
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCreditPayment(u)}
                        disabled={isBusy}
                        className="min-h-[32px] px-2.5 py-1 rounded border border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 cursor-pointer"
                      >
                        +${snapshot.platformSettings.monthlyPriceUsd} Payment
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label className="block text-[10px] text-slate-500 mb-1">Status</label>
                        <select
                          value={draftStatus}
                          onChange={(e) => {
                            const next = e.target.value as SubscriptionStatus;
                            setDraftStatus(next);
                            if (next !== 'active') {
                              setDraftDays(0);
                              if (next === 'pending' || next === 'suspended') {
                                setDraftActiveTimes(0);
                              }
                            }
                            if (next === 'active' && draftDays <= 0) {
                              setDraftDays(planDays);
                              setDraftActiveTimes(Math.max(1, draftActiveTimes));
                            }
                          }}
                          className="w-full min-h-[38px] px-2.5 py-1.5 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0c1017] text-slate-900 dark:text-white"
                        >
                          <option value="active">Active</option>
                          <option value="pending">Pending</option>
                          <option value="expired">Expired</option>
                          <option value="suspended">Suspended</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] text-slate-500 mb-1">Days Left</label>
                        <input
                          type="number"
                          min={0}
                          value={draftDays}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value));
                            setDraftDays(val);
                            if (val > 0) {
                              setDraftStatus('active');
                              setDraftActiveTimes(Math.max(1, Math.ceil(val / planDays)));
                            } else {
                              setDraftActiveTimes(0);
                            }
                          }}
                          className="w-full min-h-[38px] px-2.5 py-1.5 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0c1017] text-slate-900 dark:text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] text-slate-500 mb-1">
                          Active Times
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={draftActiveTimes}
                          onChange={(e) =>
                            setDraftActiveTimes(Math.max(0, Math.round(Number(e.target.value))))
                          }
                          className="w-full min-h-[38px] px-2.5 py-1.5 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0c1017] text-emerald-600 dark:text-emerald-400 font-bold"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[10px] text-slate-500 mb-1">
                          Max Queue / Hr
                        </label>
                        <select
                          value={draftOptions.maxHourlyRate}
                          onChange={(e) =>
                            setDraftOptions((prev) => ({
                              ...prev,
                              maxHourlyRate: Number(e.target.value) as HourlyRateStep,
                            }))
                          }
                          className="w-full min-h-[38px] px-2.5 py-1.5 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0c1017] text-slate-900 dark:text-white"
                        >
                          {HOURLY_STEPS.map((s) => (
                            <option key={s} value={s}>
                              {s} / hr
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] text-slate-500 mb-1">
                          Send Limit (0=No Cap)
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={draftOptions.dailyEmailLimit}
                          onChange={(e) =>
                            setDraftOptions((prev) => ({
                              ...prev,
                              dailyEmailLimit: Math.max(0, Number(e.target.value)),
                            }))
                          }
                          className="w-full min-h-[38px] px-2.5 py-1.5 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0c1017] text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>

                    <div className="space-y-1 pt-1">
                      <label className="min-h-[34px] flex items-center justify-between gap-2 cursor-pointer">
                        <span className="text-slate-600 dark:text-slate-300">
                          Allow 10,000/sec Fast Send
                        </span>
                        <input
                          type="checkbox"
                          checked={draftOptions.allowFastBurst}
                          onChange={(e) =>
                            setDraftOptions((prev) => ({
                              ...prev,
                              allowFastBurst: e.target.checked,
                            }))
                          }
                          className="w-4 h-4 accent-cyan-500 shrink-0"
                        />
                      </label>

                      <label className="min-h-[34px] flex items-center justify-between gap-2 cursor-pointer">
                        <span className="text-slate-600 dark:text-slate-300">
                          Allow HTML Templates
                        </span>
                        <input
                          type="checkbox"
                          checked={draftOptions.allowHtml}
                          onChange={(e) =>
                            setDraftOptions((prev) => ({
                              ...prev,
                              allowHtml: e.target.checked,
                            }))
                          }
                          className="w-4 h-4 accent-cyan-500 shrink-0"
                        />
                      </label>

                      <label className="min-h-[34px] flex items-center justify-between gap-2 cursor-pointer">
                        <span className="text-slate-600 dark:text-slate-300">
                          Allow Open Tracking Pixel
                        </span>
                        <input
                          type="checkbox"
                          checked={draftOptions.allowTracking}
                          onChange={(e) =>
                            setDraftOptions((prev) => ({
                              ...prev,
                              allowTracking: e.target.checked,
                            }))
                          }
                          className="w-4 h-4 accent-cyan-500 shrink-0"
                        />
                      </label>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      <div>
                        <label className="block text-[10px] text-slate-500 mb-1">
                          {u.id === snapshot.user.id ? 'Role (Locked — Active Admin)' : 'Role'}
                        </label>
                        <select
                          value={u.id === snapshot.user.id ? 'admin' : draftRole}
                          disabled={u.id === snapshot.user.id}
                          onChange={(e) => setDraftRole(e.target.value as UserRole)}
                          className="w-full min-h-[38px] px-2.5 py-1.5 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0c1017] text-slate-900 dark:text-white disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          <option value="manager">User</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] text-slate-500 mb-1">
                          Reset Password
                        </label>
                        <input
                          type="text"
                          value={draftResetPassword}
                          onChange={(e) => setDraftResetPassword(e.target.value)}
                          placeholder="Optional..."
                          className="w-full min-h-[38px] px-2.5 py-1.5 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0c1017] text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setEditingUserId(null)}
                        className="min-h-[38px] px-3 py-1.5 rounded text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleSaveUserOptions(u)}
                        className="min-h-[38px] px-3.5 py-1.5 rounded bg-cyan-500 text-slate-950 font-bold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Save</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Card Action Buttons */}
              <div className="space-y-2.5 pt-1">
                <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleLoginAsUser(u)}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg border border-cyan-500/35 bg-cyan-500/10 text-xs font-mono font-semibold text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/20 inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Zap className="w-3 h-3 shrink-0" />
                    <span className="truncate">Login As User</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openUserOptions(u)}
                    className={`min-h-[38px] px-3 py-1.5 rounded-lg border text-xs font-mono inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      isEditing
                        ? 'border-cyan-500 bg-cyan-500/15 text-cyan-600 dark:text-cyan-300'
                        : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-600 dark:text-slate-300 hover:border-cyan-500/40'
                    }`}
                  >
                    <Sliders className="w-3 h-3 shrink-0" />
                    <span>Options</span>
                  </button>
                </div>

                <div className="grid grid-cols-3 sm:flex items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleQuickAction(u, 'activate', true)}
                    className="min-h-[38px] px-2.5 sm:px-3.5 py-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/10 text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 inline-flex items-center justify-center transition-colors cursor-pointer"
                  >
                    Activate
                  </button>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleQuickAction(u, 'suspend', false)}
                    className="min-h-[38px] px-2.5 sm:px-3.5 py-1.5 rounded-lg border border-amber-500/35 bg-amber-500/10 text-xs font-mono font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 inline-flex items-center justify-center transition-colors cursor-pointer"
                  >
                    Suspend
                  </button>

                  {isConfirmingDelete ? (
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleDeleteUser(u)}
                        className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-rose-600 text-white text-[11px] font-mono font-bold cursor-pointer"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="min-h-[38px] px-2 py-1.5 rounded-lg text-[11px] font-mono text-slate-400 hover:text-white cursor-pointer"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={isBusy || u.id === snapshot.user.id}
                      onClick={() => setConfirmDeleteId(u.id)}
                      className="min-h-[38px] px-2.5 sm:px-3.5 py-1.5 rounded-lg border border-rose-500/35 bg-rose-500/10 text-xs font-mono font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 disabled:opacity-40 inline-flex items-center justify-center transition-colors cursor-pointer"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredUsers.length === 0 && (
        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] py-16 text-center text-xs font-mono text-slate-500">
          No users match your search.
        </div>
      )}
    </div>
  );
};

interface AdminLoginViewProps {
  currentNonAdminUsername?: string | null;
  resetToken?: string | null;
  onClearResetToken?: () => void;
  onNavigateUrl?: (nextPath: string) => void;
  onAuthenticatedAdmin: (token: string, snapshot: DashboardSnapshot) => void;
  onNavigateHome: () => void;
}

export const AdminLoginView: React.FC<AdminLoginViewProps> = ({
  currentNonAdminUsername,
  resetToken,
  onClearResetToken,
  onNavigateUrl,
  onAuthenticatedAdmin,
  onNavigateHome,
}) => {
  const [mode, setMode] = useState<'signin' | 'forgot' | 'new_password'>(() =>
    resetToken ? 'new_password' : 'signin'
  );
  const [identifier, setIdentifier] = useState('');
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
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [magicLinkSentInfo, setMagicLinkSentInfo] = useState<{
    email: string;
    message: string;
    magicLink?: string;
  } | null>(null);

  useEffect(() => {
    if (!resetToken) {
      setVerifiedAccount(null);
      setMode((prev) => (prev === 'new_password' ? 'signin' : prev));
      return;
    }

    let cancelled = false;
    setMode('new_password');
    setError(null);
    setSuccessMsg(null);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (mode === 'forgot') {
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
            returnPath: '/admin',
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

    if (mode === 'new_password') {
      if (!resetToken) {
        setError('Missing magic reset link. Please request a new link.');
        return;
      }
      if (newPassword.length < 4) {
        setError('New password must be at least 4 characters.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setError('Passwords do not match.');
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
        setMode('signin');
        setSuccessMsg(res.message);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not reset password.');
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      const res = await apiRequest<{ token: string; snapshot: DashboardSnapshot }>(
        '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ identifier, password, adminPortal: true }),
        }
      );

      if (res.snapshot.user.role !== 'admin') {
        setError('Access denied: that account does not have Admin permissions.');
        return;
      }

      onAuthenticatedAdmin(res.token, res.snapshot);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid admin credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col esp-grid-bg bg-slate-50 text-slate-900 dark:bg-[#07090e] dark:text-slate-100">
      <header className="h-14 px-4 sm:px-6 lg:px-10 border-b border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#090c13] flex items-center justify-between">
        <a
          href="/"
          onClick={(e) => {
            if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
              e.preventDefault();
              onNavigateHome();
            }
          }}
          className="text-lg font-extrabold font-display tracking-tight"
        >
          <span className="text-slate-900 dark:text-white">234</span>
          <span className="text-cyan-600 dark:text-cyan-400">Mail</span>
        </a>

        <div className="flex items-center gap-2">
          <PWAInstallButton />
          <span className="px-3 py-1 rounded-full border border-rose-500/35 bg-rose-500/10 text-xs font-mono font-semibold text-rose-600 dark:text-rose-400 inline-flex items-center gap-1.5">
            <Settings className="w-3.5 h-3.5" />
            <span>/admin</span>
          </span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-white/[0.09] bg-white dark:bg-[#0c1017] p-5 sm:p-8 space-y-6 shadow-sm">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-rose-500/35 bg-rose-500/10 text-[11px] font-mono font-bold text-rose-600 dark:text-rose-400 mb-3">
              <Settings className="w-3 h-3" />
              <span>ADMIN PORTAL</span>
            </div>
            <h1 className="text-2xl font-extrabold font-display tracking-tight text-slate-900 dark:text-white">
              {mode === 'signin'
                ? 'Admin Sign In'
                : mode === 'forgot'
                  ? 'Forgot Password'
                  : 'Set New Password'}
            </h1>
            <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1">
              {mode === 'signin'
                ? 'Sign in with an administrator account to manage users, subscriptions, and options.'
                : mode === 'forgot'
                  ? 'Enter your email address or username and we will send a magic link to set a new password.'
                  : verifiedAccount
                    ? `Setting new password for ${verifiedAccount.username} (${verifiedAccount.email})`
                    : 'Verify your magic link to choose a new password.'}
            </p>
          </div>

          {currentNonAdminUsername && mode === 'signin' && (
            <div className="px-3.5 py-3 rounded-xl border border-amber-500/35 bg-amber-500/10 text-xs font-mono text-amber-700 dark:text-amber-300">
              Currently signed in as <strong>{currentNonAdminUsername}</strong> (Regular User). Sign
              in with an Admin account below to open <code>/admin</code>.
            </div>
          )}

          {successMsg && (
            <div className="px-3.5 py-3 rounded-xl border border-emerald-500/35 bg-emerald-500/10 text-xs font-mono text-emerald-700 dark:text-emerald-300">
              {successMsg}
            </div>
          )}

          {error && (
            <div className="px-3.5 py-3 rounded-xl border border-rose-500/35 bg-rose-500/10 text-xs font-mono text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          {mode === 'forgot' && magicLinkSentInfo ? (
            <div className="space-y-4">
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
                      if (onNavigateUrl && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
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

              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setMagicLinkSentInfo(null);
                  setError(null);
                }}
                className="w-full text-center text-xs font-mono text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                ← Back to Sign In
              </button>
            </div>
          ) : mode === 'new_password' ? (
            <div className="space-y-4">
              {verifyingToken ? (
                <div className="py-6 text-center text-xs font-mono text-slate-500">
                  Verifying magic link...
                </div>
              ) : verifiedAccount ? (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-mono text-slate-500 dark:text-slate-400 mb-1.5">
                      New Password
                    </label>
                    <div className="relative">
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Min 4 characters"
                        className="w-full pl-3.5 pr-11 py-2.5 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword((v) => !v)}
                        aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                        title={showNewPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
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
                    <label className="block text-xs font-mono text-slate-500 dark:text-slate-400 mb-1.5">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter new password"
                        className="w-full pl-3.5 pr-11 py-2.5 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((v) => !v)}
                        aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                        title={showConfirmPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
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
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-400 text-slate-950 font-display font-extrabold text-sm hover:opacity-95 disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? 'Saving Password...' : 'Save New Password'}
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    onClearResetToken?.();
                    setError(null);
                    setMode('forgot');
                  }}
                  className="w-full py-3 px-4 rounded-xl bg-cyan-400 text-slate-950 font-display font-extrabold text-sm hover:opacity-95 cursor-pointer"
                >
                  Request a New Magic Link
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  onClearResetToken?.();
                  setMode('signin');
                  setError(null);
                }}
                className="w-full text-center text-xs font-mono text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                ← Back to Sign In
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-slate-500 dark:text-slate-400 mb-1.5">
                  {mode === 'forgot' ? 'Email Address or Username' : 'Admin Username or Email'}
                </label>
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Enter admin username or email"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              {mode === 'signin' && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-mono text-slate-500 dark:text-slate-400">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('forgot');
                        setError(null);
                        setSuccessMsg(null);
                        setMagicLinkSentInfo(null);
                      }}
                      className="text-xs font-mono text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full pl-3.5 pr-11 py-2.5 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      title={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-400 text-slate-950 font-display font-extrabold text-sm hover:opacity-95 disabled:opacity-50 cursor-pointer"
              >
                {loading
                  ? mode === 'signin'
                    ? 'Signing in...'
                    : 'Sending Magic Link...'
                  : mode === 'signin'
                    ? 'Open Admin Dashboard'
                    : 'Send Magic Link'}
              </button>

              {mode === 'forgot' && (
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin');
                    setError(null);
                  }}
                  className="w-full text-center text-xs font-mono text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  ← Back to Sign In
                </button>
              )}
            </form>
          )}

          <div className="pt-2 border-t border-slate-100 dark:border-white/[0.07] text-center">
            <a
              href="/"
              onClick={(e) => {
                if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                  e.preventDefault();
                  onNavigateHome();
                }
              }}
              className="text-xs font-mono text-cyan-600 dark:text-cyan-400 hover:underline"
            >
              ← Return to 234Mail User Login
            </a>
          </div>
        </div>
      </main>
    </div>
  );
};
