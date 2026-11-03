import type { ResumeContent } from '../resume/model';
import type { RequirementClassification } from '../evidence/engine';
import { findConcepts } from '../taxonomy/skills';
import { STAGE_EXPECTATIONS, type CareerStage } from '../career/stage';
import { clamp100, type ExplainedScore } from './types';

export const ACTION_VERBS =
  /^(architected|designed|built|led|developed|implemented|created|launched|delivered|owned|drove|migrated|automated|optimi[sz]ed|reduced|increased|improved|scaled|established|introduced|mentored|managed|defined|spearheaded|engineered|refactored|modernized|modernised|streamlined|resolved|integrated|deployed|shipped|negotiated|coordinated|authored|researched|analy[sz]ed|accelerated|consolidated|rebuilt|redesigned|initiated|directed|oversaw|hired|grew|transformed|wrote|configured|maintained|tested|supported)\b/i;
const WEAK_START =
  /^(responsible for|worked on|involved in|helped|assisted|participated in|tasked with|duties included)/i;
const IMPACT =
  /(\d+(\.\d+)?\s?%|\b\d+(\.\d+)?x\b|[$£€₹]\s?\d|\b(reduced|increased|improved|cut|saved|grew|boosted|lowered|accelerated)\b[^.]{0,60}\b(by|from|to)\s+\d)/i;
const SCALE =
  /\b\d[\d,.]*\s?(k|m|million|billion|bn)?\+?\s?(users|customers|requests|transactions|tps|rps|qps|events|messages|services|microservices|servers|nodes|engineers|developers|people|members|reports|countries|markets|clients|records|rows|tb|gb|pb)\b|\bteam of \d+\b/i;
const CONTEXT = /\b(for|to|across|using|with|within|by|that|enabling|serving)\b/i;

export interface BulletAssessment {
  location: { section: 'experience' | 'projects'; itemId: string; bulletId: string };
  text: string;
  signals: Record<
    'specificity' | 'context' | 'contribution' | 'depth' | 'impact' | 'scale' | 'relevance',
    number
  >;
  score: number;
}

function weightsFor(stage: CareerStage) {
  const e = STAGE_EXPECTATIONS[stage];
  return e.expectsImpact
    ? {
        specificity: 0.15,
        context: 0.1,
        contribution: 0.15,
        depth: 0.15,
        impact: 0.2,
        scale: 0.1,
        relevance: 0.15,
      }
    : {
        specificity: 0.2,
        context: 0.15,
        contribution: 0.15,
        depth: 0.2,
        impact: 0.1,
        scale: 0.05,
        relevance: 0.15,
      };
}

export function assessBullet(
  text: string,
  relevant: boolean,
  stage: CareerStage,
): Omit<BulletAssessment, 'location' | 'text'> {
  const concepts = findConcepts(text);
  const signals = {
    specificity: concepts.length ? 1 : /\b[A-Z][a-zA-Z0-9]+\b/.test(text.slice(1)) ? 0.5 : 0,
    context: text.length >= 60 && CONTEXT.test(text) ? 1 : text.length >= 35 ? 0.5 : 0,
    contribution: ACTION_VERBS.test(text.trim()) ? 1 : WEAK_START.test(text.trim()) ? 0.3 : 0.5,
    depth:
      concepts.length >= 2 || concepts.some((c) => c.category === 'architecture')
        ? 1
        : concepts.length
          ? 0.5
          : 0,
    impact: IMPACT.test(text) ? 1 : 0,
    scale: SCALE.test(text) ? 1 : 0,
    relevance: relevant ? 1 : 0,
  };
  const w = weightsFor(stage);
  const score =
    (Object.keys(w) as (keyof typeof w)[]).reduce((n, k) => n + signals[k] * w[k], 0) * 100;
  return { signals, score: clamp100(score) };
}

