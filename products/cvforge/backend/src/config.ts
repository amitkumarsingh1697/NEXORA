import { z } from 'zod';
import { loadEnv } from '@nexora/validation';
import { aiConfigSchema } from '@nexora/ai';

export const backendEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().min(1).default('postgres://nexora:nexora_dev@127.0.0.1:5432/cvforge'),
    /** Used to sign download links and extension access tokens. Must be long and random in production. */
    APP_SECRET: z.string().min(32).default('dev-only-secret-change-me-dev-only-secret'),
    APP_ORIGIN: z.url().default('http://localhost:3000'),
    STORAGE_DIR: z.string().default('.data/storage'),
    MAIL_OUTBOX_DIR: z.string().default('.data/outbox'),
    /** 'outbox' (default) writes mail to MAIL_OUTBOX_DIR; 'smtp' delivers through SMTP_*. */
    MAIL_TRANSPORT: z.enum(['outbox', 'smtp']).default('outbox'),
    SMTP_HOST: z.string().trim().default(''),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_SECURE: z.enum(['true', 'false']).default('false'),
    SMTP_REQUIRE_TLS: z.enum(['true', 'false']).default('true'),
    SMTP_USER: z.string().default(''),
    SMTP_PASSWORD: z.string().default(''),
    MAIL_FROM: z.string().trim().default(''),
    /** When 'true', uploads and AI requests need a verified email address. */
    REQUIRE_EMAIL_VERIFICATION: z.enum(['true', 'false']).default('false'),
    USER_STORAGE_QUOTA_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(200 * 1024 * 1024),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(14),
    EXTENSION_ACCESS_TTL_SECONDS: z.coerce.number().int().min(300).max(1800).default(900),
    EXTENSION_REFRESH_TTL_DAYS: z.coerce.number().int().min(7).max(30).default(30),
    EXPORT_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    AUDIT_RETENTION_DAYS: z.coerce.number().int().min(30).max(3650).default(365),
  })
  .extend(aiConfigSchema.shape)
  .refine((e) => e.NODE_ENV !== 'production' || !e.APP_SECRET.startsWith('dev-only'), {
    message: 'APP_SECRET must be set in production',
    path: ['APP_SECRET'],
  })
  .refine((e) => e.MAIL_TRANSPORT !== 'smtp' || (e.SMTP_HOST && e.MAIL_FROM.includes('@')), {
    message: 'MAIL_TRANSPORT=smtp needs SMTP_HOST and a MAIL_FROM address',
    path: ['MAIL_TRANSPORT'],
  })
  .refine(
    (e) =>
      e.REQUIRE_EMAIL_VERIFICATION !== 'true' ||
      e.MAIL_TRANSPORT === 'smtp' ||
      e.NODE_ENV !== 'production',
    {
      message:
        'REQUIRE_EMAIL_VERIFICATION in production needs MAIL_TRANSPORT=smtp, or users could never verify',
      path: ['REQUIRE_EMAIL_VERIFICATION'],
    },
  );

export type BackendConfig = z.infer<typeof backendEnvSchema>;

export function loadBackendConfig(
  source: Record<string, string | undefined> = process.env,
): BackendConfig {
  return loadEnv(backendEnvSchema, source);
}
