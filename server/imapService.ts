import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import type { InboxMessage, InboxSyncInfo } from '../src/types.ts';
import { store } from './store.ts';

const OUTBOUND_ONLY_SMTP_PATTERNS = [
  'sendgrid.net',
  'mailgun.org',
  'brevo.com',
  'sendinblue.com',
  'amazonaws.com',
  'resend.com',
  'postmarkapp.com',
  'sparkpostmail.com',
  'smtp2go.com',
];

function isOutboundOnlyRelay(smtpHost: string): boolean {
  const lower = smtpHost.trim().toLowerCase();
  return OUTBOUND_ONLY_SMTP_PATTERNS.some((domain) => lower.includes(domain));
}

function resolveCandidateImapHosts(smtpHost: string, customImapHost?: string): string[] {
  const candidates = new Set<string>();
  const explicit = customImapHost?.trim().toLowerCase();
  if (explicit) {
    candidates.add(explicit);
  }

  const clean = smtpHost.trim().toLowerCase();
  if (!clean) return Array.from(candidates);

  if (clean.includes('gmail.com') || clean.includes('googlemail.com')) {
    candidates.add('imap.gmail.com');
    return Array.from(candidates);
  }
  if (
    clean.includes('outlook.com') ||
    clean.includes('office365.com') ||
    clean.includes('hotmail.com') ||
    clean.includes('live.com')
  ) {
    candidates.add('outlook.office365.com');
    candidates.add('imap-mail.outlook.com');
    return Array.from(candidates);
  }
  if (clean.includes('yahoo.com')) {
    candidates.add('imap.mail.yahoo.com');
    return Array.from(candidates);
  }
  if (clean.includes('zoho.')) {
    candidates.add(clean.replace(/^smtppro\./, 'imappro.').replace(/^smtp\./, 'imap.'));
    candidates.add('imap.zoho.com');
    candidates.add('imappro.zoho.com');
    return Array.from(candidates);
  }
  if (clean.includes('hostinger.com')) {
    candidates.add('imap.hostinger.com');
    return Array.from(candidates);
  }
  if (clean.includes('titan.email')) {
    candidates.add('imap.titan.email');
    return Array.from(candidates);
  }
  if (clean.includes('privateemail.com')) {
    candidates.add('mail.privateemail.com');
    return Array.from(candidates);
  }
  if (clean.includes('secureserver.net')) {
    candidates.add('imap.secureserver.net');
    return Array.from(candidates);
  }
  if (clean.includes('ionos.com')) {
    candidates.add('imap.ionos.com');
    return Array.from(candidates);
  }
  if (clean.includes('fastmail.com')) {
    candidates.add('imap.fastmail.com');
    return Array.from(candidates);
  }
  if (clean.includes('icloud.com') || clean.includes('mail.me.com')) {
    candidates.add('imap.mail.me.com');
    return Array.from(candidates);
  }
  if (clean.includes('yandex.')) {
    candidates.add('imap.yandex.com');
    return Array.from(candidates);
  }
  if (clean.includes('gmx.')) {
    candidates.add('imap.gmx.com');
    return Array.from(candidates);
  }
  if (clean.includes('aol.com')) {
    candidates.add('imap.aol.com');
    return Array.from(candidates);
  }
  if (clean.includes('emailsrvr.com')) {
    candidates.add('secure.emailsrvr.com');
    return Array.from(candidates);
  }

  // Custom domain / cPanel / Plesk / DirectAdmin mail servers:
  // Often the exact host itself (e.g. mail.domain.com or domain.com) IS the IMAP server on 993!
  if (clean.startsWith('smtp.')) {
    const base = clean.slice(5);
    candidates.add(`imap.${base}`);
    candidates.add(`mail.${base}`);
    candidates.add(base);
    candidates.add(clean);
  } else if (clean.startsWith('mail.')) {
    const base = clean.slice(5);
    candidates.add(clean);
    candidates.add(`imap.${base}`);
    candidates.add(base);
  } else {
    candidates.add(clean);
    candidates.add(`mail.${clean}`);
    candidates.add(`imap.${clean}`);
  }

  return Array.from(candidates);
}

