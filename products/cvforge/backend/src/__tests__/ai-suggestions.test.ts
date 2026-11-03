import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AiError,
  type GenerateRequest,
  type GenerateResult,
  type ModelCapabilities,
  type ModelProvider,
} from '@nexora/ai';
import { parseResumeText, renderDocx } from '@nexora/cvforge-core';
import * as auth from '../services/auth';
import * as resumesSvc from '../services/resumes';
import * as ws from '../services/workspaces';
import * as analysis from '../services/analysis';
import * as sugg from '../services/suggestions';
import { setupTestEnv, PASSWORD, type TestEnv } from './helpers';

const RESUME = `Arjun Mehta
Backend Engineer
arjun@example.com | Pune, India

SKILLS
Java, Spring Boot, AWS, Kafka

EXPERIENCE
Backend Engineer | PayCo | Pune
Jan 2018 – Present
• Worked on Java microservices for payment processing
• Was responsible for Kafka consumers that handled settlement events
• Helped with AWS deployments for the payments platform

EDUCATION
B.E. Computer Engineering, Pune University, 2013 - 2017
`;

const JD = `Backend Engineer
Company: Example Payments
Requirements
- Experience with Java and Spring Boot microservices
- Experience with Kafka and AWS
- Payment processing domain knowledge
`;

/** Scriptable stand-in for a local model: the only fake in CVForge's AI path. */
class FakeProvider implements ModelProvider {
  readonly id = 'fake';
  readonly local = true;
  mode: 'ok' | 'error' = 'ok';
  calls = 0;
  async capabilities(): Promise<ModelCapabilities> {
    return {
      provider: 'fake',
      available: true,
      model: 'fake-1',
      models: ['fake-1'],
      contextWindowTokens: 8192,
      supportsJsonSchema: true,
      local: true,
    };
  }
  async generate(req: GenerateRequest): Promise<GenerateResult> {
    this.calls++;
    if (this.mode === 'error') throw new AiError('timeout', 'Model request timed out.');
    const user = req.messages.find((m) => m.role === 'user')!;
    const { bullets } = JSON.parse(user.content) as {
      bullets: { bulletId: string; text: string }[];
    };
    const rewrites = bullets.flatMap((b) => [
      // Faithful rewording: same facts.
      {
        bulletId: b.bulletId,
        text: `Delivered work: ${b.text.replace(/^(Worked on|Was responsible for|Helped with)\s*/i, '')}`,
      },
      // Fabrication: a new metric and a technology absent from the resume.
      { bulletId: b.bulletId, text: `${b.text} using Kubernetes, cutting latency by 73%` },
    ]);
    return {
      text: JSON.stringify({ rewrites: rewrites.slice(0, 5) }),
      model: 'fake-1',
      provider: 'fake',
      durationMs: 1,
    };
  }
}

const fake = new FakeProvider();
let env: TestEnv;
let userId: string;
let workspaceId: string;

beforeAll(async () => {
  env = await setupTestEnv(fake);
  userId = (
    await auth.signUp(env.ctx, { email: 'ai@example.com', password: PASSWORD, acceptPrivacy: true })
  ).id;
  const bytes = await renderDocx(parseResumeText(RESUME).content, 'classic');
  const up = await resumesSvc.uploadResume(env.ctx, userId, { filename: 'arjun.docx', bytes });
  await resumesSvc.finalizeVersion(env.ctx, userId, up.versionId);
  workspaceId = (
    await ws.createWorkspace(env.ctx, userId, { resumeVersionId: up.versionId, jobText: JD })
  ).id;
  await analysis.runWorkspaceAnalysis(env.ctx, userId, workspaceId);
});
afterAll(async () => env.cleanup());

describe('AI wording suggestions', () => {
  it('are not requested while the user has AI assist off', async () => {
    await auth.updateSettings(env.ctx, userId, { aiAssistEnabled: false });
    const before = fake.calls;
    const out = await sugg.generateWorkspaceSuggestions(env.ctx, userId, workspaceId);
    expect(fake.calls).toBe(before);
    expect(out.filter((s) => s.source === 'ai')).toHaveLength(0);
  });

  it('keep faithful rewordings and drop fabricated metrics or technologies', async () => {
    await auth.updateSettings(env.ctx, userId, { aiAssistEnabled: true });
    const out = await sugg.generateWorkspaceSuggestions(env.ctx, userId, workspaceId);
    expect(fake.calls).toBeGreaterThan(0);
    const ai = out.filter((s) => s.source === 'ai');
    expect(ai.length).toBeGreaterThan(0);
    for (const s of ai) {
      expect(s.proposed).toMatch(/^Delivered work:/);
      expect(s.proposed).not.toMatch(/Kubernetes|73%/);
      expect(s.reason).toMatch(/AI-suggested/);
    }
  });

  it('fall back to deterministic suggestions when the model fails', async () => {
    fake.mode = 'error';
    const out = await sugg.generateWorkspaceSuggestions(env.ctx, userId, workspaceId);
    expect(out.filter((s) => s.source === 'ai')).toHaveLength(0);
    fake.mode = 'ok';
  });
});
