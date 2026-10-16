import { createHash } from 'node:crypto';
import { lstat, readFile, mkdir, writeFile, copyFile, realpath, mkdtemp, rm } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { REPO_ROOT, PACKAGE_ROOT } from './paths.js';
import { canonicalPath } from './cases.js';
import type { HarnessCase, ManifestEntry } from './types.js';

export const digest = (content: string | Buffer) => createHash('sha256').update(content).digest('hex');
const safety = `\n\n# Evaluation runtime boundary\nThis is a disposable snapshot, not the live repository. Read-only tools only; no writes, edits, commits, deployment, network or external messages.\nUse ONLY the eval_files MCP list_documents/read_document tools for source reads. Shell and general filesystem tools are unavailable.\nEach successful read returns a source digest. Do not fabricate tool evidence or claim reads/delegation from prose. Apply a relevant available Skill only when the task needs it; read its full SKILL.md through the read_document tool before applying it. Do not load unrelated skills.\nReturn the requested JSON answer in stdout; any proposed artifact remains in that answer. Do not execute checks or arbitrary commands. Delegate only when the user scenario explicitly requests it, and no nested delegation.\n`;
export async function readSource(root: string, path: string) {
  if (!canonicalPath(path)) throw new Error('Unsafe source path');
  let absolute = resolve(root);
  for (const part of path.split('/')) { absolute = join(absolute, part); if ((await lstat(absolute)).isSymbolicLink()) throw new Error('Linked source refused'); }
  const rel = relative(await realpath(root), await realpath(absolute));
  const stat = await lstat(absolute);
  if (rel.startsWith(`..${sep}`) || rel === '..' || !stat.isFile() || stat.size > 131072) throw new Error('Unsafe or oversized source');
  const bytes = await readFile(absolute); if (bytes.length > 131072) throw new Error('Source byte limit');
  return bytes;
}
export async function stageCase(c: HarnessCase, folder: string, config: 'candidate' | 'baseline', repoRoot = REPO_ROOT) {
  // Outside the checkout: ancestor project config/instructions cannot bleed in.
  const snapshot = await mkdtemp(join(tmpdir(), 'devdigest-harness-'));
  await mkdir(join(snapshot, '.harness', 'home'), { recursive: true });
  const manifest: ManifestEntry[] = []; let totalBytes = 0;
  const put = async (source: string, staged: string, bytes: Buffer | string) => {
    totalBytes += Buffer.byteLength(bytes); if (totalBytes > 1_048_576) throw new Error('Snapshot exceeds 1 MiB');
    await mkdir(dirname(join(snapshot, staged)), { recursive: true }); await writeFile(join(snapshot, staged), bytes);
    await mkdir(dirname(join(folder, 'snapshot-evidence', staged)), { recursive: true }); await writeFile(join(folder, 'snapshot-evidence', staged), bytes);
    manifest.push({ source, staged, sha256: digest(bytes), bytes: Buffer.byteLength(bytes) });
  };
  const paths = new Set(['AGENTS.md', 'CLAUDE.md', ...c.files, ...(c.artifact ? [c.artifact] : [])]);
  for (const path of paths) {
    if (config === 'baseline' && path === c.artifact) continue;
    const source = await readSource(repoRoot, path);
    await put(path, path, path === 'AGENTS.md' ? source.toString('utf8') + safety : source);
  }
  if (!manifest.some(file => file.staged === 'AGENTS.md')) await put('evals/runtime/safety', 'AGENTS.md', safety);
  if (c.nativeSkill && config === 'candidate') {
    const path = `.claude/skills/${c.nativeSkill}/SKILL.md`;
    await put(path, `.agents/skills/${c.nativeSkill}/SKILL.md`, await readSource(repoRoot, path));
  }
  if (c.delegate) {
    const path = `.claude/agents/${c.delegate}.md`;
    const instructions = config === 'candidate' ? (await readSource(repoRoot, path)).toString('utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '') : 'Review the supplied change and return evidence-backed findings.';
    const role = `name = ${JSON.stringify(c.delegate)}\ndescription = "Independent read-only architecture review"\ndeveloper_instructions = ${JSON.stringify(instructions + safety + '\nRuntime translation: Read/Glob/Grep use ONLY the eval_files MCP list/read tools. No shell and no nested delegation.')}\n[features]\nshell_tool = false\napps = false\nplugins = false\nrequest_permissions_tool = false\n`;
    await put(path, `.codex/agents/${c.delegate}.toml`, role);
  }
  await copyFile(join(PACKAGE_ROOT, 'assets/read.mjs'), join(snapshot, '.harness/read.mjs'));
  await copyFile(join(PACKAGE_ROOT, 'assets/probe.mjs'), join(snapshot, '.harness/probe.mjs'));
  await writeFile(join(folder, 'manifest.json'), JSON.stringify({ config, files: manifest }, null, 2));
  return { snapshot, manifest, manifestDigest: digest(JSON.stringify(manifest)) };
}
export async function removeSnapshot(snapshot: string) {
  if (resolve(dirname(snapshot)) !== resolve(tmpdir()) || !basename(snapshot).startsWith('devdigest-harness-')) throw new Error('Refusing to remove unexpected snapshot');
  await rm(snapshot, { recursive: true, force: true });
}
