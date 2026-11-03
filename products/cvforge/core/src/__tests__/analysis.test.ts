import { describe, expect, it } from 'vitest';
import { parseResumeText } from '../resume/parse';
import { parseJobDescription, parseSalary } from '../job/parse';
import { computeExperienceYears, stageForYears } from '../career/stage';
import { classifyRequirement, findEvidence, type ClarificationResponse } from '../evidence/engine';
import { runAnalysis } from '../analysis';
import { SAMPLE_JD_TEXT, SAMPLE_RESUME_TEXT } from './fixtures/samples';
import type { Requirement } from '../job/model';

const NOW = new Date('2026-11-01T00:00:00Z');
const resume = parseResumeText(SAMPLE_RESUME_TEXT).content;
const job = parseJobDescription(SAMPLE_JD_TEXT);

describe('job parsing', () => {
  it('extracts metadata explicitly present', () => {
    expect(job.title).toBe('Senior Backend Engineer');
    expect(job.company).toBe('Acme Payments');
    expect(job.location).toContain('Bengaluru');
    expect(job.country).toBe('India');
    expect(job.workMode).toBe('hybrid');
    expect(job.employmentType).toBe('full_time');
    expect(job.salary).toMatchObject({
      currency: 'INR',
      min: 3500000,
      max: 5000000,
      period: 'year',
    });
    expect(job.workAuthorization).toHaveLength(1);
    expect(job.minYearsOverall).toBe(6);
  });
  it('does not invent salary when absent', () => {
    expect(parseSalary('Great culture and growth.')).toBeNull();
  });
  it('splits technology lists into individual requirements', () => {
    const kafka = job.requirements.find((r) => r.concepts.includes('Kafka'));
    const k8s = job.requirements.find((r) => r.concepts.includes('Kubernetes'));
    expect(kafka?.kind).toBe('required_skill');
    expect(k8s).toBeDefined();
    expect(job.requirements.find((r) => r.concepts.includes('Terraform'))?.importance).toBe(
      'preferred',
    );
  });
  it('classifies kinds', () => {
    const kinds = new Set(job.requirements.map((r) => r.kind));
    for (const k of [
      'responsibility',
      'leadership',
      'experience',
      'education',
      'required_skill',
      'preferred_skill',
    ])
      expect(kinds).toContain(k);
    expect(job.requirements.find((r) => r.kind === 'education')?.hard).toBe(true);
  });
  it('ignores about-us and benefits text', () => {
    expect(job.requirements.some((r) => /payment infrastructure/.test(r.text))).toBe(false);
  });
});

describe('career stage', () => {
  it('merges overlapping roles and maps stage', () => {
    const y = computeExperienceYears(resume, NOW);
    // Jun 2015 - Dec 2018 (43 months) + Jan 2019 - Nov 2026 (95 months) = 138 months = 11.5 years
    expect(y.years).toBe(11.5);
    expect(stageForYears(y.years)).toBe('senior');
    expect(stageForYears(3)).toBe('early');
    expect(stageForYears(25)).toBe('executive');
  });
});

describe('evidence classification', () => {
  const req = (over: Partial<Requirement>): Requirement => ({
    id: 'r1',
    kind: 'required_skill',
    text: 'Kubernetes',
    concepts: ['Kubernetes'],
    minYears: null,
    importance: 'required',
    hard: false,
    sourceSection: 'Requirements',
    ...over,
  });
  const answer = (
    response: ClarificationResponse['response'],
    text = '',
  ): ClarificationResponse => ({
    requirementId: 'r1',
    response,
    text,
    answeredAt: '2026-11-01T00:00:00Z',
  });

  it('demonstrated when resume evidence exists, with source location', () => {
    const r = req({ text: 'Java', concepts: ['Java'] });
    const ev = findEvidence(r, resume, 11.5, NOW);
    const c = classifyRequirement(r, ev, undefined);
    expect(c.state).toBe('demonstrated');
    expect(c.evidence[0]?.location.section).toBe('experience');
    expect(c.evidence[0]?.location.bulletId).toBeTruthy();
  });
  it('unanswered => pending, never missing', () => {
    const r = req({});
    const c = classifyRequirement(r, findEvidence(r, resume, 11.5, NOW), undefined);
    expect(c.status).toBe('pending');
    expect(c.state).toBeNull();
    const deferred = classifyRequirement(r, [], answer('deferred'));
    expect(deferred.status).toBe('pending');
  });
  it('yes with text => user_confirmed (not demonstrated)', () => {
    const c = classifyRequirement(
      req({}),
      [],
      answer('yes', 'I ran our services on EKS for two years'),
    );
    expect(c.state).toBe('user_confirmed');
    expect(c.confirmation?.text).toBe('I ran our services on EKS for two years');
  });
  it('yes without any text stays pending (confirmation must be traceable)', () => {
    expect(classifyRequirement(req({}), [], answer('yes', '')).status).toBe('pending');
  });
  it('no or explicit skip => missing', () => {
    expect(classifyRequirement(req({}), [], answer('no')).state).toBe('missing');
    expect(classifyRequirement(req({}), [], answer('skipped')).state).toBe('missing');
  });
  it('confirmed never overrides real resume evidence and vice versa', () => {
    const r = req({ text: 'Java', concepts: ['Java'] });
    const c = classifyRequirement(
      r,
      findEvidence(r, resume, 11.5, NOW),
      answer('yes', 'yes I know Java'),
    );
    expect(c.state).toBe('demonstrated');
  });
  it('related-only evidence does not demonstrate', () => {
    const r = req({ text: 'Spring framework', concepts: ['Spring'] });
    const ev = findEvidence(
      r,
      {
        ...resume,
        skills: [],
        experience: [
          { ...resume.experience[0]!, bullets: [{ id: 'x', text: 'Built Hibernate data layers' }] },
        ],
      },
      11.5,
      NOW,
    );
    expect(ev.every((e) => e.strength === 'related')).toBe(true);
    expect(classifyRequirement(r, ev, undefined).status).toBe('pending');
  });
  it('work authorisation is never inferred', () => {
    const r = req({
      text: 'Candidates must be authorized to work in India.',
      concepts: [],
      kind: 'experience',
      hard: true,
    });
    const c = classifyRequirement(r, findEvidence(r, resume, 11.5, NOW), undefined);
    expect(c.status).toBe('pending');
    expect(c.requiresExplicitConfirmation).toBe(true);
  });
  it('years requirement computed from dated roles', () => {
    const r = req({
      kind: 'experience',
      text: '6+ years of software development',
      concepts: [],
      minYears: 6,
    });
    expect(classifyRequirement(r, findEvidence(r, resume, 11.5, NOW), undefined).state).toBe(
      'demonstrated',
    );
    const r2 = req({
      kind: 'experience',
      text: '5+ years with Kafka',
      concepts: ['Kafka'],
      minYears: 5,
    });
    expect(classifyRequirement(r2, findEvidence(r2, resume, 11.5, NOW), undefined).status).toBe(
      'pending',
    );
  });
});

