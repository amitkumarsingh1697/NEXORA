import { z } from 'zod';
import type { ModelProvider } from './types';
import { OllamaProvider } from './providers/ollama';
import { OpenAiCompatibleProvider } from './providers/openai-compatible';
import { DisabledProvider } from './providers/unavailable';

export const aiConfigSchema = z.object({
  AI_PROVIDER: z.enum(['ollama', 'openai-compatible', 'disabled']).default('ollama'),
  OLLAMA_BASE_URL: z.url().default('http://127.0.0.1:11434'),
  OLLAMA_MODEL: z.string().min(1).default('qwen2.5:7b-instruct'),
  AI_CONTEXT_TOKENS: z.coerce.number().int().min(1024).max(131072).default(8192),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(600000).default(120000),
  OPENAI_COMPAT_BASE_URL: z.url().optional(),
  OPENAI_COMPAT_MODEL: z.string().optional(),
  OPENAI_COMPAT_API_KEY: z.string().optional(),
  AI_REMOTE_CONSENT: z.enum(['true', 'false']).default('false'),
});
export type AiConfig = z.infer<typeof aiConfigSchema>;

/** Build the configured provider. Nothing here is hard-coded into callers. */
export function createProvider(config: AiConfig): ModelProvider {
  switch (config.AI_PROVIDER) {
    case 'disabled':
      return new DisabledProvider();
    case 'openai-compatible':
      if (!config.OPENAI_COMPAT_BASE_URL || !config.OPENAI_COMPAT_MODEL)
        return new DisabledProvider();
      return new OpenAiCompatibleProvider({
        baseUrl: config.OPENAI_COMPAT_BASE_URL,
        model: config.OPENAI_COMPAT_MODEL,
        apiKey: config.OPENAI_COMPAT_API_KEY,
        userConsentedToRemote: config.AI_REMOTE_CONSENT === 'true',
        contextWindowTokens: config.AI_CONTEXT_TOKENS,
        defaultTimeoutMs: config.AI_TIMEOUT_MS,
      });
    case 'ollama':
    default:
      return new OllamaProvider({
        baseUrl: config.OLLAMA_BASE_URL,
        model: config.OLLAMA_MODEL,
        contextWindowTokens: config.AI_CONTEXT_TOKENS,
        defaultTimeoutMs: config.AI_TIMEOUT_MS,
      });
  }
}
