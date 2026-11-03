import type { JobDescription, Requirement } from '../job/model';
import type { RequirementClassification } from '../evidence/engine';
import { STAGE_EXPECTATIONS, STAGE_INFO, type CareerStage } from '../career/stage';
import { conceptByName } from '../taxonomy/skills';
import { clamp100, normaliseWeights, type ExplainedScore } from './types';

export const JOB_MATCH_WEIGHTS = {
  required: 0.3,
  responsibilities: 0.25,
  experience: 0.2,
  evidence: 0.15,
  preferred: 0.1,
} as const;

type Dim = keyof typeof JOB_MATCH_WEIGHTS;

const LABELS: Record<Dim, string> = {
  required: 'Required skills and qualifications',
  responsibilities: 'Responsibilities alignment',
  experience: 'Relevant experience and seniority',
  evidence: 'Evidence and achievements',
  preferred: 'Preferred qualifications',
};

export function dimensionOf(req: Requirement): Dim {
  if (req.importance === 'preferred') return 'preferred';
  switch (req.kind) {
    case 'responsibility':
    case 'leadership':
      return 'responsibilities';
    case 'experience':
      return 'experience';
    case 'preferred_skill':
      return 'preferred';
    default:
      return 'required';
  }
}

/** Credit for a classified requirement. Pending requirements get no credit and are reported as a range. */
export function requirementCredit(c: RequirementClassification): number | null {
  if (c.status === 'pending' || c.state === null) return null;
  if (c.state === 'missing') return 0;
  if (c.state === 'user_confirmed') return 0.8;
  const best = c.evidence.find((e) => e.strength !== 'related');
  return best?.strength === 'listed' ? 0.75 : 1;
}

/** Stage-aware weight of a requirement within its dimension. */
function requirementWeight(req: Requirement, stage: CareerStage): number {
  const emphasis = STAGE_EXPECTATIONS[stage].emphasis;
  const cats = req.concepts.map((c) => conceptByName(c)?.category).filter(Boolean) as string[];
  const kindCat = req.kind === 'leadership' ? 'leadership' : undefined;
  const emphasised = [...cats, kindCat].some((c) => c && emphasis.includes(c));
  return (req.hard ? 1.25 : 1) * (emphasised ? 1.5 : 1);
}

export function impliedJobStage(job: JobDescription): CareerStage | null {
  const t = job.title.toLowerCase();
  if (/\b(vp|vice president|director|head of|cto|chief)\b/.test(t)) return 'executive';
  if (/\b(principal|staff|architect|distinguished)\b/.test(t)) return 'lead';
  if (/\b(senior|sr\.?|lead)\b/.test(t)) return 'senior';
  if (job.minYearsOverall !== null) {
    const y = job.minYearsOverall;
    return y >= 16 ? 'lead' : y >= 11 ? 'senior' : y >= 6 ? 'mid' : 'early';
  }
  if (/\b(junior|jr\.?|graduate|entry|associate)\b/.test(t)) return 'early';
  return null;
}

const STAGE_ORDER: CareerStage[] = ['early', 'mid', 'senior', 'lead', 'executive'];

export interface JobMatchInput {
  job: JobDescription;
  classifications: RequirementClassification[];
  stage: CareerStage;
  totalYears: number;
  /** Evidence quality score (0-100) restricted to job-relevant bullets, or null. */
  relevantEvidenceQuality: number | null;
}

/**
 * Deterministic Job Match Score. Not an ATS score and not an interview
 * probability. Pending requirements are excluded and shown as a range.
 */
