# MASTER BUILD PROMPT — RESUME INTELLIGENCE + ARCHITECTURE BRAIN

## 1. Your Role

Act as a world-class product engineering organization consisting of:

- A principal software architect.
- A senior full-stack engineer.
- An AI/ML engineer specializing in local and hybrid LLM systems.
- A browser-extension engineer.
- A developer productivity and code-intelligence engineer.
- A database architect.
- A security and privacy engineer.
- A UX/UI designer.
- A QA automation and performance engineer.
- A DevOps and release engineer.
- A product manager responsible for production readiness.

You are responsible for designing, implementing, testing, documenting, and preparing two independent, production-quality software products.

Do not merely generate a prototype, a collection of screens, a technical demonstration, or a superficial MVP.

Build functioning products with real application logic, persistent data, working workflows, validation, error handling, security controls, tests, and usable documentation.

Think like a founder building products intended for real customers, enterprise adoption, and future investment.

Your work must prioritize:

1. Correctness.
2. Security and privacy.
3. Reliability.
4. Maintainability.
5. Excellent user experience.
6. Performance.
7. Extensibility.
8. Production readiness.
9. Commercial viability.

Do not sacrifice architectural quality for unnecessary complexity.

---

# 2. Products to Build

Build two independent products:

### Product A: Resume Intelligence

An AI-assisted resume intelligence platform that helps professionals understand how well their experience aligns with a job description, identify missing or undocumented evidence, improve their resume through controlled editing, and generate tailored, ATS-compatible resume versions.

It consists of:

- A web application.
- A Chrome/Edge browser extension.
- A local-first AI capability with optional hosted model adapters.
- A backend and persistent data layer.
- Resume parsing, job analysis, evidence mapping, editing, versioning, and export workflows.

### Product B: Architecture Brain

A local-first code intelligence platform that transforms a software repository into an interactive, evidence-backed architecture model.

It must allow developers to:

- Explore repository architecture.
- Understand modules, dependencies, flows, and ownership signals.
- Ask questions about the codebase.
- Investigate potential bugs and architectural risks.
- Generate documentation.
- Propose code fixes.
- Validate proposed changes.
- Review exact patches.
- Approve and merge changes locally.

It consists of:

- A local web application.
- A local indexing and analysis service.
- A repository intelligence engine.
- A structured code graph.
- A source-grounded AI assistant.
- A controlled patch and approval workflow.

Keep the products logically independent. They may share carefully selected engineering utilities, but must not become one tightly coupled application.

---

# 3. Overall Engineering Strategy

## 3.1 Repository structure

Use a TypeScript-centered monorepo with independent application boundaries.

Suggested structure:

    products/
      resume-intelligence/
        web/
        extension/
        backend/
      architecture-brain/
        web/
        local-service/
        indexing-engine/

    packages/
      shared-types/
      validation/
      logging/
      testing/
      utilities/

    infrastructure/
      local-development/
      database/
      scripts/

    documentation/
      architecture/
      product/
      security/
      api/
      deployment/
      testing/
      operations/

    scripts/

    README.md

You may adjust this structure if there is a compelling architectural reason. Document the final decision.

Use package boundaries and dependencies deliberately. Do not create abstractions merely for the sake of abstraction.

## 3.2 Recommended technology stack

### Shared engineering foundation

- TypeScript with strict mode.
- Node.js LTS.
- pnpm workspaces.
- ESLint.
- Prettier.
- Zod for runtime validation.
- Vitest for unit and integration tests.
- Playwright for end-to-end testing.
- Pino for structured logging.
- Git for version control.

### Resume Intelligence

Frontend:

- Next.js.
- React.
- TypeScript.
- Tailwind CSS.
- shadcn/ui.

Browser extension:

- WXT.
- React.
- TypeScript.
- Chrome Manifest V3.
- Edge-compatible packaging.

Backend:

- Next.js route handlers initially.
- PostgreSQL.
- Drizzle ORM.
- Auth.js or a maintained authentication solution.
- Private object storage abstraction.

Document processing:

- PDF.js or equivalent PDF text extraction.
- Mammoth for DOCX extraction.
- DOCX generation library.
- LibreOffice headless for PDF conversion where required.

### Architecture Brain

Frontend:

- React.
- TypeScript.
- Vite.
- Tailwind CSS.
- shadcn/ui.
- Cytoscape.js for architecture graphs.
- React Flow for detailed execution and dependency flows.

Local service:

- Node.js.
- TypeScript.
- SQLite.
- SQLite FTS5.
- Controlled Git CLI integration.

Code intelligence:

- TypeScript Compiler API for JavaScript and TypeScript.
- Tree-sitter as a future multi-language parsing foundation.
- JavaParser adapter as a priority subsequent language integration.
- Language-specific adapters with a common indexing interface.

### Local AI

- Ollama as the initial local model runtime.
- Configurable model/provider interface.
- Start with a quantized 7B–8B instruct model.
- Test larger 12B–14B models only if performance and available memory permit.
- Support deterministic non-LLM fallback paths.
- No model training in v1.

Target development hardware:

Apple MacBook Pro M5 Pro, 24 GB unified memory, 18 CPU cores, 20 GPU cores.

Optimize for this hardware. Do not assume dedicated server GPUs.

Do not make paid model APIs, cloud inference, or subscriptions mandatory for core functionality.

---

# 4. PRODUCT A — RESUME INTELLIGENCE

## 4.1 Product vision

Build a professional career intelligence platform for technology professionals with 2–30 years of experience.

Initial markets:

- India.
- United States.
- Europe.
- United Kingdom.
- Dubai and UAE.

The system must support multiple career stages:

| Career stage                   |  Experience |
| ------------------------------ | ----------: |
| Early career                   |   2–5 years |
| Mid-level                      |  6–10 years |
| Senior                         | 11–15 years |
| Lead / Principal / Architect   | 16–20 years |
| Executive / Highly experienced | 21–30 years |

Career stage must be a first-class concept throughout the product.

Do not evaluate an experienced architect or engineering leader using the same evidence expectations as an early-career developer.

Recognize:

- Technical depth.
- Architecture.
- System design.
- Engineering leadership.
- Mentoring.
- Team management.
- Delivery scale.
- Business outcomes.
- Stakeholder management.
- Technical strategy.
- Operational responsibility.
- Relevant career progression.

Do not automatically penalize older experience or remove valuable historical achievements.

Initial role focus:

- Software Engineering.
- Java and Full Stack Engineering.
- Cloud Engineering.
- Data Engineering.
- DevOps and Platform Engineering.
- Software Architecture.
- Technical Leadership.

Keep the role taxonomy extensible.

## 4.2 Core user journey

Implement this end-to-end workflow:

