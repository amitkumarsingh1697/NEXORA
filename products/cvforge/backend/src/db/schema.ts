import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

/* ---------------------------------------------------------------- tenancy */

export const organizations = pgTable(
  'organizations',
  {
    id: id(),
    name: text('name').notNull(),
    /** 'personal' orgs are created per user in v1; 'team' is reserved for future enterprise support. */
    kind: text('kind').notNull().default('personal'),
    createdAt: createdAt(),
  },
  (t) => [check('organizations_kind_chk', sql`${t.kind} in ('personal','team')`)],
);

export const users = pgTable(
  'users',
  {
    id: id(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name').notNull().default(''),
    country: text('country').notNull().default(''),
    careerStageOverride: text('career_stage_override'),
    aiAssistEnabled: boolean('ai_assist_enabled').notNull().default(true),
    privacyConsentVersion: text('privacy_consent_version').notNull(),
    privacyConsentAt: timestamp('privacy_consent_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('users_email_lower_uq').on(sql`lower(${t.email})`),
    check(
      'users_stage_chk',
      sql`${t.careerStageOverride} is null or ${t.careerStageOverride} in ('early','mid','senior','lead','executive')`,
    ),
  ],
);

export const organizationMembers = pgTable(
  'organization_members',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('owner'),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.userId] }),
    check('org_members_role_chk', sql`${t.role} in ('owner','admin','member')`),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    userAgent: text('user_agent').notNull().default(''),
    createdAt: createdAt(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('sessions_token_hash_uq').on(t.tokenHash),
    index('sessions_user_idx').on(t.userId),
  ],
);

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('pwreset_token_hash_uq').on(t.tokenHash)],
);

/* ---------------------------------------------------------------- resumes */

export const resumes = pgTable(
  'resumes',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('resumes_user_idx').on(t.userId)],
);

