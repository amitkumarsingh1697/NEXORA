import { AppError } from '@nexora/validation';

/**
 * Fixed-window in-memory rate limiter. Suitable for a single instance; a
 * shared store (e.g. Postgres or Redis) is needed for multi-instance hosting.
 */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  check(key: string): void {
    const t = this.now();
    const cur = this.hits.get(key);
    if (!cur || cur.resetAt <= t) {
      this.hits.set(key, { count: 1, resetAt: t + this.windowMs });
      if (this.hits.size > 10_000) this.prune(t);
      return;
    }
    cur.count++;
    if (cur.count > this.limit)
      throw new AppError('RATE_LIMITED', 'Too many requests. Please wait and try again.');
  }

  private prune(t: number) {
    for (const [k, v] of this.hits) if (v.resetAt <= t) this.hits.delete(k);
  }
}
