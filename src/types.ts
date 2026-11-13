export type UserRole = 'admin' | 'manager' | 'analyst';

export type SubscriptionStatus = 'active' | 'pending' | 'expired' | 'suspended';

export type EmailMode = 'plain' | 'html' | 'tracking';

export type SmtpEncryption = 'tls' | 'ssl' | 'none';

export type HourlyRateStep = 50 | 100 | 200 | 300 | 400 | 500 | 1000;

export type DispatchSpeedMode = 'hourly_queue' | 'auto_warmup' | 'hyper_burst';

export type CloudRegionId = 'us-east-1' | 'eu-west-1' | 'ap-southeast-1' | 'sa-east-1';

export type LanguageCode = 'en' | 'es' | 'fr' | 'de' | 'ja';

export type ThemeId = 'dark' | 'light' | 'red' | 'gold' | 'green' | 'blue' | 'silver';

export interface UserOptions {
  allowFastBurst: boolean;
  maxHourlyRate: HourlyRateStep;
  dailyEmailLimit: number;
  allowHtml: boolean;
  allowTracking: boolean;
  allowCustomFrom: boolean;
}

export interface UserProfile {
  id: string;
  userNumber: number;
  username: string;
  email: string;
  role: UserRole;
  planName: string;
  subscriptionStatus: SubscriptionStatus;
  expiresAt: string;
  daysLeft: number;
  joinedAt: string;
  lastLoginAt: string;
  paymentsCount: number;
  totalPaidUsd: number;
  campaignsCount: number;
  theme?: ThemeId;
  preferredLanguage?: LanguageCode;
  options: UserOptions;
}

export interface AdminResetSmtpConfig {
  host: string;
  port: number;
  encryption: SmtpEncryption;
  username: string;
  passwordMasked: string;
  hasPassword: boolean;
  fromEmail: string;
  fromName: string;
  configured: boolean;
  verified: boolean;
  lastVerifiedAt: string | null;
}

export interface PlatformSettings {
  monthlyPriceUsd: number;
  planDurationDays: number;
  usdtWalletAddress: string;
  paymentNetwork: string;
  newUserDefaultStatus: 'pending' | 'active';
  newUserTrialDays: number;
}

export interface InboxSyncInfo {
  smtpId?: string;
  smtpLabel?: string;
  connectedAccount: string;
  sourceHost: string;
  isLiveSmtpAccount: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export type SmtpNodeStatus = 'ready' | 'cooling_down' | 'quota_reached' | 'error';

export interface SmtpConfig {
  id: string;
  label: string;
  host: string;
  port: number;
  encryption: SmtpEncryption;
  secure: boolean;
  username: string;
  passwordMasked: string;
  hasPassword: boolean;
  fromDefaultEmail: string;
  fromDefaultName: string;
  imapEnabled: boolean;
  imapHost: string;
  imapPort: number;
  useRealSmtp: boolean;
  verified: boolean;
  lastVerifiedAt: string | null;
  region: CloudRegionId;
  isPrimary?: boolean;
  status?: SmtpNodeStatus;
  statusReason?: string | null;
  cooldownUntil?: string | null;
  sentCount?: number;
}

export interface RegionNode {
  id: CloudRegionId;
  name: string;
  location: string;
  status: 'healthy' | 'degraded' | 'draining';
  activeContainers: number;
  loadPercentage: number;
  latencyMs: number;
  throughputPerSec: number;
  weight: number;
}

export interface RecipientItem {
  email: string;
  firstName: string;
}

export interface QueueJob {
  id: string;
  ownerId?: string;
  campaignName: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  replyToName: string;
  replyToEmail: string;
  mode: EmailMode;
  body: string;
  dispatchMode: DispatchSpeedMode;
  hourlyRateLimit: HourlyRateStep;
  warmupStageIndex: number;
  burstTargetPerSec: number;
  timeScaleMultiplier: 1 | 60 | 600;
  totalRecipients: number;
  processedCount: number;
  sentCount: number;
  failedCount: number;
  retriedCount: number;
  openedCount: number;
  clickedCount: number;
  convertedCount: number;
  status: 'queued' | 'scheduled' | 'running' | 'paused' | 'completed' | 'stopped' | 'failed';
  scheduledFor: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  currentThroughputPerSec: number;
  currentHourlyRate: number;
  region: CloudRegionId;
  maxRetries: number;
  attachmentNames: string[];
  pauseReason?: string | null;
  limitType?: 'manual' | 'deferred' | 'max_quota' | 'smtp_error' | null;
  autoResumeAt?: string | null;
  activeSmtpLabel?: string | null;
  failoverCount?: number;
  lastSmtpError?: string | null;
  lastSmtpErrorAt?: string | null;
}

export interface TrackingRecord {
  id: string;
  ownerId?: string;
  jobId: string;
  campaignName: string;
  recipientEmail: string;
  recipientName: string;
  opens: number;
  clicks: number;
  converted: boolean;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  status: 'delivered' | 'opened' | 'clicked' | 'bounced';
  region: CloudRegionId;
}

export interface DeliveryErrorLog {
  id: string;
  ownerId?: string;
  jobId: string;
  campaignName: string;
  recipientEmail: string;
  smtpCode: string;
  errorMessage: string;
  attempt: number;
  maxAttempts: number;
  retryStatus: 'pending_retry' | 'retried_success' | 'exhausted';
  nextRetryAt: string | null;
  region: CloudRegionId;
  timestamp: string;
}

export interface SystemAlert {
  id: string;
  ownerId?: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  service: 'smtp-relay' | 'queue-worker' | 'load-balancer' | 'deliverability';
  acknowledged: boolean;
  createdAt: string;
}

export interface ApiKeyItem {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  requestsCount: number;
  status: 'active' | 'revoked';
}

export interface DraftItem {
  id: string;
  ownerId?: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  replyToName: string;
  replyToEmail: string;
  recipientsText: string;
  namesText: string;
  mode: EmailMode;
  body: string;
  dispatchMode: DispatchSpeedMode;
  hourlyRateLimit: HourlyRateStep;
  updatedAt: string;
}

export interface InboxMessage {
  id: string;
  fromName: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  snippet: string;
  body: string;
  htmlBody?: string;
  receivedAt: string;
  unread: boolean;
  category: 'reply' | 'bounce' | 'transactional';
}

export interface TelemetryPoint {
  time: string;
  sentPerSec: number;
  hourlyProjection: number;
  deliverabilityPct: number;
  openRatePct: number;
  latencyMs: number;
}

export interface DashboardSnapshot {
  user: UserProfile;
  users: UserProfile[];
  platformSettings: PlatformSettings;
  adminResetSmtp?: AdminResetSmtpConfig;
  inboxSync: InboxSyncInfo;
  smtp: SmtpConfig;
  smtpPool: SmtpConfig[];
  regions: RegionNode[];
  jobs: QueueJob[];
  tracking: TrackingRecord[];
  errors: DeliveryErrorLog[];
  alerts: SystemAlert[];
  apiKeys: ApiKeyItem[];
  drafts: DraftItem[];
  inbox: InboxMessage[];
  telemetryHistory: TelemetryPoint[];
}
