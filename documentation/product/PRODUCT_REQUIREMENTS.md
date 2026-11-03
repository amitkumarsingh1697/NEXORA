# Product requirements

> The master specification ([MASTER_SPECIFICATION.md](MASTER_SPECIFICATION.md)) is the source of truth. Authoritative requirement IDs, mapped to code and tests, are in [REQUIREMENTS_TRACEABILITY.md](../REQUIREMENTS_TRACEABILITY.md). This page is a readable summary; the CV-n / CA-n IDs below are legacy.

## CVForge: Resume Intelligence

**Who it is for:** job seekers who want to tailor a resume to a specific job without inventing experience.

**Core promise:** every claim in a tailored resume traces back to the original resume or to something the user explicitly confirmed.

### Functional requirements

| ID    | Requirement                                                                                                                                                                                                                                                                                                                                                 |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CV-1  | Account signup, login, logout, password reset, password change, session list and revoke, privacy consent captured at signup.                                                                                                                                                                                                                                |
| CV-2  | Upload a DOCX or PDF resume (type sniffed from bytes, size and per-user storage quota enforced). Extract text, detect layout risks (columns, tables, header/footer), split into sections with a parse confidence and warnings.                                                                                                                              |
| CV-3  | The user reviews and confirms the parsed resume before it becomes version 1. Lines the parser could not place are shown, not dropped.                                                                                                                                                                                                                       |
| CV-4  | Create a job workspace by pasting a job description or capturing it with the extension. Parse title, company, location, work mode, employment type, salary, work authorisation, languages, minimum years, and individual requirements (required vs preferred, hard constraints). Requirements are editable.                                                 |
| CV-5  | Classify each requirement into one evidence state: **demonstrated** (cited resume text), **user_confirmed** (the user answered yes in their own words, with date), or **missing**. Work-authorisation and clearance requirements always need explicit confirmation; years of experience are computed from dated roles.                                      |
| CV-6  | Generate prioritised clarification questions for missing or weak requirements. Answers are yes / no / skipped / deferred; "yes" requires the user's own words.                                                                                                                                                                                              |
| CV-7  | Three explainable scores with every factor shown: job match (required 30%, responsibilities 25%, experience 20%, evidence 15%, preferred 10%), ATS readiness (8 weighted checks), and evidence quality (weights depend on career stage). Scores are never a pass/fail promise.                                                                              |
| CV-8  | Suggestions: deterministic, plus optional AI phrasing. Each shows original, proposed, reason and evidence; the user accepts, edits or rejects. Nothing is applied silently. A fabrication guard rejects any proposal (AI or deterministic) that introduces numbers or technologies not found in the original text, the resume, or the user's confirmations. |
| CV-9  | Versions: every applied change creates a new version with a change log; drafts, finalisation, side-by-side diff, compare workspaces.                                                                                                                                                                                                                        |
| CV-10 | Export DOCX (generated) and PDF (via LibreOffice) from two ATS-safe single-column templates (Classic Professional, Modern Professional). Exports are verified by re-extracting the text and expire after a retention period.                                                                                                                                |
| CV-11 | Privacy: export all account data as JSON, delete account (password confirmed), storage usage view, AI assist toggle, retention sweep for expired data and old audit events.                                                                                                                                                                                 |
| CV-12 | Browser extension (Chrome and Edge, MV3): pair with a one-time code, extract the job on the current tab only when the user clicks Extract, show the extracted text for review and editing, save to a new workspace. Tokens are short-lived with rotating refresh tokens and reuse detection.                                                                |

### Non-functional

- Works fully without any AI model. AI only improves phrasing.
- Never logs passwords, tokens or resume contents.
- Accessible UI (labels, keyboard focus, live regions for async results).

## CodeAtlas: Architecture Brain

**Who it is for:** engineers joining or maintaining a TypeScript/JavaScript codebase.

**Core promise:** every statement about the code is labelled with how it is known and links to the line it came from.

| ID   | Requirement                                                                                                                                                                                                                                                                                                                                                          |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CA-1 | Local service bound to 127.0.0.1, token-protected, with DNS-rebinding and origin protection.                                                                                                                                                                                                                                                                         |
| CA-2 | Register a local repository and index it with the TypeScript Compiler API: files, modules (workspace packages), symbols, imports, calls, instantiations, JSX renders, extends/implements, HTTP routes (Next.js app router, Express-style), tests, Markdown docs and ADRs, git history.                                                                               |
| CA-3 | Every edge is labelled **observed** (resolved by the compiler), **inferred** (heuristic, e.g. unique-name fallback) or **unknown**. Unresolved references are listed, not hidden.                                                                                                                                                                                    |
| CA-4 | Coverage report per index run: files indexed and skipped (with reasons), secret-looking files skipped, resolution rates, limitations.                                                                                                                                                                                                                                |
| CA-5 | Views: overview, modules, dependencies (graph), flows (from routes and entrypoints), risk (complexity, churn, fan-in/out, test gaps), ownership (git authors), knowledge (docs, ADRs, mentions), full-text search, impact of a node.                                                                                                                                 |
| CA-6 | Chatbot grounded in retrieved source: answers cite file and line ranges; unknown citations are stripped and uncited answers downgraded. Works with Ollama; without a model it returns the retrieved sources and graph facts instead.                                                                                                                                 |
| CA-7 | Bug investigation: describe a bug, get suspects, facts, affected routes and tests to run; create an isolated git worktree; propose a patch (manual or model-generated, limited to suspect files); run allowlisted commands; approve or reject the exact patch by its SHA-256; commit inside the worktree only. CodeAtlas prints merge instructions and never merges. |

## ArchLens

A Claude skill draft (`skills/archlens/SKILL.md`) that applies the same observed / inferred / unknown discipline to architecture reviews done in conversation. It is added by the user through claude.ai settings.
