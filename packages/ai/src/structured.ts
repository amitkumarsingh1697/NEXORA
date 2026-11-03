import { z } from 'zod';
import { AiError, estimateTokens, type ChatMessage, type ModelProvider } from './types';

export interface StructuredRequest<T extends z.ZodTypeAny> {
  provider: ModelProvider;
  schema: T;
  messages: ChatMessage[];
  contextWindowTokens?: number;
  timeoutMs?: number;
  temperature?: number;
  /** Validation retries after the first attempt. Bounded; default 1. */
  maxRepairAttempts?: number;
}

/** Extract the first JSON object/array from model text (models sometimes wrap it). */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
    if (fence?.[1]) {
      try {
        return JSON.parse(fence[1]);
      } catch {
        // fall through to brace scan
      }
    }
    const start = trimmed.search(/[[{]/);
    const end = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        throw new AiError('invalid_output', 'Model output was not valid JSON.');
      }
    }
    throw new AiError('invalid_output', 'Model output did not contain JSON.');
  }
}

/**
 * Run a generation constrained to a schema and validate the result. Model
 * output is treated as untrusted: it is returned only if it passes the schema.
 */
export async function generateStructured<T extends z.ZodTypeAny>(
  req: StructuredRequest<T>,
): Promise<z.infer<T>> {
  const budget = req.contextWindowTokens ?? 8192;
  const promptTokens = req.messages.reduce((n, m) => n + estimateTokens(m.content), 0);
  if (promptTokens > budget * 0.8) {
    throw new AiError('context_overflow', 'Prompt exceeds the model context budget.');
  }
  const jsonSchema = z.toJSONSchema(req.schema) as Record<string, unknown>;
  const attempts = 1 + Math.min(Math.max(req.maxRepairAttempts ?? 1, 0), 3);
  let messages = [...req.messages];
  let lastError = 'unknown';
  for (let i = 0; i < attempts; i++) {
    const result = await req.provider.generate({
      messages,
      jsonSchema,
      temperature: req.temperature ?? 0,
      timeoutMs: req.timeoutMs,
    });
    let parsed: unknown;
    try {
      parsed = extractJson(result.text);
    } catch (e) {
      lastError = (e as Error).message;
      messages = [...req.messages, { role: 'user', content: 'Respond with valid JSON only.' }];
      continue;
    }
    const check = req.schema.safeParse(parsed);
    if (check.success) return check.data;
    lastError = check.error.issues
      .slice(0, 5)
      .map((iss) => `${iss.path.join('.')}: ${iss.message}`)
      .join('; ');
    messages = [
      ...req.messages,
      {
        role: 'user',
        content: `Your previous JSON failed validation (${lastError}). Respond again with JSON matching the schema exactly.`,
      },
    ];
  }
  throw new AiError('invalid_output', `Model output failed schema validation: ${lastError}`);
}