1. User creates an account.
2. User uploads their original resume.
3. System extracts resume content.
4. User reviews and corrects extracted information.
5. User creates a job workspace.
6. User pastes a job description or extracts one using the browser extension.
7. System parses the job description.
8. System identifies job requirements.
9. System maps resume evidence to individual requirements.
10. System identifies demonstrated, user-confirmed, missing, and unanswered evidence.
11. System asks targeted clarification questions.
12. User answers or explicitly skips questions.
13. System updates evidence classifications.
14. System produces an explainable job analysis.
15. System generates individually reviewable resume suggestions.
16. User accepts or rejects each suggestion.
17. System generates a new immutable resume version.
18. User compares versions.
19. User exports the approved version as DOCX or PDF.
20. User can create another job workspace without modifying the original resume.

Every step must be functional.

## 4.3 Resume management

Implement:

- Upload PDF.
- Upload DOCX.
- Resume text extraction.
- Structured resume representation.
- Editable resume sections.
- Personal information.
- Professional summary.
- Skills.
- Employment history.
- Projects.
- Education.
- Certifications.
- Achievements.
- Publications where applicable.
- Languages.
- Custom sections.

Preserve the original uploaded document.

The original resume must never be overwritten.

Store the original file and structured representation separately.

Allow the user to correct parsing mistakes before analysis.

Clearly communicate parsing confidence and unsupported document content.

## 4.4 Job description management

Support:

- Manual job description entry.
- Pasted job description.
- Browser extension extraction.
- Company career-page extraction.
- Saved job descriptions.
- Job workspaces.
- Job comparison.
- Job history.

Extract:

- Job title.
- Company.
- Location.
- Country.
- Remote/hybrid/onsite status.
- Employment type.
- Required skills.
- Preferred skills.
- Responsibilities.
- Experience requirements.
- Education requirements.
- Certifications.
- Domain requirements.
- Leadership expectations.
- Language requirements.
- Salary information if explicitly available.
- Work authorization or visa requirements if explicitly stated.

Never infer visa eligibility or work authorization from a resume.

Never invent salary information or employer requirements.

## 4.5 Evidence and skill classification engine

This is a critical differentiating feature.

Every job requirement must be associated with one of three final evidence states:

### A. Demonstrated

Evidence explicitly exists in the candidate's resume.

Store:

- Resume version.
- Section.
- Text evidence.
- Source location.
- Evidence confidence.

### B. User-confirmed

The candidate explicitly confirms possessing the skill or experience, but the evidence is not yet documented in the resume.

Store:

- Exact confirmation text.
- Confirmation date.
- Associated requirement.
- Supporting details, if provided.
- Source of confirmation.

Do not silently convert this state into demonstrated.

### C. Missing

The candidate has not established the required skill or experience after the clarification process.

Important:

Unanswered questions are not missing skills.

Implement a separate classification workflow status:

- pending.
- classified.

The final evidence state must remain one of the three defined states.

Do not fabricate skills, certifications, responsibilities, employment dates, job titles, project details, or performance metrics.

If a candidate claims an achievement without a measurable metric, improve its wording without inventing numbers.

## 4.6 Clarification engine

Generate targeted questions based on gaps between the job description and the candidate's available evidence.

Questions should:

- Be specific.
- Avoid asking for information already available.
- Focus on important requirements.
- Be understandable.
- Be relevant to the candidate's experience level.
- Distinguish practical experience from theoretical knowledge.
- Ask for context and evidence.
- Ask about impact when relevant.
- Ask about scale when relevant.

Example:

Job requirement: Experience designing distributed systems.

Existing resume evidence: Java microservices development.

Possible question:

"Have you personally designed the architecture of a distributed system, including service boundaries, communication patterns, resilience, and data consistency? If yes, describe the system and your responsibility."

Never suggest that the candidate has experience they have not confirmed.

Allow:

- Answer.
- Skip.
- Save and answer later.

## 4.7 Scoring engine

Do not call any score an ATS score or interview probability.

Create three separate metrics.

### Job Match Score

Measures alignment between job requirements and established candidate evidence.

Suggested weighting:

| Dimension                          | Weight |
| ---------------------------------- | -----: |
| Required skills and qualifications |    30% |
| Responsibilities alignment         |    25% |
| Relevant experience and seniority  |    20% |
| Evidence and achievements          |    15% |
| Preferred qualifications           |    10% |

### ATS Compatibility

Measures document structure and parser readability.

Evaluate:

- Standard section headings.
- Text extraction quality.
- Reading order.
- Formatting complexity.
- Columns and tables.
- Header/footer placement.
- Font and layout issues.
- Section recognition.
- Contact information extraction.

### Evidence Quality

Measures how well the candidate supports relevant claims.

Evaluate:

- Specificity.
- Context.
- Individual contribution.
- Technical depth.
- Measurable impact.
- Scale.
- Relevance.

All scores must be explainable.

For every score, show:

- Calculation basis.
- Positive evidence.
- Missing evidence.
- Uncertainty.
- Recommended improvements.

Keep hard requirement warnings separate from the numerical score.

Unanswered requirements must trigger clarification, not automatic negative classification.

Use deterministic algorithms for score calculations. AI may extract and normalize information, but it must not invent numerical results.

Make the scoring framework career-stage-aware.

## 4.8 Resume editing and version control

Implement immutable versioning.

Rules:

1. Original resume remains immutable.
2. Every editing session produces a separate version.
3. Every suggestion is independently reviewable.
4. User accepts or rejects each suggestion.
5. Rejected suggestions must not appear in the exported version.
6. Accepted suggestions are recorded with evidence and reasoning.
7. Finalized versions cannot be modified in place.
8. Further edits create another version.
9. Every version maintains a parent-version relationship.
10. Version comparisons must be available.

Support:

- Added content.
- Removed content.
- Modified content.
- Reordered sections.
- Formatting changes.

Display meaningful structured diffs, not just raw document text differences.

Each change should record:

- Original content.
- Proposed content.
- Reason.
- Supporting evidence.
- User decision.
- Timestamp.
- Parent version.
- New version.

## 4.9 Resume output templates

Provide two professional templates in v1:

### Template 1: Classic Professional

- Single column.
- Conventional headings.
- ATS-friendly.
- Minimal visual decoration.

### Template 2: Modern Professional

- Single column.
- Restrained visual hierarchy.
- Professional typography.
- ATS-compatible structure.

Support:

- DOCX export.
- PDF export.

The DOCX must remain editable.

The PDF must represent the exact approved resume version.

Avoid:

- Multi-column layouts.
- Text embedded in images.
- Excessive tables.
- Important information in headers or footers.
- Decorative elements that interfere with text extraction.

