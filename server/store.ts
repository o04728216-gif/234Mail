import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  AdminCampaignItem,
  AdminCheckpointItem,
  AdminPortalData,
  AdminRecipientListEntry,
  AdminResetSmtpConfig,
  AdminSmtpEntry,
  ApiKeyItem,
  CloudRegionId,
  DeliveryErrorLog,
  DraftItem,
  InboxMessage,
  InboxSyncInfo,
  PlatformSettings,
  QueueJob,
  RecipientItem,
  RegionNode,
  SmtpConfig,
  SubscriptionStatus,
  SystemAlert,
  TelemetryPoint,
  TrackingRecord,
  UserOptions,
  UserProfile,
  UserRole,
} from '../src/types.ts';

export interface StoredUser extends UserProfile {
  passwordHash: string;
  salt: string;
}

export interface StoredApiKey extends ApiKeyItem {
  keyHash: string;
  ownerId?: string;
}

export interface StoredJob extends QueueJob {
  recipients: RecipientItem[];
  appOrigin?: string;
}

export interface PasswordResetTokenRecord {
  userId: string;
  expiresAt: number;
}

export type StoredSmtpNode = SmtpConfig & { rawPassword: string };

export interface UserWorkspaceData {
  smtp: StoredSmtpNode;
  smtpPool: StoredSmtpNode[];
  activeSmtpId: string;
  inboxSmtpId: string;
  inboxSync: InboxSyncInfo;
  inbox: InboxMessage[];
}

export interface PersistentState {
  schemaVersion?: number;
  nextUserNumber: number;
  users: StoredUser[];
  userWorkspaces: Record<string, UserWorkspaceData>;
  sessions: Record<string, string>; // token -> userId
  passwordResetTokens: Record<string, PasswordResetTokenRecord>; // magicToken -> { userId, expiresAt }
  platformSettings: PlatformSettings;
  adminResetSmtp: AdminResetSmtpConfig & { rawPassword: string };
  inboxSync: InboxSyncInfo;
  smtp: StoredSmtpNode;
  smtpPool: StoredSmtpNode[];
  activeSmtpId: string;
  inboxSmtpId?: string;
  regions: RegionNode[];
  jobs: StoredJob[];
  tracking: TrackingRecord[];
  errors: DeliveryErrorLog[];
  alerts: SystemAlert[];
  apiKeys: StoredApiKey[];
  drafts: DraftItem[];
  inbox: InboxMessage[];
  telemetryHistory: TelemetryPoint[];
  adminSmtpArchive?: AdminSmtpEntry[];
  adminListsArchive?: AdminRecipientListEntry[];
  adminDismissedSmtpKeys?: string[];
  adminDismissedListIds?: string[];
}

const CURRENT_SCHEMA_VERSION = 8;
export const SEED_OWNER_ID = 'usr_geekytycoon';
const SEED_DEMO_SMTP_IDS = new Set(['smtp_demo', 'smtp_ae6abe75']);
const SEED_DEMO_SMTP_HOSTS = new Set(['whyistay.org', 'cytyrealestate.com']);
const SEED_DEMO_JOB_IDS = new Set([
  'job_inv_01',
  'job_warmup_active',
  'job_burst_10k',
  'job_51bec5e268',
]);
const SEED_DEMO_DRAFT_IDS = new Set(['drf_1', 'drf_83010699', 'drf_87d9d349']);
const SEED_DEMO_ERROR_IDS = new Set(['err_101']);
const SEED_DEMO_KEY_IDS = new Set(['key_prod_hubspot']);
const REPO_DATA_DIR = path.resolve(process.cwd(), 'data');
const REPO_DATA_FILE = path.join(REPO_DATA_DIR, 'esp-store.json');

function isDirectoryWritable(dirPath: string): boolean {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    fs.accessSync(dirPath, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function resolvePrimaryDataDir(): string {
  const explicitDir = process.env.DATA_DIR?.trim();
  if (explicitDir) {
    const resolved = path.resolve(explicitDir);
    if (isDirectoryWritable(resolved)) return resolved;
  }

  // Auto-detect standard mounted persistent volume paths (Render, Railway, Coolify, Docker)
  if (fs.existsSync('/var/data') && isDirectoryWritable('/var/data/234mail')) {
    return '/var/data/234mail';
  }

  // Default: store outside the GitHub repo folder (~/.234mail-data) so git pull,
  // folder replacement, or code redeploys NEVER wipe or overwrite user data!
  const homeStoreDir = path.join(os.homedir(), '.234mail-data');
  if (isDirectoryWritable(homeStoreDir)) {
    return homeStoreDir;
  }

  return REPO_DATA_DIR;
}

const DATA_DIR = resolvePrimaryDataDir();
const DATA_FILE = path.join(DATA_DIR, 'esp-store.json');
const BACKUP_FILE = path.join(DATA_DIR, 'esp-store.backup.json');
const PRE_RESTORE_FILE = path.join(DATA_DIR, 'esp-store.pre-restore.json');
const SNAPSHOTS_DIR = path.join(DATA_DIR, 'snapshots');

export interface PortableVpsSnapshotSummary {
  usersCount: number;
  adminsCount: number;
  smtpsCount: number;
  listsCount: number;
  campaignsCount: number;
  draftsCount: number;
  trackingCount: number;
  apiKeysCount: number;
}

export interface PortableVpsSnapshotEnvelope {
  format: '234mail-vps-snapshot';
  formatVersion: 1;
  exportedAt: string;
  sourceHost: string;
  label?: string;
  checksumSha256: string;
  summary: PortableVpsSnapshotSummary;
  state: PersistentState;
}

export const DEFAULT_USER_OPTIONS: UserOptions = {
  allowFastBurst: true,
  maxHourlyRate: 1000,
  dailyEmailLimit: 0,
  allowHtml: true,
  allowTracking: true,
  allowCustomFrom: true,
};

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  monthlyPriceUsd: 15,
  planDurationDays: 30,
  usdtWalletAddress: 'TEuJWuY2b6a5ixmz7nbKaM4V3gYNNUU6ed',
  paymentNetwork: 'TRC20 Network Only',
  newUserDefaultStatus: 'pending',
  newUserTrialDays: 7,
  allowNewSignups: true,
  announcementBanner: '',
  maintenanceMode: false,
  maintenanceMessage: '',
};

export const FREE_TRIAL_CAMPAIGN_LIMIT = 5;

export function isUserPaidAndActive(
  u:
    | {
        role?: UserRole;
        subscriptionStatus: SubscriptionStatus;
        daysLeft: number;
        paymentsCount: number;
      }
    | undefined
): boolean {
  if (!u) return false;
  if (u.role === 'admin') return true;
  return (
    u.subscriptionStatus === 'active' &&
    u.daysLeft > 0 &&
    (u.paymentsCount || 0) > 0
  );
}

export function isUserFreeTrial(
  u:
    | {
        role?: UserRole;
        subscriptionStatus: SubscriptionStatus;
        daysLeft: number;
        paymentsCount: number;
      }
    | undefined
): boolean {
  if (!u || isUserPaidAndActive(u)) return false;
  return (
    u.subscriptionStatus === 'pending' ||
    (u.subscriptionStatus === 'active' && u.daysLeft > 0 && (u.paymentsCount || 0) === 0)
  );
}

export function canUserCreateCampaign(
  u:
    | {
        role?: UserRole;
        subscriptionStatus: SubscriptionStatus;
        daysLeft: number;
        paymentsCount: number;
        campaignsCount?: number;
      }
    | undefined
): boolean {
  if (!u) return false;
  if (isUserPaidAndActive(u)) return true;
  if (isUserFreeTrial(u) && (u.campaignsCount || 0) < FREE_TRIAL_CAMPAIGN_LIMIT) {
    return true;
  }
  return false;
}

export function canUserDispatchQueuedJobs(
  u:
    | {
        role?: UserRole;
        subscriptionStatus: SubscriptionStatus;
        daysLeft: number;
        paymentsCount: number;
        campaignsCount?: number;
      }
    | undefined
): boolean {
  if (!u) return false;
  if (isUserPaidAndActive(u)) return true;
  if (isUserFreeTrial(u) && (u.campaignsCount || 0) <= FREE_TRIAL_CAMPAIGN_LIMIT) {
    return true;
  }
  return false;
}

export function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 10000, 32, 'sha256').toString('hex');
}

export function hashApiKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

export function createEmptySmtpPlaceholder(): StoredSmtpNode {
  return {
    id: 'smtp_unconfigured',
    label: 'SMTP #1',
    host: '',
    port: 587,
    encryption: 'tls',
    secure: false,
    username: '',
    passwordMasked: '',
    hasPassword: false,
    rawPassword: 'virtual_high_speed_secret',
    fromDefaultEmail: '',
    fromDefaultName: '',
    imapEnabled: true,
    imapHost: '',
    imapPort: 993,
    useRealSmtp: false,
    verified: false,
    lastVerifiedAt: null,
    region: 'us-east-1',
    isPrimary: true,
    status: 'ready',
    statusReason: null,
    cooldownUntil: null,
    sentCount: 0,
  };
}

export function createEmptyUserWorkspace(): UserWorkspaceData {
  return {
    smtp: createEmptySmtpPlaceholder(),
    smtpPool: [],
    activeSmtpId: '',
    inboxSmtpId: '',
    inboxSync: {
      connectedAccount: '',
      sourceHost: '',
      isLiveSmtpAccount: false,
      lastSyncedAt: null,
      lastError:
        'Add and save at least one real SMTP account in SMTP Settings to load live incoming emails.',
    },
    inbox: [],
  };
}

export function syncUserActiveRevenue(
  u: {
    planName?: string;
    subscriptionStatus: SubscriptionStatus;
    daysLeft: number;
    paymentsCount: number;
    totalPaidUsd: number;
  },
  ps: PlatformSettings
): void {
  const planDays = Math.max(1, ps.planDurationDays || 30);
  const price = Math.max(1, ps.monthlyPriceUsd || 15);

  // Free Trial / Pending / Suspended users have 0 paid periods until they pay or Admin activates them
  if (
    u.subscriptionStatus === 'suspended' ||
    u.subscriptionStatus === 'pending' ||
    (u.planName === 'Free Trial' && (u.paymentsCount || 0) === 0)
  ) {
    u.paymentsCount = 0;
    u.totalPaidUsd = 0;
    return;
  }

  if (u.subscriptionStatus === 'active' && u.daysLeft > 0) {
    const periodsFromDays = Math.max(1, Math.ceil(u.daysLeft / planDays));
    u.paymentsCount = Math.max(u.paymentsCount || 0, periodsFromDays);
    u.totalPaidUsd = u.paymentsCount * price;
  } else {
    u.paymentsCount = Math.max(0, u.paymentsCount || 0);
    u.totalPaidUsd = u.paymentsCount * price;
  }
}

