import type { ResumeContent } from '../resume/model';
import { monthIndex } from '../resume/dates';

export const CAREER_STAGES = ['early', 'mid', 'senior', 'lead', 'executive'] as const;
export type CareerStage = (typeof CAREER_STAGES)[number];

export const STAGE_INFO: Record<CareerStage, { label: string; range: string; minYears: number }> = {
  early: { label: 'Early career', range: '2–5 years', minYears: 0 },
  mid: { label: 'Mid-level', range: '6–10 years', minYears: 6 },
  senior: { label: 'Senior', range: '11–15 years', minYears: 11 },
  lead: { label: 'Lead / Principal / Architect', range: '16–20 years', minYears: 16 },
  executive: { label: 'Executive / Highly experienced', range: '21–30 years', minYears: 21 },
};

export function stageForYears(years: number): CareerStage {
  if (years >= 21) return 'executive';
  if (years >= 16) return 'lead';
  if (years >= 11) return 'senior';
  if (years >= 6) return 'mid';
  return 'early';
}

export interface ExperienceYears {
  years: number;
  /** Roles that could not be dated and are therefore excluded from the total. */
  undatedRoles: number;
  /** Months counted once even if roles overlap. */
  months: number;
}

/**
 * Total professional experience from dated roles, merging overlaps so that
 * concurrent roles are not double counted. `now` is injectable for tests.
 */
export function computeExperienceYears(
  resume: ResumeContent,
  now: Date = new Date(),
): ExperienceYears {
  const nowIdx = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const intervals: [number, number][] = [];
  let undated = 0;
  for (const e of resume.experience) {
    if (!e.startDate) {
      undated++;
      continue;
    }
    const start = monthIndex(e.startDate);
    // A year-only end date counts through December of that year.
    const end =
      e.current || !e.endDate
        ? nowIdx
        : e.endDate.length === 4
          ? monthIndex(e.endDate) + 11
          : monthIndex(e.endDate);
    if (end >= start) intervals.push([start, Math.min(end, nowIdx)]);
  }
  intervals.sort((a, b) => a[0] - b[0]);
  let months = 0;
  let curStart = -1;
  let curEnd = -2;
  for (const [s, e] of intervals) {
    if (s > curEnd + 1) {
      if (curEnd >= curStart && curStart >= 0) months += curEnd - curStart + 1;
      curStart = s;
      curEnd = e;
    } else curEnd = Math.max(curEnd, e);
  }
  if (curStart >= 0) months += curEnd - curStart + 1;
  return { years: Math.round((months / 12) * 10) / 10, undatedRoles: undated, months };
}

/**
 * Evidence expectations differ by stage. Used by scoring and clarification so
 * an architect is not assessed with early-career expectations.
 */
export interface StageExpectations {
  /** Requirement categories that matter more at this stage. */
  emphasis: string[];
  /** Whether impact/scale evidence is expected for strong evidence quality. */
  expectsImpact: boolean;
  expectsLeadership: boolean;
  expectsArchitecture: boolean;
  questionFocus: string;
}

export const STAGE_EXPECTATIONS: Record<CareerStage, StageExpectations> = {
  early: {
    emphasis: ['language', 'framework', 'practice'],
    expectsImpact: false,
    expectsLeadership: false,
    expectsArchitecture: false,
    questionFocus: 'hands-on implementation and what you personally built',
  },
  mid: {
    emphasis: ['framework', 'cloud', 'data', 'practice'],
    expectsImpact: true,
    expectsLeadership: false,
    expectsArchitecture: false,
    questionFocus: 'ownership of features or services and measurable results',
  },
  senior: {
    emphasis: ['architecture', 'cloud', 'practice', 'leadership'],
    expectsImpact: true,
    expectsLeadership: true,
    expectsArchitecture: true,
    questionFocus: 'design decisions, technical ownership, mentoring and scale',
  },
  lead: {
    emphasis: ['architecture', 'leadership'],
    expectsImpact: true,
    expectsLeadership: true,
    expectsArchitecture: true,
    questionFocus: 'architecture, cross-team influence, technical strategy and delivery scale',
  },
  executive: {
    emphasis: ['leadership', 'architecture', 'domain'],
    expectsImpact: true,
    expectsLeadership: true,
    expectsArchitecture: true,
    questionFocus:
      'organisational leadership, strategy, business outcomes and stakeholder management',
  },
};
