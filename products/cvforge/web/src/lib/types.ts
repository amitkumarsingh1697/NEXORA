import type { ResumeContent, ExplainedScore, EvidenceItem, ResumeDiff } from '@nexora/cvforge-core';

export type { ResumeContent, ExplainedScore, EvidenceItem, ResumeDiff };

export interface VersionSummary {
  id: string;
  versionNumber: number;
  parentVersionId?: string | null;
  status: 'draft' | 'finalized';
  origin: 'original_parse' | 'edit' | 'tailored';
  label: string;
  workspaceId?: string | null;
  createdAt: string;
  finalizedAt?: string | null;
}

export interface ResumeListItem {
  id: string;
  title: string;
  createdAt: string;
  versions: VersionSummary[];
}

export interface Counts {
  demonstrated: number;
  user_confirmed: number;
  missing: number;
  pending: number;
  total: number;
}

export interface WorkspaceListItem {
  id: string;
  name: string;
  updatedAt: string;
  job: { title: string; company: string; location: string; country: string; source: string } | null;
  latestAnalysis: {
    jobMatchValue: number | null;
    atsValue: number | null;
    evidenceQualityValue: number | null;
    counts: Counts;
    createdAt: string;
  } | null;
}

export interface Requirement {
  id: string;
  position: number;
  kind: string;
  text: string;
  concepts: string[];
  minYears: number | null;
  importance: 'required' | 'preferred';
  hard: boolean;
  sourceSection: string;
  userEdited: boolean;
}

export interface Question {
  id: string;
  requirementId: string;
  question: string;
  rationale: string;
  priority: number;
  response: 'yes' | 'no' | 'skipped' | null;
  responseText: string;
  answeredAt: string | null;
}

export interface EvidenceRow {
  requirementId: string;
  status: 'pending' | 'classified';
  state: 'demonstrated' | 'user_confirmed' | 'missing' | null;
  evidence: EvidenceItem[];
  confirmationText: string | null;
  confirmationDate: string | null;
  reasoning: string;
  requiresExplicitConfirmation: boolean;
}

export interface SuggestionRow {
  id: string;
  type: string;
  target: { section: string; itemId?: string; bulletId?: string };
  original: string | null;
  proposed: string;
  editedProposed: string | null;
  reason: string;
  evidence: { kind: string; text: string; requirementId?: string }[];
  source: 'deterministic' | 'ai';
  decision: 'pending' | 'accepted' | 'rejected';
  appliedVersionId: string | null;
  baseVersionId: string;
}

export interface WorkspaceDetail {
  workspace: {
    id: string;
    name: string;
    resumeId: string;
    baseVersionId: string;
    createdAt: string;
  };
  job: {
    id: string;
    rawText: string;
    title: string;
    company: string;
    location: string;
    country: string;
    workMode: string;
    employmentType: string;
    salary: {
      text: string;
      currency: string | null;
      min: number | null;
      max: number | null;
      period: string;
    } | null;
    workAuthorization: string[];
    languages: string[];
    source: string;
    sourceUrl: string;
    sourceSite: string;
    minYearsOverall: number | null;
  };
  requirements: Requirement[];
  questions: Question[];
  analysis: null | {
    id: string;
    createdAt: string;
    stage: string;
    stageSource: string;
    totalYears: string;
    jobMatch: ExplainedScore & { hardRequirementWarnings: string[] };
    ats: ExplainedScore;
    evidenceQuality: ExplainedScore;
    counts: Counts;
    resumeVersionId: string;
    stale: boolean;
    engineVersion: string;
  };
  evidence: EvidenceRow[];
  suggestions: SuggestionRow[];
  baseVersion: { id: string; versionNumber: number; label: string; origin: string };
}