## 4.10 Browser extension

Build a Chrome and Edge Manifest V3 extension using WXT.

Initial explicitly required integrations:

- LinkedIn.
- Naukri.

Also provide a generic career-page extractor.

Prepare an extensible adapter architecture for:

Global:

- Indeed.
- LinkedIn.
- Glassdoor.
- Company career pages.

India:

- Naukri.
- Foundit.
- Hirist.
- Instahyre.
- Shine.

USA:

- Dice.
- Wellfound.
- ZipRecruiter.
- Built In.

UK:

- Reed.
- Totaljobs.
- CV-Library.

UAE and Gulf:

- Bayt.
- GulfTalent.
- Naukrigulf.

Germany:

- StepStone.
- XING.

France:

- HelloWork.
- France Travail.
- Welcome to the Jungle.

Canada:

- Job Bank.
- Indeed.

Australia:

- SEEK.
- Jora.

Singapore:

- JobStreet.
- Indeed.

These are future adapter targets, not a requirement to claim unsupported integration coverage.

Build a generic visible-page extraction engine and reusable site adapters.

Prioritize LinkedIn, Naukri, and generic career pages for the first functional release.

Important security and compliance rules:

- Do not bypass CAPTCHAs.
- Do not bypass login restrictions.
- Do not circumvent access controls.
- Do not extract unrelated browser tabs.
- Do not copy job-board cookies or credentials.
- Do not inject credentials into job-board pages.
- Do not silently scrape pages.
- Require an explicit user action to extract.
- Extract only content the user is authorized to view.
- Provide manual paste as a permanent fallback.
- Respect applicable website terms and technical restrictions.
- Do not claim that a user being logged in grants permission to scrape.

## 4.11 Extension authentication and pairing

Implement secure pairing:

1. User logs into Resume Intelligence.
2. User clicks Pair Extension.
3. Backend generates a cryptographically random, single-use pairing code.
4. Pairing code expires after five minutes.
5. Store only its hash server-side.
6. User enters the code in the extension.
7. Backend validates and consumes the code.
8. Issue a short-lived access token.
9. Issue a rotating refresh credential bound to the extension device.
10. Revoke the device on logout or user-requested removal.

Recommended defaults:

- Access token: 10–15 minutes.
- Refresh credential: configurable 7–30 days.

Implement:

- Token rotation.
- Token-family reuse detection.
- Device revocation.
- Session revocation.
- Minimal extension permissions.

Never expose database service credentials or model API keys in the extension.

## 4.12 Resume Intelligence database

Implement and document an appropriate relational schema.

Required entities include:

- users
- organizations
- resumes
- resume_documents
- resume_versions
- resume_sections
- resume_changes
- workspaces
- job_descriptions
- job_requirements
- requirement_evidence
- clarification_questions
- analyses
- suggestions
- exports
- extension_devices
- audit_events

Use:

- Foreign keys.
- Appropriate indexes.
- Unique constraints.
- Check constraints.
- Database migrations.
- Tenant isolation.
- Secure authorization checks.

Design the schema for future organization and enterprise support without implementing unnecessary enterprise complexity in v1.

## 4.13 Internationalization and privacy

English-only UI for v1.

Prepare country-aware data structures for:

- Currency.
- Date formats.
- Time zones.
- Locations.
- Work authorization.
- Language proficiency.
- Salary ranges.
- Employment type.

Do not assume every country uses identical resume conventions.

Do not automatically add:

- Date of birth.
- Photograph.
- Nationality.
- Marital status.

Country-specific fields must be included only when relevant and user-controlled.

Design privacy controls for applicable markets, including GDPR considerations.

Provide:

- Account export.
- Resume export.
- Data deletion.
- Workspace deletion.
- Explicit retention policy.
- Clear consent.
- Privacy disclosures.

Do not claim legal compliance without appropriate legal review.

## 4.14 Resume Intelligence UI

Build a polished, premium, professional product.

Core screens:

1. Landing page.
2. Sign-up/login.
3. Dashboard.
4. Resume library.
5. Resume upload and parsing.
6. Resume editor.
7. Job workspace.
8. Job description editor.
9. Job analysis.
10. Requirement/evidence matrix.
11. Clarification workflow.
12. Score explanation.
13. Suggested improvements.
14. Individual change review.
15. Version comparison.
16. Export center.
17. Browser extension pairing.
18. Settings.
19. Privacy and account management.

The UI must feel like a serious career intelligence product, not a generic AI chat wrapper.

Prioritize clarity, trust, and transparency.

---

# 5. PRODUCT B — ARCHITECTURE BRAIN

## 5.1 Product vision

Build a local-first software architecture intelligence platform.

The application must understand a software repository structurally, create an explorable architecture representation, and answer questions grounded in actual source code.

It must be useful to developers, technical leads, architects, engineering managers, and technical reviewers.

It must not pretend to understand code that it has not successfully indexed.

## 5.2 Packaging strategy

V1:

- Local web UI.
- Local indexing service.
- Local repository access.
- Local database.
- Local AI inference.

Desktop packaging comes after the local web interaction model has been validated.

V1 must support:

- Selecting a local repository directory.
- Indexing a local Git repository.
- Cloning public repositories when explicitly requested.
- Using an already-authorized local clone of a private repository.

Do not implement GitHub OAuth in the initial release.

A user's email address or company email domain is an identity attribute, not proof of repository authorization.

Repository access must be verified using actual Git provider permissions or authorized local filesystem access.

A personal email can legitimately access a company repository. A company email does not automatically grant access to every company repository.

## 5.3 Repository ingestion

Implement a reliable ingestion pipeline.

Detect:

- Repository root.
- Git branch.
- Current commit.
- File structure.
- Languages.
- Frameworks.
- Build tools.
- Dependency manifests.
- Configuration files.
- Test files.
- Generated files.
- Excluded files.

Extract:

- Modules.
- Packages.
- Classes.
- Interfaces.
- Methods.
- Functions.
- Imports.
- Exports.
- Calls where statically resolvable.
- Dependencies.
- Relationships.
- Configuration references.
- Test relationships.
- Git history.
- Contributors.

Support TypeScript and JavaScript as the initial language family.

Design the parser adapter interface to support:

- Java.
- Python.
- Go.
- C#.
- Other languages later.

Java support is a priority subsequent integration.

Never claim full language coverage when a parser is unavailable.

## 5.4 Indexing and evidence model

Every indexed fact must be traceable.

Store:

- Repository ID.
- Git commit/revision.
- Branch.
- File path.
- Symbol.
- Symbol type.
- Start line.
- End line.
- Relationship type.
- Index timestamp.
- Confidence.
- Evidence source.
- Parser status.

Classify information as:

