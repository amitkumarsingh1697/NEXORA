import { z } from 'zod';
import type { Requirement } from '../job/model';
import {
  resumeTextUnits,
  type ResumeContent,
  type ResumeLocation,
  type ResumeTextUnit,
} from '../resume/model';
import { conceptByName, mentionsConcept, CONCEPTS } from '../taxonomy/skills';
import { monthIndex } from '../resume/dates';

export const EVIDENCE_STATES = ['demonstrated', 'user_confirmed', 'missing'] as const;
export type EvidenceState = (typeof EVIDENCE_STATES)[number];
export type ClassificationStatus = 'pending' | 'classified';

export interface EvidenceItem {
  location: ResumeLocation;
  text: string;
  context: string;
  /** 0-1: how strongly this text supports the requirement. */
  confidence: number;
  matched: string[];
  /** 'direct' = the concept/phrase itself; 'listed' = skills list only; 'related' = implied by a related concept. */
  strength: 'direct' | 'listed' | 'related' | 'computed';
}

export const clarificationResponseSchema = z.object({
  requirementId: z.string(),
  response: z.enum(['yes', 'no', 'skipped', 'deferred']),
  /** The user's own words. Required for "yes" so a confirmation is always traceable. */
  text: z.string().max(4000).default(''),
  answeredAt: z.string(),
});
export type ClarificationResponse = z.infer<typeof clarificationResponseSchema>;

export interface RequirementClassification {
  requirementId: string;
  status: ClassificationStatus;
  /** Final state; null only while status is "pending". */
  state: EvidenceState | null;
  evidence: EvidenceItem[];
  confirmation: { text: string; date: string; source: 'clarification' } | null;
  reasoning: string;
  /** Requirement must never be satisfied from resume inference (e.g. work authorisation). */
  requiresExplicitConfirmation: boolean;
}

const STOP = new Set(
  'with that this from have will your their they them into such using use used able strong good excellent knowledge experience working work understanding skills skill ability years year team teams other across within including include about also must should would could plus nice well more than through our you are the and for its who what when where which while'.split(
    ' ',
  ),
);

function keywords(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9+#. ]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 4 && !STOP.has(w))
        .map(stem),
    ),
  ];
}
function stem(w: string) {
  return w.replace(/(ing|ed|es|s|ment|ion|ions)$/, '');
}

const AUTH_RE =
  /\b(visa|sponsorship|authori[sz]ed to work|work permit|right to work|citizenship|security clearance)\b/i;

function unitWeight(u: ResumeTextUnit): { confidence: number; strength: EvidenceItem['strength'] } {
  if (u.location.section === 'skills') return { confidence: 0.6, strength: 'listed' };
  if (u.location.section === 'summary' || u.location.section === 'personal')
    return { confidence: 0.55, strength: 'direct' };
  if (u.location.field === 'title') return { confidence: 0.75, strength: 'direct' };
  return { confidence: 0.9, strength: 'direct' };
}

/** Years of dated experience in roles that mention a concept anywhere in the role. */
export function conceptYears(resume: ResumeContent, concept: string, now = new Date()): number {
  const nowIdx = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const months = new Set<number>();
  for (const e of resume.experience) {
    if (!e.startDate) continue;
    const blob = [e.title, ...e.bullets.map((b) => b.text)].join(' \n ');
    if (!mentionsConcept(blob, concept)) continue;
    const s = monthIndex(e.startDate);
    const end =
      e.current || !e.endDate
        ? nowIdx
        : e.endDate.length === 4
          ? monthIndex(e.endDate) + 11
          : monthIndex(e.endDate);
    for (let m = s; m <= Math.min(end, nowIdx); m++) months.add(m);
  }
  return Math.round((months.size / 12) * 10) / 10;
}

