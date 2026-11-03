import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError, emailSchema, loadEnv, parseOrThrow, passwordSchema } from '../index';

describe('validation', () => {
  it('normalises email', () => {
    expect(emailSchema.parse('  Amit@Example.COM ')).toBe('amit@example.com');
  });
  it('rejects short passwords', () => {
    expect(passwordSchema.safeParse('short').success).toBe(false);
  });
  it('parseOrThrow raises AppError with issues', () => {
    try {
      parseOrThrow(z.object({ a: z.number() }), { a: 'x' });
      expect.fail('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).status).toBe(400);
      expect((e as AppError).details).toEqual([expect.objectContaining({ path: 'a' })]);
    }
  });
  it('loadEnv lists names but not values', () => {
    expect(() =>
      loadEnv(z.object({ SECRET: z.string().min(10) }), { SECRET: 'tiny-value' + '' }),
    ).not.toThrow();
    try {
      loadEnv(z.object({ SECRET: z.string().min(50) }), { SECRET: 'supersecret' });
    } catch (e) {
      expect((e as Error).message).toContain('SECRET');
      expect((e as Error).message).not.toContain('supersecret');
    }
  });
});
