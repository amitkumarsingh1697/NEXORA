# ADR 0021: Svelte, Vue and Astro components compiled as virtual TypeScript modules

- Status: accepted
- Date: 2026-11-12
- Corrects ADR 0019 §7, which said Vue scripts were read by the TypeScript adapter. They were not: `.vue`, `.svelte` and `.astro` files were recorded as text only until this decision.

## Context

The Immich proof run (sprint L6) showed 421 Svelte files, the whole web app, as "text only": no functions, no calls, no links between components. Vue and Astro were the same. Tree-sitter grammars exist for these formats, but they parse only the markup and leave the script as raw text; the code inside is TypeScript or JavaScript, which the TypeScript compiler already analyses with resolved calls and types.

## Decision

1. `products/codeatlas/core/src/indexer/sfc.ts` turns each component into TypeScript with exactly the same lines (`maskComponent`). Script blocks (and Astro frontmatter) are copied as written. Markup is replaced by the code it stands for: an expression becomes a statement; Svelte `{#if}`, `{#each … as x, i (key)}`, `{#await}`, `{#key}` and `{#snippet name(params)}` become `if`, `for`, block and function code, so loop variables and snippet parameters are scoped and snippets are functions; `use:`, `transition:`, `in:`, `out:` and `animate:` directives become the calls Svelte compiles them to; Vue `v-for` and slot props open a scope that closes with their element, and `@event`, `:prop`, `v-if` and `{{ }}` become statements. Tags, text, styles and comments are dropped, keeping their line breaks. Every component ends with `export {};` so it is a module.
2. The TypeScript indexer serves each one under the name TypeScript itself tries for `import X from './X.svelte'`: `X.svelte.ts` (`X.astro.tsx` for Astro, whose expressions contain JSX). Line numbers in every edge are the component's own.
3. Component tags (`<Button>`, `<my-button>`) are emitted as references; once the compiler resolves one, a `renders` edge goes to the component file (default import) or symbol (named export).
4. Svelte runes and Vue compiler macros are declared in an ambient file served as part of the `svelte` or `vue` package, so calls to them count as external package calls, not unresolved ones. Svelte store reads `$name` are read as the store `name` (Svelte forbids declaring `$`-prefixed names, so this is unambiguous).
5. SvelteKit's `$lib` alias, defined in a generated `.svelte-kit/tsconfig.json` that a clone does not have, defaults to `src/lib` (the documented default of `kit.files.lib`) in a package that depends on `@sveltejs/kit` and does not set it. A custom `kit.alias` or `files.lib` in `svelte.config.js` is not read.
6. Scripts without an extension that a `#!` line identifies as JavaScript or TypeScript go the same way, served as `<path>.js` or `<path>.ts` with their text unchanged.
7. Inventory status is `full`, with the method saying exactly what was compiled: "Svelte component: scripts, template expressions and component tags compiled as TypeScript (TypeScript Compiler API); markup and styles are not code".

## Consequences

- Immich: 421 Svelte files fully analysed; 1,772 observed calls and 150 `renders` links from them.
- Limits, stated in KNOWN_LIMITATIONS: Svelte 4 `let:` slot props and Vue globally registered or auto-imported components (Nuxt) are not resolved; event modifiers and CSS are not modelled; a component and a real file named `X.svelte.ts` cannot both be compiled (the component is then recorded as failed with that reason).
- `components.test.ts` covers line preservation, a clean TypeScript parse, scoping, directives, snippets, store reads, renders links for all three formats, and a `#!` script.
