import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  AdminResetSmtpConfig,
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
}

const CURRENT_SCHEMA_VERSION = 7;
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

export const DEFAULT_USER_OPTIONS: UserOptions = {
  allowFastBurst: true,
  maxHourlyRate: 1000,
  dailyEmailLimit: 0,
  allowHtml: true,
  allowTracking: true,
  allowCustomFrom: true,
};

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  monthlyPriceUsd: 20,
  planDurationDays: 30,
  usdtWalletAddress: 'TEuJWuY2b6a5ixmz7nbKaM4V3gYNNUU6ed',
  paymentNetwork: 'TRC20 Network Only',
  newUserDefaultStatus: 'pending',
  newUserTrialDays: 7,
};

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
  const price = Math.max(1, ps.monthlyPriceUsd || 20);

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
      planName: 'Monthly — $20 USDT',
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

  const seedAdminUsername = process.env.ADMIN_USERNAME?.trim() || 'Geekytycoon';
  const seedAdminEmail = process.env.ADMIN_EMAIL?.trim() || 'laytua@duck.com';
  const seedAdminPassword =
    process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.trim().length >= 4
      ? process.env.ADMIN_PASSWORD.trim()
      : 'demo1234';

  return [
    mkUser({
      id: 'usr_geekytycoon',
      userNumber: 18,
      username: seedAdminUsername,
      email: seedAdminEmail,
      password: seedAdminPassword,
      role: 'admin',
      status: 'active',
      expiresAt: '2026-12-08',
      daysLeft: 26,
      joinedAt: '2026-03-17',
      paymentsCount: 1,
      totalPaidUsd: 20,
      campaignsCount: 0,
    }),
    mkUser({
      id: 'usr_17_ayomide',
      userNumber: 17,
      username: 'AYOMIDE23',
      email: 'paulwilliam7476@gmail.com',
      status: 'expired',
      expiresAt: '2026-11-12',
      daysLeft: 0,
      joinedAt: '2026-10-13',
      paymentsCount: 0,
      totalPaidUsd: 0,
      campaignsCount: 5,
    }),
    mkUser({
      id: 'usr_16_santawilly',
      userNumber: 16,
      username: 'Santawilly',
      email: 'lovelysoul315@gmail.com',
      status: 'active',
      expiresAt: '2026-12-08',
      daysLeft: 26,
      joinedAt: '2026-10-08',
      paymentsCount: 1,
      totalPaidUsd: 20,
      campaignsCount: 6,
    }),
    mkUser({
      id: 'usr_15_joseph62',
      userNumber: 15,
      username: 'Joseph62',
      email: 'josephnwachukwu679@gmail.com',
      status: 'active',
      expiresAt: '2026-12-08',
      daysLeft: 26,
      joinedAt: '2026-10-08',
      paymentsCount: 1,
      totalPaidUsd: 20,
      campaignsCount: 11,
    }),
    mkUser({
      id: 'usr_10_richard',
      userNumber: 10,
      username: 'RichardRex0147',
      email: 'rexrichard291@gmail.com',
      status: 'expired',
      expiresAt: '2026-10-14',
      daysLeft: 0,
      joinedAt: '2026-09-14',
      paymentsCount: 0,
      totalPaidUsd: 0,
      campaignsCount: 85,
    }),
    mkUser({
      id: 'usr_9_behej',
      userNumber: 9,
      username: 'Behej',
      email: 'felixadams5050@gmail.com',
      status: 'expired',
      expiresAt: '2026-10-21',
      daysLeft: 0,
      joinedAt: '2026-08-19',
      paymentsCount: 0,
      totalPaidUsd: 0,
      campaignsCount: 102,
    }),
    mkUser({
      id: 'usr_8_hakeem',
      userNumber: 8,
      username: 'Hakeem',
      email: 'alimihakeem53@gmail.com',
      status: 'pending',
      expiresAt: '',
      daysLeft: 0,
      joinedAt: '2026-08-19',
      paymentsCount: 0,
      totalPaidUsd: 0,
      campaignsCount: 0,
    }),
    mkUser({
      id: 'usr_7_moshow',
      userNumber: 7,
      username: 'moshow',
      email: 'ihggghuy@gmail.com',
      status: 'expired',
      expiresAt: '2026-09-18',
      daysLeft: 0,
      joinedAt: '2026-08-19',
      paymentsCount: 0,
      totalPaidUsd: 0,
      campaignsCount: 0,
    }),
    mkUser({
      id: 'usr_6_vivit',
      userNumber: 6,
      username: 'Vivitcm002',
      email: 'apexcalibrationllc@gmail.com',
      status: 'expired',
      expiresAt: '2026-09-06',
      daysLeft: 0,
      joinedAt: '2026-08-07',
      paymentsCount: 0,
      totalPaidUsd: 0,
      campaignsCount: 35,
    }),
    mkUser({
      id: 'usr_5_trimset',
      userNumber: 5,
      username: 'trimset',
      email: 'suprisegift295@gmail.com',
      status: 'expired',
      expiresAt: '2026-06-19',
      daysLeft: 0,
      joinedAt: '2026-05-20',
      paymentsCount: 0,
      totalPaidUsd: 0,
      campaignsCount: 149,
    }),
    mkUser({
      id: 'usr_4_kingdavid',
      userNumber: 4,
      username: 'KingDavid',
      email: 'davidk99@gmail.com',
      status: 'expired',
      expiresAt: '2026-06-02',
      daysLeft: 0,
      joinedAt: '2026-05-02',
      paymentsCount: 0,
      totalPaidUsd: 0,
      campaignsCount: 18,
    }),
    mkUser({
      id: 'usr_3_celestine',
      userNumber: 3,
      username: 'Celestine',
      email: 'celestine.m@gmail.com',
      status: 'expired',
      expiresAt: '2026-05-14',
      daysLeft: 0,
      joinedAt: '2026-04-14',
      paymentsCount: 0,
      totalPaidUsd: 0,
      campaignsCount: 42,
    }),
    mkUser({
      id: 'usr_2_tunde',
      userNumber: 2,
      username: 'TundeB',
      email: 'tundebusiness@gmail.com',
      status: 'expired',
      expiresAt: '2026-04-28',
      daysLeft: 0,
      joinedAt: '2026-03-29',
      paymentsCount: 0,
      totalPaidUsd: 0,
      campaignsCount: 9,
    }),
  ];
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
    nextUserNumber: 19,
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

  if (!parsed.schemaVersion || parsed.schemaVersion < 7) {
    if (!platformSettings.monthlyPriceUsd || platformSettings.monthlyPriceUsd === 50) {
      platformSettings.monthlyPriceUsd = 20;
    }
  }

  let users: StoredUser[];
  if (wasVeryOldSchema || !Array.isArray(parsed.users) || parsed.users.length === 0) {
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
        userNumber: u.userNumber || 19 + idx,
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

  // Anti-lockout auto-recovery: if 0 admins remain (e.g. accidental self-demotion),
  // automatically restore Admin role on the primary admin account without touching user data.
  if (users.length > 0 && !users.some((u) => u.role === 'admin')) {
    const recoveryTarget =
      users.find((u) => u.id === SEED_OWNER_ID) ||
      users
        .slice()
        .sort((a, b) => (a.userNumber || 999999) - (b.userNumber || 999999))[0];
    if (recoveryTarget) {
      recoveryTarget.role = 'admin';
      console.log(
        `[234Mail] Auto-recovered Admin role for "${recoveryTarget.username}" (${recoveryTarget.id}) because zero admin accounts existed.`
      );
    }
  }

  for (const u of users) {
    if ((!parsed.schemaVersion || parsed.schemaVersion < 7) && u.planName?.includes('$50')) {
      u.planName = `Monthly — $${platformSettings.monthlyPriceUsd} USDT`;
    }
    syncUserActiveRevenue(u, platformSettings);
  }

  const maxUserNum = users.reduce((max, u) => Math.max(max, u.userNumber || 0), 18);

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

  if (!userWorkspaces[SEED_OWNER_ID]) {
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

  const geekyWs = userWorkspaces[SEED_OWNER_ID];

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
  };
}

