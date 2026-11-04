/**
 * Optional model-written overview of a module (S3-5). The model sees only the deterministic
 * module summary as graph facts and the code of the module's main exports as numbered
 * sources, and goes through the same grounding as chat: unknown citations are removed and an
 * uncited answer is flagged. Without a model the caller gets the evidence list instead.
 */
import type { ModelProvider } from '@nexora/ai';
import type { Db } from '../store/db';
import type { ModuleDoc } from '../query/moduledoc';
import { answerQuestion, type ChatAnswer } from './answer';
import { redactSecrets } from './redact';
import { chunkForSymbol, clip, type GraphFact, type Retrieval, type Source } from './retrieve';

export function moduleRetrieval(db: Db, repoId: number, doc: ModuleDoc, maxSources = 8): Retrieval {
  const sources: Source[] = [];
  let redactions = 0;
  for (const e of doc.exports) {
    if (sources.length >= maxSources) break;
    const h = chunkForSymbol(db, repoId, e.key);
    if (!h) continue;
    const c = clip(h.body, h.startLine);
    const red = redactSecrets(c.text);
    redactions += red.redactions;
    sources.push({
      id: `S${sources.length + 1}`,
      filePath: h.filePath,
      startLine: c.startLine,
      endLine: c.endLine,
      symbol: e.name,
      kind: 'code',
      text: red.text,
      reason: `exported ${e.kind} of ${doc.module}`,
    });
  }
  const facts: GraphFact[] = [
    ...doc.dependsOn.map((d) => ({
      text: `${doc.module} imports from module ${d.module} (${d.imports} imports)`,
      confidence: 'observed',
      evidence: d.at.path ? `${d.at.path}:${d.at.line ?? ''}` : null,
    })),
    ...doc.usedBy.map((d) => ({
      text: `module ${d.module} imports from ${doc.module} (${d.imports} imports)`,
      confidence: 'observed',
      evidence: d.at.path ? `${d.at.path}:${d.at.line ?? ''}` : null,
    })),
    ...doc.routes.map((r) => ({
      text: `${doc.module} serves route ${r.name}`,
      confidence: 'inferred',
      evidence: `${r.at.path}:${r.at.line ?? ''}`,
    })),
    ...doc.integrations.map((i) => ({
      text: `${doc.module} uses ${i.category} ${i.name}`,
      confidence: i.category === 'environment variable' ? 'observed' : 'inferred',
      evidence: `${i.at.path}:${i.at.line ?? ''}`,
    })),
    ...doc.externals.slice(0, 15).map((x) => ({
      text: `${doc.module} imports the package ${x.name} in ${x.files} files`,
      confidence: 'observed',
      evidence: null,
    })),
  ].slice(0, 40);
  return {
    question: `Write a short overview (one or two paragraphs) of what the module "${doc.module}" does and how it fits with the rest of the repository, for a developer new to it. Mention its main exports.`,
    sources,
    facts,
    entities: [],
    redactions,
    revision: doc.revision,
  };
}

export async function describeModule(
  provider: ModelProvider,
  db: Db,
  repoId: number,
  doc: ModuleDoc,
  opts: { contextWindowTokens?: number; timeoutMs?: number } = {},
): Promise<ChatAnswer> {
  return answerQuestion(provider, moduleRetrieval(db, repoId, doc), opts);
}
