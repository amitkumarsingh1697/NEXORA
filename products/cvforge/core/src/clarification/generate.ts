import type { Requirement } from '../job/model';
import type { RequirementClassification } from '../evidence/engine';
import { STAGE_EXPECTATIONS, type CareerStage } from '../career/stage';

export interface ClarificationQuestion {
  id: string;
  requirementId: string;
  question: string;
  /** Why we are asking, shown to the user. */
  rationale: string;
  priority: number;
}

const PRIORITY: Record<Requirement['kind'], number> = {
  experience: 90,
  required_skill: 80,
  certification: 75,
  education: 70,
  leadership: 65,
  responsibility: 60,
  language: 55,
  domain: 45,
  preferred_skill: 30,
};

function short(s: string, n = 120) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/**
 * Deterministic clarification questions for pending requirements only.
 * Questions never assert that the candidate has an experience; they ask.
 */
export function generateClarificationQuestions(
  requirements: Requirement[],
  classifications: RequirementClassification[],
  stage: CareerStage,
  limit = 12,
): ClarificationQuestion[] {
  const byId = new Map(classifications.map((c) => [c.requirementId, c]));
  const focus = STAGE_EXPECTATIONS[stage].questionFocus;
  const questions: ClarificationQuestion[] = [];
  for (const req of requirements) {
    const cls = byId.get(req.id);
    if (!cls || cls.status !== 'pending') continue;
    const concept = req.concepts[0];
    const related = cls.evidence.find((e) => e.strength === 'related');
    let q: string;
    let rationale: string;
    if (cls.requiresExplicitConfirmation) {
      q = `The posting states: "${short(req.text, 200)}". Do you meet this requirement? If yes, briefly state your status in your own words.`;
      rationale =
        'Work authorisation and similar requirements are never inferred from your resume.';
    } else if (req.kind === 'experience' && req.minYears !== null) {
      const what = req.concepts.length
        ? req.concepts.join(', ')
        : 'relevant professional experience';
      q = `The role asks for ${req.minYears}+ years of ${what}. Your dated roles do not show this yet. Do you have experience with ${what} that is not reflected in your resume dates? If yes, describe where, for how long, and your responsibility.`;
      rationale = 'Years are computed only from roles with dates that mention this area.';
    } else if (req.kind === 'education') {
      q = `The role lists this education requirement: "${short(req.text, 200)}". Do you hold this qualification or an equivalent? If yes, give the degree, field and institution.`;
      rationale = 'No matching qualification was found in your education section.';
    } else if (req.kind === 'certification') {
      q = `The role mentions: "${short(req.text, 200)}". Do you hold this certification? If yes, give its exact name, issuer and year.`;
      rationale = 'No matching certification was found.';
    } else if (req.kind === 'language') {
      q = `The role requires: "${short(req.text, 200)}". What is your proficiency in this language, and have you used it professionally?`;
      rationale = 'No matching language was found in your resume.';
    } else if (req.kind === 'leadership') {
      q = `The role expects: "${short(req.text, 200)}". Have you personally done this? If yes, describe the situation, team size or scope, your specific role, and the outcome. Focus on ${focus}.`;
      rationale = 'Leadership expectations need specific examples, scaled to your career stage.';
    } else if (req.kind === 'responsibility') {
      q = `The role involves: "${short(req.text, 200)}". Have you done this in practice? If yes, describe a specific example, what you were personally responsible for, and the impact or scale.`;
      rationale = 'No resume line clearly matches this responsibility.';
    } else if (concept && related) {
      q = `Your resume mentions "${short(related.text, 90)}". Have you worked directly with ${concept} in hands-on, professional work (not only training)? If yes, describe what you built or owned with it and in which role.`;
      rationale = `Only indirect evidence of ${concept} was found.`;
    } else if (concept) {
      q = `The role asks for ${concept}. Have you used ${concept} in practical work (not only courses or reading)? If yes, describe the project, your responsibility, and the outcome.`;
      rationale = `${concept} does not appear in your resume.`;
    } else {
      q = `The role asks for: "${short(req.text, 200)}". Do you have this experience? If yes, describe a concrete example and your role in it.`;
      rationale = 'No matching resume evidence was found.';
    }
    const priority =
      PRIORITY[req.kind] + (req.hard ? 20 : 0) + (req.importance === 'required' ? 5 : 0);
    questions.push({ id: `q_${req.id}`, requirementId: req.id, question: q, rationale, priority });
  }
  return questions.sort((a, b) => b.priority - a.priority).slice(0, limit);
}
