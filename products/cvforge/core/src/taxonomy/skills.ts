/**
 * Skill and competency taxonomy for the v1 role focus (software, Java/full
 * stack, cloud, data, DevOps/platform, architecture, technical leadership).
 *
 * Each concept has a canonical name, aliases matched as whole terms, and a
 * category. Extend by adding entries; no code changes are required.
 */
export type SkillCategory =
  | 'language'
  | 'framework'
  | 'cloud'
  | 'data'
  | 'devops'
  | 'architecture'
  | 'practice'
  | 'leadership'
  | 'domain'
  | 'tool';

export interface Concept {
  name: string;
  category: SkillCategory;
  aliases: string[];
  /** Concepts implied by this one (e.g. Spring Boot implies Java). Used only as weak evidence. */
  related?: string[];
}

const c = (
  name: string,
  category: SkillCategory,
  aliases: string[] = [],
  related: string[] = [],
): Concept => ({
  name,
  category,
  aliases,
  related,
});

export const CONCEPTS: Concept[] = [
  // Languages
  c('Java', 'language', [
    'java 8',
    'java 11',
    'java 17',
    'java 21',
    'core java',
    'j2ee',
    'java ee',
    'jakarta ee',
  ]),
  c('Kotlin', 'language'),
  c('Scala', 'language'),
  c('Python', 'language'),
  c('Go', 'language', ['golang']),
  c('JavaScript', 'language', ['js', 'ecmascript', 'es6']),
  c('TypeScript', 'language', ['ts']),
  c('C#', 'language', ['csharp', 'c sharp']),
  c('C++', 'language', ['cpp']),
  c('Rust', 'language'),
  c('Ruby', 'language'),
  c('PHP', 'language'),
  c('SQL', 'language', ['t-sql', 'pl/sql', 'plsql']),
  c('Bash', 'language', ['shell scripting']),
  // Frameworks
  c('Spring Boot', 'framework', ['springboot'], ['Java', 'Spring']),
  c(
    'Spring',
    'framework',
    ['spring framework', 'spring mvc', 'spring cloud', 'spring security'],
    ['Java'],
  ),
  c('Hibernate', 'framework', ['jpa'], ['Java']),
  c('Microservices', 'architecture', ['microservice', 'micro-services', 'micro services']),
  c('React', 'framework', ['react.js', 'reactjs'], ['JavaScript']),
  c('Angular', 'framework', ['angularjs', 'angular.js'], ['TypeScript']),
  c('Vue', 'framework', ['vue.js', 'vuejs']),
  c('Next.js', 'framework', ['nextjs'], ['React']),
  c('Node.js', 'framework', ['nodejs'], ['JavaScript']),
  c('Express', 'framework', ['express.js', 'expressjs'], ['Node.js']),
  c('.NET', 'framework', ['dotnet', 'asp.net', '.net core'], ['C#']),
  c('Django', 'framework', [], ['Python']),
  c('Flask', 'framework', [], ['Python']),
  c('FastAPI', 'framework', [], ['Python']),
  c('GraphQL', 'framework'),
  c('REST APIs', 'architecture', [
    'restful',
    'rest api',
    'restful apis',
    'restful services',
    'web services',
  ]),
  c('gRPC', 'framework'),
  // Cloud
  c('AWS', 'cloud', [
    'amazon web services',
    'ec2',
    's3',
    'lambda',
    'aws lambda',
    'ecs',
    'eks',
    'cloudformation',
    'dynamodb',
    'rds',
  ]),
  c('Azure', 'cloud', ['microsoft azure', 'aks', 'azure devops']),
  c('GCP', 'cloud', ['google cloud', 'google cloud platform', 'gke', 'bigquery']),
  c('Serverless', 'cloud', ['faas']),
  // Data
  c('PostgreSQL', 'data', ['postgres'], ['SQL']),
  c('MySQL', 'data', [], ['SQL']),
  c('Oracle', 'data', ['oracle db', 'oracle database'], ['SQL']),
  c('MongoDB', 'data', ['mongo']),
  c('Redis', 'data'),
  c('Cassandra', 'data'),
  c('Elasticsearch', 'data', ['elastic search', 'opensearch', 'elk']),
  c('Kafka', 'data', ['apache kafka']),
  c('RabbitMQ', 'data'),
  c('Spark', 'data', ['apache spark', 'pyspark']),
  c('Hadoop', 'data', ['hdfs', 'hive']),
  c('Airflow', 'data', ['apache airflow']),
  c('dbt', 'data'),
  c('Snowflake', 'data'),
  c('Databricks', 'data'),
  c('Data Modeling', 'data', ['data modelling', 'data model', 'schema design']),
  c('ETL', 'data', ['elt', 'data pipelines', 'data pipeline']),
  c('Data Warehousing', 'data', ['data warehouse', 'dwh']),
  c('Machine Learning', 'data', ['ml', 'deep learning']),
  // DevOps / platform
  c('Docker', 'devops', ['containers', 'containerization']),
  c('Kubernetes', 'devops', ['k8s', 'openshift', 'helm']),
  c('Terraform', 'devops', ['infrastructure as code', 'iac']),
  c('Ansible', 'devops'),
  c('CI/CD', 'devops', [
    'ci cd',
    'continuous integration',
    'continuous delivery',
    'continuous deployment',
    'jenkins',
    'github actions',
    'gitlab ci',
  ]),
  c('Linux', 'devops', ['unix']),
  c('Git', 'tool', ['github', 'gitlab', 'bitbucket']),
  c('Monitoring', 'devops', [
    'observability',
    'prometheus',
    'grafana',
    'datadog',
    'new relic',
    'splunk',
  ]),
  c('SRE', 'devops', ['site reliability', 'site reliability engineering']),
  c('Maven', 'tool', [], ['Java']),
  c('Gradle', 'tool', [], ['Java']),
  // Architecture & practices
  c('System Design', 'architecture', ['systems design', 'solution design']),
  c('Distributed Systems', 'architecture', ['distributed system', 'distributed computing']),
  c('Software Architecture', 'architecture', [
    'architecture',
    'solution architecture',
    'technical architecture',
    'enterprise architecture',
  ]),
  c('Event-Driven Architecture', 'architecture', [
    'event driven',
    'event-driven',
    'event sourcing',
    'cqrs',
  ]),
  c('Domain-Driven Design', 'architecture', ['ddd', 'domain driven design']),
  c('API Design', 'architecture', ['api-first', 'openapi', 'swagger']),
  c('Scalability', 'architecture', [
    'high availability',
    'high-availability',
    'scalable',
    'fault tolerance',
    'resilience',
  ]),
  c('Performance Optimization', 'practice', [
    'performance tuning',
    'performance optimisation',
    'latency',
  ]),
  c('Security', 'practice', [
    'application security',
    'appsec',
    'owasp',
    'oauth',
    'oauth2',
    'authentication',
    'authorization',
  ]),
  c('Testing', 'practice', [
    'unit testing',
    'integration testing',
    'tdd',
    'junit',
    'test automation',
    'jest',
    'mockito',
  ]),
  c('Agile', 'practice', ['scrum', 'kanban']),
  c('Design Patterns', 'practice', ['solid', 'object-oriented design', 'ood', 'oop']),
  c('Code Review', 'practice', ['code reviews']),
  // Leadership
  c('Technical Leadership', 'leadership', [
    'tech lead',
    'technical lead',
    'lead engineer',
    'led a team',
    'led the team',
    'team lead',
  ]),
  c('Mentoring', 'leadership', ['mentored', 'mentor', 'coaching', 'coached']),
  c('People Management', 'leadership', [
    'managed a team',
    'line management',
    'direct reports',
    'engineering manager',
    'hiring',
  ]),
  c('Stakeholder Management', 'leadership', [
    'stakeholders',
    'stakeholder',
    'cross-functional',
    'cross functional',
  ]),
  c('Technical Strategy', 'leadership', [
    'technology strategy',
    'technical roadmap',
    'technology roadmap',
    'technical vision',
  ]),
  c('Project Delivery', 'leadership', [
    'delivery management',
    'program management',
    'project management',
  ]),
  c('Communication', 'leadership', ['communication skills', 'presented', 'presentations']),
  // Domains
  c('Fintech', 'domain', [
    'financial services',
    'banking',
    'payments',
    'capital markets',
    'trading',
  ]),
  c('Healthcare', 'domain', ['healthtech', 'hipaa', 'clinical']),
  c('E-commerce', 'domain', ['ecommerce', 'retail', 'marketplace']),
  c('Telecom', 'domain', ['telecommunications']),
  c('SaaS', 'domain', ['b2b saas', 'multi-tenant', 'multitenant']),
];