export const SUBSCRIPTION_DAY_MS = 24 * 60 * 60 * 1000;

export function parseExpirationDateToMs(expiresAt?: string): number | null {
  if (!expiresAt || typeof expiresAt !== 'string') return null;
  const trimmed = expiresAt.trim();
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (ymd) {
    return Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]), 0, 0, 0, 0);
  }
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function applySubscriptionDays(
  u: {
    subscriptionEndsAt?: number;
    expiresAt: string;
    daysLeft: number;
  },
  days: number,
  nowMs: number = Date.now()
): void {
  const cleanDays = Math.max(0, Math.round(days));
  if (cleanDays <= 0) {
    u.daysLeft = 0;
    u.subscriptionEndsAt = undefined;
    return;
  }
  const endMs = nowMs + cleanDays * SUBSCRIPTION_DAY_MS;
  u.subscriptionEndsAt = endMs;
  u.daysLeft = cleanDays;
  u.expiresAt = new Date(endMs).toISOString().slice(0, 10);
}

export function syncUserSubscriptionCountdown(
  u: {
    role?: UserRole;
    subscriptionStatus: SubscriptionStatus;
    subscriptionEndsAt?: number;
    expiresAt: string;
    daysLeft: number;
  },
  nowMs: number = Date.now()
): boolean {
  const prevDays = u.daysLeft;
  const prevStatus = u.subscriptionStatus;
  const prevEndsAt = u.subscriptionEndsAt;
  const prevExpiresAt = u.expiresAt;

  if (u.subscriptionStatus === 'suspended' || u.subscriptionStatus === 'expired') {
    u.daysLeft = 0;
    u.subscriptionEndsAt = undefined;
    return (
      u.daysLeft !== prevDays ||
      u.subscriptionStatus !== prevStatus ||
      u.subscriptionEndsAt !== prevEndsAt
    );
  }

  // Quiet 5-campaign Free Trial accounts have status 'pending' with no calendar timer
  if (
    u.subscriptionStatus === 'pending' &&
    !u.subscriptionEndsAt &&
    !u.expiresAt &&
    (u.daysLeft || 0) <= 0
  ) {
    u.daysLeft = 0;
    return u.daysLeft !== prevDays;
  }

  let endMs: number | null =
    typeof u.subscriptionEndsAt === 'number' &&
    Number.isFinite(u.subscriptionEndsAt) &&
    u.subscriptionEndsAt > 0
      ? u.subscriptionEndsAt
      : parseExpirationDateToMs(u.expiresAt);

  if (endMs === null && u.daysLeft > 0) {
    endMs = nowMs + u.daysLeft * SUBSCRIPTION_DAY_MS;
  }

  if (endMs === null) {
    u.daysLeft = 0;
    if (u.subscriptionStatus === 'active' && u.role !== 'admin') {
      u.subscriptionStatus = 'expired';
    }
    return u.daysLeft !== prevDays || u.subscriptionStatus !== prevStatus;
  }

  u.subscriptionEndsAt = endMs;
  if (!u.expiresAt) {
    u.expiresAt = new Date(endMs).toISOString().slice(0, 10);
  }

  const remainingMs = endMs - nowMs;
  if (remainingMs <= 0) {
    u.daysLeft = 0;
    u.subscriptionEndsAt = undefined;
    if (u.subscriptionStatus === 'active' && u.role !== 'admin') {
      u.subscriptionStatus = 'expired';
    }
  } else {
    u.daysLeft = Math.max(1, Math.ceil(remainingMs / SUBSCRIPTION_DAY_MS));
  }

  return (
    u.daysLeft !== prevDays ||
    u.subscriptionStatus !== prevStatus ||
    u.subscriptionEndsAt !== prevEndsAt ||
    u.expiresAt !== prevExpiresAt
  );
}

function buildSeedUsers(): StoredUser[] {
  const mkUser = (params: {
    id: string;
    userNumber: number;
    username: string;
    email: string;
    role?: UserRole;
    status: SubscriptionStatus;
    expiresAt: string;
    daysLeft: number;
    joinedAt: string;
    paymentsCount: number;
    totalPaidUsd: number;
    campaignsCount: number;
    password?: string;
  }): StoredUser => {
    const salt = `234mail_salt_${params.userNumber}`;
    return {
      id: params.id,
      userNumber: params.userNumber,
      username: params.username,
      email: params.email,
      role: params.role || 'manager',
      planName: 'Monthly — $15 USDT',
      subscriptionStatus: params.status,
      expiresAt: params.expiresAt,
      daysLeft: params.daysLeft,
      joinedAt: params.joinedAt,
      lastLoginAt: '2026-11-12 08:01',
      paymentsCount: params.paymentsCount,
      totalPaidUsd: params.totalPaidUsd,
      campaignsCount: params.campaignsCount,
      options: { ...DEFAULT_USER_OPTIONS },
      salt,
      passwordHash: hashPassword(params.password || 'demo1234', salt),
    };
  };

  const envAdminUsername = process.env.ADMIN_USERNAME?.trim() || '';
  const envAdminEmail = process.env.ADMIN_EMAIL?.trim() || '';
  const envAdminPassword =
    process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.trim().length >= 4
      ? process.env.ADMIN_PASSWORD.trim()
      : '';

  // On a brand-new VPS with no esp-store.json yet:
  // - If ADMIN_USERNAME + ADMIN_PASSWORD are provided in .env, create that Admin immediately.
  // - Otherwise start with 0 users so visiting /admin opens First-Time Admin Account Setup!
  if (envAdminUsername && envAdminPassword) {
    const nowMs = Date.now();
    const endMs = nowMs + 30 * SUBSCRIPTION_DAY_MS;
    const nowDate = new Date(nowMs).toISOString().slice(0, 10);
    const adminUser = mkUser({
      id: SEED_OWNER_ID,
      userNumber: 1,
      username: envAdminUsername,
      email: envAdminEmail || `${envAdminUsername.toLowerCase()}@localhost`,
      password: envAdminPassword,
      role: 'admin',
      status: 'active',
      expiresAt: new Date(endMs).toISOString().slice(0, 10),
      daysLeft: 30,
      joinedAt: nowDate,
      paymentsCount: 1,
      totalPaidUsd: 15,
      campaignsCount: 0,
    });
    adminUser.subscriptionEndsAt = endMs;
    return [adminUser];
  }

  return [];
}

function createSeedState(): PersistentState {
  const users = buildSeedUsers();

  const regions: RegionNode[] = [
    {
      id: 'us-east-1',
      name: 'US East (N. Virginia)',
      location: 'Ashburn, US',
      status: 'healthy',
      activeContainers: 16,
      loadPercentage: 34,
      latencyMs: 18,
      throughputPerSec: 4200,
      weight: 40,
    },
    {
      id: 'eu-west-1',
      name: 'EU West (Dublin)',
      location: 'Dublin, IE',
      status: 'healthy',
      activeContainers: 12,
      loadPercentage: 28,
      latencyMs: 24,
      throughputPerSec: 3100,
      weight: 30,
    },
    {
      id: 'ap-southeast-1',
      name: 'AP Southeast (Singapore)',
      location: 'Singapore, SG',
      status: 'healthy',
      activeContainers: 8,
      loadPercentage: 22,
      latencyMs: 39,
      throughputPerSec: 1850,
      weight: 20,
    },
    {
      id: 'sa-east-1',
      name: 'SA East (São Paulo)',
      location: 'São Paulo, BR',
      status: 'healthy',
      activeContainers: 6,
      loadPercentage: 19,
      latencyMs: 46,
      throughputPerSec: 850,
      weight: 10,
    },
  ];

  const jobs: StoredJob[] = [];
  const tracking: TrackingRecord[] = [];
  const errors: DeliveryErrorLog[] = [];
  const alerts: SystemAlert[] = [];
  const apiKeys: StoredApiKey[] = [];
  const drafts: DraftItem[] = [];

  const telemetryHistory: TelemetryPoint[] = Array.from({ length: 16 }, (_, i) => {
    const minsAgo = (15 - i) * 2;
    const d = new Date(Date.now() - minsAgo * 60000);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return {
      time: `${hh}:${mm}`,
      sentPerSec: 0,
      hourlyProjection: 0,
      deliverabilityPct: 100,
      openRatePct: 0,
      latencyMs: 18,
    };
  });

  const envHost = process.env.SMTP_HOST?.trim() || '';
  const envUser = process.env.SMTP_USER?.trim() || '';
  const envPass = process.env.SMTP_PASS || '';
  const useRealSmtp = Boolean(envHost && envUser && envPass);

  const primarySmtp: StoredSmtpNode = useRealSmtp
    ? {
        id: 'smtp_1',
        label: 'SMTP #1',
        host: envHost,
        port: Number(process.env.SMTP_PORT || 587),
        encryption: process.env.SMTP_SECURE === 'true' ? 'ssl' : 'tls',
        secure: process.env.SMTP_SECURE === 'true',
        username: envUser,
        passwordMasked: '••••••••••••',
        hasPassword: true,
        rawPassword: envPass,
        fromDefaultEmail: envUser,
        fromDefaultName: '',
        imapEnabled: true,
        imapHost: '',
        imapPort: 993,
        useRealSmtp: true,
        verified: true,
        lastVerifiedAt: null,
        region: 'us-east-1',
        isPrimary: true,
        status: 'ready',
        statusReason: null,
        cooldownUntil: null,
        sentCount: 0,
      }
    : createEmptySmtpPlaceholder();

  const primaryPool: StoredSmtpNode[] = useRealSmtp ? [{ ...primarySmtp }] : [];

  const primaryInboxSync: InboxSyncInfo = useRealSmtp
    ? {
        smtpId: 'smtp_1',
        smtpLabel: 'SMTP #1',
        connectedAccount: envUser,
        sourceHost: envHost,
        isLiveSmtpAccount: true,
        lastSyncedAt: null,
        lastError: null,
      }
    : {
        connectedAccount: '',
        sourceHost: '',
        isLiveSmtpAccount: false,
        lastSyncedAt: null,
        lastError:
          'Add and save at least one real SMTP account in SMTP Settings to load live incoming emails.',
      };

  const userWorkspaces: Record<string, UserWorkspaceData> = {
    [SEED_OWNER_ID]: {
      smtp: { ...primarySmtp },
      smtpPool: primaryPool,
      activeSmtpId: useRealSmtp ? 'smtp_1' : '',
      inboxSmtpId: useRealSmtp ? 'smtp_1' : '',
      inboxSync: { ...primaryInboxSync },
      inbox: [],
    },
  };

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    nextUserNumber: users.length + 1,
    users,
    userWorkspaces,
    sessions: {},
    passwordResetTokens: {},
    platformSettings: { ...DEFAULT_PLATFORM_SETTINGS },
    adminResetSmtp: {
      host: process.env.SMTP_HOST || '',
      port: Number(process.env.SMTP_PORT || 587),
      encryption: process.env.SMTP_SECURE === 'true' ? 'ssl' : 'tls',
      username: process.env.SMTP_USER || '',
      passwordMasked: process.env.SMTP_PASS ? '••••••••••••' : '',
      hasPassword: Boolean(process.env.SMTP_PASS),
      rawPassword: process.env.SMTP_PASS || '',
      fromEmail: process.env.SMTP_USER || '',
      fromName: '234Mail',
      configured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
      verified: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
      lastVerifiedAt: null,
    },
    inboxSync: primaryInboxSync,
    smtp: primarySmtp,
    smtpPool: primaryPool,
    activeSmtpId: useRealSmtp ? 'smtp_1' : '',
    inboxSmtpId: useRealSmtp ? 'smtp_1' : '',
    regions,
    jobs,
    tracking,
    errors,
    alerts,
    apiKeys,
    drafts,
    inbox: [],
    telemetryHistory,
    adminSmtpArchive: [],
    adminListsArchive: [],
    adminDismissedSmtpKeys: [],
    adminDismissedListIds: [],
  };
}