function formatDate(d?: Date | string): string {
  const parsed = typeof d === 'string' ? new Date(d) : d;
  const target = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
  return target.toISOString().slice(0, 19).replace('T', ' ');
}

export async function syncInboxFromConfiguredSmtp(
  userId: string,
  requestedSmtpId?: string
): Promise<{
  inbox: InboxMessage[];
  inboxSync: InboxSyncInfo;
}> {
  const ws = store.getWorkspace(userId);
  const pool = ws.smtpPool;
  let targetNode = requestedSmtpId ? pool.find((n) => n.id === requestedSmtpId) : undefined;

  if (!targetNode && ws.inboxSmtpId) {
    targetNode = pool.find((n) => n.id === ws.inboxSmtpId);
  }
  if (!targetNode && pool.length > 0) {
    targetNode = pool.find((n) => n.id === ws.activeSmtpId) || pool[0];
  }

  const s = targetNode || ws.smtp;
  const previousSmtpId = ws.inboxSync.smtpId;
  const switchedAccount = Boolean(targetNode && previousSmtpId && targetNode.id !== previousSmtpId);

  if (targetNode) {
    ws.inboxSmtpId = targetNode.id;
  }

  const nowStr = formatDate();

  const isPlaceholderAccount =
    !s.username.trim() ||
    !s.rawPassword ||
    s.rawPassword === 'virtual_high_speed_secret';

  if (isPlaceholderAccount) {
    if (switchedAccount) {
      ws.inbox = [];
    }
    const syncInfo: InboxSyncInfo = {
      smtpId: targetNode?.id,
      smtpLabel: targetNode?.label,
      connectedAccount: s.username || '',
      sourceHost: s.host || '',
      isLiveSmtpAccount: false,
      lastSyncedAt: nowStr,
      lastError:
        'Enter and save your real SMTP Host, Username, and Password in SMTP Settings to load live incoming emails from your mail account.',
    };
    ws.inboxSync = syncInfo;
    store.scheduleSave();
    return {
      inbox: ws.inbox,
      inboxSync: syncInfo,
    };
  }

  const customImap = s.imapHost?.trim() || '';
  if (!customImap && isOutboundOnlyRelay(s.host)) {
    if (switchedAccount) {
      ws.inbox = [];
    }
    const relayNotice: InboxSyncInfo = {
      smtpId: s.id,
      smtpLabel: s.label,
      connectedAccount: s.username,
      sourceHost: s.host,
      isLiveSmtpAccount: true,
      lastSyncedAt: nowStr,
      lastError: `${s.host} is an outbound-only SMTP relay (it sends emails, but does not store an incoming mailbox). To view incoming mail here, enter your mailbox's IMAP Host (e.g. imap.gmail.com or mail.yourdomain.com) in SMTP Settings.`,
    };
    ws.inboxSync = relayNotice;
    store.scheduleSave();
    return {
      inbox: ws.inbox,
      inboxSync: relayNotice,
    };
  }

  const candidateHosts = resolveCandidateImapHosts(s.host, customImap);
  let lastConnectError = 'Could not reach mail server inbox.';

  // Try IMAPS (993) across candidates first (fastest & universal), then port 143 fallback
  const attempts: { host: string; port: number; secure: boolean }[] = [];
  const preferredPort = s.imapPort && s.imapPort !== 993 ? s.imapPort : 993;

  if (customImap && preferredPort !== 993) {
    attempts.push({
      host: customImap.toLowerCase(),
      port: preferredPort,
      secure: preferredPort === 993,
    });
  }
  for (const h of candidateHosts) {
    attempts.push({ host: h, port: 993, secure: true });
  }
  for (const h of candidateHosts.slice(0, 2)) {
    attempts.push({ host: h, port: 143, secure: false });
  }

  for (const target of attempts) {
    const client = new ImapFlow({
      host: target.host,
      port: target.port,
      secure: target.secure,
      auth: {
        user: s.username.trim(),
        pass: s.rawPassword,
      },
      tls: {
        rejectUnauthorized: false,
      },
      logger: false,
      connectionTimeout: 4500,
      greetingTimeout: 4500,
    });

    // Prevent unhandled 'error' events on ImapFlow socket teardown
    client.on('error', () => {});

    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      const fetchedMessages: InboxMessage[] = [];

      try {
        const mailboxStatus = client.mailbox;
        const totalExists =
          mailboxStatus && typeof mailboxStatus === 'object' ? mailboxStatus.exists : 0;

        if (totalExists > 0) {
          const startSeq = Math.max(1, totalExists - 49);
          const range = `${startSeq}:*`;

          const decodeHtmlEntities = (str: string): string =>
            str
              .replace(/&nbsp;/gi, ' ')
              .replace(/&amp;/gi, '&')
              .replace(/&lt;/gi, '<')
              .replace(/&gt;/gi, '>')
              .replace(/&quot;/gi, '"')
              .replace(/&#39;|&apos;/gi, "'");

          const htmlToReadableText = (rawHtml: string): string =>
            decodeHtmlEntities(
              rawHtml
                .replace(/<!--[\s\S]*?-->/g, '')
                .replace(/<style[\s\S]*?<\/style>/gi, '')
                .replace(/<script[\s\S]*?<\/script>/gi, '')
                .replace(/<head[\s\S]*?<\/head>/gi, '')
                .replace(/<\s*br\s*\/?>/gi, '\n')
                .replace(/<\/\s*(p|div|tr|li|h[1-6]|blockquote|section|article|header|footer|pre)\s*>/gi, '\n')
                .replace(/<[^>]+>/g, '')
            )
              .replace(/\r\n/g, '\n')
              .replace(/[ \t]+\n/g, '\n')
              .replace(/\n{3,}/g, '\n\n')
              .trim();

          const escapeHtml = (str: string): string =>
            str
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;');

          for await (const msg of client.fetch(range, {
            uid: true,
            flags: true,
            envelope: true,
            source: true,
            internalDate: true,
          })) {
            try {
              const parsed = msg.source
                ? await simpleParser(msg.source, {
                    keepCidLinks: false,
                  })
                : null;
              const fromEntry = parsed?.from?.value?.[0] || msg.envelope?.from?.[0];
              const toEntry = parsed?.to
                ? Array.isArray(parsed.to)
                  ? parsed.to[0]?.value?.[0]
                  : parsed.to.value?.[0]
                : msg.envelope?.to?.[0];

              const fromEmail =
                (fromEntry && 'address' in fromEntry && fromEntry.address) || 'unknown@sender';
              const fromName =
                (fromEntry && 'name' in fromEntry && fromEntry.name) || fromEmail.split('@')[0];
              const toEmail =
                (toEntry && 'address' in toEntry && toEntry.address) || s.username;
              const subject = parsed?.subject || msg.envelope?.subject || '(No Subject)';

              const rawHtml = typeof parsed?.html === 'string' ? parsed.html.trim() : '';
              const plainFromHtml = rawHtml ? htmlToReadableText(rawHtml) : '';
              let textContent =
                typeof parsed?.text === 'string' && parsed.text.trim()
                  ? parsed.text.replace(/\r\n/g, '\n').trim()
                  : plainFromHtml;

              // If HTML version contains markedly more text than a truncated plain-text alternative, keep full text
              if (plainFromHtml.length > textContent.length + 120) {
                textContent = plainFromHtml;
              }

              // Extract inline MIME report / delivery-status / forwarded rfc822 sections so bounces & multipart emails are never cut short
              const extraSections: string[] = [];
              const fileAttachmentLabels: string[] = [];

              if (Array.isArray(parsed?.attachments)) {
                for (const att of parsed.attachments) {
                  const ct = (att.contentType || '').toLowerCase();
                  const isDiagnosticOrInlineText =
                    ct.includes('delivery-status') ||
                    ct.includes('disposition-notification') ||
                    ct.includes('rfc822-headers') ||
                    ct === 'message/rfc822' ||
                    ((ct === 'text/plain' || ct === 'text/rfc822') && !att.filename);

                  if (isDiagnosticOrInlineText && Buffer.isBuffer(att.content)) {
                    const extraText = att.content.toString('utf-8').replace(/\r\n/g, '\n').trim();
                    if (extraText && !textContent.includes(extraText.slice(0, 80))) {
                      extraSections.push(extraText);
                    }
                  } else if (att.filename && !att.cid) {
                    const kb = Math.max(1, Math.round((att.size || att.content?.length || 0) / 1024));
                    fileAttachmentLabels.push(`${att.filename} (${kb} KB)`);
                  }
                }
              }

              if (extraSections.length > 0) {
                textContent = [textContent, ...extraSections].filter(Boolean).join('\n\n--- Additional Message Details ---\n');
              }
              if (fileAttachmentLabels.length > 0) {
                textContent = [
                  textContent,
                  `Attachments: ${fileAttachmentLabels.join(', ')}`,
                ]
                  .filter(Boolean)
                  .join('\n\n');
              }

              let htmlBody: string | undefined = rawHtml || undefined;
              // If htmlBody is only a tiny partial fragment compared to textContent (e.g. bounce report or signature-only HTML), append the missing text so HTML view shows everything
              if (
                htmlBody &&
                textContent.length > plainFromHtml.length + 80 &&
                plainFromHtml.length < textContent.length * 0.65
              ) {
                const supplemental =
                  extraSections.length > 0 ? extraSections.join('\n\n') : textContent;
                htmlBody = `${htmlBody}<hr style="margin:20px 0;border:0;border-top:1px solid #e2e8f0;"/><pre style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.6;white-space:pre-wrap;word-break:break-word;color:#334155;background:#f8fafc;padding:12px;border-radius:8px;">${escapeHtml(supplemental)}</pre>`;
              }

              const snippet = textContent.replace(/\s+/g, ' ').trim().slice(0, 140);
              const isSeen = msg.flags ? msg.flags.has('\\Seen') : true;
              const lowerSub = subject.toLowerCase();
              const lowerFrom = fromEmail.toLowerCase();

              const category: InboxMessage['category'] =
                lowerFrom.includes('mailer-daemon') ||
                lowerFrom.includes('postmaster') ||
                lowerSub.includes('undelivered') ||
                lowerSub.includes('delivery status') ||
                lowerSub.includes('failure')
                  ? 'bounce'
                  : lowerSub.startsWith('re:')
                    ? 'reply'
                    : 'transactional';

              fetchedMessages.push({
                id: `imap_${s.id}_${target.host}_${msg.uid}`,
                fromName,
                fromEmail,
                toEmail,
                subject,
                snippet,
                body: textContent || '(Empty message)',
                htmlBody,
                receivedAt: formatDate(
                  parsed?.date ||
                    msg.envelope?.date ||
                    (msg.internalDate instanceof Date ? msg.internalDate : undefined)
                ),
                unread: !isSeen,
                category,
              });
            } catch {
              // Skip individual malformed MIME message rather than aborting entire mailbox sync
            }
          }
        }
      } finally {
        lock.release();
      }

      await client.logout().catch(() => {});

      fetchedMessages.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));

      s.imapPort = target.port;
      ws.inbox = fetchedMessages;

      const syncInfo: InboxSyncInfo = {
        smtpId: s.id,
        smtpLabel: s.label,
        connectedAccount: s.username,
        sourceHost: `${target.host}:${target.port}`,
        isLiveSmtpAccount: true,
        lastSyncedAt: nowStr,
        lastError: null,
      };
      ws.inboxSync = syncInfo;
      store.persistSync();

      return {
        inbox: fetchedMessages,
        inboxSync: syncInfo,
      };
    } catch (err) {
      lastConnectError = err instanceof Error ? err.message : 'Mail server connection failed';
      await client.logout().catch(() => {});
    }
  }

  if (switchedAccount) {
    ws.inbox = [];
  }

  const failedSync: InboxSyncInfo = {
    smtpId: s.id,
    smtpLabel: s.label,
    connectedAccount: s.username,
    sourceHost: customImap || candidateHosts[0] || s.host,
    isLiveSmtpAccount: true,
    lastSyncedAt: nowStr,
    lastError: `Could not load Inbox from ${customImap || candidateHosts[0] || s.host} (${lastConnectError}). Check that IMAP is enabled on your mail account or enter your provider's IMAP Host in SMTP Settings.`,
  };
  ws.inboxSync = failedSync;
  store.persistSync();

  return {
    inbox: ws.inbox,
    inboxSync: failedSync,
  };
}
