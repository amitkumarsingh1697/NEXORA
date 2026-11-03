import { newItemId, resumeContentSchema, type ResumeContent } from '../resume/model';
import type { Suggestion } from '../suggestions/model';

export class StaleSuggestionError extends Error {
  readonly suggestionId: string;
  constructor(id: string, message: string) {
    super(message);
    this.name = 'StaleSuggestionError';
    this.suggestionId = id;
  }
}

/**
 * Apply accepted suggestions to a copy of the content. The input is never
 * mutated. Suggestions whose `original` no longer matches are rejected as stale.
 */
export function applySuggestions(content: ResumeContent, accepted: Suggestion[]): ResumeContent {
  const next: ResumeContent = structuredClone(content);
  for (const s of accepted) {
    switch (s.type) {
      case 'add_bullet': {
        const exp = next.experience.find((e) => e.id === s.target.itemId);
        if (!exp) throw new StaleSuggestionError(s.id, 'The target role no longer exists.');
        exp.bullets.push({ id: newItemId('b'), text: s.proposed });
        break;
      }
      case 'modify_bullet': {
        const exp =
          next.experience.find((e) => e.id === s.target.itemId) ??
          next.projects.find((p) => p.id === s.target.itemId);
        const b = exp?.bullets.find((x) => x.id === s.target.bulletId);
        if (!b || b.text !== s.original)
          throw new StaleSuggestionError(
            s.id,
            'The bullet changed since this suggestion was made.',
          );
        b.text = s.proposed;
        break;
      }
      case 'add_skill':
        if (!next.skills.some((k) => k.name.toLowerCase() === s.proposed.toLowerCase())) {
          next.skills.push({ id: newItemId('sk'), name: s.proposed });
        }
        break;
      case 'reorder_skills': {
        // Tolerates skills added by other accepted suggestions (kept at the end),
        // but not edits to the skills this suggestion was computed from.
        const original: string[] = JSON.parse(s.original ?? '[]');
        const currentOriginal = next.skills.map((k) => k.id).filter((id) => original.includes(id));
        if (JSON.stringify(currentOriginal) !== JSON.stringify(original)) {
          throw new StaleSuggestionError(s.id, 'Skills changed since this suggestion was made.');
        }
        const order: string[] = JSON.parse(s.proposed);
        const byId = new Map(next.skills.map((k) => [k.id, k]));
        const extras = next.skills.filter((k) => !order.includes(k.id));
        next.skills = [
          ...order.map((id) => byId.get(id)).filter((k): k is NonNullable<typeof k> => Boolean(k)),
          ...extras,
        ];
        break;
      }
      case 'update_summary':
        if ((next.summary ?? '') !== (s.original ?? ''))
          throw new StaleSuggestionError(
            s.id,
            'The summary changed since this suggestion was made.',
          );
        next.summary = s.proposed;
        break;
      case 'reorder_sections': {
        if (JSON.stringify(next.sectionOrder) !== s.original)
          throw new StaleSuggestionError(s.id, 'Section order changed.');
        next.sectionOrder = JSON.parse(s.proposed);
        break;
      }
    }
  }
  return resumeContentSchema.parse(next);
}
