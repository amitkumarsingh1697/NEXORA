import { z } from 'zod';
import { AppError } from './errors';

/**
 * Parse environment variables against a schema. Fails fast with a list of the
 * offending variable names only (values are never echoed, they may be secrets).
 */
export function loadEnv<T extends z.ZodTypeAny>(
  schema: T,
  source: Record<string, string | undefined> = process.env,
): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((i) => i.path.join('.')))];
    throw new AppError(
      'VALIDATION_FAILED',
      `Invalid environment configuration: ${names.join(', ')}`,
    );
  }
  return result.data;
}