- Observed.
- Inferred.
- Unknown.

Do not present inferred relationships as confirmed facts.

Dynamic dispatch, reflection, runtime configuration, dependency injection, generated code, and external service behavior may not be fully resolved statically.

Expose these limitations.

## 5.5 Architecture Brain visualization

Build an interactive architecture visualization.

Primary navigation regions:

1. Modules.
2. Dependencies.
3. Flows.
4. Risk.
5. Ownership.
6. Knowledge.

Provide hierarchical drill-down:

Repository → Module → Package → Class/Component → Method/Function.

Use a 2D graph with useful interaction.

Users must be able to:

- Click nodes.
- Inspect relationships.
- Expand and collapse sections.
- Filter by language.
- Search symbols.
- Search files.
- View dependency direction.
- Inspect evidence.
- Navigate directly to source files and line ranges.
- Identify unresolved relationships.

Provide an accessible list and search alternative to graph-only navigation.

The graph must be useful and data-driven, not decorative.

Do not introduce expensive 3D visualization in v1.

## 5.6 Architecture analysis

Implement deterministic analyses for:

### Module structure

- Module boundaries.
- Package structure.
- Module dependencies.
- Circular dependencies.

### Dependency analysis

- Direct dependencies.
- Transitive dependencies where resolvable.
- Highly coupled components.
- Dependency direction.
- Unresolved dependencies.

### Flow analysis

- Entry points.
- Function and method relationships.
- Routes and handlers where identifiable.
- Service-to-service calls where statically identifiable.
- Database access patterns where identifiable.

### Risk analysis

- Large or highly coupled modules.
- Circular dependencies.
- High change frequency.
- Complex functions where measurable.
- Missing or weak test coverage signals.
- Potentially sensitive configuration.
- Unsupported or unresolved references.

### Ownership signals

- Git contributors.
- Commit frequency.
- File modification history.
- Contributor distribution.

Never claim that commit frequency proves actual code ownership.

Present ownership as a signal, not a definitive fact.

Every risk or finding must show its evidence and limitations.

## 5.7 Code search and persistence

Use SQLite initially.

Do not introduce a graph database or vector database in v1.

Use relational tables for nodes and edges.

Use SQLite FTS5 for full-text search.

Support:

- Exact symbol search.
- Identifier search.
- File and path search.
- Full-text search.
- Graph traversal.
- Filtered search.

Optional embeddings can be introduced later.

The repository at a specific Git revision remains the source of truth.

Support re-indexing and incremental indexing where reliable.

Maintain an index coverage report.

Show:

- Files discovered.
- Files indexed.
- Files skipped.
- Unsupported languages.
- Parse failures.
- Generated files excluded.
- Unresolved references.
- Index duration.
- Index revision.

Never silently claim an index is complete when it is not.

## 5.8 Repository-aware chatbot

Implement a source-grounded architecture assistant.

It must answer questions such as:

- What does this repository do?
- What are the major modules?
- How does a request flow through the system?
- Where is authentication implemented?
- Which services depend on this module?
- What could break if this class changes?
- Where are database interactions handled?
- Which areas have high coupling?
- Where are tests missing?
- Explain this method.
- Generate module documentation.
- Investigate a potential bug.

Every material technical answer must cite:

- File path.
- Symbol.
- Line range where available.
- Repository revision.

Clearly distinguish:

- Observed.
- Inferred.
- Unknown.

If evidence is insufficient, say so.

Do not invent:

- Runtime behavior.
- External system behavior.
- Design rationale.
- Historical decisions.
- Business requirements.
- Dynamic relationships not discovered by indexing.

Treat source files, comments, documentation, issues, and repository content as untrusted input.

Protect the AI system against prompt injection contained in repository content.

Do not allow unrestricted shell execution.

Expose only narrow, explicitly controlled tools.

## 5.9 Bug investigation and patch workflow

This is a critical product feature.

Implement the following workflow:

1. User describes a bug or issue.
2. Brain investigates relevant source code.
3. Brain provides evidence and a potential root cause.
4. Brain creates a structured bug report.
5. Brain proposes a patch.
6. Patch is created in an isolated Git worktree or equivalent safe environment.
7. Tests, lint, and static checks run through controlled commands.
8. System records validation results.
9. User reviews exact source changes.
10. User reviews test results, limitations, risks, and rollback guidance.
11. User explicitly approves the exact patch.
12. System verifies that the patch hash has not changed.
13. Only then may the approved patch be merged locally.

No autonomous merge.

No automatic approval.

No hidden file changes.

No unrestricted shell execution.

The exact patch must have an explicit human approval record.

If the patch changes after approval, invalidate the approval and require a new review.

If tests fail:

- Display the failures.
- Do not conceal them.
- Do not describe the patch as validated.
- Allow the user to reject or revise it.

Use isolated worktrees and never modify the original working tree during investigation or patch creation.

Local branch and patch workflow is v1.

GitHub OAuth, GitHub App integration, and PR creation are a subsequent phase.

## 5.10 Change request data model

Implement:

- change_requests
- change_request_files
- validation_runs
- approvals
- merge_events

Suggested statuses:

- investigating
- reported
- proposed
- validating
- awaiting_approval
- approved
- merged
- rejected
- validation_failed
- abandoned
- superseded

Approval records must include:

- User identity.
- Exact patch hash.
- Commit or base revision.
- Approval timestamp.
- Validation run references.
- Approval decision.

The merge operation must verify the patch hash and repository state again before applying.

## 5.11 Architecture Brain analytics

Analytics must remain local in v1.

Track:

- Files indexed.
- Symbols discovered.
- Relationships discovered.
- Indexing duration.
- Indexing failures.
- Modules explored.
- Questions asked.
- Sources retrieved.
- Answer feedback.
- Findings generated.
- Change requests proposed.
- Patches accepted or rejected.
- Tests passed or failed.
- Changes merged.

Do not transmit source code, repository content, or telemetry externally by default.

Provide a clear future path for opt-in organizational analytics.

## 5.12 Architecture Brain UI

Build these screens:

1. Welcome/onboarding.
2. Repository selection.
3. Repository indexing progress.
4. Index coverage report.
5. Architecture Brain overview.
6. Module explorer.
7. Dependency graph.
8. Flow explorer.
9. Risk dashboard.
10. Ownership explorer.
11. Knowledge/search.
12. Source code evidence viewer.
13. Repository chatbot.
14. Bug investigation.
15. Change request details.
16. Patch diff viewer.
17. Validation results.
18. Approval and merge screen.
19. Settings.

The UI must make the repository understandable, navigable, and trustworthy.

---

# 6. AI ENGINEERING RULES

Both products must use a configurable AI abstraction.