export function assessBullets(
  resume: ResumeContent,
  classifications: RequirementClassification[] | null,
  stage: CareerStage,
): BulletAssessment[] {
  const relevantIds = new Set(
    (classifications ?? []).flatMap((c) =>
      c.evidence.filter((e) => e.location.bulletId).map((e) => e.location.bulletId as string),
    ),
  );
  const out: BulletAssessment[] = [];
  for (const e of resume.experience) {
    for (const b of e.bullets) {
      out.push({
        location: { section: 'experience', itemId: e.id, bulletId: b.id },
        text: b.text,
        ...assessBullet(b.text, relevantIds.has(b.id), stage),
      });
    }
  }
  for (const p of resume.projects) {
    for (const b of p.bullets) {
      out.push({
        location: { section: 'projects', itemId: p.id, bulletId: b.id },
        text: b.text,
        ...assessBullet(b.text, relevantIds.has(b.id), stage),
      });
    }
  }
  return out;
}

const SIGNAL_LABELS = {
  specificity: 'Specificity (named technologies or systems)',
  context: 'Context (what, for whom, using what)',
  contribution: 'Individual contribution (clear action verb)',
  depth: 'Technical depth',
  impact: 'Measurable impact',
  scale: 'Scale',
  relevance: 'Relevance to this job',
};

/**
 * Evidence Quality: how well bullets support claims. With `relevantOnly`, only
 * bullets used as evidence for job requirements are considered.
 */
export function computeEvidenceQuality(
  resume: ResumeContent,
  classifications: RequirementClassification[] | null,
  stage: CareerStage,
  relevantOnly = false,
): ExplainedScore & { bullets: BulletAssessment[] } {
  const all = assessBullets(resume, classifications, stage);
  const bullets = relevantOnly ? all.filter((b) => b.signals.relevance === 1) : all;
  const w = weightsFor(stage);
  if (!bullets.length) {
    return {
      name: 'Evidence Quality',
      value: null,
      range: null,
      components: [],
      bullets,
      basis: 'Average of per-bullet signals across experience and project bullets.',
      positives: [],
      gaps: [],
      uncertainty: ['No bullets to assess.'],
      recommendations: ['Add bullets describing what you did, how, and with what result.'],
    };
  }
  const keys = Object.keys(w) as (keyof typeof w)[];
  const components = keys.map((k) => {
    const avg = bullets.reduce((n, b) => n + b.signals[k], 0) / bullets.length;
    return {
      key: k,
      label: SIGNAL_LABELS[k],
      weight: w[k],
      effectiveWeight: w[k],
      score: clamp100(avg * 100),
      explanation: `${Math.round(avg * 100)}% average across ${bullets.length} bullet(s).`,
    };
  });
  const value = clamp100(bullets.reduce((n, b) => n + b.score, 0) / bullets.length);
  const weak = [...bullets].sort((a, b) => a.score - b.score).slice(0, 3);
  const strong = [...bullets].sort((a, b) => b.score - a.score).slice(0, 3);
  const recs: string[] = [];
  if ((components.find((c) => c.key === 'impact')?.score ?? 0) < 40)
    recs.push(
      'Where you have real figures (latency, cost, adoption, time saved), add them. Do not estimate numbers you cannot support.',
    );
  if ((components.find((c) => c.key === 'contribution')?.score ?? 0) < 60)
    recs.push(
      'Start bullets with what you personally did (e.g. "Designed…", "Led…") instead of "Responsible for…".',
    );
  if ((components.find((c) => c.key === 'context')?.score ?? 0) < 60)
    recs.push('Add context: the system, the users, and the technologies involved.');
  if (
    STAGE_EXPECTATIONS[stage].expectsLeadership &&
    (components.find((c) => c.key === 'scale')?.score ?? 0) < 30
  )
    recs.push('At your career stage, show scope: team size, number of services, users or markets.');
  return {
    name: 'Evidence Quality',
    value,
    range: null,
    components,
    bullets,
    basis: `Average per-bullet score from seven signals, weighted for your career stage (${STAGE_EXPECTATIONS[stage].expectsImpact ? 'impact and scale expected' : 'emphasis on specificity and depth'}). Signals are detected with deterministic text patterns.`,
    positives: strong
      .filter((b) => b.score >= 70)
      .map((b) => `“${b.text.slice(0, 120)}” (${b.score})`),
    gaps: weak.filter((b) => b.score < 50).map((b) => `“${b.text.slice(0, 120)}” (${b.score})`),
    uncertainty: ['Pattern-based signals can miss impact described in unusual wording.'],
    recommendations: recs,
  };
}
