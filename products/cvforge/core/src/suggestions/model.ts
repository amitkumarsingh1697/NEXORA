import { z } from 'zod';
import { SECTION_KEYS } from '../resume/model';

export const SUGGESTION_TYPES = [
  'add_bullet',
  'modify_bullet',
  'add_skill',
  'reorder_skills',
  'update_summary',
  'reorder_sections',
] as const;

export const suggestionEvidenceSchema = z.object({
  kind: z.enum(['resume', 'confirmation', 'computed']),
  text: z.string(),
  requirementId: z.string().optional(),
});

export const suggestionSchema = z.object({
  id: z.string(),
  type: z.enum(SUGGESTION_TYPES),
  target: z.object({
    section: z.enum([...SECTION_KEYS, 'personal']),
    itemId: z.string().optional(),
    bulletId: z.string().optional(),
  }),
  /** Exact current text (or JSON list for reorders). Used to detect stale suggestions. */
  original: z.string().nullable(),
  proposed: z.string().min(1).max(4000),
  reason: z.string().max(1000),
  evidence: z.array(suggestionEvidenceSchema).min(1),
  source: z.enum(['deterministic', 'ai']),
  requirementIds: z.array(z.string()).default([]),
});
export type Suggestion = z.infer<typeof suggestionSchema>;
