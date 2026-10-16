import { readdir, readFile, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { REPO_ROOT } from './paths.js';
import { loadCases } from './cases.js';
import { readSource } from './stage.js';

export function frontmatter(text: string) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) throw new Error('Missing frontmatter');
  const value = (key: string) => new RegExp(`^${key}:\\s*["']?([^\\r\\n]+)`, 'm').exec(match[1]!)?.[1]?.replace(/["']$/, '').trim();
  if (!value('name') || !value('description')) throw new Error('Frontmatter requires name and description');
  return { name: value('name')!, description: value('description')!, body: text.slice(match[0].length) };
}
export async function quality(repoRoot = REPO_ROOT) {
  const findings: string[] = [], names = new Set<string>(); let skillCount = 0, agentCount = 0;
  const authored = new Set(['onion-architecture', 'frontend-architecture', 'engineering-insights', 'pr-self-review', 'run-plan']);
  for (const entry of await readdir(join(repoRoot, '.claude/skills'), { withFileTypes: true })) if (entry.isDirectory()) {
    const path = `.claude/skills/${entry.name}/SKILL.md`;
    try {
      const full = join(repoRoot, path), text = await readFile(full, 'utf8'), meta = frontmatter(text);
      if (names.has(meta.name)) throw new Error('Duplicate skill name'); names.add(meta.name);
      if (meta.name !== entry.name || meta.body.trim().length < 40) throw new Error('Name/directory mismatch or missing instructions');
      if (authored.has(entry.name)) for (const match of meta.body.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
        const target = match[1]!.split('#')[0]!;
        if (target && !/^(?:https?:|mailto:)/.test(target)) await access(resolve(dirname(full), target));
      }
      skillCount++;
    } catch (error) { findings.push(`${path}: ${(error as Error).message}`); }
  }
  for (const name of await readdir(join(repoRoot, '.claude/agents'))) if (name.endsWith('.md') && name !== 'README.md') {
    try { const meta = frontmatter(await readFile(join(repoRoot, '.claude/agents', name), 'utf8')); if (meta.name !== name.slice(0, -3)) throw new Error('Agent name mismatch'); agentCount++; }
    catch (error) { findings.push(`.claude/agents/${name}: ${(error as Error).message}`); }
  }
  if (agentCount !== 11) findings.push(`Expected eleven development agents, got ${agentCount}`);
  const cases = await loadCases();
  for (const c of cases) for (const path of new Set([...c.files, ...(c.artifact ? [c.artifact] : [])])) {
    try { await readSource(repoRoot, path); } catch (error) { findings.push(`${c.id}: missing/unsafe source ${path}: ${(error as Error).message}`); }
  }
  for (const suite of ['skills', 'agents', 'workflow']) if (!cases.some(c => c.suite === suite)) findings.push(`Missing ${suite} suite`);
  if (!cases.some(c => c.id.endsWith('positive')) || !cases.some(c => c.expect.noTools && c.expect.forbiddenReads?.length)) findings.push('Missing positive/negative activation contrast');
  const routing = await readFile(join(repoRoot, 'CLAUDE.md'), 'utf8');
  for (const command of ['eval:quality', 'eval:skills', 'eval:agents', 'eval:workflow']) if (!routing.includes(command)) findings.push(`CLAUDE routing omits ${command}`);
  return { evidenceKind: 'static' as const, skillCount, agentCount, caseCount: cases.length, findings };
}
