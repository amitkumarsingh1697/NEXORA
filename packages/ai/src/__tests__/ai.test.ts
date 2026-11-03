import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AiError,
  DisabledProvider,
  OllamaProvider,
  OpenAiCompatibleProvider,
  extractJson,
  generateStructured,
  type GenerateRequest,
  type ModelProvider,
} from '../index';

function scripted(outputs: string[]): ModelProvider & { calls: GenerateRequest[] } {
  const calls: GenerateRequest[] = [];
  return {
    id: 'scripted',
    local: true,
    calls,
    async capabilities() {
      return {
        provider: 'scripted',
        available: true,
        model: 'x',
        models: ['x'],
        contextWindowTokens: 8192,
        supportsJsonSchema: true,
        local: true,
      };
    },
    async generate(req) {
      calls.push(req);
      const text = outputs.shift();
      if (text === undefined) throw new Error('no more outputs');
      return { text, model: 'x', provider: 'scripted', durationMs: 1 };
    },
  };
}

describe('extractJson', () => {
  it('parses fenced JSON', () => {
    expect(extractJson('Here:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it('throws on non-JSON', () => {
    expect(() => extractJson('no json here')).toThrow(AiError);
  });
});

describe('generateStructured', () => {
  const schema = z.object({ answer: z.string(), confidence: z.number().min(0).max(1) });
  it('returns validated data', async () => {
    const p = scripted(['{"answer":"ok","confidence":0.5}']);
    await expect(
      generateStructured({ provider: p, schema, messages: [{ role: 'user', content: 'q' }] }),
    ).resolves.toEqual({ answer: 'ok', confidence: 0.5 });
    expect(p.calls[0]?.jsonSchema).toBeDefined();
  });
  it('repairs once then succeeds', async () => {
    const p = scripted(['{"answer":"ok","confidence":5}', '{"answer":"ok","confidence":0.9}']);
    const out = await generateStructured({
      provider: p,
      schema,
      messages: [{ role: 'user', content: 'q' }],
    });
    expect(out.confidence).toBe(0.9);
    expect(p.calls).toHaveLength(2);
  });
  it('fails after bounded attempts', async () => {
    const p = scripted(['{}', '{}', '{}', '{}', '{}']);
    await expect(
      generateStructured({
        provider: p,
        schema,
        messages: [{ role: 'user', content: 'q' }],
        maxRepairAttempts: 1,
      }),
    ).rejects.toMatchObject({ kind: 'invalid_output' });
    expect(p.calls).toHaveLength(2);
  });
  it('rejects prompts over budget', async () => {
    const p = scripted([]);
    await expect(
      generateStructured({
        provider: p,
        schema,
        messages: [{ role: 'user', content: 'x'.repeat(40000) }],
        contextWindowTokens: 1024,
      }),
    ).rejects.toMatchObject({ kind: 'context_overflow' });
  });
});

describe('OllamaProvider', () => {
  it('reports unavailable when server is down', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const caps = await new OllamaProvider({ fetchImpl }).capabilities();
    expect(caps.available).toBe(false);
    expect(caps.reason).toMatch(/not running/);
  });
  it('detects pulled model and sends chat request with schema', async () => {
    const seen: { url: string; body: unknown }[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      seen.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.endsWith('/api/tags'))
        return new Response(JSON.stringify({ models: [{ name: 'm:latest' }] }));
      return new Response(
        JSON.stringify({
          model: 'm',
          message: { role: 'assistant', content: '{"a":1}' },
          eval_count: 3,
        }),
      );
    }) as unknown as typeof fetch;
    const p = new OllamaProvider({ model: 'm', fetchImpl });
    expect((await p.capabilities()).available).toBe(true);
    const r = await p.generate({
      messages: [{ role: 'user', content: 'hi' }],
      jsonSchema: { type: 'object' },
    });
    expect(r.text).toBe('{"a":1}');
    expect(seen[1]?.body).toMatchObject({ model: 'm', stream: false, format: { type: 'object' } });
  });
  it('maps timeouts', async () => {
    const fetchImpl = (async () => {
      const e = new Error('t');
      e.name = 'TimeoutError';
      throw e;
    }) as unknown as typeof fetch;
    await expect(
      new OllamaProvider({ fetchImpl }).generate({ messages: [] }),
    ).rejects.toMatchObject({ kind: 'timeout' });
  });
});

describe('remote consent', () => {
  it('blocks hosted providers without consent', async () => {
    const p = new OpenAiCompatibleProvider({
      baseUrl: 'https://api.example.com/v1',
      model: 'm',
      userConsentedToRemote: false,
    });
    expect((await p.capabilities()).available).toBe(false);
    await expect(p.generate({ messages: [] })).rejects.toMatchObject({ kind: 'consent_required' });
  });
  it('disabled provider throws unavailable', async () => {
    await expect(new DisabledProvider().generate()).rejects.toMatchObject({ kind: 'unavailable' });
  });
});