Do not hard-code a single provider throughout the codebase.

Implement a common interface for:

- Model selection.
- Inference.
- Structured outputs.
- Token/context limits.
- Timeout handling.
- Retry handling.
- Model capability reporting.
- Provider availability.

## Resume Intelligence AI boundaries

AI may:

- Extract structured information.
- Normalize job requirements.
- Generate clarification questions.
- Explain evidence gaps.
- Suggest improved wording.
- Assist with document interpretation.

Deterministic code must:

- Calculate scores.
- Validate resume structures.
- Manage versions.
- Enforce evidence states.
- Validate exports.
- Record user decisions.

## Architecture Brain AI boundaries

AI may:

- Explain indexed code.
- Summarize modules.
- Interpret retrieved evidence.
- Suggest possible causes.
- Propose code changes.
- Generate documentation.

Deterministic code must:

- Index source files.
- Build graph relationships.
- Track source locations.
- Validate patch hashes.
- Execute approved validation commands.
- Enforce approval gates.
- Control Git operations.

## General AI rules

- Structured output must be schema-validated.
- Never trust model output without validation.
- Use bounded context.
- Use retrieval rather than sending entire repositories unnecessarily.
- Handle unavailable models gracefully.
- Provide useful deterministic fallbacks.
- Avoid unnecessary multi-agent orchestration.
- Never expose secrets in prompts or logs.
- Do not send private source code to hosted providers without explicit user consent.
- Clearly indicate when local inference is unavailable.

---

# 7. SECURITY REQUIREMENTS

Security is a core engineering requirement, not a final cosmetic phase.

Implement appropriate controls for:

### Authentication

- Secure password handling or maintained authentication.
- Session security.
- CSRF protection where applicable.
- Secure cookie configuration.
- Session revocation.
- Account recovery.

### Authorization

- Server-side authorization.
- Tenant isolation.
- Resource ownership checks.
- Least privilege.
- Explicit repository access checks.

### Application security

- Input validation.
- Output encoding.
- SQL injection prevention.
- XSS prevention.
- SSRF protection.
- File upload restrictions.
- MIME and file signature validation.
- File size limits.
- Rate limiting.
- Secure error handling.
- Secret management.
- Dependency scanning.

### Data security

- Encryption in transit.
- Appropriate encryption at rest.
- Private object storage.
- Signed download URLs.
- Secure local credential storage.
- Explicit deletion.
- Audit events.

### Extension security

- Minimal permissions.
- Secure pairing.
- Token rotation.
- Device revocation.
- No exposed service keys.
- No unnecessary page access.

### Architecture Brain security

- No source upload by default.
- No unrestricted shell.
- Isolated worktrees.
- Controlled Git operations.
- Explicit command allowlists.
- Human approval before merge.
- Patch hash verification.
- Prompt injection defenses.

Do not claim the product is secure merely because these features have been implemented. Document threat models, tests, and remaining risks.

---

# 8. UX AND PRODUCT DESIGN STANDARDS

Build both products with polished, modern interfaces.

Requirements:

- Responsive layouts.
- Consistent design system.
- Clear navigation.
- Good typography.
- Accessible color contrast.
- Keyboard navigation.
- Loading states.
- Empty states.
- Error states.
- Confirmation dialogs.
- Useful notifications.
- Search and filtering.
- Helpful onboarding.
- Sensible defaults.
- Consistent terminology.

Do not create:

- Non-functional buttons.
- Fake analytics.
- Placeholder dashboards presented as real data.
- Hardcoded sample results in production workflows.
- Artificial AI-generated scores.
- Decorative graphs without actual repository data.

Use realistic seeded demo data only in explicitly identified demo environments.

Build a clear distinction between demo data and user data.

---

# 9. DATABASE AND DATA GOVERNANCE

For Resume Intelligence:

- PostgreSQL.
- Drizzle ORM.
- Versioned migrations.
- Foreign keys and indexes.
- Tenant-aware access.
- Persistent workspace data.
- User-controlled deletion.

For Architecture Brain:

- SQLite.
- FTS5.
- Local database files.
- Repository revision-aware indexing.
- Safe re-indexing.
- Clear local data deletion.

Use repositories or service layers to isolate persistence from business logic.

Avoid placing SQL directly inside UI components.

All important workflows must survive application restart.

---

# 10. ZERO-COST INITIAL DEVELOPMENT STRATEGY

The initial development and testing phase must avoid mandatory paid subscriptions and recurring services.

Use:

- Open-source frameworks.
- Local databases.
- Local storage.
- Local Ollama inference.
- Local Git.
- Local test runners.
- Free development tools.
- Existing computer hardware.

Do not assume that cloud services or free hosted API quotas are permanently free.

Do not make a paid provider necessary to complete the core workflows.

For Resume Intelligence:

- Support local development storage.
- Implement a storage abstraction.
- Prepare private cloud object storage for hosted deployment.
- Do not silently delete data when storage limits are reached.
- Warn before capacity limits.

For Architecture Brain:

- Keep repository content local.
- Keep indexing local.
- Keep SQLite local.
- Keep inference local by default.

Document the future operating costs separately:

- Domain.
- Hosting.
- Managed PostgreSQL.
- Object storage.
- Bandwidth.
- Hosted inference.
- Email delivery.
- Monitoring.
- CI/CD.
- Browser extension publishing.
- Desktop code signing.
- Legal and security review.

Zero-cost development does not mean guaranteed zero-cost commercial operation.

---

# 11. TESTING REQUIREMENTS

Testing is mandatory.

## Unit tests

Test:

- Resume parsing.
- Job description parsing.
- Evidence classification.
- Scoring calculations.
- Clarification logic.
- Version generation.
- Structured diffs.
- Export generation.
- Authentication utilities.
- Token pairing.
- Repository parsing.
- Symbol extraction.
- Graph construction.
- Search.
- Risk analysis.
- Patch hashing.
- Approval validation.

## Integration tests

Test:

- Database persistence.
- Upload and parsing.
- Workspace creation.
- Job analysis.
- Evidence updates.
- Resume version creation.
- Export generation.
- Extension pairing.
- Repository indexing.
- Search and retrieval.
- Bug investigation workflow.
- Patch validation.
- Approval and merge controls.

## End-to-end tests

Resume Intelligence:

- Upload a resume.
- Create a job workspace.
- Analyze a job description.
- Review requirements.
- Answer clarification questions.
- Accept and reject suggestions.
- Create a new version.
- Compare versions.
- Export PDF and DOCX.

Architecture Brain:

- Select a repository.
- Index the repository.
- Explore modules.
- Search symbols.
- Ask architecture questions.
- Inspect evidence.
- Create a bug report.
- Propose a patch.
- Run tests.
- Review the diff.
- Reject a patch.
- Approve a separate valid patch.
- Verify merge authorization.

