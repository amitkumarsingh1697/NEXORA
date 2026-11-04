# User guide

This guide covers both Nexora products as they stand at the end of Sprint 2 (2026-11-03). For what is not built or not verified yet, see [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).

- [CVForge](#cvforge-resume-intelligence): tailor a resume to a job using only evidence you can stand behind.
- [CodeAtlas](#codeatlas-architecture-brain): understand a TypeScript or JavaScript repository on your own machine.

Setup commands for developers are in the repository [README](../../README.md).

---

## CVForge (resume intelligence)

CVForge runs as a web app (by default at `http://localhost:3000`) with an optional Chrome or Edge extension.

### 1. Create an account

Open **Sign up**, enter your name, email and a password of at least 12 characters, and accept the privacy notice. You land on the upload screen.

CVForge sends a link to confirm your email address. Open it and click **Confirm email address**. Until you do, **Settings** shows a reminder with a **Send a new link** button. Depending on how CVForge is set up, uploading resumes and AI suggestions may wait until you confirm. (In local development the email is written to the outbox folder instead of being sent.)

### 2. Upload and confirm your resume

1. Choose a Word (`.docx`) or PDF file of up to 10 MB and click **Upload and extract**.
2. CVForge keeps your original file unchanged and shows what it extracted: contact details, summary, skills, experience, projects, education and more. Each section shows how confident the parser is.
3. Correct anything that is wrong. Under **Formatting** you can pick a preferred export template, and under **Section order** you can move sections up or down.
4. Click **Confirm version**. Confirmed versions never change. Every later edit creates a new version.

If CVForge cannot read a file it says why. Scanned (image-only) PDFs are not supported. A Word document that takes too long or too much memory to read is refused as too complex; saving it again or exporting it as PDF usually helps.

### 3. Analyse a job

1. Go to **Workspaces → New workspace**, paste the full job description (or capture it with the extension, below) and pick which confirmed resume version to analyse.
2. Click **Create workspace and analyse**.

The workspace has five tabs:

| Tab          | What it shows                                                                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Analysis     | Job Match, ATS Compatibility and Evidence Quality scores, with how many requirements are demonstrated, confirmed, missing or pending                                                             |
| Requirements | Every requirement from the job with its evidence state and the resume lines that support it                                                                                                      |
| Clarify      | Questions about requirements your resume does not show. Answer **Yes, I have this** with a short description in your own words, answer no, or skip. Your answer updates the analysis immediately |
| Scores       | How each score was calculated, factor by factor, including what is uncertain                                                                                                                     |
| Suggestions  | Proposed edits, each backed by evidence. Accept or reject each one individually                                                                                                                  |

Evidence states mean:

- **Demonstrated:** your resume text shows it.
- **User confirmed:** you said yes and described it. CVForge only ever uses your own words for these.
- **Missing:** you said no or skipped.
- **Pending:** not yet answered.

Scores are explainable estimates. They are not predictions of what an employer's system or a recruiter will decide.

### 4. Create a tailored version

After accepting the suggestions you want, click **Create version**. CVForge builds a new version from your accepted changes only and opens the comparison. The comparison lists every structured change (added, removed, modified or reordered), shows word-level differences, and includes formatting changes such as a different template or section order. The **Decision record** lists what you accepted and rejected.

### 5. Compare jobs

On **Workspaces**, tick two or more jobs (up to six). The comparison card shows:

- each job's latest scores;
- a warning if the jobs were analysed against different resume versions, because their scores are then not directly comparable;
- **Skills these jobs share**, with your evidence state and whether each job marks the skill as required or preferred.

Skills are matched using CVForge's skill list. Responsibilities that do not name a recognised skill are not compared.

### 6. Export

Go to **Exports**, choose a confirmed version, a template (it defaults to the version's preferred template if you set one) and a format:

- **DOCX:** editable in Word.
- **PDF:** generated from the same document.

Each export is checked against the version's content before you download it, and the export list shows whether it matches.

### 7. Browser extension (optional)

1. In the web app open **Settings → Browser extension** and create a pairing code.
2. In the extension popup enter the code. The extension is now paired with your account.
3. On a job page (LinkedIn, Naukri or a company careers page) click the extension, then **Extract**. Review the title, company, location and description, choose a resume version, and save. A workspace is created.

The extension reads a page only when you click **Extract**. It does not read job-site cookies or passwords and does not get around logins or CAPTCHAs. If extraction fails, paste the job description into a new workspace instead. Live LinkedIn and Naukri pages have not been verified yet (see the release readiness checklist).

To disconnect a browser, revoke it under **Settings → Browser extension**.

### 8. Your data

Under **Settings** you can see and revoke your sessions. Under **Settings → Privacy and data** you can download your data or delete your account, which removes your resumes, versions, workspaces and exports.

---

## CodeAtlas (architecture brain)

CodeAtlas runs on your computer and listens only on `127.0.0.1`. Your code is not uploaded anywhere.

### 1. Start it

Start the service from a terminal. It prints a link such as `http://127.0.0.1:4317/#token=…`. Open that link: the token proves the request comes from you, and CodeAtlas removes it from the address bar. Opening the plain address without the token shows instructions instead of your data.

### 2. First run

The **Welcome** screen explains what CodeAtlas does and how it protects your code. Click **Add your first repository**. The screen appears again only after you delete all local data.

### 3. Add a repository

On **Repositories**:

- **Local folder:** enter the absolute path of a repository and click **Add and index**.
- **Public clone:** enter an `https://` URL of a public repository and click **Clone and index**. CodeAtlas refuses other URL types and addresses on your local network, and it does not use your saved git credentials.

Indexing runs in the background. While it runs you can click **Cancel indexing**; the previous index (if any) stays as it was. **Re-index** refreshes the map after you change code. When your project configuration and file list are unchanged, only changed files and the files that depend on them are analysed again, so re-indexing is much faster; **Overview** shows which mode ran and why. **Remove** deletes CodeAtlas's data for that repository and never touches your files.

### 4. Explore

Open a repository to see these tabs:

| Tab          | What it shows                                                                                                                                                                                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview     | Coverage report: files analysed, symbols, routes, how many calls were resolved, branch and commit, manifests, declared frameworks, language adapters and unsupported languages, integrations found, incremental indexing status, and what was skipped and why                                     |
| Structure    | A collapsible tree: modules, then files, then classes, functions and their members. Expands one level at a time, and can be filtered by language                                                                                                                                                  |
| Modules      | Modules with size and test counts, and import cycles between modules                                                                                                                                                                                                                              |
| Dependencies | The import graph for a module or the whole repository, optionally including external packages, filtered by language if you choose                                                                                                                                                                 |
| Integrations | Environment variables, configuration files, HTTP services and databases the code uses, each with the lines that use them (inferred, never their values)                                                                                                                                           |
| Flows        | From a route or entry point, the chain of calls it makes                                                                                                                                                                                                                                          |
| Risk         | Files ranked by churn, size and missing tests; import cycles; files that look like credentials (listed by path only, never read)                                                                                                                                                                  |
| Ownership    | Who changed which files, from git history                                                                                                                                                                                                                                                         |
| Knowledge    | Markdown documents and architecture decision records, plus **Module documentation**: a generated page per module (exports, dependencies, routes, integrations, with citations). **Download Markdown** saves it; **Write overview with AI** adds a model-written summary when a model is available |
| Search       | Full-text search over code and docs, optionally limited to one language                                                                                                                                                                                                                           |
| Ask          | Questions answered from the code, with citations                                                                                                                                                                                                                                                  |
| Investigate  | Take a bug from description to an approved, merged fix                                                                                                                                                                                                                                            |

Every relationship is labelled **observed** (seen directly in code), **inferred** (likely, with the reason) or **unknown**. Click any node to see its details and the source lines behind it.

### 5. Ask questions

Type a question on **Ask**. If a local Ollama model is running, it answers using only the retrieved sources and cites them as `[S1]`, `[S2]` and so on; click a citation to see the exact lines and the commit they were indexed at. Without a model you get **Evidence only** answers: the relevant sources and relationships, with no generated text. Low-confidence answers and answers from an index of uncommitted changes carry a warning.

Under each answer, rate it 👍 or 👎 and add an optional note. Feedback is stored only on your machine.

### 6. Investigate a bug

1. On **Investigate**, describe what happens and what should happen, then click **Start investigation**. CodeAtlas suggests where to look, with evidence.
2. Propose a patch: paste a unified diff, or ask the model if one is available. The patch is applied in a separate git worktree on its own branch. Your checkout is not changed.
3. Run allowlisted checks (such as the repository's `test` or `typecheck` scripts). Results are recorded against the exact patch.
4. Review the diff and its sha256 hash. **Reject** it, or **Approve this exact diff**. If checks failed or did not run, CodeAtlas asks you to acknowledge that before approving.
5. **Commit** writes the approved patch to the investigation branch.
6. **Merge** fast-forwards your branch to that commit. You must type the first 8 characters of the approved hash. CodeAtlas re-checks the approval, the hash, the branch and that your working tree is clean, and refuses if anything changed. The result shows the `git revert` command to undo the merge.

CodeAtlas never approves or merges on its own, and runs only allowlisted commands. Note that a repository's own test and build scripts are that repository's code: only run checks on repositories you trust.

### 7. Settings

Click **Settings** in the header to see:

- **AI provider:** which provider and model are configured and whether they are available.
- **Data location:** where the database, investigation worktrees and public clones live.
- **Local usage analytics:** counts of indexing runs, modules explored, questions, feedback, findings, patches, checks and merges. These stay on your machine and never include your code, questions or answers.
- **Delete all local data:** type `DELETE` to clear CodeAtlas's database. Your repositories are not touched. The worktree and clone folders are kept for you to review and delete yourself.

### 8. Configuration

Set these environment variables before starting the service:

| Variable                                                     | Default                                         | Purpose                                                     |
| ------------------------------------------------------------ | ----------------------------------------------- | ----------------------------------------------------------- |
| `CODEATLAS_HOME`                                             | `~/.codeatlas`                                  | Where the database, token, worktrees and clones are stored  |
| `CODEATLAS_PORT`                                             | `4317`                                          | Port on 127.0.0.1                                           |
| `CODEATLAS_ALLOWED_ROOTS`                                    | not set                                         | Restrict which folders can be added                         |
| `CODEATLAS_WORKTREE_DIR`                                     | `$CODEATLAS_HOME/worktrees`                     | Where investigation worktrees are created                   |
| `AI_PROVIDER`                                                | `ollama`                                        | `ollama`, `openai-compatible` or `disabled`                 |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL`                            | `http://127.0.0.1:11434`, `qwen2.5:7b-instruct` | Local model                                                 |
| `AI_COMPAT_BASE_URL`, `AI_COMPAT_MODEL`, `AI_COMPAT_API_KEY` | not set                                         | A hosted OpenAI-compatible provider                         |
| `AI_REMOTE_CONSENT`                                          | not set                                         | Must be `true` before any code is sent to a hosted provider |

CodeAtlas needs Node.js 22.13 or later with SQLite full-text search (FTS5). If your Node build lacks FTS5, CodeAtlas stops with a message saying so.
