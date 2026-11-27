import { sendSmtp, SmtpError, type SmtpMessage } from './smtp-client';
import type { ReviewRequestConfig } from './review-request-config';

// One EmailSender per configured backend. 'smtp' (Gmail app-password or any generic host) goes through
// the TCP socket client; 'resend' and 'sendgrid' are plain HTTPS APIs through the injected fetch
// (injectable in tests). Secrets are AES-256-GCM encrypted at rest (TokenEncryptionService shape) and
// only opened here, at send time, through the injected opener.

export type OutboundEmail = SmtpMessage;

export type EmailSender = {
  send: (msg: OutboundEmail) => Promise<void>;
};

/** Opens an encrypted-at-rest secret to plaintext at send time; identity when the value was stored unencrypted. */
export type SecretOpener = (stored: string) => string;

class HttpApiError extends Error {
  constructor(
    readonly backend: string,
    readonly status: number,
    detail: string,
  ) {
    super(`${backend} API ${status}: ${detail.slice(0, 200)}`);
    this.name = 'HttpApiError';
  }
}

const readBodySnippet = async (response: Response): Promise<string> => {
  try {
    return await response.text();
  } catch {
    return '';
  }
};

const smtpSender = (config: ReviewRequestConfig, openSecret: SecretOpener): EmailSender | null => {
  const smtp = config.smtp;
  if (!smtp || !smtp.host || !smtp.port || !smtp.from_email) return null;
  const port = smtp.port;
  return {
    send: (msg) =>
      sendSmtp(
        {
          host: smtp.host,
          port,
          user: smtp.user || undefined,
          pass: smtp.pass ? openSecret(smtp.pass) : undefined,
          tls: smtp.tls === 'tls' ? 'tls' : 'starttls',
        },
        { ...msg, from: msg.from || smtp.from_email },
      ),
  };
};

const resendSender = (config: ReviewRequestConfig, openSecret: SecretOpener, fetcher: typeof fetch): EmailSender | null => {
  if (!config.api_key || !config.from_email) return null;
  const apiKey = openSecret(config.api_key);
  const from = config.from_email;
  return {
    send: async (msg) => {
      const response = await fetcher('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html }),
      });
      if (!response.ok) throw new HttpApiError('resend', response.status, await readBodySnippet(response));
    },
  };
};

const sendgridSender = (config: ReviewRequestConfig, openSecret: SecretOpener, fetcher: typeof fetch): EmailSender | null => {
  if (!config.api_key || !config.from_email) return null;
  const apiKey = openSecret(config.api_key);
  const from = config.from_email;
  return {
    send: async (msg) => {
      const response = await fetcher('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: msg.to.map((email) => ({ email })) }],
          from: { email: from },
          subject: msg.subject,
          content: [
            { type: 'text/plain', value: msg.text },
            { type: 'text/html', value: msg.html },
          ],
        }),
      });
      if (!response.ok) throw new HttpApiError('sendgrid', response.status, await readBodySnippet(response));
    },
  };
};

/**
 * Builds the sender for the shop's config, or null when the config cannot send (disabled, unknown
 * backend, or missing credentials). Failure to build is permanent for that run — the caller marks
 * the email 'failed' rather than retrying a misconfiguration.
 */
export const resolveEmailSender = (
  config: ReviewRequestConfig,
  openSecret: SecretOpener,
  fetcher: typeof fetch,
): EmailSender | null => {
  if (!config.enabled) return null;
  switch (config.backend) {
    case 'smtp':
      return smtpSender(config, openSecret);
    case 'resend':
      return resendSender(config, openSecret, fetcher);
    case 'sendgrid':
      return sendgridSender(config, openSecret, fetcher);
    default:
      return null;
  }
};

export { SmtpError };