class DataStore {
  public state: PersistentState;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.state = this.loadFromDiskOrSeed();
  }

  private loadFromDiskOrSeed(): PersistentState {
    const candidateFiles = [
      DATA_FILE,
      BACKUP_FILE,
      ...(REPO_DATA_FILE !== DATA_FILE ? [REPO_DATA_FILE] : []),
    ];

    for (const candidate of candidateFiles) {
      try {
        if (fs.existsSync(candidate)) {
          const raw = fs.readFileSync(candidate, 'utf-8');
          if (!raw.trim()) continue;
          const parsed = JSON.parse(raw) as Partial<PersistentState>;
          const migrated = migrateLoadedState(parsed);
          this.persistSync(migrated);
          return migrated;
        }
      } catch (err) {
        console.error(`Warning reading store candidate ${candidate}, trying next fallback:`, err);
      }
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

    // Keep local ./data/esp-store.json synced as a secondary mirror when separate from DATA_FILE
    if (REPO_DATA_FILE !== DATA_FILE) {
      try {
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

  public sanitizeUser(u: StoredUser): UserProfile {
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
    const nowStr = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const ps = this.state.platformSettings;
    const planDays = Math.max(1, ps.planDurationDays || 30);

    // Self-signup (no overrideStatus and non-admin) enters Free Trial with full workspace access except sending emails
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
    if (daysLeft > 0) {
      const exp = new Date();
      exp.setDate(exp.getDate() + daysLeft);
      expiresAt = exp.toISOString().slice(0, 10);
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
      daysLeft,
      joinedAt: nowStr.slice(0, 10),
      lastLoginAt: nowStr,
      paymentsCount: initialPayments,
      totalPaidUsd: initialPayments * Math.max(1, ps.monthlyPriceUsd || 20),
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
}

export const store = new DataStore();
