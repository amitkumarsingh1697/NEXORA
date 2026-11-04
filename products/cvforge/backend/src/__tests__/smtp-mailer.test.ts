import { createServer, type Server } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadBackendConfig } from '../config';
import { createMailer } from '../factory';
import { OutboxMailer, SmtpMailer } from '../lib/mail';

/** A minimal plain-text SMTP server that records one conversation per connection. */
interface Session {
  commands: string[];
  data: string;
}
let server: Server;
let port = 0;
const sessions: Session[] = [];

beforeAll(async () => {
  server = createServer((sock) => {
    const s: Session = { commands: [], data: '' };
    sessions.push(s);
    let buf = '';
    let inData = false;
    sock.write('220 test.local ESMTP\r\n');
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      for (;;) {
        if (inData) {
          const end = buf.indexOf('\r\n.\r\n');
          if (end < 0) return;
          s.data = buf.slice(0, end);
          buf = buf.slice(end + 5);
          inData = false;
          sock.write('250 2.0.0 queued\r\n');
          continue;
        }
        const nl = buf.indexOf('\r\n');
        if (nl < 0) return;
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 2);
        s.commands.push(line);
        const verb = line.split(' ')[0]!.toUpperCase();
        if (verb === 'EHLO') sock.write('250-test.local\r\n250 AUTH PLAIN\r\n');
        else if (verb === 'AUTH') sock.write('235 2.7.0 ok\r\n');
        else if (verb === 'MAIL' || verb === 'RCPT') sock.write('250 ok\r\n');
        else if (verb === 'DATA') {
          inData = true;
          sock.write('354 go ahead\r\n');
        } else if (verb === 'QUIT') {
          sock.end('221 bye\r\n');
          return;
        } else sock.write('502 not implemented\r\n');
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as { port: number }).port;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const base = { host: '127.0.0.1', secure: false, from: 'CVForge <no-reply@example.com>' };

describe('SMTP mailer', () => {
  it('delivers a message over SMTP with authentication', async () => {
    const m = new SmtpMailer({
      ...base,
      port,
      user: 'mailer',
      password: 's3cret',
      requireTls: false,
    });
    await m.send({ to: 'amit@example.com', subject: 'Hello', text: 'Link: https://x.test/a?b=1' });
    m.close();
    const s = sessions.at(-1)!;
    const auth = s.commands.find((c) => c.startsWith('AUTH PLAIN'))!;
    expect(Buffer.from(auth.split(' ')[2]!, 'base64').toString()).toBe('\0mailer\0s3cret');
    expect(s.commands).toContain('MAIL FROM:<no-reply@example.com>');
    expect(s.commands).toContain('RCPT TO:<amit@example.com>');
    expect(s.data).toMatch(/^Subject: Hello$/m);
    expect(s.data).toMatch(/^To: amit@example\.com$/m);
    expect(s.data).toContain('Link: https://x.test/a?b=1');
  });

  it('refuses to send without TLS when TLS is required, without echoing the message', async () => {
    const m = new SmtpMailer({ ...base, port, requireTls: true });
    const err = await m
      .send({ to: 'amit@example.com', subject: 'Secret subject', text: 'one-time link' })
      .then(
        () => null,
        (e: Error) => e,
      );
    m.close();
    expect(err?.message).toMatch(/^Mail delivery failed/);
    expect(err?.message).not.toContain('one-time link');
    expect(err?.message).not.toContain('Secret subject');
    expect(sessions.at(-1)!.commands.some((c) => c.startsWith('MAIL FROM'))).toBe(false);
  });

  it('chooses the transport from configuration and validates SMTP settings', () => {
    expect(createMailer(loadBackendConfig({ NODE_ENV: 'test' }))).toBeInstanceOf(OutboxMailer);
    const smtp = createMailer(
      loadBackendConfig({
        NODE_ENV: 'test',
        MAIL_TRANSPORT: 'smtp',
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: String(port),
        MAIL_FROM: 'no-reply@example.com',
      }),
    );
    expect(smtp).toBeInstanceOf(SmtpMailer);
    (smtp as SmtpMailer).close();
    expect(() => loadBackendConfig({ NODE_ENV: 'test', MAIL_TRANSPORT: 'smtp' })).toThrow(
      /MAIL_TRANSPORT/,
    );
    expect(() =>
      loadBackendConfig({
        NODE_ENV: 'production',
        APP_SECRET: 'a'.repeat(40),
        REQUIRE_EMAIL_VERIFICATION: 'true',
      }),
    ).toThrow(/REQUIRE_EMAIL_VERIFICATION/);
  });
});