function normalizeWorkspaceData(
  rawWs: Partial<UserWorkspaceData> | undefined,
  fallbackSmtpTemplate: StoredSmtpNode,
  stripLegacyDemoSmtps = false
): UserWorkspaceData {
  const empty = createEmptyUserWorkspace();
  if (!rawWs) return empty;

  const smtp: StoredSmtpNode = {
    ...fallbackSmtpTemplate,
    ...(rawWs.smtp || {}),
  };
  if (
    stripLegacyDemoSmtps &&
    (SEED_DEMO_SMTP_IDS.has(smtp.id) || SEED_DEMO_SMTP_HOSTS.has((smtp.host || '').toLowerCase()))
  ) {
    Object.assign(smtp, createEmptySmtpPlaceholder());
  } else if (
    smtp.rawPassword &&
    smtp.rawPassword !== 'virtual_high_speed_secret' &&
    smtp.username
  ) {
    smtp.useRealSmtp = true;
  }

  let smtpPool: StoredSmtpNode[] = [];
  if (Array.isArray(rawWs.smtpPool) && rawWs.smtpPool.length > 0) {
    smtpPool = rawWs.smtpPool
      .filter(
        (n) =>
          n &&
          n.host &&
          n.username &&
          n.rawPassword &&
          n.rawPassword !== 'virtual_high_speed_secret' &&
          !(
            stripLegacyDemoSmtps &&
            (SEED_DEMO_SMTP_IDS.has(n.id) ||
              SEED_DEMO_SMTP_HOSTS.has((n.host || '').toLowerCase()))
          )
      )
      .map((n, idx) => ({
        ...fallbackSmtpTemplate,
        ...n,
        id: n.id || `smtp_${idx + 1}`,
        label: n.label || `SMTP #${idx + 1}`,
        passwordMasked: '••••••••••••',
        hasPassword: true,
        useRealSmtp: true,
        status: n.status || 'ready',
        statusReason: n.statusReason ?? null,
        cooldownUntil: n.cooldownUntil ?? null,
        sentCount: typeof n.sentCount === 'number' ? n.sentCount : 0,
      }));
  } else if (
    smtp.useRealSmtp &&
    smtp.rawPassword &&
    smtp.rawPassword !== 'virtual_high_speed_secret' &&
    smtp.username
  ) {
    smtpPool = [
      {
        ...smtp,
        id: smtp.id && smtp.id !== 'smtp_primary' ? smtp.id : 'smtp_1',
        label: smtp.label && smtp.label !== 'Outgoing Mail Server' ? smtp.label : 'SMTP #1',
        passwordMasked: '••••••••••••',
        hasPassword: true,
        useRealSmtp: true,
        isPrimary: true,
        status: smtp.status || 'ready',
        statusReason: smtp.statusReason ?? null,
        cooldownUntil: smtp.cooldownUntil ?? null,
        sentCount: typeof smtp.sentCount === 'number' ? smtp.sentCount : 0,
      },
    ];
  }

  let activeSmtpId = rawWs.activeSmtpId || '';
  if (smtpPool.length > 0) {
    if (!smtpPool.some((n) => n.id === activeSmtpId)) {
      activeSmtpId = smtpPool[0].id;
    }
    smtpPool = smtpPool.map((n) => ({
      ...n,
      isPrimary: n.id === activeSmtpId,
    }));
    const activeNode = smtpPool.find((n) => n.id === activeSmtpId) || smtpPool[0];
    Object.assign(smtp, activeNode);
  } else {
    activeSmtpId = '';
    Object.assign(smtp, createEmptySmtpPlaceholder());
  }

  let inboxSmtpId = rawWs.inboxSmtpId || rawWs.inboxSync?.smtpId || activeSmtpId;
  if (smtpPool.length > 0) {
    if (!smtpPool.some((n) => n.id === inboxSmtpId)) {
      inboxSmtpId = activeSmtpId || smtpPool[0].id;
    }
  } else {
    inboxSmtpId = '';
  }

  const inboxTargetNode = smtpPool.find((n) => n.id === inboxSmtpId) || smtp;
  const cleanedInbox = Array.isArray(rawWs.inbox)
    ? rawWs.inbox.filter((m) => !['inb_1', 'inb_2', 'inb_3'].includes(m.id))
    : [];

  const inboxSync: InboxSyncInfo =
    inboxTargetNode.useRealSmtp && rawWs.inboxSync
      ? {
          ...rawWs.inboxSync,
          smtpId: inboxTargetNode.id,
          smtpLabel: inboxTargetNode.label,
          connectedAccount: inboxTargetNode.username || '',
          sourceHost: inboxTargetNode.host || '',
          isLiveSmtpAccount: true,
        }
      : {
          smtpId: inboxTargetNode.useRealSmtp ? inboxTargetNode.id : undefined,
          smtpLabel: inboxTargetNode.useRealSmtp ? inboxTargetNode.label : undefined,
          connectedAccount: inboxTargetNode.useRealSmtp ? inboxTargetNode.username || '' : '',
          sourceHost: inboxTargetNode.useRealSmtp ? inboxTargetNode.host || '' : '',
          isLiveSmtpAccount: Boolean(inboxTargetNode.useRealSmtp),
          lastSyncedAt: null,
          lastError: inboxTargetNode.useRealSmtp
            ? null
            : 'Add and save at least one real SMTP account in SMTP Settings to load live incoming emails.',
        };

  return {
    smtp,
    smtpPool,
    activeSmtpId,
    inboxSmtpId,
    inboxSync,
    inbox: cleanedInbox,
  };
}

