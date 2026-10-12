import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vi, describe, it, expect } from 'vitest';
import { BriefOutput } from '@devdigest/shared';

const invocation = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: invocation.spawn }));
import { CodexCliProvider } from '../src/adapters/llm/codex-cli.js';

describe('Codex facts-only structured adapter', () => {
  it('starts one isolated process, supplies schema/stdin, records prompt/events and validates without reprompt', async () => {
    const root = await mkdtemp(join(tmpdir(), 'devdigest-brief-adapter-'));
    let prompt = '', dir = '';
    invocation.spawn.mockReset();
    invocation.spawn.mockImplementation((_command, args, options) => {
      dir = options.cwd;
      const child = new EventEmitter() as any;
      child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = vi.fn();
      child.stdin = { end: (text: string) => {
        prompt = text;
        void writeFile(args[args.indexOf('-o') + 1], JSON.stringify({ summary: 'Prepared facts.', risks: [], review_focus: [] })).then(() => {
          child.stdout.write(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 22, output_tokens: 9 } }) + '\n');
          child.stdout.end(); child.emit('close', 0);
        });
      } };
      return child;
    });
    const result = await new CodexCliProvider('codex-test', root).completeStructured({ model: 'selected-model', schema: BriefOutput,
      schemaName: 'pr_risk_brief', messages: [{ role: 'system', content: 'Prepared facts only' }, { role: 'user', content: '{"files":[]}' }], maxRetries: 0 });
    expect(invocation.spawn).toHaveBeenCalledTimes(1);
    const args = invocation.spawn.mock.calls[0]![1];
    expect(args).toEqual(expect.arrayContaining(['--ignore-user-config', '--sandbox', 'read-only', 'features.shell_tool=false', 'web_search="disabled"', '--output-schema', 'selected-model']));
    expect(invocation.spawn.mock.calls[0]![2]).toMatchObject({ shell: false, windowsHide: true });
    expect(await readFile(join(dir, 'prompt.txt'), 'utf8')).toBe(prompt);
    expect(prompt).toContain('<user>\n{"files":[]}\n</user>');
    expect(JSON.parse(await readFile(join(dir, 'schema.json'), 'utf8')).properties).toHaveProperty('review_focus');
    expect(await readFile(join(dir, 'events.jsonl'), 'utf8')).toContain('turn.completed');
    expect(result).toMatchObject({ data: { summary: 'Prepared facts.', risks: [], review_focus: [] }, attempts: 1, tokensIn: 22, tokensOut: 9, costUsd: null });
  });
});