## Security tests

Test:

- Unauthorized access.
- Cross-user resource access.
- Tenant isolation.
- Malicious uploads.
- Expired tokens.
- Token reuse.
- Pairing-code reuse.
- Prompt injection.
- Path traversal.
- Unsafe shell commands.
- Patch modification after approval.
- Unauthorized Git operations.

Never report a test as passing unless it actually ran and passed.

---

# 12. PERFORMANCE AND RELIABILITY

Build for real workloads.

Resume Intelligence:

- Large resumes.
- Multiple resume versions.
- Multiple job workspaces.
- Large job descriptions.
- Repeated analyses.
- Concurrent users in hosted deployment.
- Document parsing failures.
- AI timeouts.

Architecture Brain:

- Small and medium repositories first.
- Large repositories should degrade gracefully.
- Ignore generated and irrelevant directories.
- Avoid unnecessary full re-indexing.
- Use incremental indexing when safe.
- Support cancellation.
- Show indexing progress.
- Handle parser crashes.
- Prevent memory exhaustion.
- Preserve existing indexes when a new indexing run fails.

Do not optimize prematurely, but design clear performance boundaries and record benchmarks.

---

# 13. DEVELOPMENT EXECUTION PLAN

You must implement the products in stages.

Do not stop after writing architecture documents.

Do not generate only a plan and claim completion.

For each stage:

1. Inspect the existing repository.
2. Review current code and dependencies.
3. Define the stage's scope.
4. Implement the functionality.
5. Add tests.
6. Run tests.
7. Fix failures.
8. Update documentation.
9. Report what works.
10. Identify genuine remaining limitations.
11. Proceed to the next stage.

Do not ask for approval between ordinary implementation stages.

Ask a question only if a decision is genuinely blocking or a potentially destructive action requires explicit authorization.

Never overwrite existing user work without checking it first.

## Phase 0 — Repository and environment inspection

- Inspect the current workspace.
- Identify existing files and applications.
- Detect available runtimes.
- Check Node.js, pnpm, Git, PostgreSQL, SQLite, Ollama, and LibreOffice availability.
- Identify existing configuration and environment variables.
- Do not expose secrets.
- Create a baseline engineering report.
- Establish the monorepo only if the workspace is appropriate.
- Preserve existing work.

Deliver:

- Repository inventory.
- Architecture decision records.
- Initial development instructions.
- Dependency inventory.

## Phase 1 — Engineering foundation

Build:

- Monorepo.
- Shared TypeScript configuration.
- Linting.
- Formatting.
- Test infrastructure.
- Logging.
- Validation utilities.
- Environment configuration.
- Documentation framework.

Acceptance:

- All applications build.
- Lint passes.
- Tests execute.
- No unnecessary paid dependency is required.

## Phase 2 — Resume Intelligence foundation

Build:

- Authentication.
- Database.
- Migrations.
- User workspace.
- Resume upload.
- Resume parsing.
- Structured resume editor.
- Original resume preservation.

Acceptance:

- User can upload a PDF or DOCX.
- Parsed content is reviewable.
- Original file remains unchanged.
- Data persists after restart.

## Phase 3 — Resume analysis engine

Build:

- Job description input.
- Job parsing.
- Requirement extraction.
- Evidence mapping.
- Three-state evidence model.
- Pending/classified workflow.
- Career-stage-aware scoring.
- Score explanations.
- Clarification questions.

Acceptance:

- An analysis can be completed without paid APIs.
- Every score is reproducible and explainable.
- Unanswered questions are not classified as missing.
- No fabricated experience is introduced.

## Phase 4 — Resume editing and export

Build:

- Suggestion generation.
- Individual accept/reject.
- Immutable versioning.
- Structured version diff.
- Classic Professional template.
- Modern Professional template.
- DOCX export.
- PDF export.

Acceptance:

- Original resume remains immutable.
- Every accepted edit is traceable.
- Rejected edits are excluded.
- Export matches the approved version.

## Phase 5 — Resume browser extension

Build:

- WXT extension.
- Secure pairing.
- Active-tab extraction.
- LinkedIn adapter.
- Naukri adapter.
- Generic career-page extraction.
- Manual paste fallback.
- Error and unsupported-page handling.

Acceptance:

- Extension can authenticate through pairing.
- User explicitly triggers extraction.
- Extracted content is reviewable.
- No job-board credentials or cookies are copied.
- Device revocation works.

## Phase 6 — Architecture Brain foundation

Build:

- Local web application.
- Local service.
- Repository selection.
- Git integration.
- SQLite database.
- TypeScript/JavaScript parser.
- Repository indexing.
- Symbol and relationship extraction.
- Index coverage report.

Acceptance:

- A local repository can be indexed.
- Results survive application restart.
- Index coverage is visible.
- Source locations are traceable.

## Phase 7 — Architecture visualization

Build:

- Repository overview.
- Module explorer.
- Dependency graph.
- Flow explorer.
- Search.
- Symbol navigation.
- Evidence viewer.
- Risk dashboard.
- Ownership signals.

Acceptance:

- Visualizations use actual indexed repository data.
- Nodes navigate to meaningful source evidence.
- Unresolved relationships are clearly identified.

## Phase 8 — Architecture chatbot

Build:

- Local Ollama integration.
- Retrieval engine.
- Repository-aware conversation.
- Evidence citations.
- Observed/Inferred/Unknown labels.
- Context management.
- Prompt injection protections.
- Model availability fallback.

Acceptance:

- Answers cite indexed source evidence.
- Unsupported claims are identified.
- Missing information is acknowledged.
- No external source-code transmission occurs by default.

## Phase 9 — Bug investigation and patch workflow

Build:

- Bug investigation.
- Structured bug reports.
- Patch proposal.
- Isolated worktree.
- Validation commands.
- Test result capture.
- Diff viewer.
- Patch hash.
- Human approval.
- Local merge.

Acceptance:

- The original working tree is protected.
- Patch creation is isolated.
- Validation results are visible.
- Approval is tied to an exact patch hash.
- Changed patches require reapproval.
- No autonomous merge is possible.

## Phase 10 — Product hardening

Both products:

- Security review.
- Error handling.
- Performance checks.
- Accessibility.
- Responsive design.
- Dependency review.
- Logging.
- Data deletion.
- Documentation.
- Backup/recovery guidance where applicable.
- Release checklist.

## Phase 11 — Release readiness

Prepare:

- Development setup guide.
- User guide.
- Architecture documentation.
- Database documentation.
- API documentation.
- Security documentation.
- Threat model.
- Test report.
- Known limitations.
- Deployment guide.
- Release checklist.
- Future roadmap.
- Cost assumptions.

