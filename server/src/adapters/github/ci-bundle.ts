import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
export async function readCiRunnerBundle() {
  const names = ['index.js', '300.index.js', 'package.json'];
  return Object.fromEntries(await Promise.all(names.map(async name => [name, await readFile(fileURLToPath(new URL(`../../../../agent-runner/dist/${name}`, import.meta.url)), 'utf8')])));
}