export function computeJobMatch(
  input: JobMatchInput,
): ExplainedScore & { hardRequirementWarnings: string[] } {
  const { job, classifications, stage } = input;
  const byId = new Map(classifications.map((c) => [c.requirementId, c]));
  const acc: Record<
    Dim,
    {
      w: number;
      got: number;
      pendingW: number;
      total: number;
      dem: number;
      conf: number;
      miss: number;
      pend: number;
    }
  > = {
    required: { w: 0, got: 0, pendingW: 0, total: 0, dem: 0, conf: 0, miss: 0, pend: 0 },
    responsibilities: { w: 0, got: 0, pendingW: 0, total: 0, dem: 0, conf: 0, miss: 0, pend: 0 },
    experience: { w: 0, got: 0, pendingW: 0, total: 0, dem: 0, conf: 0, miss: 0, pend: 0 },
    evidence: { w: 0, got: 0, pendingW: 0, total: 0, dem: 0, conf: 0, miss: 0, pend: 0 },
    preferred: { w: 0, got: 0, pendingW: 0, total: 0, dem: 0, conf: 0, miss: 0, pend: 0 },
  };
  const positives: string[] = [];
  const gaps: string[] = [];
  const hardRequirementWarnings: string[] = [];
  for (const req of job.requirements) {
    const c = byId.get(req.id);
    if (!c) continue;
    const d = dimensionOf(req);
    const w = requirementWeight(req, stage);
    const a = acc[d];
    a.total++;
    const credit = requirementCredit(c);
    if (credit === null) {
      a.pendingW += w;
      a.pend++;
    } else {
      a.w += w;
      a.got += w * credit;
      if (c.state === 'demonstrated') a.dem++;
      if (c.state === 'user_confirmed') a.conf++;
      if (c.state === 'missing') a.miss++;
    }
    if (c.state === 'demonstrated' && positives.length < 8)
      positives.push(`${short(req.text)} — ${c.reasoning}`);
    if (c.state === 'missing' && gaps.length < 8) gaps.push(short(req.text));
    if (req.hard && c.state !== 'demonstrated' && c.state !== 'user_confirmed') {
      hardRequirementWarnings.push(
        `${c.state === 'missing' ? 'Not met' : 'Unconfirmed'}: ${short(req.text, 160)}`,
      );
    }
  }

  // Seniority fit (part of experience dimension): candidate years vs job's implied stage.
  const jobStage = impliedJobStage(job);
  let seniorityNote = 'Job seniority could not be determined from the posting.';
  if (jobStage) {
    const need = Math.max(job.minYearsOverall ?? 0, STAGE_INFO[jobStage].minYears);
    const seniorityFit = need === 0 ? 1 : Math.min(1, input.totalYears / need);
    const gap = STAGE_ORDER.indexOf(jobStage) - STAGE_ORDER.indexOf(stage);
    seniorityNote = `Posting implies ${STAGE_INFO[jobStage].label}; your dated experience is ${input.totalYears} years (${STAGE_INFO[stage].label}).${gap > 0 ? ' The role is more senior than your documented experience.' : ''}`;
    acc.experience.w += 1;
    acc.experience.got += seniorityFit;
  }

  const dimScore = (d: Dim, pendingAs: number): number | null => {
    const a = acc[d];
    const denom = a.w + (pendingAs >= 0 ? a.pendingW : 0);
    if (denom === 0) return null;
    return ((a.got + (pendingAs >= 0 ? a.pendingW * pendingAs : 0)) / denom) * 100;
  };

  const evidenceScore = input.relevantEvidenceQuality;
  const build = (pendingAs: number) =>
    normaliseWeights(
      (Object.keys(JOB_MATCH_WEIGHTS) as Dim[]).map((d) => ({
        key: d,
        label: LABELS[d],
        weight: JOB_MATCH_WEIGHTS[d],
        score: d === 'evidence' ? evidenceScore : dimScore(d, pendingAs),
      })),
    );
  const sum = (items: ReturnType<typeof build>) =>
    items.reduce((n, i) => n + (i.score ?? 0) * i.effectiveWeight, 0);

  const central = build(-1);
  const anyAssessed = central.some((c) => c.score !== null);
  const low = sum(build(0));
  const high = sum(build(1));
  const totalPending = (Object.values(acc) as { pend: number }[]).reduce((n, a) => n + a.pend, 0);

  const components = central.map((c) => {
    const a = acc[c.key as Dim];
    let explanation: string;
    if (c.key === 'evidence') {
      explanation =
        evidenceScore === null
          ? 'No job-relevant resume lines to assess yet.'
          : 'Evidence Quality of resume lines that support this job’s requirements.';
    } else if (c.score === null) {
      explanation = a.pend
        ? `${a.pend} requirement(s) awaiting clarification; not yet scored.`
        : 'The posting has no requirements in this category.';
    } else {
      explanation = `${a.dem} demonstrated, ${a.conf} confirmed by you, ${a.miss} missing, ${a.pend} pending of ${a.total}.`;
      if (c.key === 'experience') explanation += ` ${seniorityNote}`;
    }
    return {
      key: c.key,
      label: c.label,
      weight: c.weight,
      effectiveWeight: Math.round(c.effectiveWeight * 1000) / 1000,
      score: c.score === null ? null : clamp100(c.score),
      explanation,
    };
  });

  const uncertainty: string[] = [];
  if (totalPending)
    uncertainty.push(
      `${totalPending} requirement(s) are pending clarification. The score could range from ${clamp100(low)} to ${clamp100(high)} once they are answered.`,
    );
  if (components.some((c) => c.score === null))
    uncertainty.push(
      'Some dimensions could not be assessed; their weight was redistributed to the others.',
    );
  uncertainty.push(
    'Requirement extraction is heuristic. Review the requirement list for anything missed or misread.',
  );

  const recommendations: string[] = [];
  if (totalPending)
    recommendations.push('Answer the pending clarification questions to firm up the score.');
  const confirmed = (Object.values(acc) as { conf: number }[]).reduce((n, a) => n + a.conf, 0);
  if (confirmed)
    recommendations.push(
      `Document the ${confirmed} skill(s) you confirmed so they become demonstrated evidence in a new resume version.`,
    );
  if (evidenceScore !== null && evidenceScore < 60)
    recommendations.push(
      'Strengthen relevant bullets with context, your personal contribution and real outcomes.',
    );
  if (gaps.length)
    recommendations.push(
      'Missing requirements cannot be fixed by rewording; consider whether the role is a fit or how to address them in your application.',
    );

  return {
    name: 'Job Match Score',
    value: anyAssessed ? clamp100(sum(central)) : null,
    range: anyAssessed ? { low: clamp100(low), high: clamp100(high) } : null,
    components,
    basis:
      'Weighted average of five dimensions (30/25/20/15/10). Demonstrated = full credit (75% if only listed in skills), confirmed by you = 80%, missing = 0. Pending requirements are excluded from the central score and shown as a range. Requirements in areas emphasised for your career stage carry 1.5× weight; explicit must-haves carry 1.25×.',
    positives,
    gaps,
    uncertainty,
    recommendations,
    hardRequirementWarnings,
  };
}

function short(s: string, n = 110) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
