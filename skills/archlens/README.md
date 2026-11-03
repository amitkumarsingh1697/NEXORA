# ArchLens

**Architecture Intelligence & Repository Engineering Skill** (Nexora)

ArchLens helps Claude understand, inspect, map, explain, troubleshoot and safely modify complex software repositories. Every claim is tagged observed, inferred or unknown, and cited to a file and line.

## Contents

```
skills/archlens/
├── SKILL.md                         entry point (frontmatter + workflow)
├── references/
│   ├── evidence-model.md            the three labels and edge cases
│   ├── playbooks.md                 Map, Trace, Impact, Assess, Investigate, Change, Onboard
│   ├── risk-heuristics.md           risk signals with evidence and limitations
│   ├── report-templates.md          output formats
│   ├── safe-change-protocol.md      how to modify code safely
│   └── codeatlas-integration.md     using a CodeAtlas index as evidence
└── scripts/check.mjs                structural validation (run with node)
```

## Install

The skill format follows the Claude Code skills docs (https://code.claude.com/docs/en/skills, checked 2026-11-03; see research R11).

- **Claude Code, all your projects:** copy the folder to `~/.claude/skills/archlens/`.
- **Claude Code, one project:** copy it to `<project>/.claude/skills/archlens/`.
- **claude.ai:** zip the `archlens` folder and upload it under Settings → Capabilities → Skills. The frontmatter uses only `name`, `description` and `allowed-tools`, the fields the docs list as accepted outside Claude Code.

Invoke it with `/archlens [question or path]`, or let Claude load it automatically when you ask about a repository's architecture.

## Validate

```bash
node skills/archlens/scripts/check.mjs
```

The script checks four things:

- the frontmatter is on the first line, with `name` and `description`, using only portable fields;
- `description` is within 1,536 characters;
- `SKILL.md` is under 500 lines;
- every linked reference exists.

## Status

The skill is implemented and passes its structure check. It has **not yet been exercised in a live Claude Code session** in this workspace.
