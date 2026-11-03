import { describe, expect, it } from 'vitest';
import { Writable } from 'node:stream';
import { createLogger } from '../index';

function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(String(chunk));
      cb();
    },
  });
  return { lines, stream };
}

describe('createLogger', () => {
  it('redacts secrets and private content', () => {
    const { lines, stream } = capture();
    const log = createLogger({ name: 'test', level: 'info', destination: stream });
    log.info(
      { password: 'hunter2', user: { refreshToken: 'abc' }, resumeText: 'private', ok: 1 },
      'msg',
    );
    const out = JSON.parse(lines[0] ?? '{}');
    expect(out.password).toBe('[REDACTED]');
    expect(out.user.refreshToken).toBe('[REDACTED]');
    expect(out.resumeText).toBe('[REDACTED]');
    expect(out.ok).toBe(1);
    expect(out.service).toBe('test');
  });
});
