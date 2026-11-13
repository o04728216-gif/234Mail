import nodemailer from 'nodemailer';
import type { EmailMode, RecipientItem, SmtpEncryption } from '../src/types.ts';
import { store, type StoredSmtpNode } from './store.ts';

export interface DispatchPayload {
  userId?: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  replyToName: string;
  replyToEmail: string;
  mode: EmailMode;
  body: string;
  recipient: RecipientItem;
  trackingId?: string;
  appBaseUrl: string;
}

export interface DispatchResult {
  ok: boolean;
  smtpCode: string;
  errorMessage?: string;
  failureKind?: 'deferred' | 'max_quota' | 'smtp_error' | 'bounce';
  latencyMs: number;
  usedSmtpLabel?: string;
  switchedFromLabel?: string;
  switchedToLabel?: string;
  poolMutated?: boolean;
}

function classifySmtpFailure(err: unknown): {
  smtpCode: string;
  errorMessage: string;
  failureKind: 'deferred' | 'max_quota' | 'smtp_error' | 'bounce';
} {
  const raw = err as {
    responseCode?: number;
    response?: string;
    code?: string;
    message?: string;
  };
  const numericCode = typeof raw?.responseCode === 'number' ? raw.responseCode : 0;
  const msg = (raw?.response || raw?.message || 'SMTP Dispatch Failure').trim();
  const lower = msg.toLowerCase();
  const smtpCode = numericCode > 0 ? String(numericCode) : raw?.code || '451';

  // 1. Maximum / Daily Send Quota Reached (e.g. Gmail 550 5.4.5, Hostinger/Zoho/cPanel max quota)
  if (
    lower.includes('daily user sending quota') ||
    lower.includes('sending quota exceeded') ||
    lower.includes('daily limit') ||
    lower.includes('daily sending limit') ||
    lower.includes('5.4.5') ||
    lower.includes('quota exceeded') ||
    lower.includes('max emails per') ||
    lower.includes('exceeded the max emails') ||
    lower.includes('maximum sending limit') ||
    lower.includes('out of quota')
  ) {
    return {
      smtpCode,
      errorMessage: msg,
      failureKind: 'max_quota',
    };
  }

  // 2. Deferred / Hourly Rate Limit / Temporary Server Throttle
  if (
    (numericCode >= 400 && numericCode < 500) ||
    lower.includes('defer') ||
    lower.includes('max defers') ||
    lower.includes('too many') ||
    lower.includes('rate limit') ||
    lower.includes('throttl') ||
    lower.includes('try again later') ||
    lower.includes('temporarily') ||
    lower.includes('greylist') ||
    lower.includes('4.7.0') ||
    lower.includes('4.7.1') ||
    lower.includes('4.2.1') ||
    raw?.code === 'ETIMEDOUT' ||
    raw?.code === 'ECONNRESET'
  ) {
    return {
      smtpCode,
      errorMessage: msg,
      failureKind: 'deferred',
    };
  }

  // 3. SMTP Server Down / Auth Rejected / Sender Policy Block (triggers auto-switch to next SMTP!)
  if (
    numericCode === 535 ||
    numericCode === 530 ||
    numericCode === 553 ||
    numericCode === 554 ||
    lower.includes('authentication') ||
    lower.includes('invalid login') ||
    lower.includes('username and password not accepted') ||
    lower.includes('sender address rejected') ||
    lower.includes('not owned by') ||
    lower.includes('relay access denied') ||
    lower.includes('account suspended') ||
    lower.includes('blocked') ||
    raw?.code === 'ECONNREFUSED' ||
    raw?.code === 'ENOTFOUND' ||
    raw?.code === 'ECONNECTION' ||
    raw?.code === 'ESOCKET' ||
    raw?.code === 'EAUTH'
  ) {
    return {
      smtpCode,
      errorMessage: msg,
      failureKind: 'smtp_error',
    };
  }

  // 4. Single Recipient Hard Bounce (550 user unknown, invalid mailbox, etc. — SMTP itself is healthy)
  return {
    smtpCode,
    errorMessage: msg,
    failureKind: 'bounce',
  };
}

