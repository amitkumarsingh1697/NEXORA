import type { JobDescription } from './job/model';
import type { ResumeContent } from './resume/model';
import type { LayoutSignals } from './resume/extract';
import { computeExperienceYears, stageForYears, type CareerStage } from './career/stage';
import {
  classifyAll,
  type ClarificationResponse,
  type RequirementClassification,
} from './evidence/engine';
import {
  generateClarificationQuestions,
  type ClarificationQuestion,
} from './clarification/generate';
import { computeJobMatch } from './scoring/job-match';
import { computeAtsCompatibility } from './scoring/ats';
import { computeEvidenceQuality } from './scoring/evidence-quality';
import type { ExplainedScore } from './scoring/types';

export interface AnalysisInput {
  resume: ResumeContent;
  job: JobDescription;
  responses: ClarificationResponse[];
  layout: LayoutSignals | null;
  headings?: { title: string; recognised: boolean }[];
  /** User override of their career stage; otherwise computed from dated roles. */
  stageOverride?: CareerStage | null;
  now?: Date;
}

export interface AnalysisResult {
  engineVersion: string;
  stage: CareerStage;
  stageSource: 'computed' | 'user';
  totalYears: number;
  undatedRoles: number;
  classifications: RequirementClassification[];
  questions: ClarificationQuestion[];
  jobMatch: ExplainedScore & { hardRequirementWarnings: string[] };
  ats: ExplainedScore;
  evidenceQuality: ExplainedScore;
  counts: {
    demonstrated: number;
    user_confirmed: number;
    missing: number;
    pending: number;
    total: number;
  };
}

export const ENGINE_VERSION = 'cvforge-analysis/1.0.0';

/** Full deterministic analysis. Same inputs always produce the same scores. */
export function runAnalysis(input: AnalysisInput): AnalysisResult {
  const now = input.now ?? new Date();
  const yrs = computeExperienceYears(input.resume, now);
  const stage = input.stageOverride ?? stageForYears(yrs.years);
  const classifications = classifyAll(
    input.job.requirements,
    input.resume,
    input.responses,
    yrs.years,
    now,
  );
  const relevantEq = computeEvidenceQuality(input.resume, classifications, stage, true);
  const eq = computeEvidenceQuality(input.resume, classifications, stage, false);
  const { bullets: _bullets, ...evidenceQuality } = eq;
  const jobMatch = computeJobMatch({
    job: input.job,
    classifications,
    stage,
    totalYears: yrs.years,
    relevantEvidenceQuality: relevantEq.value,
  });
  const ats = computeAtsCompatibility({
    layout: input.layout,
    content: input.resume,
    headings: input.headings,
  });
  const counts = {
    demonstrated: 0,
    user_confirmed: 0,
    missing: 0,
    pending: 0,
    total: classifications.length,
  };
  for (const c of classifications) {
    if (c.status === 'pending') counts.pending++;
    else if (c.state) counts[c.state]++;
  }
  return {
    engineVersion: ENGINE_VERSION,
    stage,
    stageSource: input.stageOverride ? 'user' : 'computed',
    totalYears: yrs.years,
    undatedRoles: yrs.undatedRoles,
    classifications,
    questions: generateClarificationQuestions(input.job.requirements, classifications, stage),
    jobMatch,
    ats,
    evidenceQuality,
    counts,
  };
}
