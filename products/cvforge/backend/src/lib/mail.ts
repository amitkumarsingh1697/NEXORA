import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import nodemailer, { type Transporter } from 'nodemailer';
import { randomToken } from './crypto';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(msg: MailMessage): Promise<void>;
}

/**
 * Development mail transport: writes messages to a local outbox folder
 * (never to logs, since they may contain one-time links). `SmtpMailer` below
 * implements the same interface for real delivery.
 */
export class OutboxMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  constructor(private readonly dir: string) {}
  async send(msg: MailMessage) {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    const name = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomToken(4)}.eml`;
    await writeFile(
      join(this.dir, name),
      `To: ${msg.to}\nSubject: ${msg.subject}\n\n${msg.text}\n`,
      { mode: 0o600 },
    );
    this.sent.push(msg);
  }
}

export interface SmtpSettings {
  host: string;
  port: number;
  /** true: TLS from the start (usually port 465). false: STARTTLS when the server offers it. */
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
  /** Refuse to send unless the connection is upgraded to TLS. */
  requireTls?: boolean;
}

/**
 * SMTP transport (nodemailer). Optional: the outbox stays the default, so no mail
 * service is needed to run CVForge. Nodemailer's own logger stays off, so neither
 * message bodies (which hold one-time links) nor credentials are logged.
 */
export class SmtpMailer implements Mailer {
  private readonly transport: Transporter;
  constructor(private readonly settings: SmtpSettings) {
    this.transport = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      requireTLS: settings.requireTls ?? false,
      auth: settings.user ? { user: settings.user, pass: settings.password ?? '' } : undefined,
      logger: false,
      debug: false,
      connectionTimeout: 15_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    });
  }
  async send(msg: MailMessage) {
    try {
      await this.transport.sendMail({
        from: this.settings.from,
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
      });
    } catch (e) {
      // Report the failure without the message or the server's echo of it.
      const code = (e as { code?: unknown }).code;
      throw new Error(`Mail delivery failed${typeof code === 'string' ? ` (${code})` : ''}.`, {
        cause: e,
      });
    }
  }
  close() {
    this.transport.close();
  }
}
