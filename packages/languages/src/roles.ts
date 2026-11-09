/**
 * File types (roles): what a non-source file does in the repository — a container build, a CI
 * pipeline, a migration, a lockfile — independent of its syntax. A role comes from the path,
 * and for generic syntaxes (YAML, JSON, XML, SQL) from a bounded look at the content.
 */
import type { RoleGroup, RoleId, RoleInfo } from './types';

interface RoleRule {
  id: RoleId;
  label: string;
  group: RoleGroup;
  /** Matched against the repository-relative POSIX path. */
  path: RegExp;
  /** When set, the first 8 KiB of text must also match. */
  content?: RegExp;
}

const B = '(^|/)';

/** First match wins, so specific rules come before generic ones. */
const RULES: RoleRule[] = [
  // Containers
  {
    id: 'docker-compose',
    label: 'Docker Compose',
    group: 'container',
    path: new RegExp(`${B}(docker-compose|compose)[^/]*\\.ya?ml$`, 'i'),
  },
  {
    id: 'dockerfile',
    label: 'Dockerfile / Containerfile',
    group: 'container',
    path: new RegExp(`${B}((Docker|Container)file[^/]*|[^/]+\\.(dockerfile|containerfile))$`, 'i'),
  },
  {
    id: 'dockerignore',
    label: '.dockerignore',
    group: 'container',
    path: new RegExp(`${B}\\.dockerignore$`),
  },
  {
    id: 'devcontainer',
    label: 'Dev container',
    group: 'container',
    path: new RegExp(`${B}\\.devcontainer(/|\\.json$)`),
  },
  // CI/CD
  {
    id: 'github-actions',
    label: 'GitHub Actions workflow',
    group: 'ci',
    path: new RegExp(`${B}\\.github/workflows/[^/]+\\.ya?ml$`),
  },
  {
    id: 'github-action',
    label: 'GitHub Action definition',
    group: 'ci',
    path: new RegExp(`${B}action\\.ya?ml$`),
    content: /^\s*runs:\s*$/m,
  },
  {
    id: 'gitlab-ci',
    label: 'GitLab CI',
    group: 'ci',
    path: new RegExp(`${B}\\.gitlab-ci\\.ya?ml$|${B}\\.gitlab/ci/.+\\.ya?ml$`),
  },
  { id: 'jenkins', label: 'Jenkinsfile', group: 'ci', path: new RegExp(`${B}Jenkinsfile[^/]*$`) },
  {
    id: 'circleci',
    label: 'CircleCI',
    group: 'ci',
    path: new RegExp(`${B}\\.circleci/[^/]+\\.ya?ml$`),
  },
  {
    id: 'azure-pipelines',
    label: 'Azure Pipelines',
    group: 'ci',
    path: new RegExp(`${B}(azure-pipelines[^/]*\\.ya?ml|\\.azure-pipelines/.+\\.ya?ml)$`),
  },
  {
    id: 'bitbucket',
    label: 'Bitbucket Pipelines',
    group: 'ci',
    path: new RegExp(`${B}bitbucket-pipelines\\.ya?ml$`),
  },
  { id: 'travis', label: 'Travis CI', group: 'ci', path: new RegExp(`${B}\\.travis\\.ya?ml$`) },
  {
    id: 'other-ci',
    label: 'Other CI (Drone, Buildkite, Woodpecker, AppVeyor, Cirrus, Tekton, Argo)',
    group: 'ci',
    path: new RegExp(
      `${B}(\\.drone\\.ya?ml|\\.buildkite/.+|\\.woodpecker(\\.ya?ml|/.+)|appveyor\\.ya?ml|\\.cirrus\\.ya?ml|\\.tekton/.+\\.ya?ml|cloudbuild\\.ya?ml|buildspec\\.ya?ml|codemagic\\.ya?ml|\\.pre-commit-config\\.yaml)$`,
    ),
  },
  // Orchestration
  {
    id: 'helm',
    label: 'Helm chart',
    group: 'orchestration',
    path: new RegExp(`${B}Chart\\.ya?ml$`),
  },
  {
    id: 'helm-template',
    label: 'Helm template',
    group: 'orchestration',
    path: /(^|\/)templates\/[^/]+\.(ya?ml|tpl)$/,
    content: /\{\{[-\s]*(\.Values|\.Release|include|template|define)\b/,
  },
  {
    id: 'kustomize',
    label: 'Kustomize',
    group: 'orchestration',
    path: new RegExp(`${B}kustomization\\.ya?ml$`),
  },
  {
    id: 'skaffold',
    label: 'Skaffold',
    group: 'orchestration',
    path: new RegExp(`${B}skaffold[^/]*\\.ya?ml$`),
  },
  {
    id: 'kubernetes',
    label: 'Kubernetes manifest',
    group: 'orchestration',
    path: /\.(ya?ml|json)$/i,
    content:
      /^\s*"?apiVersion"?\s*:\s*"?[\w./-]+"?\s*,?\s*$[\s\S]*^\s*"?kind"?\s*:|^\s*"?kind"?\s*:\s*"?\w+"?\s*,?\s*$[\s\S]*^\s*"?apiVersion"?\s*:/m,
  },
  // Infrastructure as code
  { id: 'terraform', label: 'Terraform / OpenTofu', group: 'iac', path: /\.(tf|tofu|tf\.json)$/i },
  { id: 'terraform-vars', label: 'Terraform variables', group: 'iac', path: /\.tfvars(\.json)?$/i },
  {
    id: 'terragrunt',
    label: 'Terragrunt',
    group: 'iac',
    path: new RegExp(`${B}terragrunt\\.hcl$`),
  },
  { id: 'bicep', label: 'Bicep', group: 'iac', path: /\.bicep(param)?$/i },
  {
    id: 'cloudformation',
    label: 'AWS CloudFormation / SAM',
    group: 'iac',
    path: /\.(ya?ml|json|template)$/i,
    content: /AWSTemplateFormatVersion|Transform:\s*AWS::Serverless|"AWSTemplateFormatVersion"/,
  },
  {
    id: 'serverless',
    label: 'Serverless Framework',
    group: 'iac',
    path: new RegExp(`${B}serverless\\.ya?ml$`),
  },
  {
    id: 'pulumi',
    label: 'Pulumi',
    group: 'iac',
    path: new RegExp(`${B}Pulumi(\\.[\\w-]+)?\\.ya?ml$`),
  },
  {
    id: 'ansible',
    label: 'Ansible',
    group: 'iac',
    path: /(^|\/)(playbooks?\/.+|roles\/[^/]+\/(tasks|handlers|defaults|vars|meta)\/[^/]+|site|playbook)\.ya?ml$|(^|\/)ansible\.cfg$|(^|\/)(inventory|hosts)(\.ini|\.ya?ml)?$/,
  },
  {
    id: 'ansible-play',
    label: 'Ansible',
    group: 'iac',
    path: /\.ya?ml$/,
    content: /^-\s+(hosts|import_playbook):/m,
  },
  { id: 'puppet', label: 'Puppet', group: 'iac', path: /\.pp$/ },
  { id: 'vagrant', label: 'Vagrantfile', group: 'iac', path: new RegExp(`${B}Vagrantfile$`) },
  { id: 'nix', label: 'Nix', group: 'iac', path: /\.nix$|(^|\/)flake\.lock$/ },
  { id: 'packer', label: 'Packer', group: 'iac', path: /\.pkr\.(hcl|json)$/ },
  { id: 'nomad', label: 'Nomad job', group: 'iac', path: /\.nomad(\.hcl)?$/ },
  // Lockfiles (before dependency manifests: Cargo.lock is not Cargo.toml)
  {
    id: 'lockfile',
    label: 'Lockfile',
    group: 'lockfile',
    path: new RegExp(
      `${B}(package-lock\\.json|npm-shrinkwrap\\.json|yarn\\.lock|pnpm-lock\\.yaml|bun\\.lockb?|deno\\.lock|Cargo\\.lock|go\\.sum|go\\.work\\.sum|Gemfile\\.lock|poetry\\.lock|Pipfile\\.lock|uv\\.lock|pdm\\.lock|composer\\.lock|mix\\.lock|packages\\.lock\\.json|gradle\\.lockfile|Podfile\\.lock|Package\\.resolved|pubspec\\.lock|flake\\.lock|conan\\.lock|vcpkg-lock\\.json|Manifest\\.toml|rebar\\.lock|stack\\.yaml\\.lock|cabal\\.project\\.freeze|pixi\\.lock|renv\\.lock|shard\\.lock|.terraform\\.lock\\.hcl)$`,
    ),
  },
  // Dependency manifests
  {
    id: 'npm-package',
    label: 'npm package.json',
    group: 'dependencies',
    path: new RegExp(`${B}package\\.json$`),
  },
  { id: 'maven', label: 'Maven POM', group: 'dependencies', path: new RegExp(`${B}pom\\.xml$`) },
  {
    id: 'gradle',
    label: 'Gradle build',
    group: 'build',
    path: /\.gradle(\.kts)?$|(^|\/)gradle\.properties$|(^|\/)gradle\/libs\.versions\.toml$/,
  },
  { id: 'sbt', label: 'sbt build', group: 'build', path: /\.sbt$|(^|\/)project\/[^/]+\.scala$/ },
  {
    id: 'go-module',
    label: 'Go module',
    group: 'dependencies',
    path: new RegExp(`${B}go\\.(mod|work)$`),
  },
  {
    id: 'cargo',
    label: 'Cargo manifest',
    group: 'dependencies',
    path: new RegExp(`${B}Cargo\\.toml$`),
  },
  {
    id: 'python-deps',
    label: 'Python packaging',
    group: 'dependencies',
    path: new RegExp(
      `${B}(pyproject\\.toml|setup\\.py|setup\\.cfg|Pipfile|requirements[^/]*\\.(txt|in)|environment\\.ya?ml|conda\\.ya?ml|tox\\.ini|MANIFEST\\.in)$`,
    ),
  },
  {
    id: 'ruby-deps',
    label: 'Ruby gems',
    group: 'dependencies',
    path: new RegExp(`${B}(Gemfile|[^/]+\\.gemspec|\\.ruby-version)$`),
  },
  {
    id: 'php-deps',
    label: 'Composer',
    group: 'dependencies',
    path: new RegExp(`${B}composer\\.json$`),
  },
  {
    id: 'dotnet-project',
    label: '.NET project or solution',
    group: 'dependencies',
    path: /\.(csproj|fsproj|vbproj|vcxproj|sln|slnx|props|targets)$|(^|\/)(packages\.config|nuget\.config|global\.json|Directory\.Packages\.props)$/i,
  },
  {
    id: 'elixir-deps',
    label: 'Elixir/Erlang project',
    group: 'dependencies',
    path: new RegExp(`${B}(mix\\.exs|rebar\\.config|[^/]+\\.app\\.src|erlang\\.mk)$`),
  },
  {
    id: 'haskell-deps',
    label: 'Haskell project',
    group: 'dependencies',
    path: /\.cabal$|(^|\/)(stack\.yaml|cabal\.project|package\.yaml)$/,
  },
  {
    id: 'jvm-other',
    label: 'Clojure/Leiningen project',
    group: 'dependencies',
    path: new RegExp(`${B}(project\\.clj|deps\\.edn|build\\.boot|shadow-cljs\\.edn)$`),
  },
  {
    id: 'swift-deps',
    label: 'Swift/CocoaPods/Carthage',
    group: 'dependencies',
    path: new RegExp(`${B}(Package\\.swift|Podfile|Cartfile|[^/]+\\.podspec)$`),
  },
  {
    id: 'dart-deps',
    label: 'Dart/Flutter pubspec',
    group: 'dependencies',
    path: new RegExp(`${B}pubspec\\.ya?ml$`),
  },
  {
    id: 'other-deps',
    label: 'Other dependency manifest',
    group: 'dependencies',
    path: new RegExp(
      `${B}(DESCRIPTION|NAMESPACE|Project\\.toml|cpanfile|Makefile\\.PL|Build\\.PL|dist\\.ini|[^/]+\\.rockspec|[^/]+\\.nimble|build\\.zig(\\.zon)?|dune-project|dune|[^/]+\\.opam|shard\\.yml|vcpkg\\.json|conanfile\\.(txt|py)|deno\\.jsonc?|bower\\.json|v\\.mod|gleam\\.toml|elm\\.json|spago\\.(dhall|ya?ml)|bsconfig\\.json|rescript\\.json|esy\\.json|[^/]+\\.csproj\\.user|jsr\\.json|requirements\\.R)$`,
    ),
  },
  // Build systems
  {
    id: 'make',
    label: 'Makefile',
    group: 'build',
    path: new RegExp(
      `${B}(GNUmakefile|[Mm]akefile(\\.[\\w.]+)?|BSDmakefile|[^/]+\\.(mk|mak|make))$`,
    ),
  },
  {
    id: 'cmake',
    label: 'CMake',
    group: 'build',
    path: new RegExp(`${B}CMakeLists\\.txt$|\\.cmake(\\.in)?$|${B}CMakePresets\\.json$`),
  },
  {
    id: 'bazel',
    label: 'Bazel / Buck / Pants',
    group: 'build',
    path: new RegExp(
      `${B}(BUILD|BUILD\\.bazel|WORKSPACE|WORKSPACE\\.bazel|MODULE\\.bazel|[^/]+\\.bzl|\\.bazelrc|\\.bazelversion|BUCK|TARGETS|pants\\.toml|BUILD\\.pants)$`,
    ),
  },
  {
    id: 'other-build',
    label: 'Other build file',
    group: 'build',
    path: new RegExp(
      `${B}(meson\\.build|meson_options\\.txt|build\\.ninja|SConstruct|SConscript|Rakefile|[^/]+\\.rake|justfile|Justfile|Taskfile\\.ya?ml|build\\.xml|configure\\.ac|configure\\.in|Makefile\\.am|Makefile\\.in|Earthfile|Gruntfile\\.[jt]s|gulpfile\\.[jt]s|Brewfile|Snakefile|[^/]+\\.pro|[^/]+\\.pri|Kbuild|Kconfig|build\\.sh|build\\.ps1|build\\.cmd|build\\.bat|mvnw|gradlew|[^/]+\\.spec)$`,
    ),
  },
  {
    id: 'js-build',
    label: 'JavaScript build/test tool config',
    group: 'build',
    path: /(^|\/)(vite|vitest|webpack|rollup|next|nuxt|svelte|astro|tsup|esbuild|playwright|jest|wxt|drizzle|babel|postcss|tailwind|metro|karma|cypress|remix|turbo|nx|lerna|rspack|rsbuild|quasar|angular|ember-cli-build|vue)\.?(config)?\.[cm]?[jt]s(on)?$|(^|\/)(turbo|nx|lerna|angular|pnpm-workspace)\.(json|ya?ml)$/,
  },
  // Compiler and tool configuration
  {
    id: 'compiler-config',
    label: 'Compiler and linter configuration',
    group: 'compiler',
    path: /(^|\/)((ts|js)config[^/]*\.json|\.babelrc(\.\w+)?|\.swcrc|\.eslintrc(\.\w+)?|eslint\.config\.[cm]?[jt]s|\.prettierrc(\.\w+)?|prettier\.config\.[cm]?[jt]s|\.stylelintrc(\.\w+)?|\.editorconfig|\.clang-format|\.clang-tidy|\.rustfmt\.toml|rustfmt\.toml|clippy\.toml|\.golangci\.ya?ml|\.rubocop\.ya?ml|\.flake8|\.pylintrc|mypy\.ini|ruff\.toml|\.scalafmt\.conf|detekt\.ya?ml|\.swiftlint\.ya?ml|analysis_options\.yaml|checkstyle\.xml|\.credo\.exs|\.formatter\.exs|biome\.jsonc?|deno\.jsonc?|\.browserslistrc|rust-toolchain(\.toml)?|\.nvmrc|\.node-version|\.tool-versions|\.python-version|\.java-version|\.sdkmanrc|\.hlint\.yaml|\.stylish-haskell\.yaml|\.jshintrc|\.markdownlint[^/]*|\.yamllint[^/]*|\.shellcheckrc|\.luacheckrc|\.luarc\.json|stylua\.toml|\.clangd)$/,
  },
  // Database
  {
    id: 'liquibase',
    label: 'Liquibase changelog',
    group: 'database',
    path: /\.(xml|ya?ml|json|sql)$/i,
    content: /databaseChangeLog|<changeSet\b|--\s*liquibase formatted sql/,
  },
  {
    id: 'flyway',
    label: 'Flyway migration',
    group: 'database',
    path: /(^|\/)[VUR]\d+(_\d+)*__[^/]+\.sql$/,
  },
  {
    id: 'sql-migration',
    label: 'Database migration',
    group: 'database',
    path: /(^|\/)(migrations?|migrate|db\/migrate|alembic\/versions|schema_migrations|changelogs?|evolutions|sql\/updates?|upgrades?)\/.+\.(sql|py|rb|exs|js|ts|go|php|java|kt|cs|xml|ya?ml)$/i,
  },
  {
    id: 'orm-schema',
    label: 'ORM schema',
    group: 'database',
    path: /\.prisma$|(^|\/)db\/(schema|structure)\.(rb|sql)$|(^|\/)schema\.(rb|graphql|sql)$/,
  },
  {
    id: 'sql-procedure',
    label: 'Stored procedures, functions and packages',
    group: 'database',
    path: /\.(sql|pls|plb|pks|pkb|pck|prc|fnc|trg|tps|tpb|spc|bdy|plsql|psql|pgsql|tsql)$/i,
    content:
      /\bcreate\s+(or\s+replace\s+|or\s+alter\s+)?(procedure|proc|function|trigger|package)\b/i,
  },
  {
    id: 'sql-schema',
    label: 'SQL schema and scripts',
    group: 'database',
    path: /\.(sql|ddl|dml|mysql|pgsql|psql|tsql|db2|hql|cql|cypher)$/i,
  },
  {
    id: 'dbt',
    label: 'dbt project',
    group: 'database',
    path: new RegExp(`${B}(dbt_project|profiles|packages|dependencies)\\.ya?ml$`),
    content: /^\s*(models|profile|packages|config-version|seeds)\s*:/m,
  },
  // API specifications
  {
    id: 'openapi',
    label: 'OpenAPI / Swagger',
    group: 'api',
    path: /\.(ya?ml|json)$/i,
    content: /^\s*"?(openapi|swagger)"?\s*:\s*["']?\d/m,
  },
  {
    id: 'asyncapi',
    label: 'AsyncAPI',
    group: 'api',
    path: /\.(ya?ml|json)$/i,
    content: /^\s*"?asyncapi"?\s*:\s*["']?\d/m,
  },
  { id: 'protobuf', label: 'Protocol Buffers', group: 'api', path: /\.proto$/i },
  { id: 'thrift', label: 'Thrift', group: 'api', path: /\.thrift$/i },
  { id: 'graphql', label: 'GraphQL schema/operations', group: 'api', path: /\.(graphqls?|gql)$/i },
  {
    id: 'other-idl',
    label: 'Other interface definition',
    group: 'api',
    path: /\.(capnp|avdl|smithy|webidl|idl|wsdl|raml|apib|fbs|asn1?|wit|aidl)$/i,
  },
  // Schema and data definitions
  {
    id: 'json-schema',
    label: 'JSON Schema',
    group: 'schema',
    path: /\.json$/i,
    content: /"\$schema"\s*:\s*"https?:\/\/json-schema\.org/,
  },
  { id: 'xml-schema', label: 'XML Schema / DTD', group: 'schema', path: /\.(xsd|dtd|rng|rnc)$/i },
  { id: 'avro', label: 'Avro schema', group: 'schema', path: /\.avsc$/i },
  // Environment templates (real .env files are never read)
  {
    id: 'env-template',
    label: 'Environment template',
    group: 'env',
    path: /(^|\/)(\.env\.(example|sample|template|dist|defaults)|[^/]*\.env\.(example|sample|template)|env\.(example|sample|template))$/i,
  },
  // Application configuration
  {
    id: 'app-config',
    label: 'Application configuration',
    group: 'config',
    path: /(^|\/)(application|bootstrap)(-[\w-]+)?\.(ya?ml|properties)$|(^|\/)appsettings[^/]*\.json$|(^|\/)(config|conf|settings|etc)\/[^/]+\.(ya?ml|json|toml|ini|conf|cfg|properties|xml|hocon|php|exs)$|\.(conf|cfg|ini|properties|hocon|toml)$|(^|\/)(web|app)\.config$|(^|\/)nginx[^/]*\.conf$|(^|\/)Procfile$|(^|\/)(app|fly|render|vercel|netlify|now|firebase|wrangler)\.(ya?ml|json|toml)$/i,
  },
  // Repository metadata
  {
    id: 'repo-meta',
    label: 'Repository metadata',
    group: 'repo',
    path: /(^|\/)(\.gitignore|\.gitattributes|\.gitmodules|\.mailmap|CODEOWNERS|OWNERS(_ALIASES)?|\.github\/[^/]+\.(md|ya?ml)|\.github\/ISSUE_TEMPLATE\/.+|\.github\/PULL_REQUEST_TEMPLATE.*|\.github\/dependabot\.ya?ml|renovate\.json5?|\.renovaterc(\.json)?|\.git-blame-ignore-revs|FUNDING\.ya?ml|\.vscode\/.+|\.idea\/.+|\.fleet\/.+)$/,
  },
  // Documentation
  {
    id: 'adr',
    label: 'Architecture decision record',
    group: 'docs',
    path: /(^|\/)(adr|adrs|decisions|architecture\/decisions)\/[^/]+\.(md|rst|adoc|txt)$/i,
  },
  {
    id: 'docs',
    label: 'Documentation',
    group: 'docs',
    path: /\.(md|markdown|mdx|rst|adoc|asciidoc|org|txt|textile|pod|rdoc|tex|wiki|creole)$|(^|\/)(README|CHANGELOG|CHANGES|HISTORY|NEWS|CONTRIBUTING|AUTHORS|LICEN[CS]E|COPYING|NOTICE|SECURITY|CODE_OF_CONDUCT|INSTALL|UPGRADING|MAINTAINERS)([._-][^/]*)?$/i,
  },
];

const INFO = new Map<RoleId, RoleInfo>();
for (const r of RULES) {
  const cur = INFO.get(r.id);
  // A file type can have several rules; the documentation lists every pattern.
  const join = (a: string | undefined, b: string | undefined) =>
    a && b ? `${a} | ${b}` : (a ?? b);
  INFO.set(r.id, {
    id: r.id,
    label: cur?.label ?? r.label,
    group: cur?.group ?? r.group,
    pathPattern: join(cur?.pathPattern, r.path.source),
    ...(r.content || cur?.contentPattern
      ? { contentPattern: join(cur?.contentPattern, r.content?.source) }
      : {}),
  });
}

export function roleInfo(id: RoleId): RoleInfo | undefined {
  return INFO.get(id);
}

export function allRoles(): RoleInfo[] {
  return [...INFO.values()];
}

/**
 * The file type of a path, or undefined for ordinary source files. `head` is the first part
 * of the text (8 KiB is enough); rules that need content do not match without it.
 */
export function roleOf(path: string, head?: string): RoleInfo | undefined {
  for (const r of RULES) {
    if (!r.path.test(path)) continue;
    if (r.content && !(head !== undefined && r.content.test(head))) continue;
    return INFO.get(r.id);
  }
  return undefined;
}
