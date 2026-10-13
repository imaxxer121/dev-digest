import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { AgentManifest, CiExportInput } from '@devdigest/shared';
import { generateWorkflow } from '../src/modules/ci/workflow.js';

const agentId = '11111111-1111-4111-8111-111111111111';
const manifest = AgentManifest.parse({ agent_id: agentId, name: 'Bootstrap fixture', provider: 'ollama', model: 'fixture-model', system_prompt: 'Fixture' });
const input = CiExportInput.parse({ repo: 'fixture/ci', post_as: 'pr_comment' });
const required = ['runner/index.js', 'runner/300.index.js', 'runner/package.json', `agents/agent-${agentId}.yaml`];
const bash = process.platform === 'win32' ? join(process.env.ProgramFiles ?? 'C:/Program Files', 'Git/bin/bash.exe') : 'bash';
function guardScript() {
  const block = generateWorkflow(input, manifest).match(/- name: Verify trusted base installation\n[\s\S]*?        run: \|\n([\s\S]*?)      - uses: actions\/setup-node/)?.[1];
  if (!block) throw new Error('Generated guard is missing');
  return block.split('\n').map(line => line.replace(/^          /, '')).join('\n');
}

describe('actual generated trusted-base bootstrap guard', () => {
  it.each([[], required.slice(0, 3), required.slice(1), required].map(files => [files]))('checks actual base files before allowing inference (%j)', files => {
    const directory = mkdtempSync(join(tmpdir(), 'devdigest-bootstrap-'));
    try {
      // PR checkout has every file, but is never consulted by the guard.
      for (const root of ['untrusted', 'trusted']) {
        for (const file of root === 'trusted' ? files : required) {
          const path = join(directory, root, '.devdigest', file);
          mkdirSync(join(path, '..'), { recursive: true }); writeFileSync(path, '// fixture only');
        }
      }
      const output = join(directory, 'output.txt');
      const log = execFileSync(bash, ['-c', guardScript()], { cwd: directory, env: { ...process.env, GITHUB_OUTPUT: output }, encoding: 'utf8', timeout: 10000 });
      const ready = files.length === required.length;
      expect(readFileSync(output, 'utf8').trim()).toBe(`ready=${ready}`);
      expect(log.includes('review starts after merge')).toBe(!ready);
      expect(existsSync(join(directory, 'devdigest-result.json'))).toBe(false);
      expect(log).not.toContain('successful review');
    } finally {
      if (!directory.startsWith(join(tmpdir(), 'devdigest-bootstrap-'))) throw new Error('Unexpected cleanup path');
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it('fails a damaged already-installed base instead of passing a required review check', () => {
    const directory = mkdtempSync(join(tmpdir(), 'devdigest-bootstrap-'));
    try {
      const workflows = join(directory, 'trusted', '.github', 'workflows'); mkdirSync(workflows, { recursive: true });
      writeFileSync(join(workflows, 'devdigest-review.yml'), generateWorkflow(input, manifest));
      const output = join(directory, 'output.txt');
      const result = spawnSync(bash, ['-c', guardScript()], { cwd: directory, env: { ...process.env, GITHUB_OUTPUT: output }, encoding: 'utf8', timeout: 10000 });
      expect(result.status).toBe(1); expect(readFileSync(output, 'utf8').trim()).toBe('ready=false');
      expect(result.stdout).toContain('::error::Trusted base CI installation is incomplete');
      expect(result.stdout).not.toContain('review starts after merge'); expect(existsSync(join(directory, 'devdigest-result.json'))).toBe(false);
    } finally {
      if (!directory.startsWith(join(tmpdir(), 'devdigest-bootstrap-'))) throw new Error('Unexpected cleanup path');
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it.each(['ollama', 'openrouter'] as const)('gates every runtime, review and artifact step for %s', provider => {
    const workflow = generateWorkflow(input, { ...manifest, provider });
    expect(workflow).toContain("- uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020\n        if: steps.base_config.outputs.ready == 'true'");
    expect(workflow).toContain("- name: Review PR diff through grounded reviewer-core\n        if: steps.base_config.outputs.ready == 'true'");
    expect(workflow).toContain("- name: Upload grounded review result\n        if: always() && steps.base_config.outputs.ready == 'true'");
    if (provider === 'ollama') expect(workflow).toContain("- name: Start verified local model runtime\n        if: steps.base_config.outputs.ready == 'true'");
  });
  it('refuses absent or shell-shaped manifest identities', () => {
    expect(() => generateWorkflow(input, { ...manifest, agent_id: undefined })).toThrow('agent identity');
    expect(() => generateWorkflow(input, { ...manifest, agent_id: "x'; touch malicious; '" })).toThrow();
  });
});