describe('runAnalysis', () => {
  const a = runAnalysis({ resume, job, responses: [], layout: null, now: NOW });

  it('is deterministic', () => {
    const b = runAnalysis({ resume, job, responses: [], layout: null, now: NOW });
    expect(b.jobMatch.value).toBe(a.jobMatch.value);
    expect(b.evidenceQuality.value).toBe(a.evidenceQuality.value);
  });
  it('produces explainable scores with ranges for pending items', () => {
    expect(a.counts.pending).toBeGreaterThan(0);
    expect(a.jobMatch.value).not.toBeNull();
    expect(a.jobMatch.range!.low).toBeLessThanOrEqual(a.jobMatch.value!);
    expect(a.jobMatch.range!.high).toBeGreaterThanOrEqual(a.jobMatch.value!);
    expect(a.jobMatch.components).toHaveLength(5);
    expect(a.jobMatch.basis).toMatch(/30\/25\/20\/15\/10/);
    expect(a.jobMatch.name).not.toMatch(/ATS|probab/i);
    const sumW = a.jobMatch.components.reduce((n, c) => n + c.effectiveWeight, 0);
    expect(sumW).toBeCloseTo(1, 2);
  });
  it('keeps hard requirement warnings separate from the score', () => {
    expect(a.jobMatch.hardRequirementWarnings.some((w) => /authori[sz]ed to work/i.test(w))).toBe(
      true,
    );
  });
  it('asks clarification only for pending requirements, prioritised', () => {
    const pendingIds = new Set(
      a.classifications.filter((c) => c.status === 'pending').map((c) => c.requirementId),
    );
    expect(a.questions.length).toBeGreaterThan(0);
    for (const q of a.questions) expect(pendingIds.has(q.requirementId)).toBe(true);
    expect(a.questions[0]!.priority).toBeGreaterThanOrEqual(
      a.questions[a.questions.length - 1]!.priority,
    );
  });
  it('answering questions moves pending to classified and changes score deterministically', () => {
    const k8s = job.requirements.find((r) => r.concepts.includes('Kubernetes'))!;
    const tf = job.requirements.find((r) => r.concepts.includes('Terraform'))!;
    const b = runAnalysis({
      resume,
      job,
      layout: null,
      now: NOW,
      responses: [
        {
          requirementId: k8s.id,
          response: 'yes',
          text: 'Deployed our payment services to Kubernetes clusters at FinPay',
          answeredAt: NOW.toISOString(),
        },
        { requirementId: tf.id, response: 'no', text: '', answeredAt: NOW.toISOString() },
      ],
    });
    expect(b.counts.pending).toBe(a.counts.pending - 2);
    expect(b.classifications.find((c) => c.requirementId === k8s.id)?.state).toBe('user_confirmed');
    expect(b.classifications.find((c) => c.requirementId === tf.id)?.state).toBe('missing');
  });
  it('stage override is respected', () => {
    const b = runAnalysis({
      resume,
      job,
      responses: [],
      layout: null,
      now: NOW,
      stageOverride: 'lead',
    });
    expect(b.stage).toBe('lead');
    expect(b.stageSource).toBe('user');
  });
});
