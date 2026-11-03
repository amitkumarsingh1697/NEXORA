import { describe, expect, it } from 'vitest';
import { parseResumeText } from '../resume/parse';
import { parseJobDescription } from '../job/parse';
import { runAnalysis } from '../analysis';
import {
  generateSuggestions,
  strengthenOpening,
  confirmationToBullet,
} from '../suggestions/generate';
import { checkNoFabrication } from '../suggestions/guard';
import { applySuggestions, StaleSuggestionError } from '../versioning/apply';
import { diffResumes } from '../versioning/diff';
import { resumeContentSchema } from '../resume/model';
import { SAMPLE_JD_TEXT, SAMPLE_RESUME_TEXT } from './fixtures/samples';

const NOW = new Date('2026-11-01T00:00:00Z');
const resume = parseResumeText(SAMPLE_RESUME_TEXT).content;
const job = parseJobDescription(SAMPLE_JD_TEXT);
const k8s = job.requirements.find((r) => r.concepts.includes('Kubernetes'))!;
const analysis = runAnalysis({
  resume,
  job,
  layout: null,
  now: NOW,
  responses: [
    {
      requirementId: k8s.id,
      response: 'yes',
      text: 'Yes, I deployed the FinPay payment services to Kubernetes clusters',
      answeredAt: NOW.toISOString(),
    },
  ],
});
const suggestions = generateSuggestions({
  resume,
  job,
  classifications: analysis.classifications,
  stage: analysis.stage,
  totalYears: analysis.totalYears,
});

describe('guard', () => {
  it('blocks invented numbers and technologies', () => {
    expect(
      checkNoFabrication('Reduced latency by 45% using Kubernetes', [
        'Reduced latency using Docker',
      ]).violations,
    ).toHaveLength(2);
    expect(
      checkNoFabrication('Reduced latency using Docker', ['Reduced latency using Docker']).ok,
    ).toBe(true);
  });
});

describe('suggestion helpers', () => {
  it('rewrites passive openings conservatively', () => {
    expect(strengthenOpening('Responsible for developing REST APIs')).toBe('Developed REST APIs');
    expect(strengthenOpening('Worked on ETL pipelines')).toBe('Contributed to ETL pipelines');
    expect(strengthenOpening('Designed the system')).toBeNull();
  });
  it('turns confirmations into bullets using only user words', () => {
    expect(confirmationToBullet('Yes, I deployed services to Kubernetes.')).toBe(
      'Deployed services to Kubernetes',
    );
  });
});

describe('generateSuggestions', () => {
  it('produces evidence-backed suggestions of several types', () => {
    const types = new Set(suggestions.map((s) => s.type));
    expect(types).toContain('add_bullet');
    expect(types).toContain('add_skill');
    expect(types).toContain('modify_bullet');
    for (const s of suggestions) expect(s.evidence.length).toBeGreaterThan(0);
  });
  it('documents confirmed skills in the matching role, in the user words', () => {
    const add = suggestions.find((s) => s.type === 'add_bullet')!;
    expect(add.proposed).toBe('Deployed the FinPay payment services to Kubernetes clusters');
    expect(add.target.itemId).toBe(resume.experience[0]!.id);
    expect(add.evidence[0]!.kind).toBe('confirmation');
  });
  it('never writes work authorisation into the resume', () => {
    expect(suggestions.some((s) => /authori[sz]ed/i.test(s.proposed))).toBe(false);
  });
  it('summary suggestion uses only computed years and demonstrated skills', () => {
    const sum = suggestions.find((s) => s.type === 'update_summary');
    if (sum) expect(sum.proposed).toMatch(/11\+ years/);
  });
});

describe('versioning', () => {
  it('applies accepted suggestions immutably and excludes rejected ones', () => {
    const accepted = suggestions.filter(
      (s) => s.type === 'add_bullet' || s.type === 'modify_bullet',
    );
    const rejected = suggestions.filter((s) => s.type === 'add_skill');
    const before = structuredClone(resume);
    const next = applySuggestions(resume, accepted);
    expect(resume).toEqual(before); // input unchanged
    const allText = JSON.stringify(next);
    for (const s of accepted) expect(allText).toContain(s.proposed);
    for (const s of rejected) expect(next.skills.map((k) => k.name)).not.toContain(s.proposed);
  });
  it('rejects stale suggestions', () => {
    const mod = suggestions.find((s) => s.type === 'modify_bullet')!;
    const changed = structuredClone(resume);
    const b = changed.experience
      .flatMap((e) => e.bullets)
      .find((x) => x.id === mod.target.bulletId)!;
    b.text = 'Someone edited this';
    expect(() => applySuggestions(changed, [mod])).toThrow(StaleSuggestionError);
  });
  it('produces a structured diff with added, modified and reordered changes', () => {
    const next = applySuggestions(resume, suggestions);
    const d = diffResumes(resume, next);
    expect(d.counts.added).toBeGreaterThan(0);
    expect(d.counts.modified).toBeGreaterThan(0);
    const mod = d.changes.find((c) => c.type === 'modified' && c.label.startsWith('Bullet'));
    expect(mod?.words?.some((w) => w.added)).toBe(true);
    expect(mod?.words?.some((w) => w.removed)).toBe(true);
    const removedVersion = structuredClone(next);
    removedVersion.experience[1]!.bullets.pop();
    removedVersion.skills.reverse();
    const d2 = diffResumes(next, removedVersion);
    expect(d2.counts.removed).toBe(1);
    expect(d2.changes.some((c) => c.type === 'reordered' && c.section === 'skills')).toBe(true);
  });
  it('identical versions have no changes', () => {
    expect(diffResumes(resume, structuredClone(resume)).changes).toHaveLength(0);
  });
  it('diffs template and section order as formatting changes (RI-4.8-05)', () => {
    const styled = structuredClone(resume);
    styled.template = 'modern';
    styled.sectionOrder = [...resume.sectionOrder].reverse();
    const d = diffResumes(resume, styled);
    const formatting = d.changes.filter((c) => c.section === 'formatting');
    expect(formatting.map((c) => [c.type, c.label, c.before, c.after])).toEqual([
      [
        'reordered',
        'Section order',
        resume.sectionOrder.join(', '),
        styled.sectionOrder.join(', '),
      ],
      ['added', 'Template', null, 'modern'],
    ]);
    expect(d.changes).toHaveLength(2);
    const switched = structuredClone(styled);
    switched.template = 'classic';
    expect(diffResumes(styled, switched).changes).toEqual([
      expect.objectContaining({
        section: 'formatting',
        type: 'modified',
        before: 'modern',
        after: 'classic',
      }),
    ]);
  });
  it('accepts versions stored before the template field existed and rejects unknown templates', () => {
    const legacy = resumeContentSchema.parse({ personal: {} });
    expect(legacy.template).toBeUndefined();
    expect(resumeContentSchema.safeParse({ personal: {}, template: 'fancy' }).success).toBe(false);
  });
});
