import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function run(label, executable, args, cwd = root) {
  console.log(`\n[L07] ${label}`);
  const result = spawnSync(executable, args, { cwd, stdio: 'inherit', timeout: 600_000, windowsHide: true });
  if (result.error || result.status !== 0) {
    console.error(`[L07] FAILED: ${label}${result.error ? ` (${result.error.message})` : ''}`);
    process.exit(result.status || 1);
  }
}
function nodeTool(pkg, tool, args, label) {
  const executable = join(root, pkg, 'node_modules', ...tool.split('/'));
  if (!existsSync(executable)) throw new Error(`Missing installed dependency: ${pkg}/${tool}`);
  run(label, process.execPath, [executable, ...args], join(root, pkg));
}

run('Docker/PostgreSQL prerequisite', 'docker', ['info', '--format', '{{.ServerVersion}}']);
for (const file of ['contracts/review-api.ts', 'contracts/eval-ci.ts', 'contracts/eval-pipeline.ts', 'contracts/trace.ts', 'contracts/platform.ts', 'adapters.ts', 'index.ts']) {
  const a = readFileSync(join(root, 'server/src/vendor/shared', file));
  const b = readFileSync(join(root, 'client/src/vendor/shared', file));
  if (!a.equals(b)) throw new Error(`Vendored contract mismatch: ${file}`);
}
console.log('[L07] Mirrored contracts match');
for (const pkg of ['server', 'client', 'reviewer-core', 'agent-runner']) {
  nodeTool(pkg, 'typescript/bin/tsc', ['--noEmit', '-p', 'tsconfig.json'], `${pkg} typecheck`);
}
nodeTool('server', 'vitest/vitest.mjs', ['run', '--exclude', '**/*.it.test.ts'], 'All server unit tests');
const scratch = mkdtempSync(join(tmpdir(), 'devdigest-l07-verify-'));
try {
  const required = ['reviews.it.test.ts', 'multi-agent.it.test.ts', 'ci.it.test.ts', 'evals.it.test.ts'];
  for (const file of required) if (!existsSync(join(root, 'server/test', file))) throw new Error(`Mandatory suite missing: ${file}`);
  const report = join(scratch, 'integration.json');
  nodeTool('server', 'vitest/vitest.mjs', ['run', '.it.test', '--reporter=default', '--reporter=json', `--outputFile.json=${report}`], 'Full isolated PostgreSQL suite, including legacy review routes');
  const result = JSON.parse(readFileSync(report, 'utf8'));
  if (!result.success || result.numPassedTests < 1 || result.numPendingTests > 0 || result.numTodoTests > 0 || result.numFailedTests > 0) throw new Error('Required integration tests did not all execute and pass');
  for (const file of required) {
    const suite = result.testResults.find(item => item.name.replaceAll('\\', '/').endsWith(`/test/${file}`));
    if (!suite || suite.status !== 'passed' || !suite.assertionResults.length || suite.assertionResults.some(test => test.status !== 'passed')) throw new Error(`Required integration suite did not execute fully: ${file}`);
  }
} finally {
  const relativeScratch = relative(resolve(tmpdir()), resolve(scratch));
  if (isAbsolute(relativeScratch) || relativeScratch.startsWith('..') || !relativeScratch.startsWith('devdigest-l07-verify-')) throw new Error('Unexpected temporary report cleanup path');
  rmSync(scratch, { recursive: true, force: true });
}
nodeTool('client', 'vitest/vitest.mjs', ['run'], 'All client interaction tests');
nodeTool('reviewer-core', 'vitest/vitest.mjs', ['run'], 'Reviewer-core tests');
nodeTool('agent-runner', 'vitest/vitest.mjs', ['run'], 'CI runner tests');
nodeTool('agent-runner', '@vercel/ncc/dist/ncc/cli.js', ['build', 'src/index.ts', '-o', 'dist'], 'Build the complete exported runner');
run('Standalone exported bundle smoke with injected inference', process.execPath, ['test/bundle-smoke.mjs'], join(root, 'agent-runner'));
nodeTool('client', 'next/dist/bin/next', ['build'], 'Next.js production build');
console.log('\n[L07] PASS — merged types, full tests, isolated DB, exported bundle and production build; no live model calls');