Do not label either product production-ready if critical security, reliability, or acceptance criteria remain incomplete.

---

# 14. DOCUMENTATION REQUIREMENTS

Create and maintain:

1. README.md
2. PRODUCT_REQUIREMENTS.md
3. SYSTEM_ARCHITECTURE.md
4. ARCHITECTURE_DECISIONS.md
5. DATABASE_SCHEMA.md
6. API_REFERENCE.md
7. SECURITY.md
8. THREAT_MODEL.md
9. PRIVACY_AND_DATA_HANDLING.md
10. AI_MODEL_STRATEGY.md
11. LOCAL_DEVELOPMENT.md
12. TESTING_STRATEGY.md
13. DEPLOYMENT_GUIDE.md
14. TROUBLESHOOTING.md
15. RELEASE_CHECKLIST.md
16. KNOWN_LIMITATIONS.md
17. ROADMAP.md
18. CHANGELOG.md

Keep documentation synchronized with actual implementation.

Do not document planned features as completed features.

---

# 15. CODE QUALITY RULES

Follow these rules throughout implementation:

- Strict TypeScript.
- Avoid `any` unless justified and isolated.
- Small, cohesive modules.
- Clear domain boundaries.
- No giant components.
- No business logic embedded in UI.
- No duplicated business rules.
- No hidden global state.
- No hardcoded secrets.
- No fake API responses in production paths.
- No swallowed exceptions.
- No unbounded retries.
- No unvalidated external data.
- No unnecessary dependencies.
- No premature microservices.
- No unnecessary Kubernetes.
- No unnecessary vector databases.
- No unnecessary distributed infrastructure.
- No unnecessary multi-agent architecture.

Use meaningful names and comments that explain non-obvious decisions.

Prefer maintainable solutions over clever implementations.

---

# 16. PRODUCT AND COMMERCIAL READINESS

Build both products so that they can evolve into commercial offerings.

However, do not introduce complex billing, enterprise administration, or multi-organization workflows before the core user experience works.

Prepare architectural extension points for:

Resume Intelligence:

- Subscription plans.
- Usage limits.
- Organization workspaces.
- Recruiter and career-coach workflows.
- Additional job-board adapters.
- Localization.
- Additional resume templates.
- Hosted model providers.

Architecture Brain:

- Desktop packaging with Tauri.
- GitHub OAuth/GitHub App.
- Pull request creation.
- Team workspaces.
- Organization permissions.
- Shared architecture knowledge.
- Additional language parsers.
- Enterprise analytics.
- Optional hosted inference.

Do not implement these as fake features or dead UI controls.

---

# 17. FINAL ACCEPTANCE CRITERIA

A product is not complete because its homepage looks good.

## Resume Intelligence is functionally complete for v1 when:

- A user can create an account.
- A user can upload and review a resume.
- Original content is preserved.
- A job description can be analyzed.
- Requirements are extracted.
- Evidence is classified correctly.
- Clarification questions work.
- Career-stage-aware scores are explainable.
- Suggestions can be individually accepted or rejected.
- New immutable versions are created.
- Version comparisons work.
- DOCX and PDF exports work.
- Extension pairing works.
- LinkedIn and Naukri extraction have tested supported paths.
- Manual paste remains available.
- Data is protected and deletion works.
- Automated tests pass.

## Architecture Brain is functionally complete for v1 when:

- A user can select a local repository.
- A repository can be indexed.
- TypeScript/JavaScript symbols and relationships are extracted.
- Coverage and parser limitations are visible.
- Architecture navigation works.
- Dependency exploration works.
- Search works.
- Chat answers cite source evidence.
- Observed/Inferred/Unknown distinctions are visible.
- Potential bugs can be investigated.
- Patches are created in isolation.
- Tests and validation run.
- Diffs can be reviewed.
- Approval is required.
- Patch hash is verified.
- Only approved changes can be merged locally.
- Repository content stays local by default.
- Automated tests pass.

## Release quality

Before declaring release readiness:

- Run the complete test suite.
- Run lint and type checks.
- Build all applications.
- Verify all critical user journeys.
- Review all authorization boundaries.
- Review data handling.
- Check dependency vulnerabilities.
- Verify no secrets are committed.
- Verify no dead-end controls.
- Verify no fake functionality.
- Document known limitations.

---

# 18. HOW YOU MUST WORK WITH ME

I am the product founder and technical owner.

I want to understand and maintain the codebase rather than receive a black-box implementation.

Follow these collaboration rules:

1. Make sound engineering decisions independently when the requirements are clear.
2. Do not repeatedly ask me questions already answered in this specification.
3. Do not change agreed product decisions without explaining why.
4. If a feature is technically infeasible, explain the constraint and implement the best safe alternative.
5. Do not silently omit a requirement.
6. Do not mark incomplete work as complete.
7. Do not use paid services without explicitly identifying the cost and asking before making them mandatory.
8. Do not perform destructive Git operations without explicit approval.
9. Do not deploy publicly, purchase domains, or create paid resources without my authorization.
10. Do not commit or push changes unless explicitly requested.
11. Keep the code understandable and maintainable.
12. Explain major architectural decisions in concise, practical terms.
13. Keep an implementation checklist and update it as work progresses.
14. When something fails, investigate and fix it instead of hiding it.
15. Continue through the implementation phases without stopping after the planning stage.

For every major phase, report:

- What was implemented.
- Important files and modules created.
- Architectural decisions.
- Tests executed.
- Test results.
- Known limitations.
- Remaining tasks.
- Exact commands to run the application.

If a phase cannot be completed because of a missing dependency, permission, hardware limitation, or unavailable service, implement the remaining independent work and document the blocker.

---

# 19. FIRST ACTION — START BUILDING

Start by inspecting the current workspace.

Do not immediately generate thousands of lines of code.

First:

1. Inspect the repository and existing files.
2. Identify the current development environment.
3. Check installed dependencies and available tools.
4. Determine whether an existing application or codebase must be preserved.
5. Produce a concise implementation plan based on the actual workspace.
6. Create the engineering foundation.
7. Start implementing Phase 1.
8. Run the first tests.
9. Continue through the phases in the prescribed order.

Maintain a single implementation tracker at:

    documentation/IMPLEMENTATION_STATUS.md

For every requirement, track:

- Not started.
- In progress.
- Implemented.
- Tested.
- Blocked.

Only mark a feature as tested after its relevant tests have actually passed.

**The objective is to build two genuinely working, secure, maintainable software products—not two attractive demonstrations.**

Begin with repository inspection and proceed with implementation.

---

CLAUDE.md — PROJECT ENGINEERING GOVERNANCE