/** Find resume evidence for one requirement. Purely deterministic. */
export function findEvidence(
  req: Requirement,
  resume: ResumeContent,
  totalYears: number,
  now = new Date(),
): EvidenceItem[] {
  const units = resumeTextUnits(resume);
  const out: EvidenceItem[] = [];
  if (AUTH_RE.test(req.text)) return out; // never inferred from a resume

  if (req.kind === 'education') {
    const level = /\b(phd|doctorate)\b/i.test(req.text)
      ? 3
      : /\b(master|m\.?tech|msc|m\.?s\b|mba)\b/i.test(req.text)
        ? 2
        : 1;
    for (const ed of resume.education) {
      const d = `${ed.degree} ${ed.field}`;
      const have = /\b(phd|ph\.d|doctorate)\b/i.test(d)
        ? 3
        : /\b(master|m\.?\s?tech|msc|m\.?sc|m\.?s\b|mba|mca|m\.?e\b)\b/i.test(d)
          ? 2
          : /\b(bachelor|b\.?\s?tech|bsc|b\.?sc|b\.?e\b|b\.?s\b|bca|b\.?a\b)\b/i.test(d)
            ? 1
            : 0;
      if (have >= level) {
        out.push({
          location: { section: 'education', itemId: ed.id },
          text: [ed.degree, ed.field, ed.institution].filter(Boolean).join(', '),
          context: 'Education',
          confidence: 0.9,
          matched: [ed.degree],
          strength: 'direct',
        });
      }
    }
    return out;
  }

  if (req.kind === 'language') {
    for (const l of resume.languages) {
      if (
        new RegExp(`\\b${l.name.replace(/[^A-Za-z]/g, '')}\\b`, 'i').test(req.text) &&
        l.name.trim()
      ) {
        out.push({
          location: { section: 'languages', itemId: l.id },
          text: `${l.name} ${l.proficiency}`.trim(),
          context: 'Languages',
          confidence: 0.85,
          matched: [l.name],
          strength: 'direct',
        });
      }
    }
    return out;
  }

  if (req.kind === 'experience' && req.minYears !== null) {
    const years = req.concepts.length
      ? Math.min(...req.concepts.map((c) => conceptYears(resume, c, now)))
      : totalYears;
    if (years >= req.minYears) {
      out.push({
        location: { section: 'experience' },
        text: req.concepts.length
          ? `${years} years in dated roles mentioning ${req.concepts.join(', ')}`
          : `${totalYears} years of dated professional experience`,
        context: 'Computed from employment dates',
        confidence: 0.85,
        matched: req.concepts,
        strength: 'computed',
      });
    }
    return out;
  }

  if (req.concepts.length) {
    for (const concept of req.concepts) {
      for (const u of units) {
        if (mentionsConcept(u.text, concept)) {
          const w = unitWeight(u);
          out.push({
            location: u.location,
            text: u.text,
            context: u.context,
            confidence: w.confidence,
            matched: [concept],
            strength: w.strength,
          });
        }
      }
      // Related-concept evidence (e.g. "Spring Boot" implies Java) is weak and never demonstrates on its own.
      const implying = CONCEPTS.filter((k) => k.related?.includes(concept));
      for (const k of implying) {
        for (const u of units) {
          if (
            mentionsConcept(u.text, k.name) &&
            !out.some((e) => sameLoc(e.location, u.location))
          ) {
            out.push({
              location: u.location,
              text: u.text,
              context: u.context,
              confidence: 0.35,
              matched: [concept],
              strength: 'related',
            });
          }
        }
      }
    }
  } else {
    const kw = keywords(req.text);
    if (kw.length >= 2) {
      for (const u of units) {
        if (u.location.section === 'skills') continue;
        const uk = new Set(keywords(u.text));
        const hit = kw.filter((k) => uk.has(k));
        const ratio = hit.length / kw.length;
        if (hit.length >= 2 && ratio >= 0.4) {
          out.push({
            location: u.location,
            text: u.text,
            context: u.context,
            confidence: Math.round(Math.min(0.85, ratio) * 100) / 100,
            matched: hit,
            strength: 'direct',
          });
        }
      }
    }
  }
  return out.sort((a, b) => b.confidence - a.confidence).slice(0, 8);
}

