/**
 * Redact likely secrets from text before it is shown to a model. Indexing
 * already skips credential files; this catches secrets embedded in code.
 */
const PATTERNS: [RegExp, string][] = [
  [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    '[REDACTED PRIVATE KEY]',
  ],
  [/\b(AKIA|ASIA)[0-9A-Z]{16}\b/g, '[REDACTED AWS KEY]'],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/g, '[REDACTED GITHUB TOKEN]'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, '[REDACTED SLACK TOKEN]'],
  [/\bsk-[A-Za-z0-9_-]{20,}\b/g, '[REDACTED API KEY]'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[REDACTED JWT]'],
  [
    /(\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key)\b["']?\s*[:=]\s*)(["'`])([^"'`\n]{8,})\2/gi,
    '$1$2[REDACTED]$2',
  ],
  [/(\b[a-z]+:\/\/[^\s:/@]+:)([^\s@/]{3,})(@)/gi, '$1[REDACTED]$3'],
];

export function redactSecrets(text: string): { text: string; redactions: number } {
  let count = 0;
  let out = text;
  for (const [re, rep] of PATTERNS) {
    out = out.replace(re, (...args: unknown[]) => {
      count++;
      const match = args[0] as string;
      return match.replace(new RegExp(re.source, re.flags.replace('g', '')), rep);
    });
  }
  return { text: out, redactions: count };
}