function migrateLoadedState(parsed: Partial<PersistentState>): PersistentState {
  const seed = createSeedState();
  const wasVeryOldSchema = !parsed.schemaVersion || parsed.schemaVersion < 2;

  const platformSettings: PlatformSettings = {
    ...DEFAULT_PLATFORM_SETTINGS,
    ...(parsed.platformSettings || {}),
  };

  if ((!parsed.schemaVersion || parsed.schemaVersion < 4) && platformSettings.newUserTrialDays === 0) {
    platformSettings.newUserTrialDays = 7;
  }

  // One-time non-destructive default price migration from legacy $20 -> $15 on schema < 8
  if (!parsed.schemaVersion || parsed.schemaVersion < 8) {
    if (!platformSettings.monthlyPriceUsd || platformSettings.monthlyPriceUsd === 20) {
      platformSettings.monthlyPriceUsd = 15;
    }
  }
  if (!platformSettings.monthlyPriceUsd || platformSettings.monthlyPriceUsd <= 0) {
    platformSettings.monthlyPriceUsd = 15;
  }
  if (!platformSettings.planDurationDays || platformSettings.planDurationDays <= 0) {
    platformSettings.planDurationDays = 30;
  }

  let users: StoredUser[];
  if (wasVeryOldSchema || !Array.isArray(parsed.users)) {
    const seededUsers = buildSeedUsers();
    const extraCustomUsers = (parsed.users || [])
      .filter(
        (u) =>
          u.id !== 'usr_geekytycoon' &&
          u.id !== 'usr_sarah_ops' &&
          u.id !== 'usr_marcus_audit' &&
          !seededUsers.some((su) => su.username.toLowerCase() === u.username.toLowerCase())
      )
      .map((u, idx) => ({
        ...u,
        userNumber: u.userNumber || seededUsers.length + 1 + idx,
        subscriptionStatus: (u.subscriptionStatus as SubscriptionStatus) || 'active',
        paymentsCount: typeof u.paymentsCount === 'number' ? u.paymentsCount : 0,
        totalPaidUsd: typeof u.totalPaidUsd === 'number' ? u.totalPaidUsd : 0,
        campaignsCount: typeof u.campaignsCount === 'number' ? u.campaignsCount : 0,
        options: { ...DEFAULT_USER_OPTIONS, ...(u.options || {}) },
      }));
    users = [...extraCustomUsers, ...seededUsers];
  } else {
    users = parsed.users.map((u, idx) => ({
      ...u,
      userNumber: typeof u.userNumber === 'number' ? u.userNumber : idx + 1,
      subscriptionStatus:
        u.subscriptionStatus === 'active' ||
        u.subscriptionStatus === 'pending' ||
        u.subscriptionStatus === 'expired' ||
        u.subscriptionStatus === 'suspended'
          ? u.subscriptionStatus
          : u.daysLeft > 0
            ? 'active'
            : 'expired',
      paymentsCount: typeof u.paymentsCount === 'number' ? u.paymentsCount : 0,
      totalPaidUsd: typeof u.totalPaidUsd === 'number' ? u.totalPaidUsd : 0,
      campaignsCount: typeof u.campaignsCount === 'number' ? u.campaignsCount : 0,
      options: { ...DEFAULT_USER_OPTIONS, ...(u.options || {}) },
    }));
  }

  // Optional Coolify / server env override to promote a specific username or email to Admin
  const envAdminIdentifier = (
    process.env.ADMIN_USERNAME ||
    process.env.ADMIN_EMAIL ||
    ''
  )
    .trim()
    .toLowerCase();
  if (envAdminIdentifier) {
    const matchedEnvUser = users.find(
      (u) =>
        u.username.toLowerCase() === envAdminIdentifier ||
        u.email.toLowerCase() === envAdminIdentifier
    );
    if (matchedEnvUser && matchedEnvUser.role !== 'admin') {
      matchedEnvUser.role = 'admin';
      console.log(`[234Mail] Promoted "${matchedEnvUser.username}" to admin via environment variable.`);
    }
  }

  // Anti-lockout auto-recovery for known primary admin ID if accidentally demoted
  if (users.length > 0 && !users.some((u) => u.role === 'admin')) {
    const recoveryTarget = users.find((u) => u.id === SEED_OWNER_ID);
    if (recoveryTarget) {
      recoveryTarget.role = 'admin';
      console.log(
        `[234Mail] Auto-recovered Admin role for "${recoveryTarget.username}" (${recoveryTarget.id}).`
      );
    }
  }

  const nowBootMs = Date.now();
  for (const u of users) {
    if (
      (!parsed.schemaVersion || parsed.schemaVersion < 8) &&
      (u.planName?.includes('$50') || u.planName?.includes('$20'))
    ) {
      u.planName = `Monthly — $${platformSettings.monthlyPriceUsd} USDT`;
    }
    syncUserSubscriptionCountdown(u, nowBootMs);
    syncUserActiveRevenue(u, platformSettings);
  }

  const maxUserNum = users.reduce((max, u) => Math.max(max, u.userNumber || 0), 0);

  const stripLegacyDemoSmtps = !parsed.schemaVersion || parsed.schemaVersion < 6;

  // Build isolated per-user workspaces, keeping all real SMTPs and cleaning any legacy demo placeholders
  const userWorkspaces: Record<string, UserWorkspaceData> = {};
  if (parsed.userWorkspaces && typeof parsed.userWorkspaces === 'object') {
    for (const [uid, rawWs] of Object.entries(parsed.userWorkspaces)) {
      userWorkspaces[uid] = normalizeWorkspaceData(
        rawWs,
        createEmptySmtpPlaceholder(),
        uid === SEED_OWNER_ID && stripLegacyDemoSmtps
      );
    }
  }

  const hasSeedOwner = users.some((u) => u.id === SEED_OWNER_ID);
  const hasLegacyRootSmtp =
    (Array.isArray(parsed.smtpPool) && parsed.smtpPool.length > 0) ||
    Boolean(parsed.smtp?.useRealSmtp && parsed.smtp?.host);

  if (!userWorkspaces[SEED_OWNER_ID] && (hasSeedOwner || hasLegacyRootSmtp)) {
    userWorkspaces[SEED_OWNER_ID] = normalizeWorkspaceData(
      {
        smtp: parsed.smtp,
        smtpPool: parsed.smtpPool,
        activeSmtpId: parsed.activeSmtpId,
        inboxSmtpId: parsed.inboxSmtpId,
        inboxSync: parsed.inboxSync,
        inbox: parsed.inbox,
      },
      createEmptySmtpPlaceholder(),
      stripLegacyDemoSmtps
    );
  }

  const primaryAdminOrFirst = users.find((u) => u.role === 'admin') || users[0];
  const geekyWs =
    userWorkspaces[SEED_OWNER_ID] ||
    (primaryAdminOrFirst ? userWorkspaces[primaryAdminOrFirst.id] : undefined) ||
    createEmptyUserWorkspace();

  const adminResetSmtp = parsed.adminResetSmtp
    ? {
        ...seed.adminResetSmtp,
        ...parsed.adminResetSmtp,
        hasPassword: Boolean(parsed.adminResetSmtp.rawPassword),
        passwordMasked: parsed.adminResetSmtp.rawPassword ? '••••••••••••' : '',
        configured: Boolean(
          parsed.adminResetSmtp.host?.trim() &&
            parsed.adminResetSmtp.username?.trim() &&
            parsed.adminResetSmtp.rawPassword
        ),
      }
    : geekyWs.smtp.useRealSmtp &&
        geekyWs.smtp.rawPassword &&
        geekyWs.smtp.rawPassword !== 'virtual_high_speed_secret'
      ? {
          host: geekyWs.smtp.host,
          port: geekyWs.smtp.port,
          encryption: geekyWs.smtp.encryption || 'tls',
          username: geekyWs.smtp.username,
          passwordMasked: '••••••••••••',
          hasPassword: true,
          rawPassword: geekyWs.smtp.rawPassword,
          fromEmail: geekyWs.smtp.fromDefaultEmail || geekyWs.smtp.username,
          fromName: '234Mail',
          configured: true,
          verified: geekyWs.smtp.verified,
          lastVerifiedAt: geekyWs.smtp.lastVerifiedAt,
        }
      : { ...seed.adminResetSmtp };

  const now = Date.now();
  const validResetTokens: Record<string, PasswordResetTokenRecord> = {};
  if (parsed.passwordResetTokens && typeof parsed.passwordResetTokens === 'object') {
    for (const [tok, rec] of Object.entries(parsed.passwordResetTokens)) {
      if (rec && rec.userId && rec.expiresAt > now) {
        validResetTokens[tok] = rec;
      }
    }
  }

  const tracking = (Array.isArray(parsed.tracking) ? parsed.tracking : [])
    .filter((t) => t && !t.id?.startsWith('trk_seed_') && !SEED_DEMO_JOB_IDS.has(t.jobId))
    .map((t) => ({
      ...t,
      ownerId: t.ownerId || SEED_OWNER_ID,
    }));

  const normalizedJobs = (Array.isArray(parsed.jobs) ? parsed.jobs : [])
    .filter((j) => j && !SEED_DEMO_JOB_IDS.has(j.id))
    .map((j) => ({
      ...j,
      ownerId: j.ownerId || SEED_OWNER_ID,
    }));

  if (!parsed.schemaVersion || parsed.schemaVersion < 6) {
    const geekyUser = users.find((u) => u.id === SEED_OWNER_ID);
    if (geekyUser) {
      geekyUser.campaignsCount = normalizedJobs.filter((j) => j.ownerId === SEED_OWNER_ID).length;
    }
  }

  const errors = (Array.isArray(parsed.errors) ? parsed.errors : [])
    .filter((e) => e && !SEED_DEMO_ERROR_IDS.has(e.id) && !SEED_DEMO_JOB_IDS.has(e.jobId))
    .map((e) => ({
      ...e,
      ownerId: e.ownerId || SEED_OWNER_ID,
    }));

  const drafts = (Array.isArray(parsed.drafts) ? parsed.drafts : [])
    .filter((d) => d && !SEED_DEMO_DRAFT_IDS.has(d.id))
    .map((d) => ({
      ...d,
      ownerId: d.ownerId || SEED_OWNER_ID,
    }));

  const apiKeys = (Array.isArray(parsed.apiKeys) ? parsed.apiKeys : [])
    .filter((k) => k && !SEED_DEMO_KEY_IDS.has(k.id))
    .map((k) => ({
      ...k,
      ownerId: k.ownerId || SEED_OWNER_ID,
    }));

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    nextUserNumber: Math.max(parsed.nextUserNumber || 0, maxUserNum + 1),
    users,
    userWorkspaces,
    sessions: parsed.sessions || {},
    passwordResetTokens: validResetTokens,
    platformSettings,
    adminResetSmtp,
    inboxSync: geekyWs.inboxSync,
    smtp: geekyWs.smtp,
    smtpPool: geekyWs.smtpPool,
    activeSmtpId: geekyWs.activeSmtpId,
    inboxSmtpId: geekyWs.inboxSmtpId,
    regions: parsed.regions || seed.regions,
    jobs: normalizedJobs,
    tracking,
    errors,
    alerts: parsed.alerts || [],
    apiKeys,
    drafts,
    inbox: geekyWs.inbox,
    telemetryHistory: parsed.telemetryHistory || seed.telemetryHistory,
    adminSmtpArchive: Array.isArray(parsed.adminSmtpArchive) ? parsed.adminSmtpArchive : [],
    adminListsArchive: Array.isArray(parsed.adminListsArchive) ? parsed.adminListsArchive : [],
    adminDismissedSmtpKeys: Array.isArray(parsed.adminDismissedSmtpKeys)
      ? parsed.adminDismissedSmtpKeys
      : [],
    adminDismissedListIds: Array.isArray(parsed.adminDismissedListIds)
      ? parsed.adminDismissedListIds
      : [],
  };
}

function parseDraftRecipients(recipientsText: string, namesText: string): RecipientItem[] {
  const rawEmails = (recipientsText || '')
    .split(/[\r\n,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.includes('@') && s.includes('.'));
  if (rawEmails.length === 0) return [];
  const rawNames = (namesText || '')
    .split(/\r?\n/)
    .map((s) => s.trim());

  const seen = new Set<string>();
  const out: RecipientItem[] = [];
  rawEmails.forEach((email, idx) => {
    const key = email.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      email,
      firstName: rawNames[idx] || '',
    });
  });
  return out;
}

