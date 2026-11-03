import { z } from 'zod';

export const REQUIREMENT_KINDS = [
  'required_skill',
  'preferred_skill',
  'responsibility',
  'experience',
  'education',
  'certification',
  'domain',
  'leadership',
  'language',
] as const;
export type RequirementKind = (typeof REQUIREMENT_KINDS)[number];

export const requirementSchema = z.object({
  id: z.string(),
  kind: z.enum(REQUIREMENT_KINDS),
  text: z.string().max(2000),
  /** Canonical concepts from the taxonomy mentioned by this requirement. */
  concepts: z.array(z.string()),
  minYears: z.number().int().min(0).max(40).nullable(),
  importance: z.enum(['required', 'preferred']),
  /** Explicit must-have (years, degree, certification, authorisation). Shown as a warning, not scored. */
  hard: z.boolean(),
  sourceSection: z.string(),
});
export type Requirement = z.infer<typeof requirementSchema>;

export const salarySchema = z.object({
  text: z.string(),
  currency: z.string().nullable(),
  min: z.number().nullable(),
  max: z.number().nullable(),
  period: z.enum(['year', 'month', 'hour', 'unspecified']),
});

export const jobDescriptionSchema = z.object({
  title: z.string().max(300),
  company: z.string().max(300),
  location: z.string().max(300),
  country: z.string().max(100),
  workMode: z.enum(['remote', 'hybrid', 'onsite', 'unspecified']),
  employmentType: z.enum([
    'full_time',
    'part_time',
    'contract',
    'internship',
    'temporary',
    'unspecified',
  ]),
  salary: salarySchema.nullable(),
  /** Exact sentences mentioning visa/authorisation. Never inferred. */
  workAuthorization: z.array(z.string()),
  languages: z.array(z.string()),
  minYearsOverall: z.number().nullable(),
  requirements: z.array(requirementSchema),
});
export type JobDescription = z.infer<typeof jobDescriptionSchema>;
