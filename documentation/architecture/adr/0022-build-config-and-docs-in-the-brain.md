# ADR 0022: Build, configuration, data and documentation files drawn in the brain

- Status: accepted
- Date: 2026-11-12

## Context

A user found that JSON, XML, Maven, Gradle and Markdown files did not seem to be read. They were read: found, parsed and searchable. But almost nothing from them reached the brain or the index:

- The brain drew a non-code file only when it was a DevOps file or another file linked to it. In a test repository with a POM, Gradle builds, package.json, a JSON configuration, a Spring `beans.xml` and two READMEs, the brain had 3 parts.
- Maven dependencies were stored only as a capped list on the file. Gradle scripts were parsed as Groovy or Kotlin, with no plugins, dependencies or tasks. A JSON file outside a few known formats gave only its top-level keys.
- Spring XML files were labelled `full` while only their elements were counted. Liquibase changelogs were labelled partial ("columns not read") although the Liquibase schema reader (ADR 0017) does read their columns.

## Decision

1. **Key trees.** JSON, YAML and TOML readers add every key, nested, as symbols with their line. Array items that hold keys are named `[0]`, `[1]`… Values are never kept, because they can be credentials. Keys under a manifest's dependency or script sections are `dependency`, `plugin` or `task` symbols: package.json, composer.json, Cargo.toml, Pipfile, `libs.versions.toml` and similar. A reader that only listed top-level keys becomes `full` when every key fits: up to 5,000 keys and 32 levels. Beyond that it is `partial`, and its method says how far it read. A templated file stays partial.
2. **XML element trees.** Every element is a symbol, nested and named by tag, plus its `id`, `name` or `key` attribute.
   - Every attribute value or element text that is a fully qualified class name links to that class: a Spring bean's `class`, `<servlet-class>`, `META-INF` service files and so on. The link resolves to the one source file whose path ends in the package path (`.java`, `.kt`, `.groovy` or `.scala`), and to the class symbol when the file declares it. It is labelled inferred.
   - Spring beans, servlets, filters, listeners and persistence units are `bean` symbols.
   - Past the 5,000-element limit, plain elements are skipped but named ones are still read.
3. **Maven.**
   - Dependencies (`groupId:artifactId`), plugins, profiles and executions are named symbols.
   - A dependency on an artifact that a POM in the repository builds links to that POM. The link is observed when the coordinates match exactly, and inferred when only the artifactId matches and the groupId is a property.
   - The module links that already existed are kept.
4. **Gradle.**
   - `readGradle` runs on top of the syntax parse. It reads, by patterns: plugins (`id`, `kotlin(…)`, `alias(…)`, back-ticked core plugins, `apply plugin:`); dependencies (string coordinates, map notation, version-catalog aliases, `platform(…)`, `project(":a:b")`); and tasks (`task x`, `tasks.register`, `by tasks.registering`).
   - A project dependency links to that project's build file. In `settings.gradle`, `include`, `includeBuild` and `apply from:` scripts are linked too. A project path maps to its folder, which is Gradle's documented default.
   - Comments are blanked first. The method says the extra reading is done by patterns.
5. **Markdown.**
   - Every heading is a `section` symbol, nested under the nearest higher heading.
   - Relative links resolve through `..`.
   - The file is `full`: its sections, its links and its code names are all read.
   - AsciiDoc, reStructuredText, Org, Pod and TeX headings are nested the same way. AsciiDoc `include::`, `xref:` and `link:`, and reStructuredText `include`, `literalinclude`, `image` and `figure`, are linked. These formats stay partial, because their prose is not chunked for search.
6. **Liquibase.**
   - Changelogs get the element tree.
   - A changelog is `full` when every change in it is one the schema reader applies: create, add, drop and rename of tables and columns, plus primary, not-null, unique and foreign keys. Data changes don't count against it.
   - Otherwise it is `partial`, and its method names the changes that are not applied (for example `createIndex`, `modifyDataType` or `customChange`).
   - A Hibernate mapping is partial because its tables are not read into the schema.
7. **Brain.**
   - Every file with structured or Markdown symbols is drawn as a file part, with what it declares inside it.
   - New part kinds: `dependency`, `plugin`, `task`, `module`, `bean`, `key`, `element` and `section`.
   - A new **Documentation** lobe sits in the brainstem. Markdown, AsciiDoc and other documentation files, and their sections, are placed there.
   - Build manifests are placed in DevOps, and so are configuration files with no other signal.
   - Keys and elements deeper than 3 levels stay in the index and search but are not drawn.
   - Documentation that names a file or symbol becomes a `references` connection from the document.
   - When a brain exceeds 100,000 parts, keys, elements and sections are left out first.

## Consequences

- Test repository: 3 parts and 0 connections become 45 parts and 5 connections (Gradle project links, a bean-to-class link and a README-to-doc link).
- Keycloak (commit 1f4a80f5): 61,811 parts become 83,635. Files fully analysed rose from 84.3% to 88.8%. There are 402 Maven dependency links to the POM that builds the module, 118 links from configuration to Java classes, and 5,366 parts in the Documentation lobe.
  - Measured in headless Chromium with software WebGL (SwiftShader), a frame took about 2.5 s both before and after. The view on a real graphics card has not been measured.
- The model accepts the new kinds and region, so older models stay valid. A model that does not list the `docs` region places documentation in core, as before.
- The limits are recorded in KNOWN_LIMITATIONS:
  - Gradle patterns miss dependencies added by code.
  - Class names resolve only for JVM source files in the repository.
  - Liquibase index, data-type and custom changes are not applied to the schema.
