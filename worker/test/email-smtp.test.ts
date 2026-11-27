import { describe, expect, it } from 'vitest';
import { buildMimeMessage, encodeHeaderValue, sendSmtp, SmtpError, type SmtpWire } from '../src/core/email/smtp-client';

// Fake-wire protocol tests: the wire is a scripted server conversation, so the whole SMTP state
// machine (greeting, EHLO, STARTTLS upgrade, AUTH LOGIN, envelope, DATA, QUIT) runs without a socket.

/** Scripted server conversation: each send step optionally asserts the client line, then queues replies. */
const scriptedWire = (steps: Array<{ expect?: RegExp; reply: string[] }>): { wire: SmtpWire; sent: string[]; upgrades: number[] } => {
  const sent: string[] = [];
  const upgrades: number[] = [];
  const replies: string[] = [];
  let index = 0;
  // The server speaks first (the greeting); step 0 of every script is exactly that.
  replies.push(...(steps[0]?.reply ?? []));
  index = 1;
  const wire: SmtpWire = {
    send: (line) => {
      sent.push(line);
      const step = steps[index];
      if (step?.expect) expect(line.trimEnd()).toMatch(step.expect);
      if (step) replies.push(...step.reply);
      index += 1;
    },
    recvLine: async () => (replies.length ? (replies.shift() as string) : null),
    close: () => undefined,
    startTls: () => {
      upgrades.push(1);
      return wire;
    },
  };
  return { wire, sent, upgrades };
};

const MSG = { to: ['khach@example.com'], from: 'Shop <shop@example.com>', subject: 'Đánh giá đơn hàng', text: 'Plain body', html: '<p>Body</p>' };

describe('smtp client state machine', () => {
  it('sends AUTH LOGIN, envelope and DATA over STARTTLS (port 587)', async () => {
    const { wire, sent, upgrades } = scriptedWire([
      { reply: ['220 mx.example ESMTP'] },
      { expect: /^EHLO/, reply: ['250-mx.example', '250-STARTTLS', '250 AUTH LOGIN'] },
      { expect: /^STARTTLS$/, reply: ['220 Ready to start TLS'] },
      { expect: /^EHLO/, reply: ['250 mx.example'] },
      { expect: /^AUTH LOGIN$/, reply: ['334 VXNlcm5hbWU6'] },
      { reply: ['334 UGFzc3dvcmQ6'] },
      { reply: ['235 2.7.0 Accepted'] },
      { expect: /^MAIL FROM:<shop@example\.com>$/, reply: ['250 OK'] },
      { expect: /^RCPT TO:<khach@example\.com>$/, reply: ['250 OK'] },
      { expect: /^DATA$/, reply: ['354 End data with <CR><LF>.<CR><LF>'] },
      { reply: ['250 OK queued'] },
      { expect: /^QUIT$/, reply: ['221 Bye'] },
    ]);
    await sendSmtp({ host: 'smtp.example.com', port: 587, user: 'u', pass: 'p', openWire: async () => wire }, MSG);
    expect(upgrades).toHaveLength(1);
    const data = sent.find((line) => line.includes('Subject: '));
    expect(data).toContain('=?UTF-8?B?');
    expect(sent.join('')).toContain('multipart/alternative');
    expect(sent.join('')).toContain('Content-Type: text/plain; charset=UTF-8');
  });

  it('opens direct TLS on port 465 without STARTTLS or AUTH when no user', async () => {
    const { wire, sent, upgrades } = scriptedWire([
      { reply: ['220 mx.example ESMTP'] },
      { expect: /^EHLO/, reply: ['250 mx.example'] },
      { expect: /^MAIL FROM:/, reply: ['250 OK'] },
      { expect: /^RCPT TO:/, reply: ['250 OK'] },
      { expect: /^DATA$/, reply: ['354 Go'] },
      { reply: ['250 OK'] },
      { expect: /^QUIT$/, reply: ['221 Bye'] },
    ]);
    let secure: boolean | undefined;
    await sendSmtp(
      {
        host: 'smtp.example.com',
        port: 465,
        openWire: async (_host, _port, s) => {
          secure = s;
          return wire;
        },
      },
      MSG,
    );
    expect(secure).toBe(true);
    expect(upgrades).toHaveLength(0);
    expect(sent.some((line) => line.startsWith('AUTH'))).toBe(false);
  });

  it('raises SMTP_AUTH on a rejected password', async () => {
    const { wire } = scriptedWire([
      { reply: ['220 mx.example'] },
      { expect: /^EHLO/, reply: ['250 mx.example'] },
      { expect: /^STARTTLS$/, reply: ['220 Ready'] },
      { expect: /^EHLO/, reply: ['250 mx.example'] },
      { expect: /^AUTH LOGIN$/, reply: ['334 VXNlcm5hbWU6'] },
      { reply: ['334 UGFzc3dvcmQ6'] },
      { reply: ['535 Authentication failed'] },
    ]);
    const error = await sendSmtp({ host: 'h', port: 587, user: 'u', pass: 'bad', openWire: async () => wire }, MSG).catch((e) => e);
    expect(error).toBeInstanceOf(SmtpError);
    expect((error as SmtpError).code).toBe('SMTP_AUTH');
  });

  it('raises SMTP_SEND when RCPT is rejected', async () => {
    const { wire } = scriptedWire([
      { reply: ['220 mx.example'] },
      { expect: /^EHLO/, reply: ['250 mx.example'] },
      { expect: /^MAIL FROM:/, reply: ['250 OK'] },
      { expect: /^RCPT TO:/, reply: ['550 No such user'] },
    ]);
    const error = await sendSmtp({ host: 'h', port: 465, openWire: async () => wire }, MSG).catch((e) => e);
    expect((error as SmtpError).code).toBe('SMTP_SEND');
  });
});

describe('mime building', () => {
  it('encodes non-ASCII subjects as RFC 2047 UTF-8 encoded-word and leaves ASCII alone', () => {
    expect(encodeHeaderValue('Hello')).toBe('Hello');
    const encoded = encodeHeaderValue('Đánh giá đơn hàng của bạn');
    expect(encoded).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/);
    expect(Buffer.from(encoded.slice(10, -2), 'base64').toString('utf8')).toBe('Đánh giá đơn hàng của bạn');
  });

  it('builds multipart/alternative with text and html parts and dot-stuffs leading dots', () => {
    const mime = buildMimeMessage({ ...MSG, text: '.starts with dot' }, 'b');
    expect(mime).toContain('Content-Type: multipart/alternative; boundary="b"');
    expect(mime).toContain('Content-Type: text/plain; charset=UTF-8');
    expect(mime).toContain('Content-Type: text/html; charset=UTF-8');
    expect(mime).toContain('--b--');
  });
});