/** The original uploaded file. Never modified after insert. */
export const resumeDocuments = pgTable(
  'resume_documents',
  {
    id: id(),
    resumeId: uuid('resume_id')
      .notNull()
      .references(() => resumes.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    originalFilename: text('original_filename').notNull(),
    kind: text('kind').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: text('sha256').notNull(),
    storageKey: text('storage_key').notNull(),
    extractedText: text('extracted_text').notNull(),
    layout: jsonb('layout').notNull(),
    headings: jsonb('headings').notNull(),
    parseConfidence: jsonb('parse_confidence').notNull(),
    parseWarnings: jsonb('parse_warnings').notNull(),
    unassignedLines: jsonb('unassigned_lines').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check('resume_documents_kind_chk', sql`${t.kind} in ('pdf','docx')`),
    check('resume_documents_size_chk', sql`${t.sizeBytes} > 0 and ${t.sizeBytes} <= 10485760`),
    uniqueIndex('resume_documents_resume_uq').on(t.resumeId),
  ],
);

export const resumeVersions = pgTable(
  'resume_versions',
  {
    id: id(),
    resumeId: uuid('resume_id')
      .notNull()
      .references(() => resumes.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    parentVersionId: uuid('parent_version_id').references((): AnyPgColumn => resumeVersions.id, {
      onDelete: 'restrict',
    }),
    versionNumber: integer('version_number').notNull(),
    label: text('label').notNull().default(''),
    /** original_parse: from the upload; edit: manual edits; tailored: from accepted suggestions. */
    origin: text('origin').notNull(),
    status: text('status').notNull().default('draft'),
    content: jsonb('content').notNull(),
    contentHash: text('content_hash').notNull(),
    workspaceId: uuid('workspace_id').references((): AnyPgColumn => workspaces.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('resume_versions_number_uq').on(t.resumeId, t.versionNumber),
    index('resume_versions_user_idx').on(t.userId),
    check('resume_versions_origin_chk', sql`${t.origin} in ('original_parse','edit','tailored')`),
    check('resume_versions_status_chk', sql`${t.status} in ('draft','finalized')`),
    check(
      'resume_versions_finalized_chk',
      sql`(${t.status} = 'finalized') = (${t.finalizedAt} is not null)`,
    ),
  ],
);

/** Immutable per-section projection of a finalized version (canonical content stays in resume_versions.content). */
export const resumeSections = pgTable(
  'resume_sections',
  {
    id: id(),
    versionId: uuid('version_id')
      .notNull()
      .references(() => resumeVersions.id, { onDelete: 'cascade' }),
    sectionKey: text('section_key').notNull(),
    position: integer('position').notNull(),
    content: jsonb('content').notNull(),
  },
  (t) => [uniqueIndex('resume_sections_uq').on(t.versionId, t.sectionKey)],
);

/** Every change between a version and its parent, with reason, evidence and decision. */
export const resumeChanges = pgTable(
  'resume_changes',
  {
    id: id(),
    versionId: uuid('version_id')
      .notNull()
      .references(() => resumeVersions.id, { onDelete: 'cascade' }),
    parentVersionId: uuid('parent_version_id')
      .notNull()
      .references(() => resumeVersions.id, { onDelete: 'cascade' }),
    suggestionId: uuid('suggestion_id'),
    changeType: text('change_type').notNull(),
    section: text('section').notNull(),
    label: text('label').notNull(),
    original: text('original'),
    proposed: text('proposed'),
    reason: text('reason').notNull(),
    evidence: jsonb('evidence').notNull(),
    decision: text('decision').notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('resume_changes_version_idx').on(t.versionId),
    check(
      'resume_changes_type_chk',
      sql`${t.changeType} in ('added','removed','modified','reordered')`,
    ),
    check('resume_changes_decision_chk', sql`${t.decision} in ('accepted','manual_edit')`),
  ],
);

/* ---------------------------------------------------------------- workspaces & jobs */

export const workspaces = pgTable(
  'workspaces',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    resumeId: uuid('resume_id')
      .notNull()
      .references(() => resumes.id, { onDelete: 'cascade' }),
    baseVersionId: uuid('base_version_id')
      .notNull()
      .references(() => resumeVersions.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('workspaces_user_idx').on(t.userId)],
);

export const jobDescriptions = pgTable(
  'job_descriptions',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    sourceUrl: text('source_url').notNull().default(''),
    sourceSite: text('source_site').notNull().default(''),
    rawText: text('raw_text').notNull(),
    title: text('title').notNull().default(''),
    company: text('company').notNull().default(''),
    location: text('location').notNull().default(''),
    country: text('country').notNull().default(''),
    workMode: text('work_mode').notNull().default('unspecified'),
    employmentType: text('employment_type').notNull().default('unspecified'),
    salary: jsonb('salary'),
    workAuthorization: jsonb('work_authorization').notNull(),
    languages: jsonb('languages').notNull(),
    minYearsOverall: integer('min_years_overall'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('job_descriptions_workspace_uq').on(t.workspaceId),
    check('job_descriptions_source_chk', sql`${t.source} in ('manual','paste','extension')`),
    check(
      'job_descriptions_mode_chk',
      sql`${t.workMode} in ('remote','hybrid','onsite','unspecified')`,
    ),
  ],
);

export const jobRequirements = pgTable(
  'job_requirements',
  {
    id: id(),
    jobDescriptionId: uuid('job_description_id')
      .notNull()
      .references(() => jobDescriptions.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    kind: text('kind').notNull(),
    text: text('text').notNull(),
    concepts: jsonb('concepts').notNull(),
    minYears: integer('min_years'),
    importance: text('importance').notNull(),
    hard: boolean('hard').notNull().default(false),
    sourceSection: text('source_section').notNull().default(''),
    userEdited: boolean('user_edited').notNull().default(false),
  },
  (t) => [
    index('job_requirements_jd_idx').on(t.jobDescriptionId),
    check(
      'job_requirements_kind_chk',
      sql`${t.kind} in ('required_skill','preferred_skill','responsibility','experience','education','certification','domain','leadership','language')`,
    ),
    check('job_requirements_importance_chk', sql`${t.importance} in ('required','preferred')`),
  ],
);

export const clarificationQuestions = pgTable(
  'clarification_questions',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    requirementId: uuid('requirement_id')
      .notNull()
      .references(() => jobRequirements.id, { onDelete: 'cascade' }),
    question: text('question').notNull(),
    rationale: text('rationale').notNull(),
    priority: integer('priority').notNull(),
    response: text('response'),
    responseText: text('response_text').notNull().default(''),
    answeredAt: timestamp('answered_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('clarification_requirement_uq').on(t.workspaceId, t.requirementId),
    check(
      'clarification_response_chk',
      sql`${t.response} is null or ${t.response} in ('yes','no','skipped','deferred')`,
    ),
  ],
);

export const analyses = pgTable(
  'analyses',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    resumeVersionId: uuid('resume_version_id')
      .notNull()
      .references(() => resumeVersions.id, { onDelete: 'restrict' }),
    jobDescriptionId: uuid('job_description_id')
      .notNull()
      .references(() => jobDescriptions.id, { onDelete: 'cascade' }),
    engineVersion: text('engine_version').notNull(),
    stage: text('stage').notNull(),
    stageSource: text('stage_source').notNull(),
    totalYears: text('total_years').notNull(),
    jobMatchValue: integer('job_match_value'),
    atsValue: integer('ats_value'),
    evidenceQualityValue: integer('evidence_quality_value'),
    jobMatch: jsonb('job_match').notNull(),
    ats: jsonb('ats').notNull(),
    evidenceQuality: jsonb('evidence_quality').notNull(),
    counts: jsonb('counts').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('analyses_workspace_idx').on(t.workspaceId, t.createdAt)],
);

export const requirementEvidence = pgTable(
  'requirement_evidence',
  {
    id: id(),
    analysisId: uuid('analysis_id')
      .notNull()
      .references(() => analyses.id, { onDelete: 'cascade' }),
    requirementId: uuid('requirement_id')
      .notNull()
      .references(() => jobRequirements.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    state: text('state'),
    evidence: jsonb('evidence').notNull(),
    confirmationText: text('confirmation_text'),
    confirmationDate: timestamp('confirmation_date', { withTimezone: true }),
    reasoning: text('reasoning').notNull(),
    requiresExplicitConfirmation: boolean('requires_explicit_confirmation')
      .notNull()
      .default(false),
  },
  (t) => [
    uniqueIndex('requirement_evidence_uq').on(t.analysisId, t.requirementId),
    check(
      'requirement_evidence_state_chk',
      sql`(${t.status} = 'pending' and ${t.state} is null) or (${t.status} = 'classified' and ${t.state} in ('demonstrated','user_confirmed','missing'))`,
    ),
    check(
      'requirement_evidence_confirm_chk',
      sql`${t.state} is distinct from 'user_confirmed' or ${t.confirmationText} is not null`,
    ),
  ],
);

export const suggestions = pgTable(
  'suggestions',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    analysisId: uuid('analysis_id')
      .notNull()
      .references(() => analyses.id, { onDelete: 'cascade' }),
    baseVersionId: uuid('base_version_id')
      .notNull()
      .references(() => resumeVersions.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    target: jsonb('target').notNull(),
    original: text('original'),
    proposed: text('proposed').notNull(),
    /** User's edit of the proposal before accepting, if any. */
    editedProposed: text('edited_proposed'),
    reason: text('reason').notNull(),
    evidence: jsonb('evidence').notNull(),
    source: text('source').notNull(),
    requirementIds: jsonb('requirement_ids').notNull(),
    decision: text('decision').notNull().default('pending'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    appliedVersionId: uuid('applied_version_id').references(() => resumeVersions.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
  },
  (t) => [
    index('suggestions_workspace_idx').on(t.workspaceId),
    check('suggestions_decision_chk', sql`${t.decision} in ('pending','accepted','rejected')`),
    check('suggestions_source_chk', sql`${t.source} in ('deterministic','ai')`),
  ],
);

export const exportsTable = pgTable(
  'exports',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    resumeVersionId: uuid('resume_version_id')
      .notNull()
      .references(() => resumeVersions.id, { onDelete: 'cascade' }),
    template: text('template').notNull(),
    format: text('format').notNull(),
    storageKey: text('storage_key').notNull(),
    sha256: text('sha256').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    verification: jsonb('verification').notNull(),
    createdAt: createdAt(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('exports_user_idx').on(t.userId),
    check('exports_format_chk', sql`${t.format} in ('docx','pdf')`),
    check('exports_template_chk', sql`${t.template} in ('classic','modern')`),
  ],
);

/* ---------------------------------------------------------------- extension */

export const extensionPairingCodes = pgTable(
  'extension_pairing_codes',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('pairing_code_hash_uq').on(t.codeHash)],
);

export const extensionDevices = pgTable(
  'extension_devices',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: createdAt(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedReason: text('revoked_reason'),
  },
  (t) => [index('extension_devices_user_idx').on(t.userId)],
);

export const extensionRefreshTokens = pgTable(
  'extension_refresh_tokens',
  {
    id: id(),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => extensionDevices.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('refresh_token_hash_uq').on(t.tokenHash),
    index('refresh_family_idx').on(t.familyId),
  ],
);

/* ---------------------------------------------------------------- audit */

export const auditEvents = pgTable(
  'audit_events',
  {
    id: id(),
    /** Nullable so audit history survives as anonymised records after account deletion. */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull().default(''),
    entityId: text('entity_id').notNull().default(''),
    /** Never contains resume text, tokens or passwords. */
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index('audit_user_idx').on(t.userId, t.createdAt)],
);