1. Primary engineering principle
   Build only what is supported by explicit requirements, verified technical capabilities, and tested implementation.
   Correctness is more important than speed or the appearance of completeness.
   Never invent:

- API methods.
- Library capabilities.
- Package versions.
- Database schemas.
- Test results.
- External integrations.
- Product capabilities.
- Performance measurements.
- Security guarantees.

If something is unknown, explicitly identify it as unknown. 2. Research before implementation
Before implementing any unfamiliar library, integration, protocol, API, or platform-specific capability:

1. Identify the exact technology and version.
2. Consult its official documentation.
3. Check compatibility with the existing stack.
4. Review relevant examples from official repositories where useful.
5. Identify known limitations and breaking changes.
6. Check whether the proposed feature is actually supported.
7. Record the findings in documentation/RESEARCH_AND_ASSUMPTIONS.md.
8. Implement only after the necessary assumptions are resolved.

Use this source priority:

1. Official documentation.
2. Official source code and repositories.
3. Official release notes and migration guides.
4. Standards and specifications.
5. Reputable technical references.
6. Community discussions only as supplementary evidence.

Do not claim research was performed if no source was checked.
Record:

- Research question.
- Finding.
- Source URL.
- Version checked.
- Date checked.
- Confidence.
- Implementation impact.
- Remaining uncertainty.

Do not browse unnecessarily for stable, well-understood programming concepts. 3. Evidence-based implementation
Every feature must have:

- A requirement ID.
- An implementation location.
- Defined expected behavior.
- Relevant tests.
- Acceptance criteria.
- Known limitations.

Maintain documentation/REQUIREMENTS_TRACEABILITY.md.
Never mark a feature as implemented merely because its UI exists.
A feature is implemented only when its actual behavior exists.
A feature is tested only when its relevant tests have executed successfully.
A feature is release-ready only when all applicable acceptance criteria have passed. 4. No fake implementations
Strictly prohibit:

- Fake API responses in production paths.
- Hardcoded scores presented as calculated scores.
- Mock data presented as real repository information.
- Placeholder buttons that appear functional.
- Simulated successful authentication.
- Simulated file uploads.
- Fake AI-generated results.
- Empty handlers.
- TODO comments used as substitutes for required functionality.
- Catch blocks that silently suppress errors.

Mock data is allowed only in tests, isolated demo environments, and explicitly labelled previews. 5. Test-driven development
For every significant feature:

1. Define expected behavior.
2. Identify normal and edge cases.
3. Write relevant tests.
4. Implement the feature.
5. Run tests.
6. Fix failures.
7. Run regression tests.
8. Record actual results.

Test at the appropriate levels:

- Unit.
- Integration.
- End-to-end.
- Security.
- Performance where relevant.

Never claim that a test passed without executing it.
If tests cannot run, report the exact blocker and mark the feature as unverified.
Do not remove or weaken tests simply to achieve a passing result. 6. Sprint discipline
Work in short, verifiable implementation sprints.
Each sprint must have:

- A defined objective.
- Requirements in scope.
- Explicit exclusions.
- Dependencies.
- Deliverables.
- Acceptance criteria.
- Test plan.
- Risks.
- Completion evidence.

Do not begin unrelated feature development while critical failures remain unresolved.
Do not expand scope without recording the reason and impact. 7. Architecture discipline
Before adding a dependency:

- Check whether an existing dependency can solve the problem.
- Check maintenance status.
- Check licensing.
- Check compatibility.
- Evaluate security and performance implications.
- Document why the dependency is necessary.

Avoid premature abstraction and overengineering.
Keep product boundaries clear.
Do not introduce microservices, distributed queues, vector databases, or complex agent frameworks unless a demonstrated requirement justifies them.
Record significant architecture decisions in documentation/ARCHITECTURE_DECISIONS.md. 8. AI reliability
Treat model output as untrusted data.

- Validate structured output against schemas.
- Never use model output directly as executable instructions.
- Ground answers in retrieved evidence.
- Distinguish facts from inference.
- Show uncertainty.
- Prevent prompt injection.
- Avoid sending private user data or source code to external models without explicit consent.

For Resume Intelligence:

- Never invent candidate experience.
- Never fabricate metrics.
- Never silently upgrade user-confirmed skills to demonstrated skills.
- Never describe match scores as interview probabilities or actual employer ATS scores.

For Architecture Brain:

- Cite source files and line ranges.
- Distinguish observed, inferred, and unknown facts.
- Never execute unrestricted commands generated by an LLM.
- Never merge a patch without explicit human approval.
- Revalidate the exact patch hash before merging.

9. Security-first implementation
   Security controls must be designed into features from the beginning.
   Validate all inputs.
   Enforce authorization on the server or trusted local service, not merely in the UI.
   Protect secrets.
   Use least privilege.
   Never log passwords, access tokens, refresh tokens, or private resume contents.
   Do not perform destructive Git operations without authorization.
   Do not overwrite existing user files.
10. Change management
    Before modifying an existing implementation:

11. Inspect the current code.
12. Understand dependencies.
13. Identify affected workflows.
14. Check relevant tests.
15. Make the smallest reasonable change.
16. Run regression tests.

Do not perform broad rewrites to fix narrow defects.
Preserve existing working functionality. 11. Definition of done
A task is complete only when:

- Requirements are satisfied.
- Implementation exists.
- Relevant tests pass.
- Type checking passes.
- Linting passes.
- Error handling exists.
- Security implications are reviewed.
- Documentation is updated.
- Known limitations are recorded.

A task blocked by an external dependency must be marked blocked, not complete. 12. Final reporting
At the end of each sprint, report:

1. What was built.
2. Requirement IDs completed.
3. Files created or changed.
4. Tests actually executed.
5. Test results.
6. Known defects.
7. Unverified functionality.
8. Security concerns.
9. Remaining work.
10. Recommended next sprint.

Always distinguish:

- Implemented.
- Tested.
- Verified.
- Release-ready.

Never use these terms interchangeably.

---

Product Name"

NEXORA
The umbrella technology brand

Intelligence that moves you forward.

For CV:
Nexora Career
CVForge
Resume Intelligence

Your experience. Your evidence. Your next opportunity.

For Architecture brain
Nexora Engineering
CodeAtlas
Architecture Brain

Understand every layer. See how everything connects.

---

For the Claude Code skill, I would choose:
My first choice
ArchLens
Architecture Intelligence & Repository Engineering Skill

Purpose: Help Claude understand, inspect, map, explain, troubleshoot, and safely modify complex software repositories.

Suggested skill directory:

skills/archlens/

Suggested skill file:

skills/archlens/SKILL.md

Suggested invocation:

/archlens
