# Roadmap

Ordered by value to the founder's launch plan. Nothing here is committed work until scheduled.

## Next (before any public beta)

1. Push to a chosen GitHub repository and get CI green.
2. Manual extension test on live LinkedIn, Naukri and three company career sites; fix selectors.
3. Install Ollama locally; evaluate CVForge phrasing and CodeAtlas chat on a set of real resumes/questions; tune prompts and pick a default model.
4. CVForge production readiness: Postgres-backed rate limiter, S3-compatible storage, real email provider with verification, backups.
5. Privacy notice and terms; data request process.
6. Accessibility audit (axe + keyboard pass) of both UIs.

## Later

- CVForge: cover-letter drafting from confirmed evidence, more templates, OCR for scanned PDFs, multi-language support, team/coach workspaces, application tracker.
- CodeAtlas: incremental indexing via file hashes and git diff, more languages (Python, Go, Java via tree-sitter with lower confidence labels), more route frameworks (NestJS, Fastify, tRPC), architecture rule checks ("UI must not import db"), PR impact summaries, VS Code extension.
- ArchLens: publish the skill after the founder adds and tests it; connect it to CodeAtlas exports.
