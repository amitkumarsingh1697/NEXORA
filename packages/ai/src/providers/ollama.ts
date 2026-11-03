import { z } from 'zod';
import {
  AiError,
  type GenerateRequest,
  type GenerateResult,
  type ModelCapabilities,
  type ModelProvider,
} from '../types';
import { fetchJson } from './http';

export interface OllamaOptions {
  baseUrl?: string;
  model?: string;
  contextWindowTokens?: number;
  defaultTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const tagsSchema = z.object({ models: z.array(z.object({ name: z.string() })).default([]) });
const chatSchema = z.object({
  model: z.string(),
  message: z.object({ role: z.string(), content: z.string() }),
  prompt_eval_count: z.number().optional(),
  eval_count: z.number().optional(),
});

/**
 * Ollama adapter using the documented REST API (/api/tags, /api/chat).
 * Structured outputs pass a JSON schema via the `format` field.
 */
export class OllamaProvider implements ModelProvider {
  readonly id = 'ollama';
  readonly local = true;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly ctx: number;
  private readonly timeout: number;
  private readonly fetchImpl?: typeof fetch;

  constructor(opts: OllamaOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? 'http://127.0.0.1:11434').replace(/\/$/, '');
    this.model = opts.model ?? 'qwen2.5:7b-instruct';
    this.ctx = opts.contextWindowTokens ?? 8192;
    this.timeout = opts.defaultTimeoutMs ?? 120_000;
    this.fetchImpl = opts.fetchImpl;
  }

  async capabilities(): Promise<ModelCapabilities> {
    const base = {
      provider: this.id,
      model: this.model,
      contextWindowTokens: this.ctx,
      supportsJsonSchema: true,
      local: true,
    };
    try {
      const raw = await fetchJson(`${this.baseUrl}/api/tags`, {
        timeoutMs: 3000,
        retries: 0,
        fetchImpl: this.fetchImpl,
      });
      const tags = tagsSchema.parse(raw);
      const models = tags.models.map((m) => m.name);
      const available = models.some((m) => m === this.model || m.startsWith(`${this.model}:`));
      return {
        ...base,
        models,
        available,
        reason: available
          ? undefined
          : `Model "${this.model}" is not pulled. Run: ollama pull ${this.model}`,
      };
    } catch {
      return {
        ...base,
        models: [],
        available: false,
        reason: 'Ollama is not running on this machine.',
      };
    }
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const started = Date.now();
    const raw = await fetchJson(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      timeoutMs: req.timeoutMs ?? this.timeout,
      signal: req.signal,
      retries: 1,
      fetchImpl: this.fetchImpl,
      body: {
        model: this.model,
        messages: req.messages,
        stream: false,
        format: req.jsonSchema,
        options: {
          temperature: req.temperature ?? 0.2,
          num_ctx: this.ctx,
          num_predict: req.maxOutputTokens,
        },
      },
    });
    const parsed = chatSchema.safeParse(raw);
    if (!parsed.success) throw new AiError('provider_error', 'Unexpected response from Ollama.');
    return {
      text: parsed.data.message.content,
      model: parsed.data.model,
      provider: this.id,
      durationMs: Date.now() - started,
      promptTokens: parsed.data.prompt_eval_count,
      outputTokens: parsed.data.eval_count,
    };
  }
}
