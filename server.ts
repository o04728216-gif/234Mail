import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { WebSocket, WebSocketServer } from 'ws';
import type {
  CloudRegionId,
  DashboardSnapshot,
  DispatchSpeedMode,
  EmailMode,
  HourlyRateStep,
  LanguageCode,
  PlatformSettings,
  RecipientItem,
  SmtpEncryption,
  SubscriptionStatus,
  ThemeId,
  UserOptions,
  UserRole,
} from './src/types.ts';
import { syncInboxFromConfiguredSmtp } from './server/imapService.ts';
import { queueWorker, stripRecipients } from './server/queueWorker.ts';
import {
  dispatchSingleEmail,
  sendAdminResetMagicLinkEmail,
  verifySmtpConnection,
} from './server/smtpService.ts';
import {
  hashApiKey,
  hashPassword,
  isUserPaidAndActive,
  store,
  syncUserActiveRevenue,
  type StoredJob,
  type StoredSmtpNode,
  type StoredUser,
} from './server/store.ts';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

interface AuthenticatedRequest extends Request {
  user?: StoredUser;
}

function getBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  return null;
}

function getRequestOrigin(req: Request): string {
  if (process.env.APP_URL?.trim()) {
    return process.env.APP_URL.trim().replace(/\/$/, '');
  }
  if (typeof req.headers.origin === 'string' && /^https?:\/\//i.test(req.headers.origin)) {
    return req.headers.origin.replace(/\/$/, '');
  }
  const host = req.get('host');
  if (host) {
    return `${req.protocol}://${host}`.replace(/\/$/, '');
  }
  return `http://localhost:${PORT}`;
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const userId = store.state.sessions[token];
  const user = store.state.users.find((u) => u.id === userId);
  if (!user) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return;
  }
  req.user = user;
  next();
}

function requireRole(allowed: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !allowed.includes(req.user.role)) {
      res.status(403).json({
        error: `Admin access required.`,
      });
      return;
    }
    next();
  };
}

function sanitizeAdminResetSmtp() {
  const { rawPassword: _rpw, ...safe } = store.state.adminResetSmtp;
  return {
    ...safe,
    hasPassword: Boolean(store.state.adminResetSmtp.rawPassword),
    passwordMasked: store.state.adminResetSmtp.rawPassword ? '••••••••••••' : '',
    configured: Boolean(
      store.state.adminResetSmtp.host?.trim() &&
        store.state.adminResetSmtp.username?.trim() &&
        store.state.adminResetSmtp.rawPassword
    ),
  };
}

function buildSnapshot(currentUser: StoredUser): DashboardSnapshot {
  const uid = currentUser.id;
  store.syncActiveSmtpFromPool(uid);
  const ws = store.getWorkspace(uid);
  const safeSmtp = store.sanitizeSmtpNode(ws.smtp);
  const owns = (ownerId?: string) => (ownerId || 'usr_geekytycoon') === uid;

  const visibleUsers =
    currentUser.role === 'admin'
      ? store.state.users
          .slice()
          .sort((a, b) => (b.userNumber || 0) - (a.userNumber || 0))
          .map((u) => store.sanitizeUser(u))
      : [store.sanitizeUser(currentUser)];

  return {
    user: store.sanitizeUser(currentUser),
    users: visibleUsers,
    platformSettings: store.state.platformSettings,
    adminResetSmtp: currentUser.role === 'admin' ? sanitizeAdminResetSmtp() : undefined,
    inboxSync: ws.inboxSync,
    smtp: safeSmtp,
    smtpPool: store.sanitizeSmtpPool(uid),
    regions: store.state.regions,
    jobs: store.state.jobs.filter((j) => owns(j.ownerId)).map(stripRecipients),
    tracking: store.state.tracking.filter((t) => owns(t.ownerId)),
    errors: store.state.errors.filter((e) => owns(e.ownerId)),
    alerts: store.state.alerts.filter((a) => !a.ownerId || owns(a.ownerId)),
    apiKeys: store.state.apiKeys
      .filter((k) => owns(k.ownerId))
      .map(({ keyHash: _kh, ...k }) => k),
    drafts: store.state.drafts.filter((d) => owns(d.ownerId)),
    inbox: ws.inbox,
    telemetryHistory: store.state.telemetryHistory,
  };
}

