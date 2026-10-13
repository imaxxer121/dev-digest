import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function run(label, executable, args, cwd = root) {
  console.log(`\n[L06] ${label}`);
  const result = spawnSync(executable, args, { cwd, stdio: 'inherit', timeout: 600_000, windowsHide: true });
  if (result.error || result.status !== 0) {
    console.error(`[L06] FAILED: ${label}${result.error ? ` (${result.error.message})` : ''}`);
    process.exit(result.status || 1);
  }
}
function nodeTool(pkg, tool, args, label) {
  const executable = join(root, pkg, 'node_modules', ...tool.split('/'));
  if (!existsSync(executable)) throw new Error(`Missing installed dependency: ${pkg}/${tool}`);
  run(label, process.execPath, [executable, ...args], join(root, pkg));
}

// Fail before any suite when the real DB prerequisite is missing; no skipped-green claim.
run('Docker/PostgreSQL integration prerequisite', 'docker', ['info', '--format', '{{.ServerVersion}}']);
for (const file of ['contracts/eval-pipeline.ts', 'contracts/trace.ts', 'index.ts']) {
  const a = readFileSync(join(root, 'server/src/vendor/shared', file));
  const b = readFileSync(join(root, 'client/src/vendor/shared', file));
  if (!a.equals(b)) throw new Error(`Vendored contract mismatch: ${file}`);
}
console.log('[L06] Mirrored contracts match');
for (const pkg of ['server', 'client', 'reviewer-core']) {
  nodeTool(pkg, 'typescript/bin/tsc', ['--noEmit', '-p', 'tsconfig.json'], `${pkg} typecheck`);
}
nodeTool('server', 'vitest/vitest.mjs', ['run', '--exclude', '**/*.it.test.ts'], 'Server deterministic unit tests');

const scratch = mkdtempSync(join(tmpdir(), 'devdigest-l06-verify-'));
try {
  const integration = join(root, 'server/test/evals.it.test.ts');
  if (!existsSync(integration)) throw new Error('Mandatory eval DB integration suite is missing');
  const report = join(scratch, 'integration.json');
  nodeTool('server', 'vitest/vitest.mjs', [
    'run', 'test/evals.it.test.ts', '--reporter=default', '--reporter=json', `--outputFile.json=${report}`,
  ], 'Required real PostgreSQL eval integration tests');
  const result = JSON.parse(readFileSync(report, 'utf8'));
  if (result.numPassedTests < 1 || result.numPendingTests > 0 || result.numTodoTests > 0 || result.numFailedTests > 0) {
    throw new Error('Required integration tests did not all execute and pass');
  }
} finally {
  const relativeScratch = relative(resolve(tmpdir()), resolve(scratch));
  if (isAbsolute(relativeScratch) || relativeScratch.startsWith('..') || !relativeScratch.startsWith('devdigest-l06-verify-')) {
    throw new Error('Unexpected temporary report cleanup path');
  }
  rmSync(scratch, { recursive: true, force: true });
}
nodeTool('client', 'vitest/vitest.mjs', ['run'], 'Client interaction tests');
nodeTool('reviewer-core', 'vitest/vitest.mjs', ['run'], 'Reviewer-core tests');
console.log('\n[L06] PASS — types, deterministic tests and real DB integration; no model calls');