function sameLoc(a: ResumeLocation, b: ResumeLocation) {
  return (
    a.section === b.section &&
    a.itemId === b.itemId &&
    a.bulletId === b.bulletId &&
    a.field === b.field
  );
}

/** Threshold at which resume evidence counts as demonstrated. */
export const DEMONSTRATED_THRESHOLD = 0.55;

function demonstrates(req: Requirement, evidence: EvidenceItem[]): boolean {
  const strong = evidence.filter(
    (e) => e.strength !== 'related' && e.confidence >= DEMONSTRATED_THRESHOLD,
  );
  if (!strong.length) return false;
  if (req.concepts.length > 1 && req.kind !== 'experience') {
    const covered = new Set(strong.flatMap((e) => e.matched));
    return req.concepts.filter((c) => covered.has(c)).length / req.concepts.length >= 0.6;
  }
  return true;
}

/**
 * Combine resume evidence and clarification responses into a classification.
 *
 * Rules (see documentation/product/EVIDENCE_MODEL.md):
 *  - Resume evidence at or above threshold => demonstrated.
 *  - Otherwise a "yes" answer with the user's own text => user_confirmed (never demonstrated).
 *  - "no" or an explicit skip => missing.
 *  - No answer or "deferred" => pending (never missing).
 */
export function classifyRequirement(
  req: Requirement,
  evidence: EvidenceItem[],
  response: ClarificationResponse | undefined,
): RequirementClassification {
  const requiresExplicitConfirmation = AUTH_RE.test(req.text);
  const base = { requirementId: req.id, evidence, requiresExplicitConfirmation };
  if (!requiresExplicitConfirmation && demonstrates(req, evidence)) {
    const best = evidence[0];
    return {
      ...base,
      status: 'classified',
      state: 'demonstrated',
      confirmation: null,
      reasoning: `Found in resume: ${best?.context ?? 'resume'}${best?.strength === 'listed' ? ' (listed in skills without supporting context)' : ''}.`,
    };
  }
  if (response?.response === 'yes' && response.text.trim().length >= 3) {
    return {
      ...base,
      status: 'classified',
      state: 'user_confirmed',
      confirmation: {
        text: response.text.trim(),
        date: response.answeredAt,
        source: 'clarification',
      },
      reasoning: 'Confirmed by you during clarification; not yet documented in the resume.',
    };
  }
  if (response?.response === 'no') {
    return {
      ...base,
      status: 'classified',
      state: 'missing',
      confirmation: null,
      reasoning: 'You indicated you do not have this experience.',
    };
  }
  if (response?.response === 'skipped') {
    return {
      ...base,
      status: 'classified',
      state: 'missing',
      confirmation: null,
      reasoning: 'Not established: the clarification question was explicitly skipped.',
    };
  }
  const why = requiresExplicitConfirmation
    ? 'Work authorisation is never inferred from a resume; only you can confirm it.'
    : evidence.some((e) => e.strength === 'related')
      ? 'Only indirect evidence was found; clarification needed.'
      : 'No resume evidence found yet; clarification needed.';
  return { ...base, status: 'pending', state: null, confirmation: null, reasoning: why };
}

export function classifyAll(
  requirements: Requirement[],
  resume: ResumeContent,
  responses: ClarificationResponse[],
  totalYears: number,
  now = new Date(),
): RequirementClassification[] {
  const byReq = new Map(responses.map((r) => [r.requirementId, r]));
  return requirements.map((r) =>
    classifyRequirement(r, findEvidence(r, resume, totalYears, now), byReq.get(r.id)),
  );
}

export function conceptCategory(name: string): string | undefined {
  return conceptByName(name)?.category;
}
