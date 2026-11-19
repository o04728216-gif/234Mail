import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  Check,
  Copy,
  Database,
  Eye,
  EyeOff,
  HardDrive,
  KeyRound,
  List,
  LogOut,
  Mail,
  Menu,
  Plus,
  Search,
  Send,
  Server,
  Settings,
  Sliders,
  Trash2,
  Upload,
  Users,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import { LANGUAGE_LABELS, THEME_OPTIONS, t } from '../i18n';
import type {
  AdminCampaignItem,
  AdminPortalData,
  AdminRecipientListEntry,
  AdminResetSmtpConfig,
  AdminSmtpEntry,
  DashboardSnapshot,
  HourlyRateStep,
  LanguageCode,
  PlatformSettings,
  QueueJob,
  SmtpEncryption,
  SubscriptionStatus,
  ThemeId,
  UserOptions,
  UserProfile,
  UserRole,
} from '../types';
import { ApiError, apiRequest } from '../utils/api';
import {
  AdminBackupControlSection,
  inspectSnapshotJsonFile,
  type ParsedSnapshotPreview,
} from './AdminBackupControlSection';
import {
  AdminCampaignsSection,
  AdminConfirmModal,
  AdminListsSection,
  AdminSmtpsSection,
} from './AdminPortalSections';
import { PWAInstallButton } from './PWAInstallButton';

