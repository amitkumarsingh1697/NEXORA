import { z } from 'zod';
import {
  AiError,
  type GenerateRequest,
  type GenerateResult,
  type ModelCapabilities,
  type ModelProvider,
} from '../types';
import { fetchJson } from './http';

export interface OpenAiCompatibleOptions {
  baseUrl: string;
  model: string;
  apiKey?: string;
  /** Hosted endpoints receive user data. Must be explicitly consented to. */
  userConsentedToRemote: boolean;
  local?: boolean;
  contextWindowTokens?: number;
  defaultTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const responseSchema = z.object({
  model: z.string().optional(),
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
  usage: z
    .object({ prompt_tokens: z.number(), completion_tokens: z.number() })
    .partial()
    .optional(),
});

/**
 * Optional adapter for OpenAI-compatible chat completion endpoints (hosted
 * providers, LM Studio, llama.cpp server). Disabled unless the caller passes
 * explicit consent for non-local endpoints. Never used by default.
 */
export class OpenAiCompatibleProvider implements ModelProvider {
  readonly id = 'openai-compatible';
  readonly local: boolean;
  private readonly opts: OpenAiCompatibleOptions;

  constructor(opts: OpenAiCompatibleOptions) {
    this.opts = opts;
    this.local = opts.local ?? /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(opts.baseUrl);
  }

  private assertConsent() {
    if (!this.local && !this.opts.userConsentedToRemote) {
      throw new AiError(
        'consent_required',
        'Sending data to a hosted model requires explicit consent.',
      );
    }
  }

  async capabilities(): Promise<ModelCapabilities> {
    const base = {
      provider: this.id,
      model: this.opts.model,
      models: [this.opts.model],
      contextWindowTokens: this.opts.contextWindowTokens ?? 8192,
      supportsJsonSchema: false,
      local: this.local,
    };
    if (!this.local && !this.opts.userConsentedToRemote) {
      return {
        ...base,
        available: false,
        reason: 'Hosted provider configured but not consented to.',
      };
    }
    return { ...base, available: true };
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    this.assertConsent();
    const started = Date.now();
    const headers: Record<string, string> = {};
    if (this.opts.apiKey) headers.authorization = `Bearer ${this.opts.apiKey}`;
    const raw = await fetchJson(`${this.opts.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers,
      timeoutMs: req.timeoutMs ?? this.opts.defaultTimeoutMs ?? 120_000,
      signal: req.signal,
      fetchImpl: this.opts.fetchImpl,
      body: {
        model: this.opts.model,
        messages: req.messages,
        temperature: req.temperature ?? 0.2,
        max_tokens: req.maxOutputTokens,
        response_format: req.jsonSchema ? { type: 'json_object' } : undefined,
      },
    });
    const parsed = responseSchema.safeParse(raw);
    if (!parsed.success)
      throw new AiError('provider_error', 'Unexpected response from model provider.');
    return {
      text: parsed.data.choices[0]?.message.content ?? '',
      model: parsed.data.model ?? this.opts.model,
      provider: this.id,
      durationMs: Date.now() - started,
      promptTokens: parsed.data.usage?.prompt_tokens,
      outputTokens: parsed.data.usage?.completion_tokens,
    };
  }
}