export function interpolatePersonalization(template: string, recipient: RecipientItem): string {
  const safeName = recipient.firstName?.trim() || recipient.email.split('@')[0] || 'there';
  return template
    .replace(/\{first_name\}/gi, safeName)
    .replace(/\{\{first_name\}\}/gi, safeName)
    .replace(/\{email\}/gi, recipient.email);
}

export function buildEmailContent(payload: DispatchPayload): { text: string; html?: string } {
  const personalizedBody = interpolatePersonalization(payload.body, payload.recipient);

  if (payload.mode === 'plain') {
    return { text: personalizedBody };
  }

  let htmlBody =
    payload.mode === 'html' || personalizedBody.includes('<')
      ? personalizedBody
      : personalizedBody
          .split('\n')
          .map((line) => (line.trim() ? `<p style="margin:0 0 12px 0;">${line}</p>` : '<br/>'))
          .join('');

  if (payload.mode === 'tracking' && payload.trackingId) {
    const pixelUrl = `${payload.appBaseUrl}/api/track/open/${payload.trackingId}.gif`;
    htmlBody += `\n<img src="${pixelUrl}" alt="" width="1" height="1" style="display:block;border:0;opacity:0;" />`;
  }

  return {
    text: personalizedBody.replace(/<[^>]+>/g, ''),
    html: htmlBody,
  };
}

function buildTransportOptions(params: {
  host: string;
  port: number;
  encryption?: SmtpEncryption;
  secure?: boolean;
  username: string;
  password: string;
  pooled?: boolean;
}) {
  const enc: SmtpEncryption =
    params.port === 465
      ? 'ssl'
      : params.encryption || (params.secure ? 'ssl' : 'tls');
  const isImplicitSsl = enc === 'ssl' || params.port === 465;

  return {
    ...(params.pooled ? { pool: true, maxConnections: 10, maxMessages: 500 } : {}),
    host: params.host,
    port: params.port,
    secure: isImplicitSsl,
    ignoreTLS: enc === 'none' && !isImplicitSsl,
    auth: params.username ? { user: params.username, pass: params.password } : undefined,
    tls: {
      rejectUnauthorized: false,
    },
    connectionTimeout: 6500,
    greetingTimeout: 6500,
  };
}

export async function verifySmtpConnection(
  customConfig?: {
    host: string;
    port: number;
    encryption?: SmtpEncryption;
    secure: boolean;
    username: string;
    password: string;
    useRealSmtp: boolean;
  },
  userId: string = 'usr_geekytycoon'
): Promise<{ verified: boolean; useRealSmtp: boolean; message: string; latencyMs: number }> {
  const start = Date.now();
  const ws = store.getWorkspace(userId);
  const cfg = customConfig ?? {
    host: ws.smtp.host,
    port: ws.smtp.port,
    encryption: ws.smtp.encryption || 'tls',
    secure: ws.smtp.secure,
    username: ws.smtp.username,
    password: ws.smtp.rawPassword,
    useRealSmtp: ws.smtp.useRealSmtp,
  };

  const hasRealCredentials = Boolean(
    cfg.host.trim() &&
      cfg.username.trim() &&
      cfg.password &&
      cfg.password !== 'virtual_high_speed_secret' &&
      !cfg.host.endsWith('234mail-relay.net')
  );

  if (!hasRealCredentials && !cfg.useRealSmtp) {
    return {
      verified: true,
      useRealSmtp: false,
      message: `Demo relay ${cfg.host}:${cfg.port} active. Enter your real SMTP Password to send live emails and sync your Inbox.`,
      latencyMs: Math.max(9, Date.now() - start + 12),
    };
  }

  try {
    const transporter = nodemailer.createTransport(
      buildTransportOptions({
        host: cfg.host.trim(),
        port: cfg.port,
        encryption: cfg.encryption,
        secure: cfg.secure,
        username: cfg.username.trim(),
        password: cfg.password,
      })
    );
    await transporter.verify();
    return {
      verified: true,
      useRealSmtp: true,
      message: `Connected! Live SMTP server (${cfg.host}:${cfg.port}) is verified and ready.`,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      verified: false,
      // Keep useRealSmtp = true whenever real credentials were saved so IMAP Inbox sync still runs
      useRealSmtp: hasRealCredentials,
      message:
        err instanceof Error
          ? `SMTP connection warning on ${cfg.host}:${cfg.port} — ${err.message}`
          : 'Could not verify SMTP server. Check your Host, Port, Username, or Password.',
      latencyMs: Date.now() - start,
    };
  }
}

