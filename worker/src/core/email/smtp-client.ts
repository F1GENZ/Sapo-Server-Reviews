import { connect } from 'cloudflare:sockets';

// Minimal SMTP client over the Workers TCP socket (`cloudflare:sockets`): port 465 opens TLS directly
// (secureTransport 'on'), port 587 starts plaintext and upgrades through STARTTLS (socket.startTls()).
// AUTH LOGIN only. The message is built as multipart/alternative (text + HTML), 8bit bodies, headers
// UTF-8 with RFC 2047 encoded-words where a value is not pure ASCII.
//
// The wire itself is a state machine over two callables (send/recvLine) so the protocol can be unit
// tested against a fake socket without the Workers runtime.

export type SmtpErrorCode = 'SMTP_CONNECT' | 'SMTP_AUTH' | 'SMTP_SEND';

export class SmtpError extends Error {
  constructor(
    readonly code: SmtpErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SmtpError';
  }
}

/** What the client needs from a socket: write a CRLF-terminated line and read one reply line. */
export type SmtpWire = {
  send: (line: string) => Promise<void> | void;
  /** Next CRLF-terminated line from the server; null on closed connection. */
  recvLine: () => Promise<string | null>;
  close: () => Promise<void> | void;
  /** Upgrades the wire to TLS (STARTTLS); returns the wire to keep using. */
  startTls?: () => Promise<SmtpWire> | SmtpWire;
};

export type SmtpMessage = {
  /** Bare envelope recipient(s). */
  to: string[];
  /** RFC 5322 From value, e.g. `"Shop" <shop@example.com>` or `shop@example.com`. */
  from: string;
  subject: string;
  text: string;
  html: string;
};

export type SmtpOptions = {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  /** 'tls' = direct TLS (465); 'starttls' = plaintext then STARTTLS (587). Default by port. */
  tls?: 'tls' | 'starttls';
  /** Injected for tests; default uses cloudflare:sockets. */
  openWire?: (host: string, port: number, secure: boolean) => Promise<SmtpWire>;
};

const CRLF = '\r\n';
const LINE_CAP = 64 * 1024;

const base64 = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

