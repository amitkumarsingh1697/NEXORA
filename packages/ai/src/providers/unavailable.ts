import { AiError, type GenerateResult, type ModelCapabilities, type ModelProvider } from '../types';

/** Provider used when AI is disabled. Callers must take their deterministic path. */
export class DisabledProvider implements ModelProvider {
  readonly id = 'disabled';
  readonly local = true;
  async capabilities(): Promise<ModelCapabilities> {
    return {
      provider: this.id,
      available: false,
      reason: 'AI assistance is disabled in settings.',
      model: 'none',
      models: [],
      contextWindowTokens: 0,
      supportsJsonSchema: false,
      local: true,
    };
  }
  async generate(): Promise<GenerateResult> {
    throw new AiError('unavailable', 'AI assistance is disabled.');
  }
}