type SmtpTransporter = ReturnType<typeof nodemailer.createTransport>;

const transporterPoolMap = new Map<string, { key: string; transporter: SmtpTransporter }>();

function getPooledTransporterForNode(userId: string, node: StoredSmtpNode): SmtpTransporter {
  const enc = node.encryption || (node.secure ? 'ssl' : 'tls');
  const poolKey = `${userId}:${node.id}`;
  const configKey = `${node.host}:${node.port}:${enc}:${node.username}:${node.rawPassword}`;
  const existing = transporterPoolMap.get(poolKey);
  if (existing && existing.key === configKey) {
    return existing.transporter;
  }
  const transporter = nodemailer.createTransport(
    buildTransportOptions({
      host: node.host,
      port: node.port,
      encryption: enc,
      secure: node.secure,
      username: node.username,
      password: node.rawPassword,
      pooled: true,
    })
  );
  transporterPoolMap.set(poolKey, { key: configKey, transporter });
  return transporter;
}

export function refreshRecoveredSmtpNodes(userId?: string): string[] {
  const recoveredUserIds: string[] = [];
  const nowMs = Date.now();
  const targetUserIds = userId ? [userId] : Object.keys(store.state.userWorkspaces);

  for (const uid of targetUserIds) {
    const ws = store.getWorkspace(uid);
    let userRecovered = false;
    for (const node of ws.smtpPool) {
      if (node.status === 'cooling_down' && node.cooldownUntil) {
        const targetMs = Date.parse(node.cooldownUntil);
        if (!Number.isNaN(targetMs) && targetMs <= nowMs) {
          node.status = 'ready';
          node.statusReason = null;
          node.cooldownUntil = null;
          userRecovered = true;
        }
      }
    }
    if (userRecovered) {
      const currentActive = ws.smtpPool.find((n) => n.id === ws.activeSmtpId);
      if (!currentActive || currentActive.status !== 'ready') {
        const firstReady = ws.smtpPool.find((n) => n.status === 'ready');
        if (firstReady) {
          ws.activeSmtpId = firstReady.id;
        }
      }
      store.syncActiveSmtpFromPool(uid);
      recoveredUserIds.push(uid);
    }
  }

  return recoveredUserIds;
}

function getOrderedReadySmtpCandidates(userId: string): StoredSmtpNode[] {
  refreshRecoveredSmtpNodes(userId);
  const ws = store.getWorkspace(userId);
  const realNodes = ws.smtpPool.filter(
    (n) =>
      n.host?.trim() &&
      n.username?.trim() &&
      n.rawPassword &&
      n.rawPassword !== 'virtual_high_speed_secret'
  );
  if (realNodes.length === 0) return [];

  const activeIdx = realNodes.findIndex((n) => n.id === ws.activeSmtpId);
  const rotated =
    activeIdx > 0
      ? [...realNodes.slice(activeIdx), ...realNodes.slice(0, activeIdx)]
      : realNodes;

  // Try all 'ready' SMTPs in order starting from the active one
  return rotated.filter((n) => !n.status || n.status === 'ready');
}

function formatNodeTag(node: StoredSmtpNode): string {
  return node.label ? `${node.label} (${node.host})` : node.host;
}

