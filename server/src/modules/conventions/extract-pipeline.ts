import type { Container } from '../../platform/container.js';
import { wrapUntrusted } from '../../platform/prompt.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import type { ConventionsRepository } from './repository.js';
import { CONFIG_FILES, MAX_FILE_CHARS, Extraction, EXTRACTOR_SYSTEM } from './constants.js';
import { groundEvidence, toCandidate } from './helpers.js';
export async function runExtraction(container: Container, repo: ConventionsRepository, workspaceId: string, repoId: string) {
  const row = await repo.repo(workspaceId, repoId);
  if (!row) throw new NotFoundError('Repo not found');
  if (!row.clonePath) throw new AppError('repo_not_cloned', 'Wait until the repository clone completes', 409);
  const ref = { owner: row.owner, name: row.name };
  let top = await container.repoIntel.getConventionSamples(repoId, 12).catch(() => [] as string[]);
  // An unindexed repo has no ranks. Use source symbols as a transparent fallback.
  if (!top.length) top = [...new Set((await container.codeIndex.symbols(ref).catch(() => [])).map(s => s.path))].filter(p => !/node_modules|\.test\.|\.spec\.|lock\./.test(p)).slice(0, 12);
  const files = new Map<string, string>();
  for (const path of [...new Set([...CONFIG_FILES, ...top])]) {
    const raw = await container.git.readFile(ref, path).catch(() => '');
    if (raw.trim()) files.set(path, raw.slice(0, MAX_FILE_CHARS));
  }
  if (!files.size) throw new AppError('no_samples', 'No readable config or source files were found', 409);
  const choice = await resolveFeatureModel(container, workspaceId, 'conventions');
  const llm = await container.llm(choice.provider);
  const result = await llm.completeStructured({ model: choice.model, schema: Extraction, schemaName: 'RepositoryConventions', messages: [
    { role: 'system', content: EXTRACTOR_SYSTEM },
    { role: 'user', content: 'Infer a small set of supported conventions from these configuration files and top-ranked source samples.\n\n' + wrapUntrusted('files', [...files].map(([path, body]) => `FILE: ${path}\n${body}`).join('\n\n')) },
  ] });
  const grounded = result.data.conventions.map(c => groundEvidence(c, files)).filter(c => c !== null);
  const rows = await repo.replaceForRepo(workspaceId, repoId, grounded.map(c => ({ workspaceId, repoId, rule: c.rule, category: c.category, evidencePath: c.evidence_path, evidenceLine: c.evidence_line, evidenceSnippet: c.evidence_snippet, confidence: c.confidence })));
  return rows.map(toCandidate);
}
