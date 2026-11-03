import pino, { type Logger, type LoggerOptions } from 'pino';

/**
 * Paths that must never reach log output. Covers credentials, tokens and
 * private document content (resume text, source code snippets).
 */
export const REDACT_PATHS = [
  'password',
  '*.password',
  'passwordHash',
  '*.passwordHash',
  'token',
  '*.token',
  'accessToken',
  '*.accessToken',
  'refreshToken',
  '*.refreshToken',
  'pairingCode',
  '*.pairingCode',
  'authorization',
  'headers.authorization',
  'headers.cookie',
  'req.headers.authorization',
  'req.headers.cookie',
  'cookie',
  'apiKey',
  '*.apiKey',
  'resumeText',
  '*.resumeText',
  'content',
  '*.content',
  'sourceCode',
  '*.sourceCode',
];

export interface CreateLoggerOptions {
  name: string;
  level?: string;
  /** Destination stream, mainly for tests. */
  destination?: pino.DestinationStream;
}

export function createLogger(options: CreateLoggerOptions): Logger {
  const config: LoggerOptions = {
    name: options.name,
    level: options.level ?? process.env.LOG_LEVEL ?? 'info',
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    base: { service: options.name },
    timestamp: pino.stdTimeFunctions.isoTime,
  };
  return options.destination ? pino(config, options.destination) : pino(config);
}

export type { Logger };