export async function dispatchSingleEmail(payload: DispatchPayload): Promise<DispatchResult> {
  const start = Date.now();
  const uid = payload.userId || 'usr_geekytycoon';
  const ws = store.getWorkspace(uid);
  const personalizedSubject = interpolatePersonalization(payload.subject, payload.recipient);
  const content = buildEmailContent(payload);

  const hasConfiguredPool = ws.smtpPool.some(
    (n) => n.host?.trim() && n.username?.trim() && n.rawPassword && n.rawPassword !== 'virtual_high_speed_secret'
  );

  if (hasConfiguredPool) {
    const candidates = getOrderedReadySmtpCandidates(uid);

    if (candidates.length === 0) {
      const anyCooling = ws.smtpPool.some((n) => n.status === 'cooling_down');
      return {
        ok: false,
        smtpCode: anyCooling ? '451' : '550 5.4.5',
        errorMessage: anyCooling
          ? 'All plugged-in SMTP accounts are cooling down from temporary deferrals.'
          : 'All plugged-in SMTP accounts have reached their send limits or stopped.',
        failureKind: anyCooling ? 'deferred' : 'max_quota',
        latencyMs: Math.max(10, Date.now() - start),
      };
    }

    let firstStoppedLabel: string | undefined;
    let poolMutated = false;
    let lastClassification: ReturnType<typeof classifySmtpFailure> | null = null;
    let sawDeferred = false;

    for (let i = 0; i < candidates.length; i++) {
      const node = candidates[i];
      try {
        const transporter = getPooledTransporterForNode(uid, node);
        await transporter.sendMail({
          from: payload.fromName ? `"${payload.fromName}" <${payload.fromEmail}>` : payload.fromEmail,
          to: payload.recipient.firstName
            ? `"${payload.recipient.firstName}" <${payload.recipient.email}>`
            : payload.recipient.email,
          replyTo: payload.replyToEmail
            ? payload.replyToName
              ? `"${payload.replyToName}" <${payload.replyToEmail}>`
              : payload.replyToEmail
            : undefined,
          subject: personalizedSubject,
          text: content.text,
          html: content.html,
        });

        node.sentCount = (node.sentCount || 0) + 1;
        node.status = 'ready';
        node.statusReason = null;
        node.cooldownUntil = null;

        if (ws.activeSmtpId !== node.id) {
          ws.activeSmtpId = node.id;
          poolMutated = true;
        }
        store.syncActiveSmtpFromPool(uid);

        return {
          ok: true,
          smtpCode: '250 2.0.0 OK',
          latencyMs: Math.max(12, Date.now() - start),
          usedSmtpLabel: formatNodeTag(node),
          switchedFromLabel: firstStoppedLabel,
          switchedToLabel: firstStoppedLabel ? formatNodeTag(node) : undefined,
          poolMutated,
        };
      } catch (err) {
        const classified = classifySmtpFailure(err);
        lastClassification = classified;

        // If it's just a single invalid recipient email (550 user unknown), keep this SMTP active!
        if (classified.failureKind === 'bounce') {
          return {
            ok: false,
            smtpCode: classified.smtpCode,
            errorMessage: classified.errorMessage,
            failureKind: 'bounce',
            latencyMs: Math.max(20, Date.now() - start),
            usedSmtpLabel: formatNodeTag(node),
            poolMutated,
          };
        }

        // Otherwise, this SMTP stopped (deferred limit, max send quota, or server/auth error):
        // Mark it immediately and auto-switch to the next available SMTP in the loop!
        if (!firstStoppedLabel) {
          firstStoppedLabel = formatNodeTag(node);
        }
        poolMutated = true;

        if (classified.failureKind === 'deferred') {
          sawDeferred = true;
          node.status = 'cooling_down';
          node.cooldownUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
          node.statusReason = 'Deferred / hourly limit — cooling down 15m';
        } else if (classified.failureKind === 'max_quota') {
          node.status = 'quota_reached';
          node.cooldownUntil = null;
          node.statusReason = 'Maximum send limit reached';
        } else {
          node.status = 'error';
          node.cooldownUntil = null;
          node.statusReason = classified.errorMessage.slice(0, 100);
        }

        // Pre-advance activeSmtpId to the next ready node if available
        const nextReady = candidates[i + 1];
        if (nextReady) {
          ws.activeSmtpId = nextReady.id;
        }
        store.syncActiveSmtpFromPool(uid);
      }
    }

    // Every available SMTP in the pool stopped at once
    return {
      ok: false,
      smtpCode: lastClassification?.smtpCode || '451',
      errorMessage:
        lastClassification?.errorMessage ||
        'All plugged-in SMTP accounts hit their send limits or stopped.',
      failureKind: sawDeferred ? 'deferred' : 'max_quota',
      latencyMs: Math.max(25, Date.now() - start),
      poolMutated,
    };
  }

  // High-speed virtual cluster dispatch (for instant testing & 10,000/sec burst benchmarks without external spam)
  const emailLower = payload.recipient.email.toLowerCase();
  if (
    emailLower.includes('bounce') ||
    emailLower.includes('invalid') ||
    emailLower.endsWith('.invalid')
  ) {
    return {
      ok: false,
      smtpCode: '550 5.1.1',
      errorMessage: 'Recipient mailbox unavailable or rejected by remote MX policy.',
      latencyMs: 16,
    };
  }

  return {
    ok: true,
    smtpCode: '250 2.0.0 OK',
    latencyMs: 14,
  };
}