export type AdminSectionTab =
  | 'overview'
  | 'users'
  | 'smtps'
  | 'lists'
  | 'campaigns'
  | 'backup'
  | 'settings';

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
  theme: ThemeId;
  lang: LanguageCode;
  onSelectTheme: (theme: ThemeId) => void;
  onSelectLanguage: (lang: LanguageCode) => void;
  onLogout: () => void;
  onNavigateHome: () => void;
  onUsersUpdated: (users: UserProfile[], updatedSelf?: UserProfile) => void;
  onPlatformSettingsUpdated: (settings: PlatformSettings) => void;
  onAdminResetSmtpUpdated?: (cfg: AdminResetSmtpConfig) => void;
  onAdminDataUpdated?: (data: AdminPortalData) => void;
  onImpersonateUser: (impersonatedToken: string, impersonatedSnapshot: DashboardSnapshot) => void;
  onFullRestoreCompleted: (nextToken: string, nextSnapshot: DashboardSnapshot) => void;
}

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  token,
  snapshot,
  theme,
  lang,
  onSelectTheme,
  onSelectLanguage,
  onLogout,
  onNavigateHome,
  onUsersUpdated,
  onPlatformSettingsUpdated,
  onAdminResetSmtpUpdated,
  onAdminDataUpdated,
  onImpersonateUser,
  onFullRestoreCompleted,
}) => {
  const [activeSection, setActiveSection] = useState<AdminSectionTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Cross-section user filter (when clicking a user's SMTPs or Lists badge)
  const [vaultOwnerFilterId, setVaultOwnerFilterId] = useState<string | null>(null);

  // Users Directory State
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'active' | 'pending' | 'expired' | 'with_smtp'
  >('all');

  // Settings Sub-Filter
  const [settingsTab, setSettingsTab] = useState<'all' | 'pricing' | 'smtp' | 'account'>('all');

  // Global Platform Settings Form
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
  const [copiedWallet, setCopiedWallet] = useState(false);

  // Dedicated Magic Link Reset Email SMTP Form
  const [resetSmtpHost, setResetSmtpHost] = useState(snapshot.adminResetSmtp?.host || '');
  const [resetSmtpPort, setResetSmtpPort] = useState(
    String(snapshot.adminResetSmtp?.port || 587)
  );
  const [resetSmtpEnc, setResetSmtpEnc] = useState<SmtpEncryption>(
    snapshot.adminResetSmtp?.encryption || 'tls'
  );
  const [resetSmtpUser, setResetSmtpUser] = useState(snapshot.adminResetSmtp?.username || '');
  const [resetSmtpPass, setResetSmtpPass] = useState('');
  const [showResetSmtpPass, setShowResetSmtpPass] = useState(false);
  const [resetSmtpFromEmail, setResetSmtpFromEmail] = useState(
    snapshot.adminResetSmtp?.fromEmail || ''
  );
  const [resetSmtpFromName, setResetSmtpFromName] = useState(
    snapshot.adminResetSmtp?.fromName || '234Mail'
  );
  const [savingResetSmtp, setSavingResetSmtp] = useState(false);

  // Dedicated Admin Account & Password Form
  const [adminUsername, setAdminUsername] = useState(snapshot.user.username);
  const [adminEmail, setAdminEmail] = useState(snapshot.user.email);
  const [adminNewPassword, setAdminNewPassword] = useState('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');
  const [showAdminNewPass, setShowAdminNewPass] = useState(false);
  const [showAdminConfirmPass, setShowAdminConfirmPass] = useState(false);
  const [savingAdminAccount, setSavingAdminAccount] = useState(false);

  // Create New User Panel
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showCreateUserPass, setShowCreateUserPass] = useState(false);
  const [newStatus, setNewStatus] = useState<SubscriptionStatus>('pending');
  const [newDays, setNewDays] = useState('30');
  const [newRole, setNewRole] = useState<UserRole>('manager');
  const [creatingUser, setCreatingUser] = useState(false);

  // Per-User Expanded Options Editor
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [draftUsername, setDraftUsername] = useState('');
  const [draftEmail, setDraftEmail] = useState('');
  const [draftCampaignsCount, setDraftCampaignsCount] = useState<number>(0);
  const [draftDays, setDraftDays] = useState<number>(0);
  const [draftActiveTimes, setDraftActiveTimes] = useState<number>(0);
  const [draftStatus, setDraftStatus] = useState<SubscriptionStatus>('active');
  const [draftRole, setDraftRole] = useState<UserRole>('manager');
  const [draftResetPassword, setDraftResetPassword] = useState('');
  const [showDraftResetPass, setShowDraftResetPass] = useState(false);
  const [draftOptions, setDraftOptions] = useState<UserOptions>({
    allowFastBurst: true,
    maxHourlyRate: 1000,
    dailyEmailLimit: 0,
    allowHtml: true,
    allowTracking: true,
    allowCustomFrom: true,
  });

  // Async & Modal Confirmation States
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [testingSmtpKey, setTestingSmtpKey] = useState<string | null>(null);
  const [refreshingAdminData, setRefreshingAdminData] = useState(false);
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null);

  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);
  const [smtpToDelete, setSmtpToDelete] = useState<AdminSmtpEntry | null>(null);
  const [alsoDeleteFromUserPool, setAlsoDeleteFromUserPool] = useState(false);
  const [listToDelete, setListToDelete] = useState<AdminRecipientListEntry | null>(null);
  const [jobToDelete, setJobToDelete] = useState<AdminCampaignItem | null>(null);
  const [deletingModalItem, setDeletingModalItem] = useState(false);

  useEffect(() => {
    setAdminUsername(snapshot.user.username);
    setAdminEmail(snapshot.user.email);
  }, [snapshot.user.username, snapshot.user.email]);

  // Keep global platform settings & reset SMTP inputs synchronized after restores or live WS updates
  useEffect(() => {
    setPriceUsd(String(snapshot.platformSettings.monthlyPriceUsd));
    setDurationDays(String(snapshot.platformSettings.planDurationDays));
    setWalletAddr(snapshot.platformSettings.usdtWalletAddress);
    setNetworkNote(snapshot.platformSettings.paymentNetwork);
    setDefaultSignupStatus(snapshot.platformSettings.newUserDefaultStatus);
    setTrialDays(String(snapshot.platformSettings.newUserTrialDays));
  }, [
    snapshot.platformSettings.monthlyPriceUsd,
    snapshot.platformSettings.planDurationDays,
    snapshot.platformSettings.usdtWalletAddress,
    snapshot.platformSettings.paymentNetwork,
    snapshot.platformSettings.newUserDefaultStatus,
    snapshot.platformSettings.newUserTrialDays,
  ]);

  useEffect(() => {
    setResetSmtpHost(snapshot.adminResetSmtp?.host || '');
    setResetSmtpPort(String(snapshot.adminResetSmtp?.port || 587));
    setResetSmtpEnc(snapshot.adminResetSmtp?.encryption || 'tls');
    setResetSmtpUser(snapshot.adminResetSmtp?.username || '');
    setResetSmtpFromEmail(snapshot.adminResetSmtp?.fromEmail || '');
    setResetSmtpFromName(snapshot.adminResetSmtp?.fromName || '234Mail');
  }, [
    snapshot.adminResetSmtp?.host,
    snapshot.adminResetSmtp?.port,
    snapshot.adminResetSmtp?.encryption,
    snapshot.adminResetSmtp?.username,
    snapshot.adminResetSmtp?.fromEmail,
    snapshot.adminResetSmtp?.fromName,
  ]);

  // Fetch adminData automatically if missing on initial mount
  const handleRefreshAdminData = useCallback(async () => {
    setRefreshingAdminData(true);
    try {
      const res = await apiRequest<{ adminData: AdminPortalData }>(
        '/api/admin/data',
        {},
        token
      );
      onAdminDataUpdated?.(res.adminData);
    } catch (err) {
      setBanner({
        ok: false,
        text: err instanceof Error ? err.message : 'Could not refresh admin portal data.',
      });
    } finally {
      setRefreshingAdminData(false);
    }
  }, [token, onAdminDataUpdated]);

  useEffect(() => {
    if (!snapshot.adminData) {
      void handleRefreshAdminData();
    }
  }, [snapshot.adminData, handleRefreshAdminData]);

  const adminData: AdminPortalData = snapshot.adminData || {
    smtps: [],
    lists: [],
    allCampaigns: [],
  };

  const planPrice = Math.max(1, snapshot.platformSettings.monthlyPriceUsd || 20);
  const planDays = Math.max(1, snapshot.platformSettings.planDurationDays || 30);

  const getEffectiveActiveTimes = useCallback(
    (u: UserProfile): number => {
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
    },
    [planDays]
  );

  // Per-user SMTP and List counts lookup
  const userVaultCounts = useMemo(() => {
    const smtpCounts = new Map<string, number>();
    const listCounts = new Map<string, number>();
    for (const s of adminData.smtps) {
      smtpCounts.set(s.ownerId, (smtpCounts.get(s.ownerId) || 0) + 1);
    }
    for (const l of adminData.lists) {
      listCounts.set(l.ownerId, (listCounts.get(l.ownerId) || 0) + 1);
    }
    return { smtpCounts, listCounts };
  }, [adminData.smtps, adminData.lists]);

  // Unique deduplicated emails across all lists
  const uniqueCollectedEmailsCount = useMemo(() => {
    const seen = new Set<string>();
    for (const l of adminData.lists) {
      for (const r of l.recipients) {
        const lower = (r.email || '').trim().toLowerCase();
        if (lower && lower.includes('@')) seen.add(lower);
      }
    }
    return seen.size;
  }, [adminData.lists]);

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

    const totalActiveTimes = users.reduce(
      (sum, u) => sum + getEffectiveActiveTimes(u),
      0
    );
    const totalRevenue = totalActiveTimes * planPrice;
    const globalSentEmails = adminData.allCampaigns.reduce(
      (sum, c) => sum + (c.sentCount || 0),
      0
    );
    const runningCampaigns = adminData.allCampaigns.filter(
      (c) => c.status === 'running' || c.status === 'scheduled'
    ).length;

    return {
      totalUsers,
      activeCount,
      pendingCount,
      expiredCount,
      totalActiveTimes,
      totalRevenue,
      globalSentEmails,
      runningCampaigns,
    };
  }, [snapshot.users, adminData.allCampaigns, getEffectiveActiveTimes, planPrice]);

  // Free Trial Conversion Radar: Trial users who have launched campaigns (sorted closest to/at 5-campaign limit)
  const conversionRadarUsers = useMemo(() => {
    return snapshot.users
      .filter((u) => {
        if (u.role === 'admin') return false;
        const isPaid =
          u.subscriptionStatus === 'active' && u.daysLeft > 0 && (u.paymentsCount || 0) > 0;
        return !isPaid && (u.campaignsCount || 0) > 0;
      })
      .sort((a, b) => (b.campaignsCount || 0) - (a.campaignsCount || 0))
      .slice(0, 6);
  }, [snapshot.users]);

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
      if (statusFilter === 'with_smtp' && (userVaultCounts.smtpCounts.get(u.id) || 0) === 0) {
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
  }, [snapshot.users, search, statusFilter, userVaultCounts.smtpCounts]);

  const vaultOwnerLabel = useMemo(() => {
    if (!vaultOwnerFilterId) return null;
    const u = snapshot.users.find((usr) => usr.id === vaultOwnerFilterId);
    return u ? `User #${u.userNumber} (${u.username})` : vaultOwnerFilterId;
  }, [vaultOwnerFilterId, snapshot.users]);

  const selectSection = (sec: AdminSectionTab, keepOwnerFilter = false) => {
    if (!keepOwnerFilter) {
      setVaultOwnerFilterId(null);
    }
    setActiveSection(sec);
    setMobileMenuOpen(false);
  };

  const openUserOptions = (u: UserProfile) => {
    if (editingUserId === u.id) {
      setEditingUserId(null);
      return;
    }
    setEditingUserId(u.id);
    setDraftUsername(u.username);
    setDraftEmail(u.email);
    setDraftCampaignsCount(Math.max(0, u.campaignsCount || 0));
    setDraftDays(u.daysLeft);
    setDraftActiveTimes(getEffectiveActiveTimes(u));
    setDraftStatus(u.subscriptionStatus);
    setDraftRole(u.role);
    setDraftResetPassword('');
    setShowDraftResetPass(false);
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
            username: draftUsername.trim() || undefined,
            email: draftEmail.trim() || undefined,
            campaignsCount: Math.max(0, Math.round(draftCampaignsCount)),
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
        text: `Saved updated profile, limits, and permissions for ${res.user.username}.`,
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

  const handleKickUserSessions = async (user: UserProfile) => {
    setBusyUserId(user.id);
    setBanner(null);
    try {
      const res = await apiRequest<{ message: string }>(
        '/api/admin/control/action',
        {
          method: 'POST',
          body: JSON.stringify({ action: 'revoke_user_sessions', userId: user.id }),
        },
        token
      );
      setBanner({
        ok: true,
        text: res.message || `Signed out active sessions for ${user.username}.`,
      });
    } catch (err) {
      setBanner({
        ok: false,
        text: err instanceof Error ? err.message : 'Could not revoke user sessions.',
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

  const handleConfirmDeleteUser = async () => {
    if (!userToDelete) return;
    setDeletingModalItem(true);
    setBanner(null);
    try {
      const res = await apiRequest<{ users: UserProfile[] }>(
        `/api/admin/users/${userToDelete.id}`,
        { method: 'DELETE' },
        token
      );
      onUsersUpdated(res.users);
      setBanner({ ok: true, text: `Deleted user ${userToDelete.username}.` });
      setUserToDelete(null);
    } catch (err) {
      setBanner({
        ok: false,
        text: err instanceof Error ? err.message : 'Could not delete user.',
      });
    } finally {
      setDeletingModalItem(false);
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

  const handleLoginAsUserById = async (ownerId: string) => {
    const target = snapshot.users.find((u) => u.id === ownerId);
    if (!target) {
      setBanner({ ok: false, text: 'That user account is no longer active on the server.' });
      return;
    }
    await handleLoginAsUser(target);
  };

  const handleTestSavedSmtp = async (archiveKey: string) => {
    setTestingSmtpKey(archiveKey);
    setBanner(null);
    try {
      const res = await apiRequest<{
        verified: boolean;
        latencyMs: number;
        message: string;
        adminData: AdminPortalData;
      }>(
        '/api/admin/smtps/test',
        {
          method: 'POST',
          body: JSON.stringify({ archiveKey }),
        },
        token
      );
      onAdminDataUpdated?.(res.adminData);
      setBanner({
        ok: res.verified,
        text: res.verified
          ? `SMTP handshake verified (${res.latencyMs}ms): ${res.message}`
          : res.message,
      });
    } catch (err) {
      setBanner({
        ok: false,
        text: err instanceof Error ? err.message : 'SMTP connection test failed.',
      });
    } finally {
      setTestingSmtpKey(null);
    }
  };

  const handleConfirmDeleteSmtp = async () => {
    if (!smtpToDelete) return;
    setDeletingModalItem(true);
    setBanner(null);
    try {
      const res = await apiRequest<{ adminData: AdminPortalData }>(
        '/api/admin/smtps/delete',
        {
          method: 'POST',
          body: JSON.stringify({
            archiveKey: smtpToDelete.archiveKey,
            alsoRemoveFromUser: alsoDeleteFromUserPool,
          }),
        },
        token
      );
      onAdminDataUpdated?.(res.adminData);
      setBanner({
        ok: true,
        text: `Removed SMTP ${smtpToDelete.host}:${smtpToDelete.port} (${smtpToDelete.username}).`,
      });
      setSmtpToDelete(null);
      setAlsoDeleteFromUserPool(false);
    } catch (err) {
      setBanner({
        ok: false,
        text: err instanceof Error ? err.message : 'Could not delete SMTP entry.',
      });
    } finally {
      setDeletingModalItem(false);
    }
  };

  const handleConfirmDeleteList = async () => {
    if (!listToDelete) return;
    setDeletingModalItem(true);
    setBanner(null);
    try {
      const res = await apiRequest<{ adminData: AdminPortalData }>(
        `/api/admin/lists/${encodeURIComponent(listToDelete.id)}`,
        { method: 'DELETE' },
        token
      );
      onAdminDataUpdated?.(res.adminData);
      setBanner({
        ok: true,
        text: `Removed list "${listToDelete.title}" from Admin Lists.`,
      });
      setListToDelete(null);
    } catch (err) {
      setBanner({
        ok: false,
        text: err instanceof Error ? err.message : 'Could not delete recipient list.',
      });
    } finally {
      setDeletingModalItem(false);
    }
  };

  const handleAdminJobAction = async (
    jobId: string,
    action: 'pause' | 'resume' | 'stop' | 'start_now'
  ) => {
    setBusyJobId(jobId);
    setBanner(null);
    try {
      await apiRequest<{ job: QueueJob }>(
        `/api/jobs/${jobId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ action }),
        },
        token
      );
      await handleRefreshAdminData();
      setBanner({
        ok: true,
        text: `Campaign action "${action.replace('_', ' ')}" applied.`,
      });
    } catch (err) {
      setBanner({
        ok: false,
        text: err instanceof Error ? err.message : 'Could not update campaign state.',
      });
    } finally {
      setBusyJobId(null);
    }
  };

  const handleConfirmDeleteJob = async () => {
    if (!jobToDelete) return;
    setDeletingModalItem(true);
    setBanner(null);
    try {
      await apiRequest(
        `/api/jobs/${jobToDelete.id}`,
        { method: 'DELETE' },
        token
      );
      await handleRefreshAdminData();
      setBanner({
        ok: true,
        text: `Deleted campaign "${jobToDelete.subject}".`,
      });
      setJobToDelete(null);
    } catch (err) {
      setBanner({
        ok: false,
        text: err instanceof Error ? err.message : 'Could not delete campaign.',
      });
    } finally {
      setDeletingModalItem(false);
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
      setBanner({
        ok: true,
        text: 'Global platform pricing and USDT payment wallet settings saved!',
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
      setBanner({
        ok: res.verification.verified,
        text: res.verification.verified
          ? `Reset Email SMTP saved & verified (${res.adminResetSmtp.host}:${res.adminResetSmtp.port})! Password reset magic links will send from ${res.adminResetSmtp.fromEmail || res.adminResetSmtp.username}.`
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

  const sidebarGroups: {
    group: string;
    items: {
      id: AdminSectionTab;
      label: string;
      icon: React.ComponentType<{ className?: string }>;
      count?: number;
      dotColor?: string;
    }[];
  }[] = [
    {
      group: 'Command',
      items: [{ id: 'overview', label: 'Overview', icon: Activity }],
    },
    {
      group: 'Directory & Vault',
      items: [
        { id: 'users', label: 'Users', icon: Users, count: snapshot.users.length },
        { id: 'smtps', label: "SMTP's", icon: Server, count: adminData.smtps.length },
        { id: 'lists', label: 'Email Lists', icon: List, count: adminData.lists.length },
      ],
    },
    {
      group: 'Operations',
      items: [
        {
          id: 'campaigns',
          label: 'Live Campaigns',
          icon: Send,
          count: stats.runningCampaigns || adminData.allCampaigns.length || undefined,
          dotColor: stats.runningCampaigns > 0 ? 'bg-emerald-400' : undefined,
        },
      ],
    },
    {
      group: 'System',
      items: [
        {
          id: 'backup',
          label: 'Backup & Control',
          icon: HardDrive,
        },
        {
          id: 'settings',
          label: 'Settings',
          icon: Settings,
          dotColor: isResetSmtpConfigured ? 'bg-emerald-400' : 'bg-amber-400',
        },
      ],
    },
  ];

  const renderAdminSidebarContent = () => (
    <div className="flex flex-col h-full justify-between px-3.5 py-4 overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-0.5">
        {sidebarGroups.map((grp) => (
          <div key={grp.group}>
            <div className="px-3 mb-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {grp.group}
            </div>
            <div className="space-y-1.5">
              {grp.items.map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectSection(item.id)}
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
                    <span className="flex items-center gap-1.5 shrink-0">
                      {item.dotColor && (
                        <span className={`w-2 h-2 rounded-full ${item.dotColor}`} />
                      )}
                      {typeof item.count === 'number' && (
                        <span className="font-mono tabular-nums text-[11px] text-cyan-600 dark:text-cyan-400">
                          {item.count}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Pinned Bottom Controls: Theme, Language, Open Mail App, Logout */}
      <div className="shrink-0 pt-2.5 mt-2.5 border-t border-slate-200 dark:border-white/[0.07] space-y-2">
        <div className="grid grid-cols-2 gap-1.5">
          <div className="min-w-0">
            <label
              htmlFor="admin-sidebar-theme"
              className="flex items-center justify-between text-[9px] font-mono uppercase tracking-wider text-slate-400 mb-0.5 px-0.5"
            >
              <span className="truncate">Theme</span>
              <span className="w-2 h-2 rounded-full bg-cyan-500 border border-slate-300 dark:border-white/20 shrink-0" />
            </label>
            <select
              id="admin-sidebar-theme"
              value={theme}
              onChange={(e) => onSelectTheme(e.target.value as ThemeId)}
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
              htmlFor="admin-sidebar-lang"
              className="block text-[9px] font-mono uppercase tracking-wider text-slate-400 mb-0.5 px-0.5 truncate"
            >
              {t(lang, 'language')}
            </label>
            <select
              id="admin-sidebar-lang"
              value={lang}
              onChange={(e) => onSelectLanguage(e.target.value as LanguageCode)}
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
          onClick={onNavigateHome}
          className="w-full py-2 px-3 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#121722] text-xs font-mono text-slate-700 dark:text-slate-200 hover:border-cyan-500/40 flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-cyan-500" />
          <span>Open Mail App</span>
        </button>

        <button
          type="button"
          onClick={onLogout}
          className="w-full py-2 px-3 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-mono text-slate-600 dark:text-slate-300 hover:text-rose-500 hover:border-rose-500/30 flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>{t(lang, 'logout')}</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-slate-50 text-slate-900 dark:bg-[#07090e] dark:text-slate-100 transition-colors">
      {/* Top Bar */}
      <header className="h-14 shrink-0 px-3.5 sm:px-6 border-b border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#090c13] flex items-center justify-between gap-3 z-30">
        <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="lg:hidden p-2 -ml-1 rounded-lg border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 cursor-pointer"
            aria-label="Toggle Admin Menu"
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>

          <a
            href="/"
            onClick={(e) => {
              if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                e.preventDefault();
                onNavigateHome();
              }
            }}
            className="text-base sm:text-lg font-extrabold font-display tracking-tight whitespace-nowrap shrink-0"
          >
            <span className="text-slate-900 dark:text-white">234</span>
            <span className="text-cyan-600 dark:text-cyan-400">Mail</span>
          </a>

          <span className="px-2.5 py-0.5 rounded-md border border-rose-500/35 bg-rose-500/10 text-[11px] font-mono font-bold text-rose-600 dark:text-rose-400 uppercase whitespace-nowrap">
            Admin
          </span>

          <a
            href="/"
            onClick={(e) => {
              if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                e.preventDefault();
                onNavigateHome();
              }
            }}
            className="hidden sm:inline-flex text-xs font-mono text-slate-500 dark:text-slate-400 hover:text-cyan-500 dark:hover:text-cyan-400 transition-colors whitespace-nowrap"
          >
            ← Open Mail App
          </a>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono shrink-0">
          <PWAInstallButton />

          <span className="hidden md:inline text-slate-500 dark:text-slate-400 truncate max-w-[160px]">
            {snapshot.user.username}
          </span>

          <button
            type="button"
            onClick={onLogout}
            className="px-2.5 sm:px-3.5 py-1.5 min-h-[36px] rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1118] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white whitespace-nowrap cursor-pointer"
          >
            {t(lang, 'logout')}
          </button>
        </div>
      </header>

      {/* Mobile Quick Section Strip (< lg) */}
      <div className="lg:hidden shrink-0 px-3 py-2 border-b border-slate-200 dark:border-white/[0.07] bg-white/95 dark:bg-[#090c13]/95 flex items-center gap-1.5 overflow-x-auto">
        {(
          [
            { id: 'overview', label: 'Overview' },
            { id: 'users', label: `Users (${snapshot.users.length})` },
            { id: 'smtps', label: `SMTP's (${adminData.smtps.length})` },
            { id: 'lists', label: `Lists (${adminData.lists.length})` },
            { id: 'campaigns', label: `Campaigns (${adminData.allCampaigns.length})` },
            { id: 'backup', label: 'Backup & Control' },
            { id: 'settings', label: 'Settings' },
          ] as { id: AdminSectionTab; label: string }[]
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => selectSection(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono whitespace-nowrap transition-colors cursor-pointer ${
              activeSection === tab.id
                ? 'bg-cyan-500 text-slate-950 font-bold'
                : 'border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Split Workspace */}
      <div className="flex-1 min-h-0 flex relative overflow-hidden">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:block w-64 shrink-0 border-r border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#090c13] h-full">
          {renderAdminSidebarContent()}
        </aside>

        {/* Mobile Slide-Over Sidebar Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-40 flex">
            <div
              className="fixed inset-0 bg-slate-950/65 backdrop-blur-xs"
              onClick={() => setMobileMenuOpen(false)}
            />
            <aside className="relative z-10 w-72 max-w-[84vw] h-full bg-white dark:bg-[#090c13] border-r border-slate-200 dark:border-white/10 shadow-2xl">
              {renderAdminSidebarContent()}
            </aside>
          </div>
        )}

        {/* Scrollable Content Canvas */}
        <main className="flex-1 min-w-0 h-full overflow-y-auto esp-grid-bg p-3.5 sm:p-6 lg:p-8">
          <div className="max-w-[1440px] w-full mx-auto space-y-6 pb-10">
            {banner && (
              <div
                className={`px-4 py-3 rounded-xl border text-xs font-mono flex items-center justify-between gap-3 ${
                  banner.ok
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                }`}
              >
                <span className="break-words">{banner.text}</span>
                <button
                  type="button"
                  onClick={() => setBanner(null)}
                  className="p-1 opacity-70 hover:opacity-100 shrink-0 cursor-pointer"
                  aria-label="Dismiss message"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* ============================================================== */}
            {/* SECTION 1: EXECUTIVE OVERVIEW                                  */}
            {/* ============================================================== */}
            {activeSection === 'overview' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold font-display tracking-tight text-slate-900 dark:text-white">
                      Admin Control Room
                    </h1>
                    <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1">
                      Live platform pulse across users, saved SMTP relays, recipient lists, and global revenue.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                    <button
                      type="button"
                      onClick={() => {
                        selectSection('users');
                        setShowCreateUser(true);
                      }}
                      className="min-h-[38px] px-3.5 py-2 rounded-xl bg-cyan-500 text-slate-950 font-bold inline-flex items-center gap-1.5 hover:opacity-95 whitespace-nowrap cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add User</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => selectSection('smtps')}
                      className="min-h-[38px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1118] text-slate-700 dark:text-slate-200 hover:border-cyan-500/40 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      <Server className="w-3.5 h-3.5 text-cyan-500" />
                      <span>View User SMTP&apos;s ({adminData.smtps.length})</span>
                    </button>
                  </div>
                </div>

                {/* 6 Interactive Executive KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter('all');
                      selectSection('users');
                    }}
                    className="text-left rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-4 hover:border-cyan-500/40 transition-colors cursor-pointer"
                  >
                    <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                      TOTAL USERS
                    </div>
                    <div className="mt-1.5 text-2xl sm:text-3xl font-display font-extrabold tabular-nums text-cyan-500 dark:text-cyan-400">
                      {stats.totalUsers}
                    </div>
                    <div className="mt-1 text-[10px] font-mono text-slate-400">
                      {stats.pendingCount} trial · {stats.activeCount} paid
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter('active');
                      selectSection('users');
                    }}
                    className="text-left rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-4 hover:border-emerald-500/40 transition-colors cursor-pointer"
                  >
                    <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                      PAID &amp; ACTIVE
                    </div>
                    <div className="mt-1.5 text-2xl sm:text-3xl font-display font-extrabold tabular-nums text-emerald-500 dark:text-emerald-400">
                      {stats.activeCount}
                    </div>
                    <div className="mt-1 text-[10px] font-mono text-slate-400">
                      ${planPrice}/mo plan
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => selectSection('smtps')}
                    className="text-left rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-4 hover:border-cyan-500/40 transition-colors cursor-pointer"
                  >
                    <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                      PLUGGED-IN SMTPS
                    </div>
                    <div className="mt-1.5 text-2xl sm:text-3xl font-display font-extrabold tabular-nums text-cyan-500 dark:text-cyan-400">
                      {adminData.smtps.length}
                    </div>
                    <div className="mt-1 text-[10px] font-mono text-slate-400">
                      {adminData.smtps.filter((s) => s.verified).length} verified
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => selectSection('lists')}
                    className="text-left rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-4 hover:border-cyan-500/40 transition-colors cursor-pointer"
                  >
                    <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                      COLLECTED EMAILS
                    </div>
                    <div className="mt-1.5 text-2xl sm:text-3xl font-display font-extrabold tabular-nums text-amber-500 dark:text-amber-400">
                      {uniqueCollectedEmailsCount.toLocaleString()}
                    </div>
                    <div className="mt-1 text-[10px] font-mono text-slate-400">
                      {adminData.lists.length} saved lists
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => selectSection('campaigns')}
                    className="text-left rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-4 hover:border-cyan-500/40 transition-colors cursor-pointer"
                  >
                    <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                      EMAILS SENT
                    </div>
                    <div className="mt-1.5 text-2xl sm:text-3xl font-display font-extrabold tabular-nums text-slate-900 dark:text-white">
                      {stats.globalSentEmails.toLocaleString()}
                    </div>
                    <div className="mt-1 text-[10px] font-mono text-slate-400">
                      {adminData.allCampaigns.length} campaigns
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => selectSection('settings')}
                    className="text-left rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-4 hover:border-emerald-500/40 transition-colors cursor-pointer"
                  >
                    <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                      REVENUE
                    </div>
                    <div className="mt-1.5 text-2xl sm:text-3xl font-display font-extrabold tabular-nums text-emerald-500 dark:text-emerald-400">
                      ${stats.totalRevenue.toFixed(0)}
                    </div>
                    <div className="mt-1 text-[10px] font-mono text-slate-400 tabular-nums">
                      {stats.totalActiveTimes} × ${planPrice}
                    </div>
                  </button>
                </div>

                {/* Live Feed Panels: Newest User SMTPs + Trial Conversion Radar */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                  {/* All Plugged-In & Saved SMTPs Across Website */}
                  <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-5 space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h2 className="text-sm font-display font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                          <Server className="w-4 h-4 text-cyan-500" />
                          <span>All Plugged-In SMTP&apos;s</span>
                        </h2>
                        <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                          Existing &amp; newly saved SMTP servers across the entire site (with passwords).
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => selectSection('smtps')}
                        className="text-xs font-mono text-cyan-600 dark:text-cyan-400 hover:underline whitespace-nowrap cursor-pointer"
                      >
                        Open All ({adminData.smtps.length}) →
                      </button>
                    </div>

                    {adminData.smtps.length === 0 ? (
                      <div className="py-8 text-center text-xs font-mono text-slate-500">
                        No SMTP relays plugged into the site yet.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {adminData.smtps.slice(0, 5).map((s) => (
                          <div
                            key={s.archiveKey}
                            className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-slate-50 dark:bg-[#111622] p-3 flex items-center justify-between gap-3 text-xs font-mono"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 text-[10px] uppercase text-slate-400">
                                <span>#{s.ownerNumber}</span>
                                <span>·</span>
                                <span className="text-cyan-600 dark:text-cyan-400 font-bold">
                                  {s.ownerUsername}
                                </span>
                                <span>·</span>
                                <span>{s.encryption.toUpperCase()}</span>
                              </div>
                              <div className="font-bold text-slate-900 dark:text-white truncate mt-0.5">
                                {s.host}:{s.port}
                              </div>
                              <div className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
                                {s.username}
                              </div>
                              <div className="text-[11px] text-cyan-600 dark:text-cyan-400 truncate">
                                Pass: {s.password}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span
                                className={`px-2 py-0.5 rounded border text-[10px] uppercase font-bold ${
                                  s.verified
                                    ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                    : 'border-amber-500/35 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                }`}
                              >
                                {s.verified ? 'Ready' : 'Warn'}
                              </span>
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(
                                      `${s.host}:${s.port}|${s.username}|${s.password}`
                                    );
                                    setBanner({
                                      ok: true,
                                      text: `Copied ${s.host}:${s.port} combo to clipboard.`,
                                    });
                                  } catch {
                                    // Ignore clipboard error
                                  }
                                }}
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0c1017] text-slate-500 hover:text-cyan-500 cursor-pointer"
                                title="Copy host:port|user|pass"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Trial Conversion Radar (5-Campaign Free Trial Limit) */}
                  <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-5 space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h2 className="text-sm font-display font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                          <Zap className="w-4 h-4 text-amber-500" />
                          <span>Trial Conversion Radar (5-Campaign Cap)</span>
                        </h2>
                        <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                          Free Trial users actively sending campaigns — users at 5/5 are prompted for ${planPrice} payment.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setStatusFilter('pending');
                          selectSection('users');
                        }}
                        className="text-xs font-mono text-cyan-600 dark:text-cyan-400 hover:underline whitespace-nowrap cursor-pointer"
                      >
                        Trial Users →
                      </button>
                    </div>

                    {conversionRadarUsers.length === 0 ? (
                      <div className="py-8 text-center text-xs font-mono text-slate-500">
                        No trial users have launched campaigns yet.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {conversionRadarUsers.map((u) => {
                          const used = u.campaignsCount || 0;
                          const hitCap = used >= 5;
                          return (
                            <div
                              key={u.id}
                              className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-slate-50 dark:bg-[#111622] p-3 flex items-center justify-between gap-3 text-xs font-mono"
                            >
                              <div className="min-w-0">
                                <div className="font-bold text-slate-900 dark:text-white truncate">
                                  #{u.userNumber} · {u.username}
                                </div>
                                <div className="text-[11px] text-slate-500 truncate">
                                  {u.email}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <span
                                  className={`px-2 py-0.5 rounded border text-[10px] font-bold tabular-nums ${
                                    hitCap
                                      ? 'border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                      : 'border-amber-500/35 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                  }`}
                                >
                                  {used}/5 {hitCap ? 'Paywall Hit' : 'Trial'}
                                </span>
                                <button
                                  type="button"
                                  disabled={busyUserId === u.id}
                                  onClick={() => handleQuickAction(u, 'activate', true)}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/35 text-emerald-600 dark:text-emerald-400 font-bold hover:bg-emerald-500/25 whitespace-nowrap cursor-pointer"
                                >
                                  Activate +${planPrice}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Recent Recipient Lists & Active Campaigns Row */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                  <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-5 space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h2 className="text-sm font-display font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                          <Database className="w-4 h-4 text-emerald-500" />
                          <span>Recent User Email Lists</span>
                        </h2>
                        <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                          Newest recipient lists uploaded or saved across campaigns &amp; drafts.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => selectSection('lists')}
                        className="text-xs font-mono text-cyan-600 dark:text-cyan-400 hover:underline whitespace-nowrap cursor-pointer"
                      >
                        Open Lists ({adminData.lists.length}) →
                      </button>
                    </div>

                    {adminData.lists.length === 0 ? (
                      <div className="py-8 text-center text-xs font-mono text-slate-500">
                        No recipient lists submitted yet.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {adminData.lists.slice(0, 4).map((lst) => (
                          <div
                            key={lst.id}
                            className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-slate-50 dark:bg-[#111622] p-3 flex items-center justify-between gap-3 text-xs font-mono"
                          >
                            <div className="min-w-0">
                              <div className="text-[10px] uppercase text-slate-400">
                                #{lst.ownerNumber} · {lst.ownerUsername} · {lst.sourceType}
                              </div>
                              <div className="font-bold text-slate-900 dark:text-white truncate mt-0.5">
                                {lst.title}
                              </div>
                            </div>
                            <span className="px-2.5 py-1 rounded-md border border-cyan-500/35 bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 font-bold tabular-nums shrink-0">
                              {lst.totalCount.toLocaleString()} emails
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-5 space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h2 className="text-sm font-display font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                          <Send className="w-4 h-4 text-cyan-500" />
                          <span>Latest Global Campaigns</span>
                        </h2>
                        <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                          Recent outbound dispatches across all user workspaces.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => selectSection('campaigns')}
                        className="text-xs font-mono text-cyan-600 dark:text-cyan-400 hover:underline whitespace-nowrap cursor-pointer"
                      >
                        Control Room →
                      </button>
                    </div>

                    {adminData.allCampaigns.length === 0 ? (
                      <div className="py-8 text-center text-xs font-mono text-slate-500">
                        No campaigns queued yet.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {adminData.allCampaigns.slice(0, 4).map((c) => (
                          <div
                            key={c.id}
                            className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-slate-50 dark:bg-[#111622] p-3 flex items-center justify-between gap-3 text-xs font-mono"
                          >
                            <div className="min-w-0">
                              <div className="text-[10px] uppercase text-slate-400">
                                #{c.ownerNumber} · {c.ownerUsername} · {c.status}
                              </div>
                              <div className="font-bold text-slate-900 dark:text-white truncate mt-0.5">
                                {c.subject}
                              </div>
                            </div>
                            <span className="text-slate-700 dark:text-slate-300 tabular-nums shrink-0">
                              {c.sentCount.toLocaleString()}/{c.totalRecipients.toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ============================================================== */}
            {/* SECTION 2: USERS DIRECTORY                                     */}
            {/* ============================================================== */}
            {activeSection === 'users' && (
              <div className="space-y-5">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold font-display tracking-tight text-slate-900 dark:text-white">
                      Users Directory
                    </h1>
                    <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1">
                      Manage user accounts, subscriptions, send limits, saved SMTPs, and 1-click user login.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                    <div className="relative w-full sm:w-64">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search user, email or #ID..."
                        className="w-full min-h-[40px] pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1118] text-xs font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowCreateUser((v) => !v)}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 font-mono font-bold text-xs inline-flex items-center justify-center gap-1.5 hover:opacity-95 whitespace-nowrap cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5 shrink-0" />
                      <span>Add User</span>
                    </button>
                  </div>
                </div>

                {/* Filter Strip */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
                  {(
                    [
                      { id: 'all', label: `All (${stats.totalUsers})` },
                      { id: 'active', label: `Paid & Active (${stats.activeCount})` },
                      { id: 'pending', label: `Free Trial (${stats.pendingCount})` },
                      { id: 'expired', label: `Expired (${stats.expiredCount})` },
                      { id: 'with_smtp', label: 'Has Saved SMTPs' },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setStatusFilter(f.id)}
                      className={`min-h-[34px] px-3 py-1.5 rounded-lg border whitespace-nowrap cursor-pointer ${
                        statusFilter === f.id
                          ? 'border-cyan-500 bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 font-semibold'
                          : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1118] text-slate-600 dark:text-slate-400 hover:border-cyan-500/35'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

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
                        <label className="block text-[10px] uppercase text-slate-500 mb-1">
                          Username
                        </label>
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
                        <label className="block text-[10px] uppercase text-slate-500 mb-1">
                          Email
                        </label>
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
                        <label className="block text-[10px] uppercase text-slate-500 mb-1">
                          Password
                        </label>
                        <div className="relative">
                          <input
                            type={showCreateUserPass ? 'text' : 'password'}
                            required
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Min 4 chars"
                            className="w-full pl-3 pr-9 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-900 dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={() => setShowCreateUserPass((v) => !v)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                            aria-label="Toggle password visibility"
                          >
                            {showCreateUserPass ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase text-slate-500 mb-1">
                          Status
                        </label>
                        <select
                          value={newStatus}
                          onChange={(e) => setNewStatus(e.target.value as SubscriptionStatus)}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-900 dark:text-white"
                        >
                          <option value="pending">Free Trial</option>
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

                {/* 3-Column User Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {filteredUsers.map((u) => {
                    const effectiveStatus: SubscriptionStatus =
                      u.subscriptionStatus === 'active' && u.daysLeft <= 0
                        ? 'expired'
                        : u.subscriptionStatus;
                    const isEditing = editingUserId === u.id;
                    const isBusy = busyUserId === u.id;
                    const userSmtpCount = userVaultCounts.smtpCounts.get(u.id) || 0;
                    const userListCount = userVaultCounts.listCounts.get(u.id) || 0;

                    const isTrialUser =
                      effectiveStatus === 'pending' ||
                      (effectiveStatus === 'active' &&
                        (u.paymentsCount || 0) === 0 &&
                        u.role !== 'admin');

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
                                {isTrialUser ? ' / 5 trial' : ''}
                              </div>
                            </div>
                          </div>

                          {/* Saved SMTPs & Lists Jump Links */}
                          {(userSmtpCount > 0 || userListCount > 0) && (
                            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                              {userSmtpCount > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setVaultOwnerFilterId(u.id);
                                    selectSection('smtps', true);
                                  }}
                                  className="px-2.5 py-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 hover:bg-cyan-500/20 inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Server className="w-3 h-3" />
                                  <span>{userSmtpCount} Saved SMTP{userSmtpCount === 1 ? '' : 's'} →</span>
                                </button>
                              )}
                              {userListCount > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setVaultOwnerFilterId(u.id);
                                    selectSection('lists', true);
                                  }}
                                  className="px-2.5 py-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-500/20 inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <List className="w-3 h-3" />
                                  <span>{userListCount} List{userListCount === 1 ? '' : 's'} →</span>
                                </button>
                              )}
                            </div>
                          )}

                          {/* Expanded Per-User Options Panel */}
                          {isEditing && (
                            <div className="rounded-xl border border-cyan-500/30 bg-slate-50 dark:bg-[#111621] p-3.5 space-y-3 text-xs font-mono">
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-white/10 pb-2">
                                <span className="font-bold text-cyan-600 dark:text-cyan-400">
                                  Full Manual User Control
                                </span>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {u.id !== snapshot.user.id && (
                                    <button
                                      type="button"
                                      onClick={() => handleKickUserSessions(u)}
                                      disabled={isBusy}
                                      className="min-h-[30px] px-2 py-1 rounded border border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 cursor-pointer"
                                    >
                                      Kick Sessions
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleCreditPayment(u)}
                                    disabled={isBusy}
                                    className="min-h-[30px] px-2.5 py-1 rounded border border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 cursor-pointer"
                                  >
                                    +${snapshot.platformSettings.monthlyPriceUsd} Payment
                                  </button>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                <div>
                                  <label className="block text-[10px] text-slate-500 mb-1">
                                    Username
                                  </label>
                                  <input
                                    type="text"
                                    value={draftUsername}
                                    onChange={(e) => setDraftUsername(e.target.value)}
                                    className="w-full min-h-[38px] px-2.5 py-1.5 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0c1017] text-slate-900 dark:text-white"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[10px] text-slate-500 mb-1">
                                    Email Address
                                  </label>
                                  <input
                                    type="email"
                                    value={draftEmail}
                                    onChange={(e) => setDraftEmail(e.target.value)}
                                    className="w-full min-h-[38px] px-2.5 py-1.5 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0c1017] text-slate-900 dark:text-white"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[10px] text-slate-500 mb-1">
                                    Trial Sends (0 = Reset)
                                  </label>
                                  <input
                                    type="number"
                                    min={0}
                                    value={draftCampaignsCount}
                                    onChange={(e) =>
                                      setDraftCampaignsCount(
                                        Math.max(0, Math.round(Number(e.target.value)))
                                      )
                                    }
                                    className="w-full min-h-[38px] px-2.5 py-1.5 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0c1017] text-slate-900 dark:text-white"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                <div>
                                  <label className="block text-[10px] text-slate-500 mb-1">
                                    Status
                                  </label>
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
                                  <label className="block text-[10px] text-slate-500 mb-1">
                                    Days Left
                                  </label>
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
                                      setDraftActiveTimes(
                                        Math.max(0, Math.round(Number(e.target.value)))
                                      )
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

                                <label className="min-h-[34px] flex items-center justify-between gap-2 cursor-pointer">
                                  <span className="text-slate-600 dark:text-slate-300">
                                    Allow Custom From Email
                                  </span>
                                  <input
                                    type="checkbox"
                                    checked={draftOptions.allowCustomFrom}
                                    onChange={(e) =>
                                      setDraftOptions((prev) => ({
                                        ...prev,
                                        allowCustomFrom: e.target.checked,
                                      }))
                                    }
                                    className="w-4 h-4 accent-cyan-500 shrink-0"
                                  />
                                </label>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                                <div>
                                  <label className="block text-[10px] text-slate-500 mb-1">
                                    {u.id === snapshot.user.id
                                      ? 'Role (Locked — Active Admin)'
                                      : 'Role'}
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
                                  <div className="relative">
                                    <input
                                      type={showDraftResetPass ? 'text' : 'password'}
                                      value={draftResetPassword}
                                      onChange={(e) => setDraftResetPassword(e.target.value)}
                                      placeholder="Optional..."
                                      className="w-full min-h-[38px] pl-2.5 pr-8 py-1.5 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0c1017] text-slate-900 dark:text-white"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => setShowDraftResetPass((v) => !v)}
                                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-800 dark:hover:text-white cursor-pointer"
                                      aria-label="Toggle reset password visibility"
                                    >
                                      {showDraftResetPass ? (
                                        <EyeOff className="w-3.5 h-3.5" />
                                      ) : (
                                        <Eye className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                  </div>
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

                            <button
                              type="button"
                              disabled={isBusy || u.id === snapshot.user.id}
                              onClick={() => setUserToDelete(u)}
                              className="min-h-[38px] px-2.5 sm:px-3.5 py-1.5 rounded-lg border border-rose-500/35 bg-rose-500/10 text-xs font-mono font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 disabled:opacity-40 inline-flex items-center justify-center gap-1 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Delete</span>
                            </button>
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
            )}

            {/* ============================================================== */}
            {/* SECTION 3: SAVED USER SMTP's                                   */}
            {/* ============================================================== */}
            {activeSection === 'smtps' && (
              <AdminSmtpsSection
                smtps={adminData.smtps}
                listsCount={adminData.lists.length}
                filterOwnerId={vaultOwnerFilterId}
                filterOwnerLabel={vaultOwnerLabel}
                onClearOwnerFilter={() => setVaultOwnerFilterId(null)}
                onSwitchToLists={() => selectSection('lists', Boolean(vaultOwnerFilterId))}
                onLoginAsUserById={handleLoginAsUserById}
                onTestSmtp={handleTestSavedSmtp}
                onRequestDeleteSmtp={(entry) => {
                  setAlsoDeleteFromUserPool(false);
                  setSmtpToDelete(entry);
                }}
                onRefreshData={handleRefreshAdminData}
                testingArchiveKey={testingSmtpKey}
                refreshing={refreshingAdminData}
                onNotify={(ok, text) => setBanner({ ok, text })}
              />
            )}

            {/* ============================================================== */}
            {/* SECTION 4: EMAIL LISTS & MASTER VAULT                          */}
            {/* ============================================================== */}
            {activeSection === 'lists' && (
              <AdminListsSection
                lists={adminData.lists}
                smtpsCount={adminData.smtps.length}
                filterOwnerId={vaultOwnerFilterId}
                filterOwnerLabel={vaultOwnerLabel}
                onClearOwnerFilter={() => setVaultOwnerFilterId(null)}
                onSwitchToSmtps={() => selectSection('smtps', Boolean(vaultOwnerFilterId))}
                onLoginAsUserById={handleLoginAsUserById}
                onRequestDeleteList={(entry) => setListToDelete(entry)}
                onNotify={(ok, text) => setBanner({ ok, text })}
              />
            )}

            {/* ============================================================== */}
            {/* SECTION 5: LIVE GLOBAL CAMPAIGNS                               */}
            {/* ============================================================== */}
            {activeSection === 'campaigns' && (
              <AdminCampaignsSection
                campaigns={adminData.allCampaigns}
                onJobAction={handleAdminJobAction}
                onRequestDeleteJob={(job) => setJobToDelete(job)}
                onLoginAsUserById={handleLoginAsUserById}
                busyJobId={busyJobId}
              />
            )}

            {/* ============================================================== */}
            {/* SECTION 5B: PORTABLE VPS BACKUP & MANUAL SYSTEM CONTROL CENTER */}
            {/* ============================================================== */}
            {activeSection === 'backup' && (
              <AdminBackupControlSection
                token={token}
                users={snapshot.users}
                platformSettings={snapshot.platformSettings}
                onPlatformSettingsUpdated={onPlatformSettingsUpdated}
                onUsersUpdated={(nextUsers) => {
                  const updatedSelf = nextUsers.find((u) => u.id === snapshot.user.id);
                  onUsersUpdated(nextUsers, updatedSelf);
                }}
                onAdminDataUpdated={(nextData) => onAdminDataUpdated?.(nextData)}
                onFullRestoreCompleted={onFullRestoreCompleted}
                onNotify={(ok, text) => setBanner({ ok, text })}
              />
            )}

            {/* ============================================================== */}
            {/* SECTION 6: SETTINGS WORKSPACE                                  */}
            {/* ============================================================== */}
            {activeSection === 'settings' && (
              <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold font-display tracking-tight text-slate-900 dark:text-white">
                      Admin &amp; Platform Settings
                    </h1>
                    <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1">
                      Configure global subscription pricing, USDT TRC20 wallet, password-reset SMTP, and Admin credentials.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
                    {(
                      [
                        { id: 'all', label: 'All Settings' },
                        { id: 'pricing', label: 'Pricing & Wallet' },
                        { id: 'smtp', label: 'Reset Email SMTP' },
                        { id: 'account', label: 'Admin Credentials' },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setSettingsTab(tab.id)}
                        className={`min-h-[34px] px-3 py-1.5 rounded-lg border whitespace-nowrap cursor-pointer ${
                          settingsTab === tab.id
                            ? 'border-cyan-500 bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 font-semibold'
                            : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1118] text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 1. Global Pricing & USDT Wallet */}
                {(settingsTab === 'all' || settingsTab === 'pricing') && (
                  <form
                    onSubmit={handleSavePlatformSettings}
                    className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-5 sm:p-6 space-y-4"
                  >
                    <div className="flex items-center gap-2.5">
                      <Wallet className="w-4 h-4 text-cyan-500 shrink-0" />
                      <div>
                        <h2 className="text-base font-display font-extrabold text-slate-900 dark:text-white">
                          Global Pricing &amp; USDT Wallet Options
                        </h2>
                        <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                          Applies immediately to the Subscription page and new signups across the website.
                        </p>
                      </div>
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
                          onChange={(e) =>
                            setDefaultSignupStatus(e.target.value as 'pending' | 'active')
                          }
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-900 dark:text-white"
                        >
                          <option value="pending">Free Trial (5 Campaigns)</option>
                          <option value="active">Paid &amp; Active on Signup</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] uppercase text-slate-500 mb-1.5">
                          Trial Window (Days)
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
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={walletAddr}
                            onChange={(e) => setWalletAddr(e.target.value)}
                            className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-cyan-600 dark:text-cyan-300"
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(walletAddr);
                                setCopiedWallet(true);
                                window.setTimeout(() => setCopiedWallet(false), 1800);
                              } catch {
                                // Ignore
                              }
                            }}
                            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-600 dark:text-slate-300 inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            {copiedWallet ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            <span>Copy</span>
                          </button>
                        </div>
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

                    <div className="flex justify-end pt-1">
                      <button
                        type="submit"
                        disabled={savingSettings}
                        className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-mono font-bold inline-flex items-center gap-1.5 hover:opacity-95 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{savingSettings ? 'Saving...' : 'Save Platform Options'}</span>
                      </button>
                    </div>
                  </form>
                )}

                {/* 2. Magic Link Reset Email SMTP */}
                {(settingsTab === 'all' || settingsTab === 'smtp') && (
                  <form
                    onSubmit={handleSaveResetSmtp}
                    className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-5 sm:p-6 space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <Server className="w-4 h-4 text-cyan-500 shrink-0" />
                        <div>
                          <h2 className="text-base font-display font-extrabold text-slate-900 dark:text-white">
                            Magic Link Reset Email SMTP
                          </h2>
                          <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                            Dedicated SMTP server used exclusively for Forgot Password magic links.
                          </p>
                        </div>
                      </div>

                      <span
                        className={`px-2.5 py-1 rounded-md border text-[10px] font-mono font-bold uppercase ${
                          isResetSmtpConfigured
                            ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'border-amber-500/35 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {isResetSmtpConfigured ? 'Configured' : 'Not Configured'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-mono">
                      <div>
                        <label className="block text-slate-500 dark:text-slate-400 mb-1">
                          SMTP Host
                        </label>
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
                        <label className="block text-slate-500 dark:text-slate-400 mb-1">
                          Port
                        </label>
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
                        <label className="block text-slate-500 dark:text-slate-400 mb-1">
                          Encryption
                        </label>
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
                        <label className="block text-slate-500 dark:text-slate-400 mb-1">
                          SMTP Username
                        </label>
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
                        <div className="relative">
                          <input
                            type={showResetSmtpPass ? 'text' : 'password'}
                            required={!snapshot.adminResetSmtp?.hasPassword}
                            value={resetSmtpPass}
                            onChange={(e) => setResetSmtpPass(e.target.value)}
                            placeholder={
                              snapshot.adminResetSmtp?.hasPassword
                                ? '••••••••••••'
                                : 'Enter SMTP password'
                            }
                            className="w-full pl-3 pr-9 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-900 dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={() => setShowResetSmtpPass((v) => !v)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-800 dark:hover:text-white cursor-pointer"
                            aria-label="Toggle SMTP password visibility"
                          >
                            {showResetSmtpPass ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
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
                        <label className="block text-slate-500 dark:text-slate-400 mb-1">
                          From Name
                        </label>
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
                          className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-[#131822] text-slate-800 dark:text-white font-bold hover:border-cyan-500/50 cursor-pointer"
                        >
                          Test
                        </button>
                        <button
                          type="submit"
                          disabled={savingResetSmtp}
                          className="flex-1 px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 font-bold hover:opacity-95 disabled:opacity-50 cursor-pointer"
                        >
                          {savingResetSmtp ? 'Saving...' : 'Save Reset SMTP'}
                        </button>
                      </div>
                    </div>
                  </form>
                )}

                {/* 3. Admin Login & Password Credentials */}
                {(settingsTab === 'all' || settingsTab === 'account') && (
                  <form
                    onSubmit={handleSaveAdminAccount}
                    className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0c1017] p-5 sm:p-6 space-y-4"
                  >
                    <div className="flex items-center gap-2.5">
                      <KeyRound className="w-4 h-4 text-cyan-500 shrink-0" />
                      <div>
                        <h2 className="text-base font-display font-extrabold text-slate-900 dark:text-white">
                          Admin Login &amp; Password Credentials
                        </h2>
                        <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                          Update your Admin username, recovery email, or password. Persisted permanently on local server storage.
                        </p>
                      </div>
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
                        <div className="relative">
                          <input
                            type={showAdminNewPass ? 'text' : 'password'}
                            value={adminNewPassword}
                            onChange={(e) => setAdminNewPassword(e.target.value)}
                            placeholder="Leave blank to keep current"
                            className="w-full pl-3 pr-9 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-900 dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={() => setShowAdminNewPass((v) => !v)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-800 dark:hover:text-white cursor-pointer"
                            aria-label="Toggle new password visibility"
                          >
                            {showAdminNewPass ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-slate-500 dark:text-slate-400 mb-1">
                          Confirm New Password
                        </label>
                        <div className="relative">
                          <input
                            type={showAdminConfirmPass ? 'text' : 'password'}
                            value={adminConfirmPassword}
                            onChange={(e) => setAdminConfirmPassword(e.target.value)}
                            placeholder="Re-enter new password"
                            className="w-full pl-3 pr-9 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-slate-900 dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={() => setShowAdminConfirmPass((v) => !v)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-800 dark:hover:text-white cursor-pointer"
                            aria-label="Toggle confirm password visibility"
                          >
                            {showAdminConfirmPass ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end pt-1 text-xs font-mono">
                      <button
                        type="submit"
                        disabled={savingAdminAccount}
                        className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 font-bold inline-flex items-center gap-1.5 hover:opacity-95 disabled:opacity-50 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>
                          {savingAdminAccount ? 'Saving...' : 'Save Admin Credentials'}
                        </span>
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Reconfirmation Modals */}
      <AdminConfirmModal
        open={Boolean(userToDelete)}
        title="Delete User Account?"
        description={
          userToDelete
            ? `Are you sure you want to permanently delete ${userToDelete.username} (#${userToDelete.userNumber} · ${userToDelete.email}) and their workspace? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete User"
        busy={deletingModalItem}
        onCancel={() => setUserToDelete(null)}
        onConfirm={handleConfirmDeleteUser}
      />

      <AdminConfirmModal
        open={Boolean(smtpToDelete)}
        title="Delete Saved SMTP Entry?"
        description={
          smtpToDelete
            ? `Remove ${smtpToDelete.host}:${smtpToDelete.port} (${smtpToDelete.username}) saved by ${smtpToDelete.ownerUsername} from Admin SMTP's?`
            : ''
        }
        confirmLabel="Delete SMTP"
        busy={deletingModalItem}
        checkboxLabel={
          smtpToDelete?.isLiveInWorkspace
            ? `Also delete this SMTP from ${smtpToDelete.ownerUsername}'s own SMTP Settings pool`
            : undefined
        }
        checkboxChecked={alsoDeleteFromUserPool}
        onCheckboxChange={setAlsoDeleteFromUserPool}
        onCancel={() => {
          setSmtpToDelete(null);
          setAlsoDeleteFromUserPool(false);
        }}
        onConfirm={handleConfirmDeleteSmtp}
      />

      <AdminConfirmModal
        open={Boolean(listToDelete)}
        title="Delete Saved Email List?"
        description={
          listToDelete
            ? `Remove "${listToDelete.title}" (${listToDelete.totalCount.toLocaleString()} recipients from ${listToDelete.ownerUsername}) from Admin Lists?`
            : ''
        }
        confirmLabel="Delete List"
        busy={deletingModalItem}
        onCancel={() => setListToDelete(null)}
        onConfirm={handleConfirmDeleteList}
      />

      <AdminConfirmModal
        open={Boolean(jobToDelete)}
        title="Delete Campaign?"
        description={
          jobToDelete
            ? `Permanently delete campaign "${jobToDelete.subject}" belonging to ${jobToDelete.ownerUsername}?`
            : ''
        }
        confirmLabel="Delete Campaign"
        busy={deletingModalItem}
        onCancel={() => setJobToDelete(null)}
        onConfirm={handleConfirmDeleteJob}
      />
    </div>
  );
};

// ============================================================================
// ADMIN SIGN-IN & FIRST-TIME VPS ADMIN CREATION PORTAL (/admin)
// ============================================================================
const ADMIN_LOCK_STORAGE_KEY = '234mail_login_lock_admin';
const ADMIN_RATE_LIMIT_MESSAGE = 'Too many tries, retry after 10 minutes.';

function formatAdminTinyCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.ceil(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

interface AdminLoginViewProps {
  onAuthenticatedAdmin: (token: string, snapshot: DashboardSnapshot) => void;
  onNavigateHome: () => void;
}

export const AdminLoginView: React.FC<AdminLoginViewProps> = ({
  onAuthenticatedAdmin,
  onNavigateHome,
}) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // First-time clean VPS admin setup or full snapshot restore state
  const [needsInitialSetup, setNeedsInitialSetup] = useState(false);
  const [setupMode, setSetupMode] = useState<'create' | 'restore'>('create');
  const [setupUsername, setSetupUsername] = useState('');
  const [setupEmail, setSetupEmail] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirmPassword, setSetupConfirmPassword] = useState('');
  const [showSetupPassword, setShowSetupPassword] = useState(false);
  const [showSetupConfirmPassword, setShowSetupConfirmPassword] = useState(false);
  const [restorePreview, setRestorePreview] = useState<ParsedSnapshotPreview | null>(null);
  const [restorePauseRunning, setRestorePauseRunning] = useState(true);

  const [loading, setLoading] = useState(false);
  const [lockUntilMs, setLockUntilMs] = useState<number | null>(() => {
    try {
      const saved = Number(localStorage.getItem(ADMIN_LOCK_STORAGE_KEY) || '0');
      return saved > Date.now() ? saved : null;
    } catch {
      return null;
    }
  });
  const [nowTickMs, setNowTickMs] = useState<number>(() => Date.now());
  const [error, setError] = useState<string | null>(() => {
    try {
      const saved = Number(localStorage.getItem(ADMIN_LOCK_STORAGE_KEY) || '0');
      return saved > Date.now() ? ADMIN_RATE_LIMIT_MESSAGE : null;
    } catch {
      return null;
    }
  });

  const remainingLockSeconds =
    lockUntilMs && lockUntilMs > nowTickMs ? Math.ceil((lockUntilMs - nowTickMs) / 1000) : 0;
  const isLockedOut = remainingLockSeconds > 0;

  useEffect(() => {
    let cancelled = false;
    apiRequest<{
      rateLimited: boolean;
      lockedUntil: number | null;
      retryAfterSeconds: number;
      needsInitialAdminSetup: boolean;
    }>('/api/auth/login-status?portal=admin')
      .then((status) => {
        if (cancelled) return;
        if (status.needsInitialAdminSetup) {
          setNeedsInitialSetup(true);
          setLockUntilMs(null);
          setError(null);
          return;
        }
        setNeedsInitialSetup(false);
        if (status.rateLimited && status.lockedUntil && status.lockedUntil > Date.now()) {
          setLockUntilMs(status.lockedUntil);
          setNowTickMs(Date.now());
          try {
            localStorage.setItem(ADMIN_LOCK_STORAGE_KEY, String(status.lockedUntil));
          } catch {
            // ignore storage errors
          }
          setError((prev) => prev || ADMIN_RATE_LIMIT_MESSAGE);
        } else {
          setLockUntilMs(null);
          try {
            localStorage.removeItem(ADMIN_LOCK_STORAGE_KEY);
          } catch {
            // ignore storage errors
          }
          setError((prev) => (prev === ADMIN_RATE_LIMIT_MESSAGE ? null : prev));
        }
      })
      .catch(() => {
        // ignore transient network failure
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!lockUntilMs) return;
    const tick = () => {
      const now = Date.now();
      setNowTickMs(now);
      if (now >= lockUntilMs) {
        setLockUntilMs(null);
        try {
          localStorage.removeItem(ADMIN_LOCK_STORAGE_KEY);
        } catch {
          // ignore storage errors
        }
        setError((prev) => (prev === ADMIN_RATE_LIMIT_MESSAGE ? null : prev));
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [lockUntilMs]);

  const handleSetupFirstAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (setupUsername.trim().length < 2) {
      setError('Admin username must be at least 2 characters.');
      return;
    }
    if (!setupEmail.trim().includes('@')) {
      setError('Please enter a valid admin email address.');
      return;
    }
    if (setupPassword.length < 4) {
      setError('Admin password must be at least 4 characters.');
      return;
    }
    if (setupPassword !== setupConfirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiRequest<{ token: string; snapshot: DashboardSnapshot }>(
        '/api/auth/setup-first-admin',
        {
          method: 'POST',
          body: JSON.stringify({
            username: setupUsername.trim(),
            email: setupEmail.trim(),
            password: setupPassword,
          }),
        }
      );
      onAuthenticatedAdmin(res.token, res.snapshot);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create first admin account.');
    } finally {
      setLoading(false);
    }
  };

  const handleFirstRestoreFilePick = async (file: File | null) => {
    setError(null);
    if (!file) {
      setRestorePreview(null);
      return;
    }
    try {
      const text = await file.text();
      const preview = inspectSnapshotJsonFile(text, file.name, file.size);
      setRestorePreview(preview);
    } catch (err) {
      setRestorePreview(null);
      setError(err instanceof Error ? err.message : 'Could not parse snapshot file.');
    }
  };

  const handleRestoreFirstAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restorePreview) {
      setError('Please select a 234Mail Portable VPS Snapshot (.json) or esp-store.json file first.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await apiRequest<{
        token: string;
        snapshot: DashboardSnapshot;
      }>('/api/auth/restore-first-admin', {
        method: 'POST',
        body: JSON.stringify({
          snapshotData: restorePreview.rawObject,
          pauseRunningCampaigns: restorePauseRunning,
        }),
      });
      onAuthenticatedAdmin(res.token, res.snapshot);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not restore VPS snapshot.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockUntilMs && lockUntilMs > Date.now()) {
      setNowTickMs(Date.now());
      setError(ADMIN_RATE_LIMIT_MESSAGE);
      return;
    }

    setError(null);
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

      setLockUntilMs(null);
      try {
        localStorage.removeItem(ADMIN_LOCK_STORAGE_KEY);
      } catch {
        // ignore storage errors
      }
      onAuthenticatedAdmin(res.token, res.snapshot);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 429 || err.rateLimited)) {
        const until =
          err.lockedUntil && err.lockedUntil > Date.now()
            ? err.lockedUntil
            : Date.now() + (err.retryAfterSeconds || 600) * 1000;
        setLockUntilMs(until);
        setNowTickMs(Date.now());
        try {
          localStorage.setItem(ADMIN_LOCK_STORAGE_KEY, String(until));
        } catch {
          // ignore storage errors
        }
        setError(ADMIN_RATE_LIMIT_MESSAGE);
      } else {
        setError(err instanceof Error ? err.message : 'Invalid admin credentials.');
      }
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
              <span>{needsInitialSetup ? 'FIRST-TIME SERVER SETUP' : 'ADMIN PORTAL'}</span>
            </div>
            <h1 className="text-2xl font-extrabold font-display tracking-tight text-slate-900 dark:text-white">
              {needsInitialSetup
                ? setupMode === 'restore'
                  ? 'Restore Full VPS Backup'
                  : 'Create First Admin Account'
                : 'Admin Sign In'}
            </h1>
            {needsInitialSetup && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                {setupMode === 'restore'
                  ? 'Upload your 234Mail Portable VPS Snapshot (.json) or esp-store.json to restore all users, SMTPs, lists, campaigns, and settings onto this new server.'
                  : 'Fresh server detected. Create your primary Administrator account, or restore a Portable VPS Snapshot from your previous server.'}
              </p>
            )}
          </div>

          {needsInitialSetup && (
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-[#101520] text-xs font-mono">
              <button
                type="button"
                onClick={() => {
                  setSetupMode('create');
                  setError(null);
                }}
                className={`py-2 px-2.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                  setupMode === 'create'
                    ? 'bg-cyan-500 text-slate-950'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Create New Admin
              </button>
              <button
                type="button"
                onClick={() => {
                  setSetupMode('restore');
                  setError(null);
                }}
                className={`py-2 px-2.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                  setupMode === 'restore'
                    ? 'bg-cyan-500 text-slate-950'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Restore VPS Backup
              </button>
            </div>
          )}

          {error && (
            <div className="px-3.5 py-3 rounded-xl border border-rose-500/35 bg-rose-500/10 text-xs font-mono text-rose-700 dark:text-rose-300">
              <div>{error}</div>
              {!needsInitialSetup && isLockedOut && (
                <div className="mt-1 text-[10px] leading-none font-mono tabular-nums opacity-80">
                  Retry in {formatAdminTinyCountdown(remainingLockSeconds)}
                </div>
              )}
            </div>
          )}

          {needsInitialSetup && setupMode === 'restore' ? (
            <form onSubmit={handleRestoreFirstAdmin} className="space-y-4">
              <label className="block rounded-xl border-2 border-dashed border-slate-300 dark:border-white/15 bg-slate-50 dark:bg-[#111621] p-4 text-center hover:border-cyan-500/60 transition-colors cursor-pointer">
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => {
                    void handleFirstRestoreFilePick(e.target.files?.[0] || null);
                  }}
                  className="hidden"
                />
                <Upload className="w-6 h-6 mx-auto text-cyan-500 mb-2" />
                <div className="text-xs font-mono font-bold text-slate-800 dark:text-slate-100">
                  {restorePreview
                    ? restorePreview.filename
                    : 'Select Portable VPS Snapshot (.json)'}
                </div>
                <div className="text-[11px] font-mono text-slate-500 mt-1">
                  Works across any new IP or domain — tracking links rebind automatically.
                </div>
              </label>

              {restorePreview && (
                <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-3.5 text-xs font-mono space-y-1.5 text-emerald-800 dark:text-emerald-200">
                  <div className="font-bold flex items-center justify-between gap-2">
                    <span className="truncate">{restorePreview.formatLabel}</span>
                    {restorePreview.hasChecksum && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20">
                        SHA-256
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[11px]">
                    <span>Users: {restorePreview.usersCount}</span>
                    <span>Admins: {restorePreview.adminsCount}</span>
                    <span>SMTPs: {restorePreview.smtpsCount}</span>
                    <span>Lists: {restorePreview.listsCount}</span>
                    <span>Campaigns: {restorePreview.campaignsCount}</span>
                    <span>Drafts: {restorePreview.draftsCount}</span>
                  </div>
                  <div className="text-[10px] opacity-80 truncate">
                    Source: {restorePreview.sourceHost}
                  </div>
                </div>
              )}

              <label className="flex items-center gap-2.5 text-xs font-mono text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={restorePauseRunning}
                  onChange={(e) => setRestorePauseRunning(e.target.checked)}
                  className="w-4 h-4 accent-cyan-500 shrink-0"
                />
                <span>Safely pause running campaigns on restore (recommended)</span>
              </label>

              <button
                type="submit"
                disabled={loading || !restorePreview}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-400 via-cyan-400 to-sky-400 text-slate-950 font-display font-extrabold text-sm hover:opacity-95 disabled:opacity-50 cursor-pointer"
              >
                {loading ? 'Restoring Full VPS...' : 'Restore Full VPS & Sign In'}
              </button>
            </form>
          ) : needsInitialSetup ? (
            <form onSubmit={handleSetupFirstAdmin} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-slate-500 dark:text-slate-400 mb-1.5">
                  Admin Username
                </label>
                <input
                  type="text"
                  required
                  value={setupUsername}
                  onChange={(e) => setSetupUsername(e.target.value)}
                  placeholder="e.g. Admin"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-500 dark:text-slate-400 mb-1.5">
                  Admin Email
                </label>
                <input
                  type="email"
                  required
                  value={setupEmail}
                  onChange={(e) => setSetupEmail(e.target.value)}
                  placeholder="admin@yourdomain.com"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-500 dark:text-slate-400 mb-1.5">
                  Admin Password
                </label>
                <div className="relative">
                  <input
                    type={showSetupPassword ? 'text' : 'password'}
                    required
                    value={setupPassword}
                    onChange={(e) => setSetupPassword(e.target.value)}
                    placeholder="Choose a strong password"
                    className="w-full pl-3.5 pr-11 py-2.5 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSetupPassword((v) => !v)}
                    aria-label={showSetupPassword ? 'Hide password' : 'Show password'}
                    title={showSetupPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                  >
                    {showSetupPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-500 dark:text-slate-400 mb-1.5">
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    type={showSetupConfirmPassword ? 'text' : 'password'}
                    required
                    value={setupConfirmPassword}
                    onChange={(e) => setSetupConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full pl-3.5 pr-11 py-2.5 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-[#131822] text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSetupConfirmPassword((v) => !v)}
                    aria-label={showSetupConfirmPassword ? 'Hide password' : 'Show password'}
                    title={showSetupConfirmPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                  >
                    {showSetupConfirmPassword ? (
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
                {loading ? 'Creating Admin...' : 'Create Admin & Open Dashboard'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-slate-500 dark:text-slate-400 mb-1.5">
                  Admin Username or Email
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

              <div>
                <label className="block text-xs font-mono text-slate-500 dark:text-slate-400 mb-1.5">
                  Password
                </label>
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

              <button
                type="submit"
                disabled={loading || isLockedOut}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-400 text-slate-950 font-display font-extrabold text-sm hover:opacity-95 disabled:opacity-50 cursor-pointer"
              >
                {loading ? 'Signing in...' : 'Open Admin Dashboard'}
              </button>
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
