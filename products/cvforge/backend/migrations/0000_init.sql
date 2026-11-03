CREATE TABLE "analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"resume_version_id" uuid NOT NULL,
	"job_description_id" uuid NOT NULL,
	"engine_version" text NOT NULL,
	"stage" text NOT NULL,
	"stage_source" text NOT NULL,
	"total_years" text NOT NULL,
	"job_match_value" integer,
	"ats_value" integer,
	"evidence_quality_value" integer,
	"job_match" jsonb NOT NULL,
	"ats" jsonb NOT NULL,
	"evidence_quality" jsonb NOT NULL,
	"counts" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text DEFAULT '' NOT NULL,
	"entity_id" text DEFAULT '' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clarification_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"requirement_id" uuid NOT NULL,
	"question" text NOT NULL,
	"rationale" text NOT NULL,
	"priority" integer NOT NULL,
	"response" text,
	"response_text" text DEFAULT '' NOT NULL,
	"answered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clarification_response_chk" CHECK ("clarification_questions"."response" is null or "clarification_questions"."response" in ('yes','no','skipped','deferred'))
);
--> statement-breakpoint
CREATE TABLE "exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"resume_version_id" uuid NOT NULL,
	"template" text NOT NULL,
	"format" text NOT NULL,
	"storage_key" text NOT NULL,
	"sha256" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"verification" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "exports_format_chk" CHECK ("exports"."format" in ('docx','pdf')),
	CONSTRAINT "exports_template_chk" CHECK ("exports"."template" in ('classic','modern'))
);
--> statement-breakpoint
CREATE TABLE "extension_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text
);
--> statement-breakpoint
CREATE TABLE "extension_pairing_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extension_refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_descriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"source_url" text DEFAULT '' NOT NULL,
	"source_site" text DEFAULT '' NOT NULL,
	"raw_text" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"country" text DEFAULT '' NOT NULL,
	"work_mode" text DEFAULT 'unspecified' NOT NULL,
	"employment_type" text DEFAULT 'unspecified' NOT NULL,
	"salary" jsonb,
	"work_authorization" jsonb NOT NULL,
	"languages" jsonb NOT NULL,
	"min_years_overall" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_descriptions_source_chk" CHECK ("job_descriptions"."source" in ('manual','paste','extension')),
	CONSTRAINT "job_descriptions_mode_chk" CHECK ("job_descriptions"."work_mode" in ('remote','hybrid','onsite','unspecified'))
);
--> statement-breakpoint
CREATE TABLE "job_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_description_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"concepts" jsonb NOT NULL,
	"min_years" integer,
	"importance" text NOT NULL,
	"hard" boolean DEFAULT false NOT NULL,
	"source_section" text DEFAULT '' NOT NULL,
	"user_edited" boolean DEFAULT false NOT NULL,
	CONSTRAINT "job_requirements_kind_chk" CHECK ("job_requirements"."kind" in ('required_skill','preferred_skill','responsibility','experience','education','certification','domain','leadership','language')),
	CONSTRAINT "job_requirements_importance_chk" CHECK ("job_requirements"."importance" in ('required','preferred'))
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_members_organization_id_user_id_pk" PRIMARY KEY("organization_id","user_id"),
	CONSTRAINT "org_members_role_chk" CHECK ("organization_members"."role" in ('owner','admin','member'))
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'personal' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_kind_chk" CHECK ("organizations"."kind" in ('personal','team'))
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requirement_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"requirement_id" uuid NOT NULL,
	"status" text NOT NULL,
	"state" text,
	"evidence" jsonb NOT NULL,
	"confirmation_text" text,
	"confirmation_date" timestamp with time zone,
	"reasoning" text NOT NULL,
	"requires_explicit_confirmation" boolean DEFAULT false NOT NULL,
	CONSTRAINT "requirement_evidence_state_chk" CHECK (("requirement_evidence"."status" = 'pending' and "requirement_evidence"."state" is null) or ("requirement_evidence"."status" = 'classified' and "requirement_evidence"."state" in ('demonstrated','user_confirmed','missing'))),
	CONSTRAINT "requirement_evidence_confirm_chk" CHECK ("requirement_evidence"."state" is distinct from 'user_confirmed' or "requirement_evidence"."confirmation_text" is not null)
);
--> statement-breakpoint
CREATE TABLE "resume_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"parent_version_id" uuid NOT NULL,
	"suggestion_id" uuid,
	"change_type" text NOT NULL,
	"section" text NOT NULL,
	"label" text NOT NULL,
	"original" text,
	"proposed" text,
	"reason" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"decision" text NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resume_changes_type_chk" CHECK ("resume_changes"."change_type" in ('added','removed','modified','reordered')),
	CONSTRAINT "resume_changes_decision_chk" CHECK ("resume_changes"."decision" in ('accepted','manual_edit'))
);
--> statement-breakpoint
CREATE TABLE "resume_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resume_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"original_filename" text NOT NULL,
	"kind" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"extracted_text" text NOT NULL,
	"layout" jsonb NOT NULL,
	"headings" jsonb NOT NULL,
	"parse_confidence" jsonb NOT NULL,
	"parse_warnings" jsonb NOT NULL,
	"unassigned_lines" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resume_documents_kind_chk" CHECK ("resume_documents"."kind" in ('pdf','docx')),
	CONSTRAINT "resume_documents_size_chk" CHECK ("resume_documents"."size_bytes" > 0 and "resume_documents"."size_bytes" <= 10485760)
);
--> statement-breakpoint
CREATE TABLE "resume_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"section_key" text NOT NULL,
	"position" integer NOT NULL,
	"content" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resume_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resume_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"parent_version_id" uuid,
	"version_number" integer NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"origin" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"content" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"workspace_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finalized_at" timestamp with time zone,
	CONSTRAINT "resume_versions_origin_chk" CHECK ("resume_versions"."origin" in ('original_parse','edit','tailored')),
	CONSTRAINT "resume_versions_status_chk" CHECK ("resume_versions"."status" in ('draft','finalized')),
	CONSTRAINT "resume_versions_finalized_chk" CHECK (("resume_versions"."status" = 'finalized') = ("resume_versions"."finalized_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "resumes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"user_agent" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"analysis_id" uuid NOT NULL,
	"base_version_id" uuid NOT NULL,
	"type" text NOT NULL,
	"target" jsonb NOT NULL,
	"original" text,
	"proposed" text NOT NULL,
	"edited_proposed" text,
	"reason" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"source" text NOT NULL,
	"requirement_ids" jsonb NOT NULL,
	"decision" text DEFAULT 'pending' NOT NULL,
	"decided_at" timestamp with time zone,
	"applied_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suggestions_decision_chk" CHECK ("suggestions"."decision" in ('pending','accepted','rejected')),
	CONSTRAINT "suggestions_source_chk" CHECK ("suggestions"."source" in ('deterministic','ai'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"country" text DEFAULT '' NOT NULL,
	"career_stage_override" text,
	"ai_assist_enabled" boolean DEFAULT true NOT NULL,
	"privacy_consent_version" text NOT NULL,
	"privacy_consent_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_stage_chk" CHECK ("users"."career_stage_override" is null or "users"."career_stage_override" in ('early','mid','senior','lead','executive'))
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"resume_id" uuid NOT NULL,
	"base_version_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_resume_version_id_resume_versions_id_fk" FOREIGN KEY ("resume_version_id") REFERENCES "public"."resume_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_job_description_id_job_descriptions_id_fk" FOREIGN KEY ("job_description_id") REFERENCES "public"."job_descriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clarification_questions" ADD CONSTRAINT "clarification_questions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clarification_questions" ADD CONSTRAINT "clarification_questions_requirement_id_job_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."job_requirements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_resume_version_id_resume_versions_id_fk" FOREIGN KEY ("resume_version_id") REFERENCES "public"."resume_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extension_devices" ADD CONSTRAINT "extension_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extension_pairing_codes" ADD CONSTRAINT "extension_pairing_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extension_refresh_tokens" ADD CONSTRAINT "extension_refresh_tokens_device_id_extension_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."extension_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_descriptions" ADD CONSTRAINT "job_descriptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_descriptions" ADD CONSTRAINT "job_descriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_requirements" ADD CONSTRAINT "job_requirements_job_description_id_job_descriptions_id_fk" FOREIGN KEY ("job_description_id") REFERENCES "public"."job_descriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_evidence" ADD CONSTRAINT "requirement_evidence_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_evidence" ADD CONSTRAINT "requirement_evidence_requirement_id_job_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."job_requirements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_changes" ADD CONSTRAINT "resume_changes_version_id_resume_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."resume_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_changes" ADD CONSTRAINT "resume_changes_parent_version_id_resume_versions_id_fk" FOREIGN KEY ("parent_version_id") REFERENCES "public"."resume_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_documents" ADD CONSTRAINT "resume_documents_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_documents" ADD CONSTRAINT "resume_documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_sections" ADD CONSTRAINT "resume_sections_version_id_resume_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."resume_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_versions" ADD CONSTRAINT "resume_versions_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_versions" ADD CONSTRAINT "resume_versions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_versions" ADD CONSTRAINT "resume_versions_parent_version_id_resume_versions_id_fk" FOREIGN KEY ("parent_version_id") REFERENCES "public"."resume_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_versions" ADD CONSTRAINT "resume_versions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_base_version_id_resume_versions_id_fk" FOREIGN KEY ("base_version_id") REFERENCES "public"."resume_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_applied_version_id_resume_versions_id_fk" FOREIGN KEY ("applied_version_id") REFERENCES "public"."resume_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_base_version_id_resume_versions_id_fk" FOREIGN KEY ("base_version_id") REFERENCES "public"."resume_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analyses_workspace_idx" ON "analyses" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_user_idx" ON "audit_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "clarification_requirement_uq" ON "clarification_questions" USING btree ("workspace_id","requirement_id");--> statement-breakpoint
CREATE INDEX "exports_user_idx" ON "exports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "extension_devices_user_idx" ON "extension_devices" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pairing_code_hash_uq" ON "extension_pairing_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_token_hash_uq" ON "extension_refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "refresh_family_idx" ON "extension_refresh_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_descriptions_workspace_uq" ON "job_descriptions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "job_requirements_jd_idx" ON "job_requirements" USING btree ("job_description_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pwreset_token_hash_uq" ON "password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "requirement_evidence_uq" ON "requirement_evidence" USING btree ("analysis_id","requirement_id");--> statement-breakpoint
CREATE INDEX "resume_changes_version_idx" ON "resume_changes" USING btree ("version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resume_documents_resume_uq" ON "resume_documents" USING btree ("resume_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resume_sections_uq" ON "resume_sections" USING btree ("version_id","section_key");--> statement-breakpoint
CREATE UNIQUE INDEX "resume_versions_number_uq" ON "resume_versions" USING btree ("resume_id","version_number");--> statement-breakpoint
CREATE INDEX "resume_versions_user_idx" ON "resume_versions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "resumes_user_idx" ON "resumes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_uq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "suggestions_workspace_idx" ON "suggestions" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_uq" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "workspaces_user_idx" ON "workspaces" USING btree ("user_id");