const byName = new Map(CONCEPTS.map((k) => [k.name.toLowerCase(), k]));

export function conceptByName(name: string): Concept | undefined {
  return byName.get(name.toLowerCase());
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whole-term matcher that copes with symbols like C++, C#, .NET, Node.js. */
export function termRegex(term: string): RegExp {
  return new RegExp(`(?<![A-Za-z0-9+#])${escapeRegex(term.toLowerCase())}(?![A-Za-z0-9+#])`, 'i');
}

const compiled = CONCEPTS.map((concept) => ({
  concept,
  patterns: [concept.name, ...concept.aliases]
    // Very short ambiguous aliases (e.g. "ts", "js", "ml", "go") are only matched case-sensitively in uppercase form.
    .map((t) => ({
      term: t,
      re:
        t.length <= 2
          ? new RegExp(`(?<![A-Za-z0-9])${escapeRegex(t.toUpperCase())}(?![A-Za-z0-9])`)
          : termRegex(t),
    })),
}));

// "Go" as a language is ambiguous in prose ("go live"); only match capitalised "Go" or "Golang".
const goPattern = /(?<![A-Za-z0-9])(Go(?![a-z])|Golang)(?![A-Za-z0-9])/;

/** Find canonical concepts mentioned in a piece of text. */
export function findConcepts(text: string): Concept[] {
  const found: Concept[] = [];
  for (const { concept, patterns } of compiled) {
    if (concept.name === 'Go') {
      if (goPattern.test(text) && !/\bGo (live|to|through|back|ahead)\b/.test(text))
        found.push(concept);
      continue;
    }
    if (patterns.some((p) => p.re.test(text))) found.push(concept);
  }
  return found;
}

/** Does `text` mention `concept` (by name or alias)? */
export function mentionsConcept(text: string, conceptName: string): boolean {
  return findConcepts(text).some((k) => k.name === conceptName);
}
