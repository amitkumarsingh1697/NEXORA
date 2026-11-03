import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
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
 * (never to logs, since they may contain one-time links). A hosted SMTP/API
 * transport implements the same interface.
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