export async function sendAdminResetMagicLinkEmail(params: {
  toEmail: string;
  username: string;
  magicLink: string;
}): Promise<{ ok: boolean; configured: boolean; errorMessage?: string }> {
  const cfg = store.state.adminResetSmtp;
  if (!cfg.host?.trim() || !cfg.username?.trim() || !cfg.rawPassword) {
    return {
      ok: false,
      configured: false,
      errorMessage:
        'Reset Email SMTP is not configured yet. Set it up in /admin -> Reset Email SMTP.',
    };
  }

  const fromEmail = cfg.fromEmail?.trim() || cfg.username.trim();
  const fromName = cfg.fromName?.trim() || '234Mail';

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #0c1017; color: #f1f5f9; border-radius: 16px; border: 1px solid #1e293b;">
      <div style="font-size: 20px; font-weight: 800; margin-bottom: 16px;">
        <span style="color: #ffffff;">234</span><span style="color: #22d3ee;">Mail</span>
      </div>
      <h2 style="font-size: 18px; font-weight: 700; margin: 0 0 12px 0; color: #ffffff;">
        Reset Your Password
      </h2>
      <p style="font-size: 14px; line-height: 1.6; color: #cbd5e1; margin: 0 0 24px 0;">
        Hi <strong>${params.username}</strong>, click the magic link button below to choose a new password for your 234Mail account. This link expires in 60 minutes.
      </p>
      <div style="margin: 0 0 24px 0;">
        <a href="${params.magicLink}" style="display: inline-block; padding: 12px 24px; background: #22d3ee; color: #020617; font-weight: 700; font-size: 14px; text-decoration: none; border-radius: 10px;">
          Set New Password &rarr;
        </a>
      </div>
      <p style="font-size: 12px; line-height: 1.5; color: #94a3b8; margin: 0; word-break: break-all;">
        Or copy and paste this link into your browser:<br/>
        <a href="${params.magicLink}" style="color: #38bdf8;">${params.magicLink}</a>
      </p>
    </div>
  `.trim();

  const text = `Hi ${params.username},\n\nOpen this magic link to set a new password for your 234Mail account (expires in 60 minutes):\n${params.magicLink}`;

  try {
    const transporter = nodemailer.createTransport(
      buildTransportOptions({
        host: cfg.host.trim(),
        port: cfg.port || 587,
        encryption: cfg.encryption || 'tls',
        username: cfg.username.trim(),
        password: cfg.rawPassword,
      })
    );
    await transporter.sendMail({
      from: fromName ? `"${fromName}" <${fromEmail}>` : fromEmail,
      to: params.toEmail,
      subject: 'Reset your 234Mail password (Magic Link)',
      text,
      html,
    });
    return { ok: true, configured: true };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      errorMessage: err instanceof Error ? err.message : 'Failed to send magic link email via SMTP.',
    };
  }
}