/** RFC 2047 encoded-word when the value carries non-ASCII; ASCII passes through quoted only when needed. */
export const encodeHeaderValue = (value: string): string => {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${base64(value)}?=`;
};

/** `Name <addr>` -> encoded display name; a bare address stays bare. */
const encodeAddress = (value: string): string => {
  const match = /^\s*([^<]*?)\s*<([^<>]+)>\s*$/.exec(value);
  if (!match) return encodeHeaderValue(value);
  const [, name, addr] = match;
  return name ? `${encodeHeaderValue(name)} <${addr}>` : `<${addr}>`;
};

const envelopeFrom = (from: string): string => {
  const match = /<([^<>]+)>/.exec(from);
  return match ? match[1] : from.trim();
};

/** dot-stuffing per RFC 5321 §4.5.2 */
const stuffDots = (body: string): string =>
  body
    .replace(/\r\n|\r|\n/g, CRLF)
    .split(CRLF)
    .map((line) => (line.startsWith('.') ? `.${line}` : line))
    .join(CRLF);

export const buildMimeMessage = (msg: SmtpMessage, boundary = `f1genz-${crypto.randomUUID().replaceAll('-', '')}`): string => {
  const headers = [
    `From: ${encodeAddress(msg.from)}`,
    `To: ${msg.to.map(encodeAddress).join(', ')}`,
    `Subject: ${encodeHeaderValue(msg.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const textPart = [`--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: 8bit', '', msg.text].join(CRLF);
  const htmlPart = [`--${boundary}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: 8bit', '', msg.html].join(CRLF);
  return [...headers, '', textPart, htmlPart, `--${boundary}--`, ''].join(CRLF);
};

type Reply = { code: number; text: string };

const readReply = async (wire: SmtpWire, stage: SmtpErrorCode): Promise<Reply> => {
  const lines: string[] = [];
  for (;;) {
    const line = await wire.recvLine();
    if (line === null) throw new SmtpError(stage, 'SMTP connection closed by server');
    lines.push(line);
    // Multiline replies carry '<code>-text' until the final '<code> text'.
    if (!/^\d{3}-/.test(line)) break;
  }
  const last = lines[lines.length - 1];
  const code = Number.parseInt(last.slice(0, 3), 10);
  if (!Number.isFinite(code)) throw new SmtpError(stage, `Malformed SMTP reply: ${last.slice(0, 80)}`);
  return { code, text: lines.join('\n') };
};

const command = async (wire: SmtpWire, stage: SmtpErrorCode, line: string | null, expect: readonly number[], what: string): Promise<Reply> => {
  if (line !== null) await wire.send(`${line}${CRLF}`);
  const reply = await readReply(wire, stage);
  if (!expect.includes(reply.code)) throw new SmtpError(stage, `${what} rejected: ${reply.text.split('\n')[0]}`);
  return reply;
};

const streamWire = (socket: Socket, serverHostname?: string): SmtpWire => {
  const reader = socket.readable.getReader();
  const writer = socket.writable.getWriter();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffered = '';
  const wire: SmtpWire = {
    send: async (line) => {
      await writer.write(encoder.encode(line));
    },
    recvLine: async () => {
      for (;;) {
        const idx = buffered.indexOf('\n');
        if (idx >= 0) {
          const line = buffered.slice(0, idx).replace(/\r$/, '');
          buffered = buffered.slice(idx + 1);
          return line;
        }
        const { value, done } = await reader.read();
        if (done) return buffered ? buffered : null;
        buffered += decoder.decode(value, { stream: true });
        if (buffered.length > LINE_CAP) throw new SmtpError('SMTP_CONNECT', 'SMTP reply line too long');
      }
    },
    close: async () => {
      try {
        await socket.close();
      } catch {
        // Closing an already-dead socket throws in some runtimes; the conversation is over either way.
      }
    },
    startTls: () => streamWire(socket.startTls(serverHostname ? { expectedServerHostname: serverHostname } : undefined), serverHostname),
  };
  return wire;
};

const defaultOpenWire = async (host: string, port: number, secure: boolean): Promise<SmtpWire> => {
  try {
    const socket = connect({ hostname: host, port }, { secureTransport: secure ? 'on' : 'off', allowHalfOpen: false });
    return streamWire(socket);
  } catch (error) {
    throw new SmtpError('SMTP_CONNECT', `Cannot connect to ${host}:${port}: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/** Sends one message over a fresh connection. Any failure leaves the socket closed. */
export const sendSmtp = async (options: SmtpOptions, msg: SmtpMessage): Promise<void> => {
  const secure = options.tls ? options.tls === 'tls' : options.port === 465;
  const wantStartTls = !secure;
  const openWire = options.openWire ?? defaultOpenWire;
  let wire: SmtpWire;
  try {
    wire = await openWire(options.host, options.port, secure);
  } catch (error) {
    if (error instanceof SmtpError) throw error;
    throw new SmtpError('SMTP_CONNECT', `Cannot connect to ${options.host}:${options.port}: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    // Server greeting.
    await command(wire, 'SMTP_CONNECT', null, [220], 'SMTP greeting');
    await command(wire, 'SMTP_CONNECT', `EHLO ${options.host}`, [250], 'EHLO');
    if (wantStartTls) {
      if (!wire.startTls) throw new SmtpError('SMTP_CONNECT', 'STARTTLS is required but the transport cannot upgrade');
      await command(wire, 'SMTP_CONNECT', 'STARTTLS', [220], 'STARTTLS');
      wire = await wire.startTls();
      await command(wire, 'SMTP_CONNECT', `EHLO ${options.host}`, [250], 'EHLO after STARTTLS');
    }
    if (options.user) {
      await command(wire, 'SMTP_AUTH', 'AUTH LOGIN', [334], 'AUTH LOGIN');
      await command(wire, 'SMTP_AUTH', base64(options.user), [334], 'AUTH username');
      await command(wire, 'SMTP_AUTH', base64(options.pass ?? ''), [235], 'AUTH password');
    }
    await command(wire, 'SMTP_SEND', `MAIL FROM:<${envelopeFrom(msg.from)}>`, [250], 'MAIL FROM');
    for (const rcpt of msg.to) {
      await command(wire, 'SMTP_SEND', `RCPT TO:<${envelopeFrom(rcpt)}>`, [250, 251], 'RCPT TO');
    }
    await command(wire, 'SMTP_SEND', 'DATA', [354], 'DATA');
    await wire.send(`${stuffDots(buildMimeMessage(msg))}${CRLF}.${CRLF}`);
    await command(wire, 'SMTP_SEND', null, [250], 'message body');
    try {
      await command(wire, 'SMTP_SEND', 'QUIT', [221], 'QUIT');
    } catch {
      // A server that closes instead of answering QUIT has already accepted the mail.
    }
  } finally {
    await wire.close();
  }
};
