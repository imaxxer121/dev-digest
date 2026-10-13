import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
const Entry = z.object({ content: z.string().max(8000) }).passthrough();
export function loadMemory(directory: string, readFile = readFileSync): string[] {
  const path = join(directory, 'memory.jsonl');
  if (!existsSync(path)) return [];
  const text = readFile(path, 'utf8');
  if (Buffer.byteLength(text) > 128_000) throw new Error('Exported memory exceeds 128 KiB');
  return text.split(/\r?\n/).filter(Boolean).map(line => Entry.parse(JSON.parse(line)).content);
}
