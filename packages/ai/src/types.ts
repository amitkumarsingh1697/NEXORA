export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface GenerateRequest {
  messages: ChatMessage[];
  /** Optional JSON schema the provider should constrain output to. */
  jsonSchema?: Record<string, unknown>;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface GenerateResult {
  text: string;
  model: string;
  provider: string;
  durationMs: number;
  promptTokens?: number;
  outputTokens?: number;
}

export interface ModelCapabilities {
  provider: string;
  available: boolean;
  /** Why the provider is unavailable, safe to show to users. */
  reason?: string;
  model: string;
  models: string[];
  contextWindowTokens: number;
  supportsJsonSchema: boolean;
  /** True when inference happens on this machine (no data leaves it). */
  local: boolean;
}

export interface ModelProvider {
  readonly id: string;
  readonly local: boolean;
  capabilities(): Promise<ModelCapabilities>;
  generate(request: GenerateRequest): Promise<GenerateResult>;
}

export type AiErrorKind =
  | 'unavailable'
  | 'timeout'
  | 'invalid_output'
  | 'provider_error'
  | 'consent_required'
  | 'context_overflow';

export class AiError extends Error {
  readonly kind: AiErrorKind;
  constructor(kind: AiErrorKind, message: string) {
    super(message);
    this.name = 'AiError';
    this.kind = kind;
  }
}

/** Rough token estimate (~4 chars/token) used for context budgeting only. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
