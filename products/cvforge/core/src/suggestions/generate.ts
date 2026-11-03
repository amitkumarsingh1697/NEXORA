import type { JobDescription } from '../job/model';
import type { RequirementClassification } from '../evidence/engine';
import { STAGE_INFO, type CareerStage } from '../career/stage';
import type { ResumeContent } from '../resume/model';
import { conceptByName, findConcepts, mentionsConcept } from '../taxonomy/skills';
import { checkNoFabrication } from './guard';
import type { Suggestion } from './model';

let n = 0;
const sid = () =>
  `sg_${Date.now().toString(36)}${(++n).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

const GERUND_TO_PAST: Record<string, string> = {
  developing: 'Developed',
  designing: 'Designed',
  building: 'Built',
  managing: 'Managed',
  leading: 'Led',
  implementing: 'Implemented',
  creating: 'Created',
  maintaining: 'Maintained',
  testing: 'Tested',
  writing: 'Wrote',
  delivering: 'Delivered',
  migrating: 'Migrated',
  automating: 'Automated',
  integrating: 'Integrated',
  deploying: 'Deployed',
  supporting: 'Supported',
  coordinating: 'Coordinated',
  mentoring: 'Mentored',
  architecting: 'Architected',
  defining: 'Defined',
  optimizing: 'Optimized',
  optimising: 'Optimised',
  improving: 'Improved',
  handling: 'Handled',
  owning: 'Owned',
  reviewing: 'Reviewed',
};

/** Conservative deterministic rewrite of weak bullet openings. Returns null if no safe rewrite exists. */
export function strengthenOpening(text: string): string | null {
  const t = text.trim();
  let m = /^(?:responsible for|tasked with|involved in|duties included)\s+(\w+ing)\b(.*)$/i.exec(t);
  if (m?.[1] && GERUND_TO_PAST[m[1].toLowerCase()])
    return `${GERUND_TO_PAST[m[1].toLowerCase()]}${m[2] ?? ''}`;
  m = /^(?:worked on|participated in)\s+(.+)$/i.exec(t);
  if (m?.[1]) return `Contributed to ${m[1]}`;
  m = /^(?:helped|assisted)\s+(?:to\s+|in\s+)?(\w+)\b(.*)$/i.exec(t);
  if (m?.[1]) {
    const verb = m[1].toLowerCase();
    if (GERUND_TO_PAST[verb])
      return `Helped ${verb.replace(/ing$/, '')}${m[2] ?? ''}`.replace(
        /^Helped (\w+)/,
        (_x, v) => `Helped ${v}`,
      );
  }
  return null;
}

/** Turn a user's confirmation answer into a resume bullet using only their own words. */
export function confirmationToBullet(answer: string): string {
  let s = answer.trim().replace(/\s+/g, ' ');
  s = s.replace(/^(yes|yeah|yep|correct|i do|i have)[,.!:;\s-]*/i, '');
  s = s.replace(/^i\s+(\w+)/i, (_m, v: string) => v.charAt(0).toUpperCase() + v.slice(1));
  s = s.charAt(0).toUpperCase() + s.slice(1);
  return s.replace(/\s*\.$/, '');
}

function pickExperienceFor(
  resume: ResumeContent,
  text: string,
): ResumeContent['experience'][number] | undefined {
  const words = new Set(
    text
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3),
  );
  let best: { e: ResumeContent['experience'][number]; s: number } | undefined;
  for (const e of resume.experience) {
    const blob = `${e.title} ${e.company} ${e.bullets.map((b) => b.text).join(' ')}`.toLowerCase();
    // Mentions of company or title in the answer are strong signals.
    let s =
      (e.company && text.toLowerCase().includes(e.company.toLowerCase()) ? 10 : 0) +
      (e.current ? 1 : 0);
    for (const w of words) if (blob.includes(w)) s += 0.2;
    if (!best || s > best.s) best = { e, s };
  }
  return best?.e;
}

export interface SuggestionInput {
  resume: ResumeContent;
  job: JobDescription;
  classifications: RequirementClassification[];
  stage: CareerStage;
  totalYears: number;
}

/**
 * Deterministic, evidence-backed suggestions. Every suggestion cites the
 * resume text or user confirmation it is based on and passes the fabrication guard.
 */
export function generateSuggestions(input: SuggestionInput): Suggestion[] {
  const { resume, job, classifications } = input;
  const out: Suggestion[] = [];
  const reqById = new Map(job.requirements.map((r) => [r.id, r]));
  const skillNames = new Set(resume.skills.map((s) => s.name.toLowerCase()));
  const hasSkill = (concept: string) =>
    resume.skills.some((s) => mentionsConcept(s.name, concept)) ||
    skillNames.has(concept.toLowerCase());
  const plannedSkills = new Set<string>();

  // 1. Document user-confirmed experience, in the user's own words.
  for (const c of classifications) {
    if (c.state !== 'user_confirmed' || !c.confirmation) continue;
    const req = reqById.get(c.requirementId);
    if (!req || c.requiresExplicitConfirmation) continue; // work authorisation is never written into a resume automatically
    const bullet = confirmationToBullet(c.confirmation.text);
    if (bullet.length >= 15) {
      const exp = pickExperienceFor(resume, c.confirmation.text);
      if (exp) {
        out.push({
          id: sid(),
          type: 'add_bullet',
          target: { section: 'experience', itemId: exp.id },
          original: null,
          proposed: bullet,
          reason: `Documents experience you confirmed for: "${req.text.slice(0, 120)}". Wording comes from your answer; edit it before accepting if needed.`,
          evidence: [{ kind: 'confirmation', text: c.confirmation.text, requirementId: req.id }],
          source: 'deterministic',
          requirementIds: [req.id],
        });
      }
    }
    for (const concept of req.concepts) {
      const k = conceptByName(concept);
      if (k && ['leadership', 'domain'].includes(k.category)) continue;
      if (
        !hasSkill(concept) &&
        !plannedSkills.has(concept) &&
        mentionsConcept(c.confirmation.text + ' ' + req.text, concept)
      ) {
        plannedSkills.add(concept);
        out.push({
          id: sid(),
          type: 'add_skill',
          target: { section: 'skills' },
          original: null,
          proposed: concept,
          reason: `You confirmed experience with ${concept}.`,
          evidence: [{ kind: 'confirmation', text: c.confirmation.text, requirementId: req.id }],
          source: 'deterministic',
          requirementIds: [req.id],
        });
      }
    }
  }

  // 2. Skills demonstrated in experience but missing from the skills list.
  for (const c of classifications) {
    if (c.state !== 'demonstrated') continue;
    const req = reqById.get(c.requirementId);
    if (!req) continue;
    for (const concept of req.concepts) {
      const k = conceptByName(concept);
      if (!k || ['leadership', 'domain', 'practice'].includes(k.category)) continue;
      const ev = c.evidence.find(
        (e) =>
          e.strength === 'direct' && e.matched.includes(concept) && e.location.section !== 'skills',
      );
      if (ev && !hasSkill(concept) && !plannedSkills.has(concept)) {
        plannedSkills.add(concept);
        out.push({
          id: sid(),
          type: 'add_skill',
          target: { section: 'skills' },
          original: null,
          proposed: concept,
          reason: `${concept} appears in your experience but not in your skills list, and the job asks for it.`,
          evidence: [{ kind: 'resume', text: ev.text, requirementId: req.id }],
          source: 'deterministic',
          requirementIds: [req.id],
        });
      }
    }
  }

  // 3. Strengthen weak openings of job-relevant bullets.
  const relevantBullets = new Map<string, string[]>();
  for (const c of classifications) {
    for (const e of c.evidence)
      if (e.location.bulletId)
        relevantBullets.set(e.location.bulletId, [
          ...(relevantBullets.get(e.location.bulletId) ?? []),
          c.requirementId,
        ]);
  }
  for (const e of resume.experience) {
    for (const b of e.bullets) {
      const rewrite = strengthenOpening(b.text);
      if (!rewrite || rewrite === b.text) continue;
      const reqIds = relevantBullets.get(b.id) ?? [];
      out.push({
        id: sid(),
        type: 'modify_bullet',
        target: { section: 'experience', itemId: e.id, bulletId: b.id },
        original: b.text,
        proposed: rewrite,
        reason:
          'Leads with what you personally did instead of a passive phrase. Meaning and facts are unchanged.',
        evidence: [{ kind: 'resume', text: b.text }],
        source: 'deterministic',
        requirementIds: reqIds,
      });
    }
  }

  // 4. Put job-relevant skills first.
  const relevantConcepts = new Set(job.requirements.flatMap((r) => r.concepts));
  if (resume.skills.length > 3) {
    const relevant = resume.skills.filter((s) =>
      findConcepts(s.name).some((k) => relevantConcepts.has(k.name)),
    );
    const rest = resume.skills.filter((s) => !relevant.includes(s));
    const newOrder = [...relevant, ...rest].map((s) => s.id);
    const oldOrder = resume.skills.map((s) => s.id);
    if (relevant.length && newOrder.join() !== oldOrder.join()) {
      out.push({
        id: sid(),
        type: 'reorder_skills',
        target: { section: 'skills' },
        original: JSON.stringify(oldOrder),
        proposed: JSON.stringify(newOrder),
        reason: `Moves the ${relevant.length} skill(s) this job asks for to the front: ${relevant
          .slice(0, 6)
          .map((s) => s.name)
          .join(', ')}.`,
        evidence: [
          {
            kind: 'computed',
            text: `Job concepts: ${[...relevantConcepts].slice(0, 10).join(', ')}`,
          },
        ],
        source: 'deterministic',
        requirementIds: [],
      });
    }
  }

  // 5. Summary line built only from computed years and demonstrated concepts.
  const demonstratedConcepts = [
    ...new Set(
      classifications
        .filter((c) => c.state === 'demonstrated')
        .flatMap((c) => reqById.get(c.requirementId)?.concepts ?? [])
        .filter((k) => conceptByName(k)?.category !== 'domain'),
    ),
  ].slice(0, 5);
  if (demonstratedConcepts.length >= 2 && input.totalYears >= 1) {
    const missingFromSummary = demonstratedConcepts.filter(
      (k) => !mentionsConcept(resume.summary, k),
    );
    if (missingFromSummary.length >= 2 || !resume.summary) {
      const role = resume.personal.headline || job.title || STAGE_INFO[input.stage].label;
      const years = Math.floor(input.totalYears);
      const line = `${role} with ${years}+ years of experience across ${demonstratedConcepts.join(', ')}.`;
      const proposed = resume.summary ? `${resume.summary.trim()} ${line}` : line;
      out.push({
        id: sid(),
        type: 'update_summary',
        target: { section: 'summary' },
        original: resume.summary,
        proposed,
        reason:
          'Surfaces the job-relevant skills already demonstrated in your experience. Years are computed from your dated roles.',
        evidence: [
          {
            kind: 'computed',
            text: `${input.totalYears} years from dated roles; demonstrated: ${demonstratedConcepts.join(', ')}`,
          },
        ],
        source: 'deterministic',
        requirementIds: [],
      });
    }
  }

  // Every suggestion must pass the fabrication guard against its allowed sources.
  const resumeCorpus = JSON.stringify(resume);
  return out.filter((s) => {
    if (s.type === 'reorder_skills') return true;
    const sources = [
      resumeCorpus,
      s.original ?? '',
      ...s.evidence.map((e) => e.text),
      ...(s.type === 'update_summary'
        ? [String(Math.floor(input.totalYears)), resume.personal.headline, job.title]
        : []),
    ];
    return checkNoFabrication(s.proposed, sources).ok;
  });
}