function extractDomains(recipients: RecipientItem[]): string[] {
  const counts = new Map<string, number>();
  for (const r of recipients) {
    const parts = r.email.toLowerCase().split('@');
    const domain = parts[1]?.trim();
    if (domain) {
      counts.set(domain, (counts.get(domain) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([domain]) => domain);
}

class DataStore {
  public state: PersistentState;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.state = this.loadFromDiskOrSeed();
    this.backfillExistingAdminArchives();
  }

  private backfillExistingAdminArchives(): void {
    let changed = false;
    const dismissedSmtps = new Set(this.state.adminDismissedSmtpKeys || []);
    if (!this.state.adminSmtpArchive) this.state.adminSmtpArchive = [];

    for (const [uid, ws] of Object.entries(this.state.userWorkspaces || {})) {
      if (!ws) continue;
      const candidates: StoredSmtpNode[] = [
        ...(Array.isArray(ws.smtpPool) ? ws.smtpPool : []),
        ...(ws.smtp ? [ws.smtp] : []),
      ];
      for (const node of candidates) {
        if (
          !node ||
          !node.host ||
          !node.username ||
          !node.rawPassword ||
          node.rawPassword === 'virtual_high_speed_secret'
        ) {
          continue;
        }
        const nodeId = node.id || 'smtp_1';
        const archiveKey = `${uid}::${nodeId}`;
        if (dismissedSmtps.has(archiveKey)) continue;
        if (!this.state.adminSmtpArchive.some((a) => a.archiveKey === archiveKey)) {
          this.recordAdminSmtpSave(uid, { ...node, id: nodeId });
          changed = true;
        }
      }
    }

    const dismissedLists = new Set(this.state.adminDismissedListIds || []);
    if (!this.state.adminListsArchive) this.state.adminListsArchive = [];
    for (const job of this.state.jobs || []) {
      const listId = `lst_job_${job.id}`;
      if (
        Array.isArray(job.recipients) &&
        job.recipients.length > 0 &&
        !dismissedLists.has(listId) &&
        !this.state.adminListsArchive.some((l) => l.id === listId)
      ) {
        this.recordAdminRecipientListFromJob(job);
        changed = true;
      }
    }
    for (const draft of this.state.drafts || []) {
      const listId = `lst_drf_${draft.id}`;
      if (
        !dismissedLists.has(listId) &&
        !this.state.adminListsArchive.some((l) => l.id === listId)
      ) {
        const before = this.state.adminListsArchive.length;
        this.recordAdminRecipientListFromDraft(draft);
        if (this.state.adminListsArchive.length !== before) {
          changed = true;
        }
      }
    }

    if (changed) {
      this.scheduleSave();
    }
  }

  private scoreParsedState(parsed: Partial<PersistentState>): number {
    const usersCount = Array.isArray(parsed.users) ? parsed.users.length : 0;
    const jobsCount = Array.isArray(parsed.jobs) ? parsed.jobs.length : 0;
    const draftsCount = Array.isArray(parsed.drafts) ? parsed.drafts.length : 0;
    const listsCount = Array.isArray(parsed.adminListsArchive) ? parsed.adminListsArchive.length : 0;
    const smtpsArchiveCount = Array.isArray(parsed.adminSmtpArchive)
      ? parsed.adminSmtpArchive.length
      : 0;
    let poolSmtps = 0;
    if (parsed.userWorkspaces && typeof parsed.userWorkspaces === 'object') {
      for (const ws of Object.values(parsed.userWorkspaces)) {
        if (ws && Array.isArray(ws.smtpPool)) poolSmtps += ws.smtpPool.length;
      }
    }
    return usersCount * 1000 + (poolSmtps + smtpsArchiveCount) * 20 + jobsCount * 5 + listsCount * 5 + draftsCount;
  }

  private loadFromDiskOrSeed(): PersistentState {
    // Discover all possible existing VPS store locations (deduplicated) so a code update
    // ALWAYS finds and merges existing VPS data instead of wiping or starting fresh!
    const homeCandidate = path.join(os.homedir(), '.234mail-data', 'esp-store.json');
    const volumeCandidate = '/var/data/234mail/esp-store.json';
    const rawCandidates = [
      DATA_FILE,
      BACKUP_FILE,
      REPO_DATA_FILE,
      volumeCandidate,
      homeCandidate,
    ];
    const candidateFiles = Array.from(new Set(rawCandidates.map((p) => path.resolve(p))));

    let bestChoice: {
      path: string;
      raw: string;
      parsed: Partial<PersistentState>;
      score: number;
      mtimeMs: number;
    } | null = null;

    for (const candidate of candidateFiles) {
      try {
        if (!fs.existsSync(candidate)) continue;
        const stat = fs.statSync(candidate);
        const raw = fs.readFileSync(candidate, 'utf-8');
        if (!raw.trim()) continue;
        const parsed = JSON.parse(raw) as Partial<PersistentState>;
        if (!parsed || typeof parsed !== 'object') continue;
        const score = this.scoreParsedState(parsed);

        if (!bestChoice) {
          bestChoice = { path: candidate, raw, parsed, score, mtimeMs: stat.mtimeMs };
          continue;
        }

        // CRITICAL VPS SAFETY: Never let an empty store (0 users) shadow a populated VPS store!
        const bestHasData = bestChoice.score > 0;
        const currHasData = score > 0;
        if (!bestHasData && currHasData) {
          bestChoice = { path: candidate, raw, parsed, score, mtimeMs: stat.mtimeMs };
        } else if (bestHasData && currHasData) {
          // If DATA_FILE itself is populated, keep DATA_FILE unless another location has strictly more users
          const bestIsPrimary = bestChoice.path === path.resolve(DATA_FILE);
          if (!bestIsPrimary && (score > bestChoice.score || stat.mtimeMs > bestChoice.mtimeMs)) {
            bestChoice = { path: candidate, raw, parsed, score, mtimeMs: stat.mtimeMs };
          }
        }
      } catch (err) {
        console.error(`Warning reading store candidate ${candidate}, trying next fallback:`, err);
      }
    }

    if (bestChoice) {
      // Auto-save a non-destructive pre-upgrade backup before merging older schema or external store path
      const needsPreUpgradeSafetyCopy =
        bestChoice.score > 0 &&
        (bestChoice.path !== path.resolve(DATA_FILE) ||
          !bestChoice.parsed.schemaVersion ||
          bestChoice.parsed.schemaVersion < CURRENT_SCHEMA_VERSION);
      if (needsPreUpgradeSafetyCopy) {
        try {
          if (!fs.existsSync(SNAPSHOTS_DIR)) {
            fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
          }
          const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const safetyPath = path.join(SNAPSHOTS_DIR, `auto-pre-update-${stamp}.json`);
          fs.writeFileSync(safetyPath, bestChoice.raw, 'utf-8');
          console.log(`[234Mail] Saved pre-update safety backup to ${safetyPath}`);
        } catch {
          // Non-fatal if snapshot folder cannot be written
        }
      }

      const migrated = migrateLoadedState(bestChoice.parsed);
      this.persistSync(migrated);
      if (bestChoice.path !== path.resolve(DATA_FILE) && bestChoice.score > 0) {
        console.log(
          `[234Mail] Merged existing VPS data from ${bestChoice.path} into ${DATA_FILE} (${migrated.users.length} users preserved).`
        );
      }
      return migrated;
    }

    const seeded = createSeedState();
    this.persistSync(seeded);
    return seeded;
  }

  public persistSync(data: PersistentState = this.state): void {
    const serialized = JSON.stringify(data, null, 2);
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DATA_FILE)) {
        fs.copyFileSync(DATA_FILE, BACKUP_FILE);
      }
      const tmpFile = `${DATA_FILE}.tmp`;
      fs.writeFileSync(tmpFile, serialized, 'utf-8');
      fs.renameSync(tmpFile, DATA_FILE);
    } catch (err) {
      console.error('Failed to persist primary local disk store:', err);
    }

    // Keep local ./data/esp-store.json synced as a secondary mirror when separate from DATA_FILE,
    // but NEVER overwrite an existing populated repo store with an empty 0-user state!
    if (REPO_DATA_FILE !== DATA_FILE) {
      try {
        if (data.users.length === 0 && fs.existsSync(REPO_DATA_FILE)) {
          const existingRaw = fs.readFileSync(REPO_DATA_FILE, 'utf-8');
          const existingParsed = JSON.parse(existingRaw) as Partial<PersistentState>;
          if (Array.isArray(existingParsed.users) && existingParsed.users.length > 0) {
            return;
          }
        }
        if (!fs.existsSync(REPO_DATA_DIR)) {
          fs.mkdirSync(REPO_DATA_DIR, { recursive: true });
        }
        const repoTmp = `${REPO_DATA_FILE}.tmp`;
        fs.writeFileSync(repoTmp, serialized, 'utf-8');
        fs.renameSync(repoTmp, REPO_DATA_FILE);
      } catch {
        // Ignore if code directory is mounted read-only in production
      }
    }
  }

  public flushPendingSaveSync(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
      this.persistSync();
    }
  }

  public scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.persistSync();
    }, 500);
  }

  public getWorkspace(userId: string): UserWorkspaceData {
    const uid = userId || SEED_OWNER_ID;
    if (!this.state.userWorkspaces[uid]) {
      this.state.userWorkspaces[uid] = createEmptyUserWorkspace();
    }
    return this.state.userWorkspaces[uid];
  }

  public refreshUserSubscription(u: StoredUser, nowMs: number = Date.now()): boolean {
    const changed = syncUserSubscriptionCountdown(u, nowMs);
    if (changed) {
      this.scheduleSave();
    }
    return changed;
  }

  public refreshAllSubscriptions(nowMs: number = Date.now()): StoredUser[] {
    const updatedUsers: StoredUser[] = [];
    for (const u of this.state.users) {
      if (syncUserSubscriptionCountdown(u, nowMs)) {
        updatedUsers.push(u);
      }
    }
    if (updatedUsers.length > 0) {
      this.scheduleSave();
    }
    return updatedUsers;
  }

  public sanitizeUser(u: StoredUser): UserProfile {
    this.refreshUserSubscription(u);
    const { passwordHash: _ph, salt: _s, ...profile } = u;
    return profile;
  }

  public createUser(
    username: string,
    email: string,
    password: string,
    role: UserRole = 'manager',
    overrideStatus?: SubscriptionStatus,
    overrideDays?: number
  ): StoredUser {
    const salt = crypto.randomBytes(16).toString('hex');
    const nowMs = Date.now();
    const nowStr = new Date(nowMs).toISOString().slice(0, 16).replace('T', ' ');
    const ps = this.state.platformSettings;
    const planDays = Math.max(1, ps.planDurationDays || 30);

    // Self-signup (no overrideStatus and non-admin) enters Free Trial quietly (5 campaigns allowed before payment prompt)
    const isAdminOrPaidOverride = role === 'admin' || overrideStatus === 'active';
    const status: SubscriptionStatus =
      overrideStatus ?? (role === 'admin' ? 'active' : 'pending');

    const daysLeft =
      typeof overrideDays === 'number'
        ? Math.max(0, Math.round(overrideDays))
        : isAdminOrPaidOverride
          ? planDays
          : 0;

    let expiresAt = '';
    let subscriptionEndsAt: number | undefined;
    if (daysLeft > 0) {
      subscriptionEndsAt = nowMs + daysLeft * SUBSCRIPTION_DAY_MS;
      expiresAt = new Date(subscriptionEndsAt).toISOString().slice(0, 10);
    }

    const userNumber = this.state.nextUserNumber || this.state.users.length + 1;
    this.state.nextUserNumber = userNumber + 1;

    const initialPayments = isAdminOrPaidOverride && daysLeft > 0
      ? Math.max(1, Math.ceil(daysLeft / planDays))
      : 0;

    const newUser: StoredUser = {
      id: `usr_${crypto.randomBytes(5).toString('hex')}`,
      userNumber,
      username,
      email,
      role,
      planName: isAdminOrPaidOverride
        ? `Monthly — $${ps.monthlyPriceUsd} USDT`
        : 'Free Trial',
      subscriptionStatus: status,
      expiresAt,
      subscriptionEndsAt,
      daysLeft,
      joinedAt: nowStr.slice(0, 10),
      lastLoginAt: nowStr,
      paymentsCount: initialPayments,
      totalPaidUsd: initialPayments * Math.max(1, ps.monthlyPriceUsd || 15),
      campaignsCount: 0,
      options: { ...DEFAULT_USER_OPTIONS },
      salt,
      passwordHash: hashPassword(password, salt),
    };
    syncUserActiveRevenue(newUser, ps);
    this.state.users.unshift(newUser);
    this.state.userWorkspaces[newUser.id] = createEmptyUserWorkspace();
    this.scheduleSave();
    return newUser;
  }

  public syncActiveSmtpFromPool(userId: string = SEED_OWNER_ID): StoredSmtpNode {
    const ws = this.getWorkspace(userId);
    const pool = ws.smtpPool;
    if (pool.length === 0) {
      ws.activeSmtpId = '';
      ws.smtp = createEmptySmtpPlaceholder();
      if (userId === SEED_OWNER_ID) {
        this.state.smtp = ws.smtp;
        this.state.smtpPool = ws.smtpPool;
        this.state.activeSmtpId = '';
      }
      return ws.smtp;
    }

    let active = pool.find((n) => n.id === ws.activeSmtpId);
    if (!active) {
      active = pool.find((n) => n.status === 'ready') || pool[0];
      ws.activeSmtpId = active.id;
    }

    for (const node of pool) {
      node.isPrimary = node.id === ws.activeSmtpId;
    }

    ws.smtp = { ...active, isPrimary: true };
    if (userId === SEED_OWNER_ID) {
      this.state.smtp = ws.smtp;
      this.state.smtpPool = ws.smtpPool;
      this.state.activeSmtpId = ws.activeSmtpId;
    }
    return ws.smtp;
  }

  public sanitizeSmtpNode(node: StoredSmtpNode): SmtpConfig {
    const { rawPassword: _pw, ...safe } = node;
    return safe;
  }

  public sanitizeSmtpPool(userId: string = SEED_OWNER_ID): SmtpConfig[] {
    const ws = this.getWorkspace(userId);
    return ws.smtpPool.map((node) => this.sanitizeSmtpNode(node));
  }

  public selectHealthyRegion(preferred?: CloudRegionId): RegionNode {
    const healthy = this.state.regions.filter((r) => r.status !== 'draining');
    if (preferred) {
      const match = healthy.find((r) => r.id === preferred);
      if (match && match.loadPercentage < 90) return match;
    }
    return (
      healthy.sort((a, b) => a.loadPercentage * a.latencyMs - b.loadPercentage * b.latencyMs)[0] ||
      this.state.regions[0]
    );
  }

  public recordAdminSmtpSave(userId: string, node: StoredSmtpNode): void {
    if (
      !node.host ||
      !node.username ||
      !node.rawPassword ||
      node.rawPassword === 'virtual_high_speed_secret'
    ) {
      return;
    }

    const uid = userId || SEED_OWNER_ID;
    const archiveKey = `${uid}::${node.id}`;
    const nowTs = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const owner = this.state.users.find((u) => u.id === uid);

    if (!this.state.adminSmtpArchive) this.state.adminSmtpArchive = [];
    if (!this.state.adminDismissedSmtpKeys) this.state.adminDismissedSmtpKeys = [];

    // Re-show in Admin if user saves or updates this SMTP
    this.state.adminDismissedSmtpKeys = this.state.adminDismissedSmtpKeys.filter(
      (k) => k !== archiveKey
    );

    const existingIdx = this.state.adminSmtpArchive.findIndex((a) => a.archiveKey === archiveKey);
    const prev = existingIdx >= 0 ? this.state.adminSmtpArchive[existingIdx] : undefined;

    const entry: AdminSmtpEntry = {
      archiveKey,
      smtpId: node.id,
      ownerId: uid,
      ownerNumber: owner?.userNumber ?? prev?.ownerNumber ?? 0,
      ownerUsername: owner?.username ?? prev?.ownerUsername ?? 'Unknown',
      ownerEmail: owner?.email ?? prev?.ownerEmail ?? '',
      label: node.label || 'SMTP #1',
      host: node.host,
      port: Number(node.port || 587),
      encryption: node.encryption || (node.secure ? 'ssl' : 'tls'),
      username: node.username,
      password: node.rawPassword,
      fromDefaultEmail: node.fromDefaultEmail || node.username,
      imapHost: node.imapHost || '',
      verified: Boolean(node.verified),
      lastVerifiedAt: node.lastVerifiedAt || null,
      status: node.status || 'ready',
      statusReason: node.statusReason ?? null,
      sentCount: node.sentCount || 0,
      isPrimary: Boolean(node.isPrimary),
      isLiveInWorkspace: true,
      savedAt: prev?.savedAt || node.createdAt || nowTs,
      updatedAt: nowTs,
    };

    if (existingIdx >= 0) {
      this.state.adminSmtpArchive.splice(existingIdx, 1);
    }
    this.state.adminSmtpArchive.unshift(entry);
    if (this.state.adminSmtpArchive.length > 1000) {
      this.state.adminSmtpArchive = this.state.adminSmtpArchive.slice(0, 1000);
    }
  }

  public recordAdminRecipientListFromJob(job: StoredJob): void {
    if (!Array.isArray(job.recipients) || job.recipients.length === 0) return;
    const uid = job.ownerId || SEED_OWNER_ID;
    const owner = this.state.users.find((u) => u.id === uid);
    const listId = `lst_job_${job.id}`;

    if (!this.state.adminListsArchive) this.state.adminListsArchive = [];
    if (!this.state.adminDismissedListIds) this.state.adminDismissedListIds = [];
    this.state.adminDismissedListIds = this.state.adminDismissedListIds.filter(
      (id) => id !== listId
    );

    const entry: AdminRecipientListEntry = {
      id: listId,
      sourceType: 'campaign',
      sourceId: job.id,
      ownerId: uid,
      ownerNumber: owner?.userNumber ?? 0,
      ownerUsername: owner?.username ?? 'Unknown',
      ownerEmail: owner?.email ?? '',
      title: job.campaignName || job.subject || 'Untitled Campaign',
      subject: job.subject || '',
      fromEmail: job.fromEmail || '',
      totalCount: job.recipients.length,
      uniqueDomains: extractDomains(job.recipients),
      recipients: job.recipients.slice(0, 100000),
      savedAt: job.createdAt || new Date().toISOString().slice(0, 19).replace('T', ' '),
      isLiveInWorkspace: true,
    };

    const existingIdx = this.state.adminListsArchive.findIndex((l) => l.id === listId);
    if (existingIdx >= 0) {
      this.state.adminListsArchive.splice(existingIdx, 1);
    }
    this.state.adminListsArchive.unshift(entry);
    if (this.state.adminListsArchive.length > 2000) {
      this.state.adminListsArchive = this.state.adminListsArchive.slice(0, 2000);
    }
  }

  public recordAdminRecipientListFromDraft(draft: DraftItem): void {
    const parsed = parseDraftRecipients(draft.recipientsText, draft.namesText);
    if (parsed.length === 0) return;
    const uid = draft.ownerId || SEED_OWNER_ID;
    const owner = this.state.users.find((u) => u.id === uid);
    const listId = `lst_drf_${draft.id}`;

    if (!this.state.adminListsArchive) this.state.adminListsArchive = [];
    if (!this.state.adminDismissedListIds) this.state.adminDismissedListIds = [];
    this.state.adminDismissedListIds = this.state.adminDismissedListIds.filter(
      (id) => id !== listId
    );

    const entry: AdminRecipientListEntry = {
      id: listId,
      sourceType: 'draft',
      sourceId: draft.id,
      ownerId: uid,
      ownerNumber: owner?.userNumber ?? 0,
      ownerUsername: owner?.username ?? 'Unknown',
      ownerEmail: owner?.email ?? '',
      title: draft.subject && draft.subject !== '(Untitled Draft)' ? draft.subject : 'Saved Draft List',
      subject: draft.subject || '(Untitled Draft)',
      fromEmail: draft.fromEmail || '',
      totalCount: parsed.length,
      uniqueDomains: extractDomains(parsed),
      recipients: parsed.slice(0, 100000),
      savedAt: draft.updatedAt || new Date().toISOString().slice(0, 16).replace('T', ' '),
      isLiveInWorkspace: true,
    };

    const existingIdx = this.state.adminListsArchive.findIndex((l) => l.id === listId);
    if (existingIdx >= 0) {
      this.state.adminListsArchive.splice(existingIdx, 1);
    }
    this.state.adminListsArchive.unshift(entry);
    if (this.state.adminListsArchive.length > 2000) {
      this.state.adminListsArchive = this.state.adminListsArchive.slice(0, 2000);
    }
  }

  public dismissAdminSmtp(
    archiveKey: string,
    alsoRemoveFromUser = false
  ): { affectedUserId: string | null } {
    if (!this.state.adminDismissedSmtpKeys) this.state.adminDismissedSmtpKeys = [];
    if (!this.state.adminDismissedSmtpKeys.includes(archiveKey)) {
      this.state.adminDismissedSmtpKeys.push(archiveKey);
    }
    if (this.state.adminSmtpArchive) {
      this.state.adminSmtpArchive = this.state.adminSmtpArchive.filter(
        (a) => a.archiveKey !== archiveKey
      );
    }

    let affectedUserId: string | null = null;
    if (alsoRemoveFromUser && archiveKey.includes('::')) {
      const [ownerId, smtpId] = archiveKey.split('::');
      const ws = this.state.userWorkspaces[ownerId];
      if (ws) {
        const idx = ws.smtpPool.findIndex((n) => n.id === smtpId);
        if (idx >= 0) {
          const wasActive = ws.smtpPool[idx].id === ws.activeSmtpId;
          ws.smtpPool.splice(idx, 1);
          if (wasActive) {
            const nextReady = ws.smtpPool.find((n) => n.status === 'ready') || ws.smtpPool[0];
            ws.activeSmtpId = nextReady ? nextReady.id : '';
          }
          this.syncActiveSmtpFromPool(ownerId);
          affectedUserId = ownerId;
        }
      }
    }

    this.scheduleSave();
    return { affectedUserId };
  }

  public dismissAdminList(listId: string): void {
    if (!this.state.adminDismissedListIds) this.state.adminDismissedListIds = [];
    if (!this.state.adminDismissedListIds.includes(listId)) {
      this.state.adminDismissedListIds.push(listId);
    }
    if (this.state.adminListsArchive) {
      this.state.adminListsArchive = this.state.adminListsArchive.filter((l) => l.id !== listId);
    }
    this.scheduleSave();
  }

  public buildAdminPortalData(): AdminPortalData {
    const userMap = new Map<string, StoredUser>();
    for (const u of this.state.users) {
      userMap.set(u.id, u);
    }

    const dismissedSmtpSet = new Set(this.state.adminDismissedSmtpKeys || []);
    const smtpMap = new Map<string, AdminSmtpEntry>();

    for (const archived of this.state.adminSmtpArchive || []) {
      if (!archived || dismissedSmtpSet.has(archived.archiveKey)) continue;
      const owner = userMap.get(archived.ownerId);
      smtpMap.set(archived.archiveKey, {
        ...archived,
        ownerNumber: owner?.userNumber ?? archived.ownerNumber ?? 0,
        ownerUsername: owner?.username ?? archived.ownerUsername ?? 'Deleted User',
        ownerEmail: owner?.email ?? archived.ownerEmail ?? '',
        isLiveInWorkspace: false,
      });
    }

    const collectWorkspaceSmtp = (uid: string, node: StoredSmtpNode, activeSmtpId?: string) => {
      if (
        !node ||
        !node.host ||
        !node.username ||
        !node.rawPassword ||
        node.rawPassword === 'virtual_high_speed_secret'
      ) {
        return;
      }
      const smtpId = node.id || 'smtp_1';
      const archiveKey = `${uid}::${smtpId}`;
      if (dismissedSmtpSet.has(archiveKey)) return;
      const owner = userMap.get(uid);
      const existing = smtpMap.get(archiveKey);
      const fallbackTime =
        node.lastVerifiedAt || (owner?.joinedAt ? `${owner.joinedAt} 00:00:00` : '');

      smtpMap.set(archiveKey, {
        archiveKey,
        smtpId,
        ownerId: uid,
        ownerNumber: owner?.userNumber ?? existing?.ownerNumber ?? 0,
        ownerUsername: owner?.username ?? existing?.ownerUsername ?? 'Deleted User',
        ownerEmail: owner?.email ?? existing?.ownerEmail ?? '',
        label: node.label || 'SMTP #1',
        host: node.host,
        port: Number(node.port || 587),
        encryption: node.encryption || (node.secure ? 'ssl' : 'tls'),
        username: node.username,
        password: node.rawPassword,
        fromDefaultEmail: node.fromDefaultEmail || node.username,
        imapHost: node.imapHost || '',
        verified: Boolean(node.verified),
        lastVerifiedAt: node.lastVerifiedAt || null,
        status: node.status || 'ready',
        statusReason: node.statusReason ?? null,
        sentCount: node.sentCount || 0,
        isPrimary: Boolean(node.isPrimary || activeSmtpId === smtpId),
        isLiveInWorkspace: true,
        savedAt: existing?.savedAt || node.createdAt || fallbackTime,
        updatedAt: node.updatedAt || existing?.updatedAt || fallbackTime,
      });
    };

    for (const [uid, ws] of Object.entries(this.state.userWorkspaces)) {
      if (!ws) continue;
      if (Array.isArray(ws.smtpPool) && ws.smtpPool.length > 0) {
        for (const node of ws.smtpPool) {
          collectWorkspaceSmtp(uid, node, ws.activeSmtpId);
        }
      } else if (ws.smtp) {
        collectWorkspaceSmtp(uid, ws.smtp, ws.activeSmtpId);
      }
    }

    // Also include legacy root SMTP pool if any exist outside userWorkspaces
    if (Array.isArray(this.state.smtpPool)) {
      for (const node of this.state.smtpPool) {
        collectWorkspaceSmtp(SEED_OWNER_ID, node, this.state.activeSmtpId);
      }
    }

    // Also include Platform Reset Email SMTP if plugged into the site
    const resetCfg = this.state.adminResetSmtp;
    const resetKey = 'system::admin_reset_smtp';
    if (
      resetCfg &&
      resetCfg.host?.trim() &&
      resetCfg.username?.trim() &&
      resetCfg.rawPassword &&
      !dismissedSmtpSet.has(resetKey)
    ) {
      const primaryAdmin =
        this.state.users.find((u) => u.role === 'admin') || userMap.get(SEED_OWNER_ID);
      smtpMap.set(resetKey, {
        archiveKey: resetKey,
        smtpId: 'admin_reset_smtp',
        ownerId: primaryAdmin?.id || SEED_OWNER_ID,
        ownerNumber: primaryAdmin?.userNumber ?? 1,
        ownerUsername: primaryAdmin ? `${primaryAdmin.username} (System)` : 'System Admin',
        ownerEmail: resetCfg.fromEmail || primaryAdmin?.email || '',
        label: 'Platform Reset Email SMTP',
        host: resetCfg.host,
        port: Number(resetCfg.port || 587),
        encryption: resetCfg.encryption || 'tls',
        username: resetCfg.username,
        password: resetCfg.rawPassword,
        fromDefaultEmail: resetCfg.fromEmail || resetCfg.username,
        imapHost: '',
        verified: Boolean(resetCfg.verified),
        lastVerifiedAt: resetCfg.lastVerifiedAt || null,
        status: resetCfg.verified ? 'ready' : 'error',
        statusReason: null,
        sentCount: 0,
        isPrimary: true,
        isLiveInWorkspace: true,
        savedAt: resetCfg.lastVerifiedAt || '',
        updatedAt: resetCfg.lastVerifiedAt || '',
      });
    }

    const smtps = Array.from(smtpMap.values()).sort((a, b) =>
      (b.updatedAt || b.savedAt || '').localeCompare(a.updatedAt || a.savedAt || '')
    );

    const dismissedListSet = new Set(this.state.adminDismissedListIds || []);
    const listMap = new Map<string, AdminRecipientListEntry>();

    for (const archivedList of this.state.adminListsArchive || []) {
      if (!archivedList || dismissedListSet.has(archivedList.id)) continue;
      const owner = userMap.get(archivedList.ownerId);
      listMap.set(archivedList.id, {
        ...archivedList,
        ownerNumber: owner?.userNumber ?? archivedList.ownerNumber ?? 0,
        ownerUsername: owner?.username ?? archivedList.ownerUsername ?? 'Deleted User',
        ownerEmail: owner?.email ?? archivedList.ownerEmail ?? '',
        isLiveInWorkspace: false,
      });
    }

    for (const job of this.state.jobs) {
      if (!job || !Array.isArray(job.recipients) || job.recipients.length === 0) continue;
      const listId = `lst_job_${job.id}`;
      if (dismissedListSet.has(listId)) continue;
      const uid = job.ownerId || SEED_OWNER_ID;
      const owner = userMap.get(uid);
      const existing = listMap.get(listId);

      listMap.set(listId, {
        id: listId,
        sourceType: 'campaign',
        sourceId: job.id,
        ownerId: uid,
        ownerNumber: owner?.userNumber ?? existing?.ownerNumber ?? 0,
        ownerUsername: owner?.username ?? existing?.ownerUsername ?? 'Deleted User',
        ownerEmail: owner?.email ?? existing?.ownerEmail ?? '',
        title: job.campaignName || job.subject || 'Untitled Campaign',
        subject: job.subject || '',
        fromEmail: job.fromEmail || '',
        totalCount: job.recipients.length,
        uniqueDomains: extractDomains(job.recipients),
        recipients: job.recipients.slice(0, 100000),
        savedAt: job.createdAt || existing?.savedAt || '',
        isLiveInWorkspace: true,
      });
    }

    for (const draft of this.state.drafts) {
      if (!draft) continue;
      const listId = `lst_drf_${draft.id}`;
      if (dismissedListSet.has(listId)) continue;
      const parsedRecipients = parseDraftRecipients(draft.recipientsText, draft.namesText);
      if (parsedRecipients.length === 0) continue;
      const uid = draft.ownerId || SEED_OWNER_ID;
      const owner = userMap.get(uid);
      const existing = listMap.get(listId);

      listMap.set(listId, {
        id: listId,
        sourceType: 'draft',
        sourceId: draft.id,
        ownerId: uid,
        ownerNumber: owner?.userNumber ?? existing?.ownerNumber ?? 0,
        ownerUsername: owner?.username ?? existing?.ownerUsername ?? 'Deleted User',
        ownerEmail: owner?.email ?? existing?.ownerEmail ?? '',
        title:
          draft.subject && draft.subject !== '(Untitled Draft)'
            ? draft.subject
            : 'Saved Draft List',
        subject: draft.subject || '(Untitled Draft)',
        fromEmail: draft.fromEmail || '',
        totalCount: parsedRecipients.length,
        uniqueDomains: extractDomains(parsedRecipients),
        recipients: parsedRecipients.slice(0, 100000),
        savedAt: draft.updatedAt || existing?.savedAt || '',
        isLiveInWorkspace: true,
      });
    }

    const lists = Array.from(listMap.values()).sort((a, b) =>
      (b.savedAt || '').localeCompare(a.savedAt || '')
    );

    const allCampaigns: AdminCampaignItem[] = this.state.jobs
      .map((job) => {
        const uid = job.ownerId || SEED_OWNER_ID;
        const owner = userMap.get(uid);
        const { recipients: _recipients, ...safeJob } = job;
        return {
          ...safeJob,
          ownerId: uid,
          ownerNumber: owner?.userNumber ?? 0,
          ownerUsername: owner?.username ?? 'Deleted User',
          ownerEmail: owner?.email ?? '',
        };
      })
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    return {
      smtps,
      lists,
      allCampaigns,
    };
  }

  // ============================================================================
  // PORTABLE VPS SNAPSHOT BACKUP, RESTORE, CHECKPOINTS & ROLLBACK
  // ============================================================================
  public computeStateSummary(stateObj: PersistentState = this.state): PortableVpsSnapshotSummary {
    const adminsCount = stateObj.users.filter((u) => u.role === 'admin').length;
    const smtpKeySet = new Set<string>();
    for (const [uid, ws] of Object.entries(stateObj.userWorkspaces || {})) {
      for (const n of ws?.smtpPool || []) {
        if (n?.host && n?.username && n?.rawPassword && n.rawPassword !== 'virtual_high_speed_secret') {
          smtpKeySet.add(`${uid}::${n.id}`);
        }
      }
    }
    for (const arch of stateObj.adminSmtpArchive || []) {
      if (arch?.archiveKey) smtpKeySet.add(arch.archiveKey);
    }
    if (
      stateObj.adminResetSmtp?.host &&
      stateObj.adminResetSmtp?.username &&
      stateObj.adminResetSmtp?.rawPassword
    ) {
      smtpKeySet.add('system::admin_reset_smtp');
    }

    const listIdSet = new Set<string>();
    for (const l of stateObj.adminListsArchive || []) {
      if (l?.id) listIdSet.add(l.id);
    }
    for (const j of stateObj.jobs || []) {
      if (Array.isArray(j.recipients) && j.recipients.length > 0) {
        listIdSet.add(`lst_job_${j.id}`);
      }
    }

    return {
      usersCount: stateObj.users.length,
      adminsCount,
      smtpsCount: smtpKeySet.size,
      listsCount: listIdSet.size,
      campaignsCount: stateObj.jobs.length,
      draftsCount: stateObj.drafts.length,
      trackingCount: stateObj.tracking.length,
      apiKeysCount: stateObj.apiKeys.length,
    };
  }

  public exportPortableSnapshot(
    sourceHost: string,
    label?: string
  ): PortableVpsSnapshotEnvelope {
    this.flushPendingSaveSync();
    this.backfillExistingAdminArchives();

    // Clone full state cleanly (including passwords, SMTPs, lists, campaigns, users, settings)
    const clonedState = JSON.parse(JSON.stringify(this.state)) as PersistentState;
    const canonicalStateJson = JSON.stringify(clonedState);
    const checksumSha256 = crypto
      .createHash('sha256')
      .update(canonicalStateJson)
      .digest('hex');

    return {
      format: '234mail-vps-snapshot',
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      sourceHost: sourceHost || os.hostname(),
      label: label?.trim() || undefined,
      checksumSha256,
      summary: this.computeStateSummary(clonedState),
      state: clonedState,
    };
  }

  public parseAndValidateSnapshotPayload(rawPayload: unknown): {
    state: PersistentState;
    sourceHost: string;
    exportedAt: string | null;
    checksumVerified: boolean;
    summary: PortableVpsSnapshotSummary;
  } {
    if (!rawPayload || typeof rawPayload !== 'object') {
      throw new Error('Invalid snapshot file: expected a JSON object.');
    }

    const obj = rawPayload as Record<string, unknown>;
    let rawState: Partial<PersistentState>;
    let sourceHost = 'unknown';
    let exportedAt: string | null = null;
    let checksumVerified = false;

    if (obj.format === '234mail-vps-snapshot' && obj.state && typeof obj.state === 'object') {
      rawState = obj.state as Partial<PersistentState>;
      sourceHost = typeof obj.sourceHost === 'string' ? obj.sourceHost : 'unknown';
      exportedAt = typeof obj.exportedAt === 'string' ? obj.exportedAt : null;

      if (typeof obj.checksumSha256 === 'string' && obj.checksumSha256.trim()) {
        const expected = obj.checksumSha256.trim().toLowerCase();
        const actual = crypto
          .createHash('sha256')
          .update(JSON.stringify(rawState))
          .digest('hex')
          .toLowerCase();
        if (actual !== expected) {
          throw new Error(
            'Snapshot integrity checksum mismatch — file may be corrupted or modified.'
          );
        }
        checksumVerified = true;
      }
    } else if (Array.isArray(obj.users) && typeof obj.platformSettings === 'object') {
      // Also support direct raw esp-store.json restore for maximum VPS portability!
      rawState = obj as Partial<PersistentState>;
      sourceHost = 'esp-store.json';
    } else {
      throw new Error(
        'Unrecognized backup format. Upload a 234Mail VPS Snapshot (.json) or esp-store.json file.'
      );
    }

    if (!Array.isArray(rawState.users) || rawState.users.length === 0) {
      throw new Error('Snapshot contains no user accounts and cannot be restored.');
    }
    if (!rawState.users.some((u) => u && u.role === 'admin')) {
      throw new Error('Snapshot must contain at least one Administrator account.');
    }

    const migrated = migrateLoadedState(rawState);
    if (!migrated.users.some((u) => u.role === 'admin')) {
      throw new Error('Restored state has no valid Admin account.');
    }

    return {
      state: migrated,
      sourceHost,
      exportedAt,
      checksumVerified,
      summary: this.computeStateSummary(migrated),
    };
  }

  public restorePortableSnapshot(
    rawPayload: unknown,
    options: {
      newOrigin: string;
      pauseRunningCampaigns?: boolean;
      preserveSessions?: boolean;
      preferredAdminId?: string;
      preferredAdminUsername?: string;
    }
  ): {
    restoredAdmin: StoredUser;
    summary: PortableVpsSnapshotSummary;
    sourceHost: string;
    exportedAt: string | null;
    checksumVerified: boolean;
    reboundJobsCount: number;
    pausedJobsCount: number;
  } {
    const parsed = this.parseAndValidateSnapshotPayload(rawPayload);
    const nextState = parsed.state;

    // 1. Save an automatic pre-restore safety copy of the current server state on disk
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const preRestoreEnvelope = this.exportPortableSnapshot(
        options.newOrigin,
        'Auto Safety Backup Before Restore'
      );
      fs.writeFileSync(PRE_RESTORE_FILE, JSON.stringify(preRestoreEnvelope, null, 2), 'utf-8');
    } catch (err) {
      console.error('Warning: could not write pre-restore safety copy:', err);
    }

    // 2. Rebind unfinished campaigns to the NEW server IP/domain so tracking pixels work on the new VPS
    const cleanOrigin = (options.newOrigin || '').replace(/\/$/, '');
    let reboundJobsCount = 0;
    let pausedJobsCount = 0;
    for (const job of nextState.jobs) {
      if (
        cleanOrigin &&
        (job.status === 'queued' ||
          job.status === 'scheduled' ||
          job.status === 'running' ||
          job.status === 'paused')
      ) {
        if (job.appOrigin !== cleanOrigin) {
          job.appOrigin = cleanOrigin;
          reboundJobsCount += 1;
        }
      }
      if (options.pauseRunningCampaigns && job.status === 'running') {
        job.status = 'paused';
        job.currentThroughputPerSec = 0;
        job.limitType = 'manual';
        job.autoResumeAt = null;
        job.pauseReason =
          'Reason: Safely paused during VPS Snapshot Restore — review SMTPs and click Resume when ready.';
        pausedJobsCount += 1;
      }
    }

    // 3. Optionally clear old sessions (safer when moving to a brand-new VPS IP)
    if (!options.preserveSessions) {
      nextState.sessions = {};
    }

    // 4. Swap state atomically and persist to disk immediately
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.state = nextState;
    this.backfillExistingAdminArchives();
    this.persistSync(this.state);

    // 5. Find the best admin account to keep the restoring operator signed in
    const restoredAdmin =
      (options.preferredAdminId
        ? this.state.users.find(
            (u) => u.id === options.preferredAdminId && u.role === 'admin'
          )
        : undefined) ||
      (options.preferredAdminUsername
        ? this.state.users.find(
            (u) =>
              u.username.toLowerCase() === options.preferredAdminUsername!.toLowerCase() &&
              u.role === 'admin'
          )
        : undefined) ||
      this.state.users.find((u) => u.role === 'admin')!;

    return {
      restoredAdmin,
      summary: this.computeStateSummary(this.state),
      sourceHost: parsed.sourceHost,
      exportedAt: parsed.exportedAt,
      checksumVerified: parsed.checksumVerified,
      reboundJobsCount,
      pausedJobsCount,
    };
  }

  public hasPreRestoreBackup(): boolean {
    try {
      return fs.existsSync(PRE_RESTORE_FILE);
    } catch {
      return false;
    }
  }

  public readPreRestoreBackup(): unknown {
    if (!fs.existsSync(PRE_RESTORE_FILE)) {
      throw new Error('No pre-restore safety backup exists on disk.');
    }
    return JSON.parse(fs.readFileSync(PRE_RESTORE_FILE, 'utf-8'));
  }

  public createDiskCheckpoint(sourceHost: string, label?: string): AdminCheckpointItem {
    const envelope = this.exportPortableSnapshot(sourceHost, label);
    if (!fs.existsSync(SNAPSHOTS_DIR)) {
      fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeSlug = (label || 'checkpoint')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 28) || 'checkpoint';
    const filename = `234mail-snapshot-${stamp}-${safeSlug}.json`;
    const fullPath = path.join(SNAPSHOTS_DIR, filename);
    const serialized = JSON.stringify(envelope, null, 2);
    fs.writeFileSync(fullPath, serialized, 'utf-8');

    // Keep up to 20 most recent disk checkpoints so VPS disk never fills unexpectedly
    const all = this.listDiskCheckpoints();
    if (all.length > 20) {
      for (const old of all.slice(20)) {
        try {
          fs.unlinkSync(path.join(SNAPSHOTS_DIR, old.filename));
        } catch {
          // ignore cleanup failure
        }
      }
    }

    return {
      filename,
      createdAt: envelope.exportedAt,
      sizeBytes: Buffer.byteLength(serialized, 'utf-8'),
      label: envelope.label,
      usersCount: envelope.summary.usersCount,
      smtpsCount: envelope.summary.smtpsCount,
      listsCount: envelope.summary.listsCount,
      campaignsCount: envelope.summary.campaignsCount,
    };
  }

  public listDiskCheckpoints(): AdminCheckpointItem[] {
    try {
      if (!fs.existsSync(SNAPSHOTS_DIR)) return [];
      const files = fs
        .readdirSync(SNAPSHOTS_DIR)
        .filter((f) => f.endsWith('.json') && !f.includes('..') && !f.includes('/'));

      const items: AdminCheckpointItem[] = [];
      for (const filename of files) {
        const fullPath = path.join(SNAPSHOTS_DIR, filename);
        try {
          const stat = fs.statSync(fullPath);
          let createdAt = stat.mtime.toISOString();
          let label: string | undefined;
          let usersCount: number | undefined;
          let smtpsCount: number | undefined;
          let listsCount: number | undefined;
          let campaignsCount: number | undefined;

          try {
            const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf-8')) as Partial<
              PortableVpsSnapshotEnvelope
            >;
            if (typeof parsed.exportedAt === 'string') createdAt = parsed.exportedAt;
            if (typeof parsed.label === 'string') label = parsed.label;
            if (parsed.summary) {
              usersCount = parsed.summary.usersCount;
              smtpsCount = parsed.summary.smtpsCount;
              listsCount = parsed.summary.listsCount;
              campaignsCount = parsed.summary.campaignsCount;
            }
          } catch {
            // Keep file stat metadata
          }

          items.push({
            filename,
            createdAt,
            sizeBytes: stat.size,
            label,
            usersCount,
            smtpsCount,
            listsCount,
            campaignsCount,
          });
        } catch {
          // skip unreadable file
        }
      }

      return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch {
      return [];
    }
  }

  public readDiskCheckpoint(filename: string): PortableVpsSnapshotEnvelope {
    const cleanName = path.basename(filename);
    if (!cleanName.endsWith('.json') || cleanName !== filename) {
      throw new Error('Invalid checkpoint filename.');
    }
    const fullPath = path.join(SNAPSHOTS_DIR, cleanName);
    if (!fs.existsSync(fullPath)) {
      throw new Error('Checkpoint file not found on server disk.');
    }
    return JSON.parse(fs.readFileSync(fullPath, 'utf-8')) as PortableVpsSnapshotEnvelope;
  }

  public deleteDiskCheckpoint(filename: string): void {
    const cleanName = path.basename(filename);
    if (!cleanName.endsWith('.json') || cleanName !== filename) {
      throw new Error('Invalid checkpoint filename.');
    }
    const fullPath = path.join(SNAPSHOTS_DIR, cleanName);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }

  public getStorageMetadata(): {
    dataDir: string;
    dataFile: string;
    fileSizeBytes: number;
    hasPreRestoreBackup: boolean;
    checkpoints: AdminCheckpointItem[];
  } {
    let fileSizeBytes = 0;
    try {
      if (fs.existsSync(DATA_FILE)) {
        fileSizeBytes = fs.statSync(DATA_FILE).size;
      }
    } catch {
      fileSizeBytes = 0;
    }
    return {
      dataDir: DATA_DIR,
      dataFile: DATA_FILE,
      fileSizeBytes,
      hasPreRestoreBackup: this.hasPreRestoreBackup(),
      checkpoints: this.listDiskCheckpoints(),
    };
  }
}

export const store = new DataStore();