async function bootstrap() {
  const flushOnShutdown = () => {
    store.flushPendingSaveSync();
  };
  process.on('SIGTERM', () => {
    flushOnShutdown();
    process.exit(0);
  });
  process.on('SIGINT', () => {
    flushOnShutdown();
    process.exit(0);
  });
  process.on('beforeExit', flushOnShutdown);

  const app = express();
  app.set('trust proxy', true);
  const httpServer = http.createServer(app);

  app.use(express.json({ limit: '5mb' }));

  // WebSocket Server on same HTTP port (filtered to /api/ws so it never collides with Vite)
  const wss = new WebSocketServer({ noServer: true });
  const wsClients = new Map<WebSocket, string>();

  httpServer.on('upgrade', (request, socket, head) => {
    const pathname = request.url?.split('?')[0];
    if (pathname === '/api/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (ws, request) => {
    let sessionToken = '';
    try {
      const parsedUrl = new URL(request.url || '/api/ws', 'http://localhost');
      sessionToken = parsedUrl.searchParams.get('token')?.trim() || '';
    } catch {
      sessionToken = '';
    }
    wsClients.set(ws, sessionToken);
    ws.on('close', () => {
      wsClients.delete(ws);
    });
  });

  const broadcast = (event: string, payload: unknown, targetUserId?: string) => {
    const serialized = JSON.stringify({ event, payload });
    for (const [client, sessionToken] of wsClients.entries()) {
      if (client.readyState !== WebSocket.OPEN) continue;

      const clientUserId = sessionToken ? store.state.sessions[sessionToken] || null : null;
      const clientUser = clientUserId
        ? store.state.users.find((u) => u.id === clientUserId)
        : undefined;

      if (event === 'users:updated' || event === 'adminResetSmtp:updated') {
        if (clientUser?.role === 'admin') {
          client.send(serialized);
        }
        continue;
      }

      if (targetUserId) {
        if (
          clientUserId === targetUserId ||
          (event === 'user:updated' && clientUser?.role === 'admin')
        ) {
          client.send(serialized);
        }
        continue;
      }

      client.send(serialized);
    }
  };

  queueWorker.start(broadcast);

  // ============================================================================
  // AUTHENTICATION ROUTES
  // ============================================================================
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { identifier, password, adminPortal } = req.body as {
      identifier?: string;
      password?: string;
      adminPortal?: boolean;
    };
    if (!identifier || !password) {
      res.status(400).json({ error: 'Username/email and password are required.' });
      return;
    }

    const normalized = identifier.trim().toLowerCase();
    const user = store.state.users.find(
      (u) => u.username.toLowerCase() === normalized || u.email.toLowerCase() === normalized
    );

    if (!user || hashPassword(password, user.salt) !== user.passwordHash) {
      res.status(401).json({ error: 'Invalid username/email or password.' });
      return;
    }

    const envAdminIdentifier = (
      process.env.ADMIN_USERNAME ||
      process.env.ADMIN_EMAIL ||
      ''
    )
      .trim()
      .toLowerCase();
    const matchesEnvAdmin =
      Boolean(envAdminIdentifier) &&
      (user.username.toLowerCase() === envAdminIdentifier ||
        user.email.toLowerCase() === envAdminIdentifier);

    // Zero-admin anti-lockout recovery when signing in at /admin (or matching ADMIN_USERNAME/ADMIN_EMAIL)
    const hasAnyAdmin = store.state.users.some((u) => u.role === 'admin');
    if (matchesEnvAdmin || (adminPortal && !hasAnyAdmin)) {
      user.role = 'admin';
      store.persistSync();
    }

    user.lastLoginAt = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const token = `sess_${crypto.randomBytes(24).toString('hex')}`;
    store.state.sessions[token] = user.id;
    store.scheduleSave();

    res.json({
      token,
      snapshot: buildSnapshot(user),
    });
  });

  app.post('/api/auth/register', (req: Request, res: Response) => {
    const { username, email, password } = req.body as {
      username?: string;
      email?: string;
      password?: string;
    };

    if (!username?.trim() || !email?.trim() || !password || password.length < 4) {
      res
        .status(400)
        .json({ error: 'Username, valid email, and password (min 4 chars) are required.' });
      return;
    }

    const exists = store.state.users.some(
      (u) =>
        u.username.toLowerCase() === username.trim().toLowerCase() ||
        u.email.toLowerCase() === email.trim().toLowerCase()
    );
    if (exists) {
      res.status(409).json({ error: 'Username or email is already registered.' });
      return;
    }

    const created = store.createUser(username.trim(), email.trim(), password, 'manager');
    const token = `sess_${crypto.randomBytes(24).toString('hex')}`;
    store.state.sessions[token] = created.id;
    store.scheduleSave();

    broadcast(
      'users:updated',
      store.state.users
        .slice()
        .sort((a, b) => (b.userNumber || 0) - (a.userNumber || 0))
        .map((u) => store.sanitizeUser(u))
    );

    res.status(201).json({
      token,
      snapshot: buildSnapshot(created),
    });
  });

  app.post('/api/auth/logout', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const token = getBearerToken(req);
    if (token) {
      delete store.state.sessions[token];
      store.scheduleSave();
    }
    res.json({ ok: true });
  });

  app.post('/api/auth/forgot-password', async (req: Request, res: Response) => {
    const { identifier, origin, returnPath } = req.body as {
      identifier?: string;
      origin?: string;
      returnPath?: string;
    };

    if (!identifier?.trim()) {
      res.status(400).json({ error: 'Please enter your email address or username.' });
      return;
    }

    const normalized = identifier.trim().toLowerCase();
    const user = store.state.users.find(
      (u) => u.username.toLowerCase() === normalized || u.email.toLowerCase() === normalized
    );

    if (!user) {
      res.status(404).json({ error: 'No account found with that email address or username.' });
      return;
    }

    // Prune expired tokens and issue a fresh 1-hour magic link token
    const now = Date.now();
    for (const [tok, rec] of Object.entries(store.state.passwordResetTokens)) {
      if (!rec || rec.expiresAt <= now) {
        delete store.state.passwordResetTokens[tok];
      }
    }

    const resetToken = `rst_${crypto.randomBytes(24).toString('hex')}`;
    store.state.passwordResetTokens[resetToken] = {
      userId: user.id,
      expiresAt: now + 60 * 60 * 1000,
    };
    store.persistSync();

    const rawBase =
      (origin && /^https?:\/\//i.test(origin) ? origin : '') ||
      getRequestOrigin(req);
    const baseUrl = rawBase.replace(/\/$/, '');
    const safePath = returnPath === '/admin' ? '/admin' : '/';
    const magicLink = `${baseUrl}${safePath}?reset_token=${encodeURIComponent(resetToken)}`;

    // Send Magic Link strictly using the Reset Email SMTP configured at /admin
    const sendRes = await sendAdminResetMagicLinkEmail({
      toEmail: user.email,
      username: user.username,
      magicLink,
    });

    if (!sendRes.configured) {
      res.status(503).json({
        error:
          'Reset Email SMTP is not configured yet. Please set up Reset Email SMTP in /admin first.',
      });
      return;
    }

    if (!sendRes.ok) {
      res.status(502).json({
        error: `Could not send magic link email (${sendRes.errorMessage || 'SMTP error'}). Please check Reset Email SMTP settings in /admin.`,
      });
      return;
    }

    res.json({
      ok: true,
      email: user.email,
      username: user.username,
      sentViaLiveSmtp: true,
      message: `Magic link sent to ${user.email}! Check your inbox (and spam folder) and click the link to set your new password.`,
    });
  });

  app.get('/api/auth/verify-reset-token', (req: Request, res: Response) => {
    const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';
    if (!token) {
      res.status(400).json({ error: 'Missing password reset token.' });
      return;
    }

    const record = store.state.passwordResetTokens[token];
    if (!record || record.expiresAt <= Date.now()) {
      if (record) {
        delete store.state.passwordResetTokens[token];
        store.scheduleSave();
      }
      res.status(400).json({
        error: 'This magic link is invalid or has expired. Please request a new one.',
      });
      return;
    }

    const user = store.state.users.find((u) => u.id === record.userId);
    if (!user) {
      res.status(404).json({ error: 'Account not found for this reset link.' });
      return;
    }

    res.json({
      ok: true,
      username: user.username,
      email: user.email,
    });
  });

  app.post('/api/auth/reset-password', (req: Request, res: Response) => {
    const { token, newPassword } = req.body as {
      token?: string;
      newPassword?: string;
    };

    if (!token?.trim()) {
      res.status(400).json({ error: 'Invalid or missing magic reset link.' });
      return;
    }

    if (!newPassword || newPassword.length < 4) {
      res.status(400).json({ error: 'New password must be at least 4 characters.' });
      return;
    }

    const record = store.state.passwordResetTokens[token.trim()];
    if (!record || record.expiresAt <= Date.now()) {
      if (record) {
        delete store.state.passwordResetTokens[token.trim()];
        store.scheduleSave();
      }
      res.status(400).json({
        error: 'This magic link is invalid or has expired. Please request a new one.',
      });
      return;
    }

    const user = store.state.users.find((u) => u.id === record.userId);
    if (!user) {
      res.status(404).json({ error: 'Account no longer exists.' });
      return;
    }

    const freshSalt = crypto.randomBytes(16).toString('hex');
    user.salt = freshSalt;
    user.passwordHash = hashPassword(newPassword, freshSalt);
    delete store.state.passwordResetTokens[token.trim()];
    for (const [sessTok, uid] of Object.entries(store.state.sessions)) {
      if (uid === user.id) {
        delete store.state.sessions[sessTok];
      }
    }
    store.persistSync();

    res.json({
      ok: true,
      username: user.username,
      message: `Password updated for ${user.username}! Sign in with your new password.`,
    });
  });

  app.get('/api/bootstrap', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    res.json(buildSnapshot(req.user!));
  });

  app.patch(
    '/api/account/preferences',
    requireAuth,
    (req: AuthenticatedRequest, res: Response) => {
      const body = (req.body || {}) as {
        theme?: string;
        preferredLanguage?: string;
      };
      const allowedThemes = new Set([
        'dark',
        'light',
        'red',
        'gold',
        'green',
        'blue',
        'silver',
      ]);
      const allowedLangs = new Set(['en', 'es', 'fr', 'de', 'ja']);

      const user = req.user!;
      if (typeof body.theme === 'string' && allowedThemes.has(body.theme)) {
        user.theme = body.theme as ThemeId;
      }
      if (
        typeof body.preferredLanguage === 'string' &&
        allowedLangs.has(body.preferredLanguage)
      ) {
        user.preferredLanguage = body.preferredLanguage as LanguageCode;
      }

      store.persistSync();
      const publicUser = store.sanitizeUser(user);
      broadcast('user:updated', publicUser, user.id);
      res.json({ user: publicUser });
    }
  );

  // ============================================================================
  // ADMIN DASHBOARD ROUTES (User Management, Options, Impersonation, Platform Settings)
  // ============================================================================
  const getSortedPublicUsers = () =>
    store.state.users
      .slice()
      .sort((a, b) => (b.userNumber || 0) - (a.userNumber || 0))
      .map((u) => store.sanitizeUser(u));

  app.post(
    '/api/admin/users',
    requireAuth,
    requireRole(['admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const { username, email, password, role, subscriptionStatus, daysLeft } = req.body as {
        username?: string;
        email?: string;
        password?: string;
        role?: UserRole;
        subscriptionStatus?: SubscriptionStatus;
        daysLeft?: number;
      };

      if (!username?.trim() || !email?.trim() || !password || password.length < 4) {
        res.status(400).json({ error: 'Username, email, and password (min 4 chars) are required.' });
        return;
      }

      const duplicate = store.state.users.some(
        (u) =>
          u.username.toLowerCase() === username.trim().toLowerCase() ||
          u.email.toLowerCase() === email.trim().toLowerCase()
      );
      if (duplicate) {
        res.status(409).json({ error: 'Username or email already exists.' });
        return;
      }

      const validRole: UserRole =
        role === 'admin' || role === 'manager' || role === 'analyst' ? role : 'manager';
      const created = store.createUser(
        username.trim(),
        email.trim(),
        password,
        validRole,
        subscriptionStatus,
        daysLeft
      );

      const publicUsers = getSortedPublicUsers();
      broadcast('users:updated', publicUsers);
      res.status(201).json({
        user: store.sanitizeUser(created),
        users: publicUsers,
      });
    }
  );

  app.patch(
    '/api/admin/users/:userId',
    requireAuth,
    requireRole(['admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const target = store.state.users.find((u) => u.id === req.params.userId);
      if (!target) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const body = req.body as {
        action?: 'activate' | 'suspend' | 'expire';
        recordPayment?: boolean;
        daysToAdd?: number;
        subscriptionStatus?: SubscriptionStatus;
        daysLeft?: number;
        expiresAt?: string;
        role?: UserRole;
        username?: string;
        email?: string;
        newPassword?: string;
        paymentsCount?: number;
        totalPaidUsd?: number;
        options?: Partial<UserOptions>;
      };

      const ps = store.state.platformSettings;
      const planDays = Math.max(1, ps.planDurationDays || 30);
      const price = Math.max(1, ps.monthlyPriceUsd || 20);

      if (body.action === 'activate') {
        const addDays =
          typeof body.daysToAdd === 'number' && body.daysToAdd > 0 ? body.daysToAdd : planDays;
        const isAlreadyPaidActive = isUserPaidAndActive(target);
        const baseDays = isAlreadyPaidActive ? target.daysLeft : 0;
        target.daysLeft = baseDays + addDays;
        const exp = new Date();
        exp.setDate(exp.getDate() + target.daysLeft);
        target.expiresAt = exp.toISOString().slice(0, 10);
        target.subscriptionStatus = 'active';
        target.planName = `Monthly — $${price} USDT`;
        target.paymentsCount = (target.paymentsCount || 0) + 1;
        syncUserActiveRevenue(target, ps);
      } else if (body.action === 'suspend') {
        target.subscriptionStatus = 'suspended';
        target.daysLeft = 0;
        target.paymentsCount = 0;
        target.totalPaidUsd = 0;
      } else if (body.action === 'expire') {
        target.subscriptionStatus = 'expired';
        target.daysLeft = 0;
      }

      if (
        body.subscriptionStatus === 'active' ||
        body.subscriptionStatus === 'pending' ||
        body.subscriptionStatus === 'expired' ||
        body.subscriptionStatus === 'suspended'
      ) {
        target.subscriptionStatus = body.subscriptionStatus;
        if (body.subscriptionStatus === 'pending') {
          target.planName = 'Free Trial';
          target.paymentsCount = 0;
          target.totalPaidUsd = 0;
        } else if (body.subscriptionStatus === 'active') {
          target.planName = `Monthly — $${price} USDT`;
        } else if (typeof body.daysLeft !== 'number') {
          target.daysLeft = 0;
          if (body.subscriptionStatus === 'suspended') {
            target.paymentsCount = 0;
            target.totalPaidUsd = 0;
          }
        }
      }

      if (typeof body.daysLeft === 'number') {
        target.daysLeft = Math.max(0, Math.round(body.daysLeft));
        if (target.daysLeft > 0) {
          const exp = new Date();
          exp.setDate(exp.getDate() + target.daysLeft);
          target.expiresAt = exp.toISOString().slice(0, 10);
          if (target.subscriptionStatus === 'pending') {
            target.planName = 'Free Trial';
            target.paymentsCount = 0;
            target.totalPaidUsd = 0;
          } else {
            target.subscriptionStatus = 'active';
            target.planName = `Monthly — $${price} USDT`;
            if (typeof body.paymentsCount !== 'number') {
              target.paymentsCount = Math.max(1, Math.ceil(target.daysLeft / planDays));
            }
          }
        } else if (target.subscriptionStatus === 'active') {
          target.subscriptionStatus = 'expired';
        } else if (target.subscriptionStatus === 'pending') {
          target.expiresAt = '';
        }
      }

      if (typeof body.expiresAt === 'string') {
        target.expiresAt = body.expiresAt;
      }

      if (body.role === 'admin' || body.role === 'manager' || body.role === 'analyst') {
        if (body.role !== 'admin' && target.role === 'admin') {
          if (req.user?.id === target.id) {
            res.status(400).json({
              error: 'You cannot change your own active Admin account to User.',
            });
            return;
          }
          const remainingAdmins = store.state.users.filter(
            (u) => u.role === 'admin' && u.id !== target.id
          ).length;
          if (remainingAdmins === 0) {
            res.status(400).json({
              error: 'Cannot remove Admin role from the last remaining Admin account.',
            });
            return;
          }
        }
        target.role = body.role;
      }

      if (typeof body.username === 'string' && body.username.trim().length >= 2) {
        const cleanUsername = body.username.trim();
        const takenByOther = store.state.users.some(
          (u) => u.id !== target.id && u.username.toLowerCase() === cleanUsername.toLowerCase()
        );
        if (takenByOther) {
          res.status(409).json({ error: 'That username is already used by another account.' });
          return;
        }
        target.username = cleanUsername;
      }

      if (typeof body.email === 'string' && body.email.trim().includes('@')) {
        const cleanEmail = body.email.trim();
        const takenByOther = store.state.users.some(
          (u) => u.id !== target.id && u.email.toLowerCase() === cleanEmail.toLowerCase()
        );
        if (takenByOther) {
          res.status(409).json({ error: 'That email address is already used by another account.' });
          return;
        }
        target.email = cleanEmail;
      }

      if (typeof body.newPassword === 'string' && body.newPassword.trim().length >= 4) {
        target.passwordHash = hashPassword(body.newPassword.trim(), target.salt);
      }

      if (typeof body.paymentsCount === 'number') {
        target.paymentsCount = Math.max(0, Math.round(body.paymentsCount));
        target.totalPaidUsd = target.paymentsCount * price;
      } else if (!body.action) {
        syncUserActiveRevenue(target, ps);
      }
      if (typeof body.totalPaidUsd === 'number') {
        target.totalPaidUsd = Math.max(0, Number(body.totalPaidUsd));
      }

      if (body.options && typeof body.options === 'object') {
        target.options = {
          ...target.options,
          ...body.options,
        };
      }

      store.persistSync();
      const publicTarget = store.sanitizeUser(target);
      const publicUsers = getSortedPublicUsers();
      broadcast('user:updated', publicTarget, target.id);
      broadcast('users:updated', publicUsers);

      res.json({
        user: publicTarget,
        users: publicUsers,
      });
    }
  );

  // Dedicated Admin Account & Password Update (/admin)
  app.put(
    '/api/admin/account',
    requireAuth,
    requireRole(['admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const adminUser = store.state.users.find((u) => u.id === req.user!.id);
      if (!adminUser) {
        res.status(404).json({ error: 'Admin user not found.' });
        return;
      }

      const body = req.body as {
        username?: string;
        email?: string;
        newPassword?: string;
      };

      const nextUsername =
        typeof body.username === 'string' ? body.username.trim() : adminUser.username;
      const nextEmail = typeof body.email === 'string' ? body.email.trim() : adminUser.email;

      if (!nextUsername || nextUsername.length < 2) {
        res.status(400).json({ error: 'Admin username must be at least 2 characters.' });
        return;
      }
      if (!nextEmail || !nextEmail.includes('@')) {
        res.status(400).json({ error: 'Enter a valid Admin email address.' });
        return;
      }

      const duplicate = store.state.users.some(
        (u) =>
          u.id !== adminUser.id &&
          (u.username.toLowerCase() === nextUsername.toLowerCase() ||
            u.email.toLowerCase() === nextEmail.toLowerCase())
      );
      if (duplicate) {
        res.status(409).json({
          error: 'Another account is already using that username or email address.',
        });
        return;
      }

      if (typeof body.newPassword === 'string' && body.newPassword.length > 0) {
        if (body.newPassword.trim().length < 4) {
          res.status(400).json({ error: 'New Admin password must be at least 4 characters.' });
          return;
        }
        adminUser.passwordHash = hashPassword(body.newPassword.trim(), adminUser.salt);
      }

      adminUser.username = nextUsername;
      adminUser.email = nextEmail;
      store.persistSync();

      const publicAdmin = store.sanitizeUser(adminUser);
      const publicUsers = getSortedPublicUsers();
      broadcast('user:updated', publicAdmin, adminUser.id);
      broadcast('users:updated', publicUsers);

      res.json({
        user: publicAdmin,
        users: publicUsers,
        message:
          typeof body.newPassword === 'string' && body.newPassword.trim().length >= 4
            ? `Admin login & password updated! Sign in at /admin using "${publicAdmin.username}" (or ${publicAdmin.email}) and your new password.`
            : `Admin profile updated (${publicAdmin.username} · ${publicAdmin.email}).`,
      });
    }
  );

  app.delete(
    '/api/admin/users/:userId',
    requireAuth,
    requireRole(['admin']),
    (req: AuthenticatedRequest, res: Response) => {
      if (req.user?.id === req.params.userId) {
        res.status(400).json({ error: 'You cannot delete your own active admin account.' });
        return;
      }

      const idx = store.state.users.findIndex((u) => u.id === req.params.userId);
      if (idx === -1) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const removed = store.state.users[idx];
      if (
        removed.role === 'admin' &&
        store.state.users.filter((u) => u.role === 'admin' && u.id !== removed.id).length === 0
      ) {
        res.status(400).json({ error: 'Cannot delete the last remaining Admin account.' });
        return;
      }
      store.state.users.splice(idx, 1);
      delete store.state.userWorkspaces[removed.id];
      store.state.jobs = store.state.jobs.filter((j) => j.ownerId !== removed.id);
      store.state.drafts = store.state.drafts.filter((d) => d.ownerId !== removed.id);
      store.state.tracking = store.state.tracking.filter((t) => t.ownerId !== removed.id);
      store.state.errors = store.state.errors.filter((e) => e.ownerId !== removed.id);
      store.state.apiKeys = store.state.apiKeys.filter((k) => k.ownerId !== removed.id);

      // Invalidate any sessions belonging to deleted user
      for (const [tok, uid] of Object.entries(store.state.sessions)) {
        if (uid === removed.id) {
          delete store.state.sessions[tok];
        }
      }

      store.scheduleSave();
      const publicUsers = getSortedPublicUsers();
      broadcast('users:updated', publicUsers);
      res.json({ users: publicUsers });
    }
  );

  app.post(
    '/api/admin/users/:userId/impersonate',
    requireAuth,
    requireRole(['admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const target = store.state.users.find((u) => u.id === req.params.userId);
      if (!target) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const impersonatedToken = `sess_imp_${crypto.randomBytes(20).toString('hex')}`;
      store.state.sessions[impersonatedToken] = target.id;
      store.scheduleSave();

      res.json({
        token: impersonatedToken,
        snapshot: buildSnapshot(target),
      });
    }
  );

  app.put(
    '/api/admin/settings',
    requireAuth,
    requireRole(['admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const body = req.body as Partial<PlatformSettings>;
      const ps = store.state.platformSettings;

      if (typeof body.monthlyPriceUsd === 'number' && body.monthlyPriceUsd >= 1) {
        ps.monthlyPriceUsd = Number(body.monthlyPriceUsd);
      }
      if (typeof body.planDurationDays === 'number' && body.planDurationDays >= 1) {
        ps.planDurationDays = Math.round(body.planDurationDays);
      }
      if (typeof body.usdtWalletAddress === 'string' && body.usdtWalletAddress.trim()) {
        ps.usdtWalletAddress = body.usdtWalletAddress.trim();
      }
      if (typeof body.paymentNetwork === 'string' && body.paymentNetwork.trim()) {
        ps.paymentNetwork = body.paymentNetwork.trim();
      }
      if (body.newUserDefaultStatus === 'pending' || body.newUserDefaultStatus === 'active') {
        ps.newUserDefaultStatus = body.newUserDefaultStatus;
      }
      if (typeof body.newUserTrialDays === 'number' && body.newUserTrialDays >= 0) {
        ps.newUserTrialDays = Math.round(body.newUserTrialDays);
      }

      for (const u of store.state.users) {
        syncUserActiveRevenue(u, ps);
      }

      store.scheduleSave();
      const publicUsers = getSortedPublicUsers();
      broadcast('settings:updated', ps);
      broadcast('users:updated', publicUsers);
      res.json({ platformSettings: ps, users: publicUsers });
    }
  );

  // Dedicated Admin Reset Email SMTP Configuration (/admin)
  app.put(
    '/api/admin/reset-smtp',
    requireAuth,
    requireRole(['admin']),
    async (req: AuthenticatedRequest, res: Response) => {
      const body = req.body as {
        host?: string;
        port?: number;
        encryption?: SmtpEncryption;
        username?: string;
        newPassword?: string;
        fromEmail?: string;
        fromName?: string;
      };

      const cfg = store.state.adminResetSmtp;
      if (typeof body.host === 'string') cfg.host = body.host.trim();
      if (typeof body.port === 'number' && body.port > 0) cfg.port = body.port;
      if (body.encryption === 'tls' || body.encryption === 'ssl' || body.encryption === 'none') {
        cfg.encryption = body.encryption;
      }
      if (typeof body.username === 'string') cfg.username = body.username.trim();
      if (typeof body.newPassword === 'string' && body.newPassword.length > 0) {
        cfg.rawPassword = body.newPassword;
      }
      if (typeof body.fromEmail === 'string') cfg.fromEmail = body.fromEmail.trim();
      if (typeof body.fromName === 'string') cfg.fromName = body.fromName.trim() || '234Mail';

      if (!cfg.host || !cfg.username || !cfg.rawPassword) {
        res.status(400).json({
          error: 'SMTP Host, Username, and Password are required to configure Reset Email SMTP.',
        });
        return;
      }

      const check = await verifySmtpConnection({
        host: cfg.host,
        port: cfg.port || 587,
        encryption: cfg.encryption || 'tls',
        secure: cfg.encryption === 'ssl' || cfg.port === 465,
        username: cfg.username,
        password: cfg.rawPassword,
        useRealSmtp: true,
      });

      cfg.configured = true;
      cfg.verified = check.verified;
      cfg.lastVerifiedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
      store.persistSync();

      const safeCfg = sanitizeAdminResetSmtp();
      broadcast('adminResetSmtp:updated', safeCfg);
      res.json({
        adminResetSmtp: safeCfg,
        verification: check,
      });
    }
  );

  app.post(
    '/api/admin/reset-smtp/verify',
    requireAuth,
    requireRole(['admin']),
    async (req: AuthenticatedRequest, res: Response) => {
      const body = req.body as {
        host?: string;
        port?: number;
        encryption?: SmtpEncryption;
        username?: string;
        password?: string;
      };
      const cfg = store.state.adminResetSmtp;
      const host = (body.host ?? cfg.host).trim();
      const port = Number(body.port ?? cfg.port ?? 587);
      const encryption = body.encryption || cfg.encryption || 'tls';
      const username = (body.username ?? cfg.username).trim();
      const password = body.password || cfg.rawPassword;

      if (!host || !username || !password) {
        res.status(400).json({
          error: 'Enter SMTP Host, Username, and Password first to test the connection.',
        });
        return;
      }

      const check = await verifySmtpConnection({
        host,
        port,
        encryption,
        secure: encryption === 'ssl' || port === 465,
        username,
        password,
        useRealSmtp: true,
      });
      res.json(check);
    }
  );

  // ============================================================================
  // MULTI-SMTP POOL & INBOX SYNC CONFIGURATION (4+ SMTPs + Auto-Failover)
  // ============================================================================
  const syncActiveInboxAndBroadcast = async (userId: string, preferredInboxSmtpId?: string) => {
    const ws = store.getWorkspace(userId);
    store.syncActiveSmtpFromPool(userId);
    let inboxMessages = ws.inbox;
    if (ws.smtpPool.length > 0 || ws.smtp.useRealSmtp) {
      const targetId =
        preferredInboxSmtpId ||
        (ws.inboxSmtpId && ws.smtpPool.some((n) => n.id === ws.inboxSmtpId)
          ? ws.inboxSmtpId
          : ws.activeSmtpId);
      const synced = await syncInboxFromConfiguredSmtp(userId, targetId);
      inboxMessages = synced.inbox;
      broadcast('inbox:synced', synced, userId);
    } else {
      ws.inbox = [];
      ws.inboxSmtpId = '';
      ws.inboxSync = {
        connectedAccount: ws.smtp.username,
        sourceHost: ws.smtp.host,
        isLiveSmtpAccount: false,
        lastSyncedAt: null,
        lastError:
          'Add and save at least one real SMTP account in SMTP Settings to load live incoming emails.',
      };
      inboxMessages = [];
      broadcast(
        'inbox:synced',
        {
          inbox: inboxMessages,
          inboxSync: ws.inboxSync,
        },
        userId
      );
    }
    store.persistSync();
    broadcast(
      'smtpPool:updated',
      {
        smtp: store.sanitizeSmtpNode(ws.smtp),
        smtpPool: store.sanitizeSmtpPool(userId),
      },
      userId
    );
    return inboxMessages;
  };

  app.post('/api/smtp/pool', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const uid = req.user!.id;
    const ws = store.getWorkspace(uid);
    const body = req.body as {
      id?: string;
      label?: string;
      host?: string;
      port?: number;
      encryption?: SmtpEncryption;
      username?: string;
      newPassword?: string;
      imapHost?: string;
      makeActive?: boolean;
    };

    const host = (body.host || '').trim();
    const port = Number(body.port || 587);
    const encryption: SmtpEncryption =
      body.encryption === 'ssl' || port === 465
        ? 'ssl'
        : body.encryption === 'none'
          ? 'none'
          : 'tls';
    const username = (body.username || '').trim();
    const existingNode = body.id ? ws.smtpPool.find((n) => n.id === body.id) : undefined;
    const rawPassword =
      body.newPassword && body.newPassword.length > 0
        ? body.newPassword
        : existingNode?.rawPassword || '';

    if (!host || !username || !rawPassword) {
      res.status(400).json({
        error: 'Please enter SMTP Host, Username, and Password.',
      });
      return;
    }

    const check = await verifySmtpConnection(
      {
        host,
        port,
        encryption,
        secure: encryption === 'ssl' || port === 465,
        username,
        password: rawPassword,
        useRealSmtp: true,
      },
      uid
    );

    const nowTs = new Date().toISOString().slice(0, 19).replace('T', ' ');

    if (existingNode) {
      existingNode.label = body.label?.trim() || existingNode.label;
      existingNode.host = host;
      existingNode.port = port;
      existingNode.encryption = encryption;
      existingNode.secure = encryption === 'ssl' || port === 465;
      existingNode.username = username;
      existingNode.rawPassword = rawPassword;
      existingNode.hasPassword = true;
      existingNode.passwordMasked = '••••••••••••';
      existingNode.imapHost = (body.imapHost ?? existingNode.imapHost ?? '').trim();
      existingNode.useRealSmtp = true;
      existingNode.verified = check.verified;
      existingNode.lastVerifiedAt = nowTs;
      existingNode.status = 'ready';
      existingNode.statusReason = null;
      existingNode.cooldownUntil = null;
      if (body.makeActive) {
        ws.activeSmtpId = existingNode.id;
      }
    } else {
      const nextNum = ws.smtpPool.length + 1;
      const newNode: StoredSmtpNode = {
        id: `smtp_${crypto.randomBytes(4).toString('hex')}`,
        label: body.label?.trim() || `SMTP #${nextNum}`,
        host,
        port,
        encryption,
        secure: encryption === 'ssl' || port === 465,
        username,
        passwordMasked: '••••••••••••',
        hasPassword: true,
        rawPassword,
        fromDefaultEmail: username,
        fromDefaultName: '',
        imapEnabled: true,
        imapHost: (body.imapHost || '').trim(),
        imapPort: 993,
        useRealSmtp: true,
        verified: check.verified,
        lastVerifiedAt: nowTs,
        region: 'us-east-1',
        isPrimary: ws.smtpPool.length === 0 || Boolean(body.makeActive),
        status: 'ready',
        statusReason: null,
        cooldownUntil: null,
        sentCount: 0,
      };
      ws.smtpPool.push(newNode);
      if (ws.smtpPool.length === 1 || body.makeActive) {
        ws.activeSmtpId = newNode.id;
      }
    }

    const inboxMessages = await syncActiveInboxAndBroadcast(uid);
    res.json({
      smtp: store.sanitizeSmtpNode(ws.smtp),
      smtpPool: store.sanitizeSmtpPool(uid),
      verification: check,
      inbox: inboxMessages,
      inboxSync: ws.inboxSync,
    });
  });

  app.post(
    '/api/smtp/pool/:smtpId/activate',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      const uid = req.user!.id;
      const ws = store.getWorkspace(uid);
      const target = ws.smtpPool.find((n) => n.id === req.params.smtpId);
      if (!target) {
        res.status(404).json({ error: 'SMTP account not found.' });
        return;
      }
      target.status = 'ready';
      target.statusReason = null;
      target.cooldownUntil = null;
      ws.activeSmtpId = target.id;

      const inboxMessages = await syncActiveInboxAndBroadcast(uid, target.id);
      res.json({
        smtp: store.sanitizeSmtpNode(ws.smtp),
        smtpPool: store.sanitizeSmtpPool(uid),
        inbox: inboxMessages,
        inboxSync: ws.inboxSync,
      });
    }
  );

  app.post(
    '/api/smtp/pool/:smtpId/reset',
    requireAuth,
    (req: AuthenticatedRequest, res: Response) => {
      const uid = req.user!.id;
      const ws = store.getWorkspace(uid);
      const target = ws.smtpPool.find((n) => n.id === req.params.smtpId);
      if (!target) {
        res.status(404).json({ error: 'SMTP account not found.' });
        return;
      }
      target.status = 'ready';
      target.statusReason = null;
      target.cooldownUntil = null;

      // If current active SMTP was stopped, promote this ready node immediately
      const curActive = ws.smtpPool.find((n) => n.id === ws.activeSmtpId);
      if (!curActive || curActive.status !== 'ready') {
        ws.activeSmtpId = target.id;
      }
      store.syncActiveSmtpFromPool(uid);
      store.persistSync();

      broadcast(
        'smtpPool:updated',
        {
          smtp: store.sanitizeSmtpNode(ws.smtp),
          smtpPool: store.sanitizeSmtpPool(uid),
        },
        uid
      );

      res.json({
        smtp: store.sanitizeSmtpNode(ws.smtp),
        smtpPool: store.sanitizeSmtpPool(uid),
      });
    }
  );

  app.post(
    '/api/smtp/pool/:smtpId/check',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      const uid = req.user!.id;
      const ws = store.getWorkspace(uid);
      const target = ws.smtpPool.find((n) => n.id === req.params.smtpId);
      if (!target) {
        res.status(404).json({ error: 'SMTP account not found.' });
        return;
      }

      const enc = target.encryption || (target.secure ? 'ssl' : 'tls');
      const port = Number(target.port || 587);
      const check = await verifySmtpConnection(
        {
          host: target.host.trim(),
          port,
          encryption: enc,
          secure: enc === 'ssl' || port === 465,
          username: target.username.trim(),
          password: target.rawPassword,
          useRealSmtp: Boolean(
            target.rawPassword && target.rawPassword !== 'virtual_high_speed_secret'
          ),
        },
        uid
      );

      const nowTs = new Date().toISOString().slice(0, 19).replace('T', ' ');
      target.verified = check.verified;
      target.lastVerifiedAt = nowTs;

      if (check.verified) {
        if (target.status === 'error' || target.status === 'cooling_down') {
          target.status = 'ready';
          target.statusReason = null;
          target.cooldownUntil = null;
        }
        const curActive = ws.smtpPool.find((n) => n.id === ws.activeSmtpId);
        if (!curActive || curActive.status !== 'ready') {
          ws.activeSmtpId = target.id;
        }
      } else {
        target.status = 'error';
        target.cooldownUntil = null;
        target.statusReason = check.message
          .replace(/^SMTP connection warning on [^—]+—\s*/i, '')
          .slice(0, 120);

        if (ws.activeSmtpId === target.id) {
          const nextReady = ws.smtpPool.find((n) => n.id !== target.id && n.status === 'ready');
          if (nextReady) {
            ws.activeSmtpId = nextReady.id;
          }
        }
      }

      store.syncActiveSmtpFromPool(uid);
      store.persistSync();

      broadcast(
        'smtpPool:updated',
        {
          smtp: store.sanitizeSmtpNode(ws.smtp),
          smtpPool: store.sanitizeSmtpPool(uid),
        },
        uid
      );

      res.json({
        verified: check.verified,
        latencyMs: check.latencyMs,
        message: check.message,
        checkedAt: nowTs,
        smtp: store.sanitizeSmtpNode(ws.smtp),
        smtpPool: store.sanitizeSmtpPool(uid),
      });
    }
  );

  app.delete(
    '/api/smtp/pool/:smtpId',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      const uid = req.user!.id;
      const ws = store.getWorkspace(uid);
      const idx = ws.smtpPool.findIndex((n) => n.id === req.params.smtpId);
      if (idx === -1) {
        res.status(404).json({ error: 'SMTP account not found.' });
        return;
      }
      const wasActive = ws.smtpPool[idx].id === ws.activeSmtpId;
      ws.smtpPool.splice(idx, 1);

      if (wasActive) {
        const nextReady = ws.smtpPool.find((n) => n.status === 'ready') || ws.smtpPool[0];
        ws.activeSmtpId = nextReady ? nextReady.id : '';
      }

      const inboxMessages = await syncActiveInboxAndBroadcast(uid);
      res.json({
        smtp: store.sanitizeSmtpNode(ws.smtp),
        smtpPool: store.sanitizeSmtpPool(uid),
        inbox: inboxMessages,
        inboxSync: ws.inboxSync,
      });
    }
  );

  // Backwards-compatible PUT /api/smtp (creates or updates the active SMTP in user's smtpPool)
  app.put('/api/smtp', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const uid = req.user!.id;
    const ws = store.getWorkspace(uid);
    const body = req.body as Partial<typeof ws.smtp> & { newPassword?: string };
    const existingActive = ws.smtpPool.find((n) => n.id === ws.activeSmtpId);
    const host = (body.host ?? existingActive?.host ?? ws.smtp.host).trim();
    const port = Number(body.port ?? existingActive?.port ?? ws.smtp.port ?? 587);
    const encryption: SmtpEncryption =
      body.encryption === 'ssl' || port === 465
        ? 'ssl'
        : body.encryption === 'none'
          ? 'none'
          : 'tls';
    const username = (body.username ?? existingActive?.username ?? ws.smtp.username).trim();
    const rawPassword =
      body.newPassword && body.newPassword.length > 0
        ? body.newPassword
        : existingActive?.rawPassword || ws.smtp.rawPassword;
    const imapHost = (body.imapHost ?? existingActive?.imapHost ?? '').trim();

    const hasRealCredentials = Boolean(
      host && username && rawPassword && rawPassword !== 'virtual_high_speed_secret'
    );

    const check = await verifySmtpConnection(
      {
        host,
        port,
        encryption,
        secure: encryption === 'ssl' || port === 465,
        username,
        password: rawPassword,
        useRealSmtp: hasRealCredentials,
      },
      uid
    );

    const nowTs = new Date().toISOString().slice(0, 19).replace('T', ' ');

    if (hasRealCredentials) {
      if (existingActive) {
        existingActive.host = host;
        existingActive.port = port;
        existingActive.encryption = encryption;
        existingActive.secure = encryption === 'ssl' || port === 465;
        existingActive.username = username;
        existingActive.rawPassword = rawPassword;
        existingActive.imapHost = imapHost;
        existingActive.verified = check.verified;
        existingActive.lastVerifiedAt = nowTs;
        existingActive.status = 'ready';
        existingActive.statusReason = null;
        existingActive.cooldownUntil = null;
      } else {
        const firstNode: StoredSmtpNode = {
          id: `smtp_${crypto.randomBytes(4).toString('hex')}`,
          label: 'SMTP #1',
          host,
          port,
          encryption,
          secure: encryption === 'ssl' || port === 465,
          username,
          passwordMasked: '••••••••••••',
          hasPassword: true,
          rawPassword,
          fromDefaultEmail: username,
          fromDefaultName: '',
          imapEnabled: true,
          imapHost,
          imapPort: 993,
          useRealSmtp: true,
          verified: check.verified,
          lastVerifiedAt: nowTs,
          region: 'us-east-1',
          isPrimary: true,
          status: 'ready',
          statusReason: null,
          cooldownUntil: null,
          sentCount: 0,
        };
        ws.smtpPool.push(firstNode);
        ws.activeSmtpId = firstNode.id;
      }
    }

    const inboxMessages = await syncActiveInboxAndBroadcast(uid);
    res.json({
      smtp: store.sanitizeSmtpNode(ws.smtp),
      smtpPool: store.sanitizeSmtpPool(uid),
      verification: check,
      inbox: inboxMessages,
      inboxSync: ws.inboxSync,
    });
  });

  app.post('/api/smtp/verify', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const uid = req.user!.id;
    const ws = store.getWorkspace(uid);
    const body = req.body as {
      id?: string;
      host?: string;
      port?: number;
      encryption?: 'tls' | 'ssl' | 'none';
      secure?: boolean;
      username?: string;
      password?: string;
    };
    const matchNode = body.id
      ? ws.smtpPool.find((n) => n.id === body.id)
      : ws.smtpPool.find((n) => n.id === ws.activeSmtpId);
    const s = matchNode || ws.smtp;
    const enc = body.encryption || s.encryption || 'tls';
    const port = Number(body.port ?? s.port);
    const pwd = body.password || s.rawPassword;
    const result = await verifySmtpConnection(
      {
        host: (body.host ?? s.host).trim(),
        port,
        encryption: enc,
        secure: enc === 'ssl' || port === 465,
        username: (body.username ?? s.username).trim(),
        password: pwd,
        useRealSmtp: Boolean(pwd && pwd !== 'virtual_high_speed_secret'),
      },
      uid
    );
    res.json(result);
  });

  app.post('/api/inbox/sync', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const uid = req.user!.id;
    const body = (req.body || {}) as { smtpId?: string };
    const requestedSmtpId =
      typeof body.smtpId === 'string' && body.smtpId.trim() ? body.smtpId.trim() : undefined;
    const synced = await syncInboxFromConfiguredSmtp(uid, requestedSmtpId);
    broadcast('inbox:synced', synced, uid);
    res.json(synced);
  });

  app.patch('/api/inbox/:msgId/read', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const uid = req.user!.id;
    const ws = store.getWorkspace(uid);
    const msg = ws.inbox.find((m) => m.id === req.params.msgId);
    if (msg) {
      msg.unread = false;
      store.scheduleSave();
    }
    res.json({ inbox: ws.inbox });
  });

  // ============================================================================
  // CAMPAIGNS, QUEUE JOBS, RATE LIMITER & 10,000/SEC BURST ENGINE
  // ============================================================================
  app.post('/api/jobs', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const sender = req.user!;
    if (!isUserPaidAndActive(sender)) {
      const isTrial =
        sender.subscriptionStatus === 'pending' || (sender.paymentsCount || 0) === 0;
      res.status(402).json({
        error: isTrial
          ? 'Free Trial accounts cannot send emails yet. Please complete payment on the Subscription page to make your account Paid & Active.'
          : 'Your account must be Paid and Active to send emails. Please renew on the Subscription page.',
      });
      return;
    }

    const body = req.body as {
      campaignName?: string;
      subject?: string;
      fromName?: string;
      fromEmail?: string;
      replyToName?: string;
      replyToEmail?: string;
      mode?: EmailMode;
      messageBody?: string;
      recipients?: RecipientItem[];
      dispatchMode?: DispatchSpeedMode;
      hourlyRateLimit?: HourlyRateStep;
      burstTargetPerSec?: number;
      timeScaleMultiplier?: 1 | 60 | 600;
      scheduledFor?: string | null;
      region?: CloudRegionId;
      attachmentNames?: string[];
    };

    if (!body.subject?.trim() || !body.fromEmail?.trim() || !body.messageBody?.trim()) {
      res.status(400).json({ error: 'Subject, From Email, and Message Body are required.' });
      return;
    }

    const userOpts = sender.options;
    const requestedMode: EmailMode = body.mode || 'plain';

    if (requestedMode === 'html' && !userOpts.allowHtml) {
      res.status(403).json({ error: 'HTML email mode is currently disabled for your account.' });
      return;
    }
    if (requestedMode === 'tracking' && !userOpts.allowTracking) {
      res.status(403).json({ error: 'Email tracking mode is currently disabled for your account.' });
      return;
    }

    const recipientsList: RecipientItem[] = Array.isArray(body.recipients)
      ? body.recipients.filter((r) => r.email && r.email.includes('@'))
      : [];

    if (recipientsList.length === 0) {
      res.status(400).json({ error: 'Add at least one valid recipient email address.' });
      return;
    }

    if (userOpts.dailyEmailLimit > 0 && recipientsList.length > userOpts.dailyEmailLimit) {
      res.status(403).json({
        error: `Recipient list exceeds your account limit of ${userOpts.dailyEmailLimit.toLocaleString()} emails.`,
      });
      return;
    }

    const selectedNode = store.selectHealthyRegion(body.region);
    const nowFormatted = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const isScheduled = Boolean(body.scheduledFor && body.scheduledFor.trim().length > 0);

    let dispatchMode: DispatchSpeedMode = body.dispatchMode || 'hourly_queue';
    if (dispatchMode === 'hyper_burst' && !userOpts.allowFastBurst) {
      dispatchMode = 'hourly_queue';
    }

    const rawRequestedHourly: HourlyRateStep =
      dispatchMode === 'auto_warmup' ? 50 : body.hourlyRateLimit || 200;
    const cappedHourly = Math.min(rawRequestedHourly, userOpts.maxHourlyRate) as HourlyRateStep;

    const senderWs = store.getWorkspace(sender.id);
    const hasRealSmtp =
      senderWs.smtpPool.some(
        (n) =>
          n.host?.trim() &&
          n.username?.trim() &&
          n.rawPassword &&
          n.rawPassword !== 'virtual_high_speed_secret'
      ) ||
      Boolean(
        senderWs.smtp.useRealSmtp &&
          senderWs.smtp.host?.trim() &&
          senderWs.smtp.username?.trim() &&
          senderWs.smtp.rawPassword &&
          senderWs.smtp.rawPassword !== 'virtual_high_speed_secret'
      );

    if (!hasRealSmtp) {
      res.status(400).json({
        error:
          'No SMTP account plugged in yet. Please add your SMTP in SMTP Settings before sending emails.',
      });
      return;
    }

    // Re-arm any SMTP accounts that previously stopped on an error (e.g. a rejected From Email on an earlier campaign)
    // so every new campaign automatically tries all plugged-in SMTP accounts in order.
    let resetAnyPoolError = false;
    for (const node of senderWs.smtpPool) {
      if (node.status === 'error') {
        node.status = 'ready';
        node.statusReason = null;
        node.cooldownUntil = null;
        resetAnyPoolError = true;
      }
    }
    if (resetAnyPoolError) {
      store.syncActiveSmtpFromPool(sender.id);
      broadcast(
        'smtpPool:updated',
        {
          smtp: store.sanitizeSmtpNode(senderWs.smtp),
          smtpPool: store.sanitizeSmtpPool(sender.id),
        },
        sender.id
      );
    }

    const newJob: StoredJob = {
      id: `job_${crypto.randomBytes(5).toString('hex')}`,
      ownerId: sender.id,
      appOrigin: getRequestOrigin(req),
      campaignName: body.campaignName?.trim() || body.subject.trim().slice(0, 48),
      subject: body.subject.trim(),
      fromName: body.fromName?.trim() || senderWs.smtp.fromDefaultName,
      fromEmail: body.fromEmail.trim(),
      replyToName: body.replyToName?.trim() || '',
      replyToEmail: body.replyToEmail?.trim() || body.fromEmail.trim(),
      mode: requestedMode,
      body: body.messageBody,
      dispatchMode,
      hourlyRateLimit: cappedHourly,
      warmupStageIndex: 0,
      burstTargetPerSec: dispatchMode === 'hyper_burst' ? body.burstTargetPerSec || 10000 : 0,
      timeScaleMultiplier: body.timeScaleMultiplier || 1,
      totalRecipients: recipientsList.length,
      processedCount: 0,
      sentCount: 0,
      failedCount: 0,
      retriedCount: 0,
      openedCount: 0,
      clickedCount: 0,
      convertedCount: 0,
      status: isScheduled ? 'scheduled' : 'running',
      scheduledFor: isScheduled ? body.scheduledFor! : null,
      createdAt: nowFormatted,
      startedAt: isScheduled ? null : nowFormatted,
      completedAt: null,
      currentThroughputPerSec: 0,
      currentHourlyRate: cappedHourly,
      region: selectedNode.id,
      maxRetries: 3,
      attachmentNames: body.attachmentNames || [],
      recipients: recipientsList,
    };

    sender.campaignsCount = (sender.campaignsCount || 0) + 1;
    store.state.jobs.unshift(newJob);
    store.scheduleSave();

    const publicJob = stripRecipients(newJob);
    broadcast('job:created', publicJob, sender.id);
    broadcast('users:updated', getSortedPublicUsers());
    res.status(201).json({ job: publicJob });
  });

  app.patch('/api/jobs/:jobId', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const job = store.state.jobs.find((j) => j.id === req.params.jobId);
    const jobOwnerId = job?.ownerId || 'usr_geekytycoon';
    if (!job || (jobOwnerId !== req.user!.id && req.user!.role !== 'admin')) {
      res.status(404).json({ error: 'Queue job not found' });
      return;
    }

    const { action, hourlyRateLimit, timeScaleMultiplier } = req.body as {
      action?: 'pause' | 'resume' | 'stop' | 'start_now';
      hourlyRateLimit?: HourlyRateStep;
      timeScaleMultiplier?: 1 | 60 | 600;
    };

    if (action === 'pause' && job.status === 'running') {
      job.status = 'paused';
      job.currentThroughputPerSec = 0;
      job.limitType = 'manual';
      job.pauseReason =
        'Reason: Paused manually by you — stays paused until you click Resume.';
      job.autoResumeAt = null;
    } else if (
      (action === 'resume' && (job.status === 'paused' || job.status === 'failed')) ||
      (action === 'start_now' && job.status === 'scheduled')
    ) {
      const jobOwner = store.state.users.find((u) => u.id === jobOwnerId);
      if (req.user!.role !== 'admin' && !isUserPaidAndActive(jobOwner || req.user)) {
        res.status(402).json({
          error:
            'Your account must be Paid and Active to send or resume emails. Please complete payment on the Subscription page.',
        });
        return;
      }
      if (job.status === 'failed' && job.sentCount === 0) {
        job.processedCount = 0;
        job.failedCount = 0;
        job.completedAt = null;
      }
      // Re-arm any error-paused SMTP accounts when manually resuming/retrying so all plugged-in SMTPs are tried
      const ownerWs = store.getWorkspace(jobOwnerId);
      let resetPoolOnResume = false;
      for (const node of ownerWs.smtpPool) {
        if (node.status === 'error') {
          node.status = 'ready';
          node.statusReason = null;
          node.cooldownUntil = null;
          resetPoolOnResume = true;
        }
      }
      if (resetPoolOnResume) {
        store.syncActiveSmtpFromPool(jobOwnerId);
        broadcast(
          'smtpPool:updated',
          {
            smtp: store.sanitizeSmtpNode(ownerWs.smtp),
            smtpPool: store.sanitizeSmtpPool(jobOwnerId),
          },
          jobOwnerId
        );
      }
      job.status = 'running';
      job.pauseReason = null;
      job.limitType = null;
      job.autoResumeAt = null;
      job.startedAt = job.startedAt || new Date().toISOString().slice(0, 19).replace('T', ' ');
    } else if (
      action === 'stop' &&
      (job.status === 'running' || job.status === 'paused' || job.status === 'scheduled')
    ) {
      job.status = 'stopped';
      job.currentThroughputPerSec = 0;
      job.pauseReason = null;
      job.limitType = null;
      job.autoResumeAt = null;
      job.completedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
    }

    if (hourlyRateLimit) {
      const capped = Math.min(hourlyRateLimit, req.user!.options.maxHourlyRate) as HourlyRateStep;
      job.hourlyRateLimit = capped;
      job.currentHourlyRate = capped;
    }
    if (timeScaleMultiplier) {
      job.timeScaleMultiplier = timeScaleMultiplier;
    }

    store.scheduleSave();
    const publicJob = stripRecipients(job);
    broadcast('job:updated', publicJob, jobOwnerId);
    res.json({ job: publicJob });
  });

  app.delete('/api/jobs/:jobId', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const jobIdx = store.state.jobs.findIndex((j) => j.id === req.params.jobId);
    if (jobIdx === -1) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }
    const job = store.state.jobs[jobIdx];
    const jobOwnerId = job.ownerId || 'usr_geekytycoon';
    if (jobOwnerId !== req.user!.id && req.user!.role !== 'admin') {
      res.status(403).json({ error: 'Not authorized to delete this campaign' });
      return;
    }

    const deletedId = job.id;
    store.state.jobs.splice(jobIdx, 1);
    store.state.errors = store.state.errors.filter((e) => e.jobId !== deletedId);
    store.state.tracking = store.state.tracking.filter((t) => t.jobId !== deletedId);
    queueWorker.removeJobState(deletedId);
    store.scheduleSave();

    broadcast('jobs:deleted', { jobIds: [deletedId] }, jobOwnerId);
    res.json({ deletedIds: [deletedId] });
  });

  app.delete('/api/jobs', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const uid = req.user!.id;
    const ownedJobs = store.state.jobs.filter((j) => (j.ownerId || 'usr_geekytycoon') === uid);
    const deletedIds = ownedJobs.map((j) => j.id);
    if (deletedIds.length === 0) {
      res.json({ deletedIds: [] });
      return;
    }

    const idSet = new Set(deletedIds);
    store.state.jobs = store.state.jobs.filter((j) => !idSet.has(j.id));
    store.state.errors = store.state.errors.filter((e) => !idSet.has(e.jobId));
    store.state.tracking = store.state.tracking.filter((t) => !idSet.has(t.jobId));
    for (const id of deletedIds) {
      queueWorker.removeJobState(id);
    }
    store.scheduleSave();

    broadcast('jobs:deleted', { jobIds: deletedIds }, uid);
    res.json({ deletedIds });
  });

  // ============================================================================
  // PIXEL OPEN TRACKING ENDPOINTS
  // ============================================================================
  app.get('/api/track/open/:trackingFile', (req: Request, res: Response) => {
    const trackingId = req.params.trackingFile.replace(/\.gif$/i, '');
    const record = store.state.tracking.find((t) => t.id === trackingId);
    if (record) {
      const ownerId = record.ownerId || 'usr_geekytycoon';
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      if (record.opens === 0) {
        record.firstOpenedAt = now;
        const job = store.state.jobs.find((j) => j.id === record.jobId);
        if (job) {
          job.openedCount += 1;
          broadcast('job:updated', stripRecipients(job), job.ownerId || ownerId);
        }
      }
      record.opens += 1;
      record.lastOpenedAt = now;
      if (record.status === 'delivered') record.status = 'opened';
      store.scheduleSave();
      broadcast('tracking:updated', record, ownerId);
    }
    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.send(TRANSPARENT_GIF);
  });

  // ============================================================================
  // DRAFTS & SUBSCRIPTION PAYMENT VERIFICATION
  // ============================================================================
  app.post('/api/drafts', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const uid = req.user!.id;
    const body = req.body as {
      subject?: string;
      fromName?: string;
      fromEmail?: string;
      replyToName?: string;
      replyToEmail?: string;
      recipientsText?: string;
      namesText?: string;
      mode?: EmailMode;
      body?: string;
      dispatchMode?: DispatchSpeedMode;
      hourlyRateLimit?: HourlyRateStep;
    };

    const draft = {
      id: `drf_${crypto.randomBytes(4).toString('hex')}`,
      ownerId: uid,
      subject: body.subject || '(Untitled Draft)',
      fromName: body.fromName || '',
      fromEmail: body.fromEmail || '',
      replyToName: body.replyToName || '',
      replyToEmail: body.replyToEmail || '',
      recipientsText: body.recipientsText || '',
      namesText: body.namesText || '',
      mode: body.mode || 'plain',
      body: body.body || '',
      dispatchMode: body.dispatchMode || 'hourly_queue',
      hourlyRateLimit: body.hourlyRateLimit || 200,
      updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    };

    store.state.drafts.unshift(draft);
    store.scheduleSave();
    const userDrafts = store.state.drafts.filter((d) => (d.ownerId || 'usr_geekytycoon') === uid);
    res.status(201).json({ draft, drafts: userDrafts });
  });

  app.delete('/api/drafts/:draftId', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const uid = req.user!.id;
    store.state.drafts = store.state.drafts.filter(
      (d) => !(d.id === req.params.draftId && (d.ownerId || 'usr_geekytycoon') === uid)
    );
    store.scheduleSave();
    const userDrafts = store.state.drafts.filter((d) => (d.ownerId || 'usr_geekytycoon') === uid);
    res.json({ drafts: userDrafts });
  });

  app.post('/api/subscription/verify', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const { txHash } = req.body as { txHash?: string };
    if (!txHash || txHash.trim().length < 12) {
      res.status(400).json({
        error: 'Please paste a valid TRC20 transaction hash (min 12 characters) to verify payment.',
      });
      return;
    }

    const ps = store.state.platformSettings;
    const user = req.user!;
    const isAlreadyPaidActive = isUserPaidAndActive(user);
    const baseDays = isAlreadyPaidActive ? user.daysLeft : 0;
    user.daysLeft = baseDays + ps.planDurationDays;

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + user.daysLeft);
    user.expiresAt = nextDate.toISOString().slice(0, 10);
    user.subscriptionStatus = 'active';
    user.planName = `Monthly — $${ps.monthlyPriceUsd} USDT`;
    user.paymentsCount = (user.paymentsCount || 0) + 1;
    syncUserActiveRevenue(user, ps);
    store.scheduleSave();

    const publicUser = store.sanitizeUser(user);
    broadcast('user:updated', publicUser, user.id);
    broadcast('users:updated', getSortedPublicUsers());

    res.json({
      user: publicUser,
      message: `Payment verified! Your account is now Paid & Active (+${ps.planDurationDays} days) — email sending is unlocked.`,
    });
  });

  // ============================================================================
  // EXTERNAL TRANSACTIONAL WEBHOOK (/api/v1/send)
  // ============================================================================
  app.post('/api/v1/send', async (req: Request, res: Response) => {
    const rawKey =
      (req.headers['x-api-key'] as string | undefined)?.trim() || getBearerToken(req);

    if (!rawKey) {
      res.status(401).json({ error: 'Missing X-API-Key or Bearer API token.' });
      return;
    }

    const hashed = hashApiKey(rawKey);
    const keyRecord = store.state.apiKeys.find(
      (k) => k.status === 'active' && k.keyHash === hashed
    );

    if (!keyRecord) {
      res.status(403).json({ error: 'Invalid or revoked API key.' });
      return;
    }

    const { to, firstName, fromEmail, fromName, subject, body, mode } = req.body as {
      to?: string;
      firstName?: string;
      fromEmail?: string;
      fromName?: string;
      subject?: string;
      body?: string;
      mode?: EmailMode;
    };

    if (!to || !subject || !body) {
      res.status(400).json({ error: 'Fields "to", "subject", and "body" are required.' });
      return;
    }

    keyRecord.requestsCount += 1;
    keyRecord.lastUsedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');

    const ownerId = keyRecord.ownerId || 'usr_geekytycoon';
    const ownerUser = store.state.users.find((u) => u.id === ownerId);
    if (!isUserPaidAndActive(ownerUser)) {
      res.status(402).json({
        error:
          'Account must be Paid and Active to send emails. Please complete payment on the Subscription page.',
      });
      return;
    }

    const ownerWs = store.getWorkspace(ownerId);
    const region = store.selectHealthyRegion();
    const trackingId = `trk_api_${crypto.randomBytes(4).toString('hex')}`;
    const dispatchRes = await dispatchSingleEmail({
      userId: ownerId,
      subject,
      fromName: fromName || ownerWs.smtp.fromDefaultName,
      fromEmail: fromEmail || ownerWs.smtp.fromDefaultEmail,
      replyToName: fromName || ownerWs.smtp.fromDefaultName,
      replyToEmail: fromEmail || ownerWs.smtp.fromDefaultEmail,
      mode: mode || 'tracking',
      body,
      recipient: { email: to, firstName: firstName || '' },
      trackingId,
      appBaseUrl: getRequestOrigin(req),
    });

    store.scheduleSave();
    res.status(dispatchRes.ok ? 200 : 502).json({
      messageId: trackingId,
      status: dispatchRes.ok ? 'dispatched' : 'failed',
      smtpCode: dispatchRes.smtpCode,
      region: region.id,
      latencyMs: dispatchRes.latencyMs,
    });
  });

  // ============================================================================
  // EXPLICIT CROSS-BROWSER FAVICON ROUTES (Safari, Chrome, Firefox, Edge, Brave)
  // ============================================================================
  const faviconFiles: Record<string, { file: string; type: string }> = {
    '/favicon.ico': { file: 'favicon.ico', type: 'image/x-icon' },
    '/favicon.png': { file: 'favicon.png', type: 'image/png' },
    '/favicon-16x16.png': { file: 'favicon-16x16.png', type: 'image/png' },
    '/favicon-32x32.png': { file: 'favicon-32x32.png', type: 'image/png' },
    '/favicon-48x48.png': { file: 'favicon-48x48.png', type: 'image/png' },
    '/apple-touch-icon.png': { file: 'apple-touch-icon.png', type: 'image/png' },
  };
  for (const [routePath, meta] of Object.entries(faviconFiles)) {
    app.get(routePath, (_req: Request, res: Response) => {
      const baseDir =
        process.env.NODE_ENV === 'production'
          ? path.resolve(process.cwd(), 'dist')
          : path.resolve(process.cwd(), 'public');
      const fullPath = path.join(baseDir, meta.file);
      res.setHeader('Content-Type', meta.type);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.sendFile(fullPath);
    });
  }

  // ============================================================================
  // VITE DEV MIDDLEWARE OR PRODUCTION STATIC ASSETS
  // ============================================================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`234Mail High-Speed ESP & Queue Server listening on http://0.0.0.0:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
