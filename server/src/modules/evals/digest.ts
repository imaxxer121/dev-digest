import { createHash } from 'node:crypto';
import type { JsonValue } from '@devdigest/shared';

export function canonical(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key]!)}`).join(',')}}`;
  return JSON.stringify(value);
}
export const textDigest = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
export const digest = (value: JsonValue) => textDigest(canonical(value));
/** Shared assembly omits blank descriptions; their effective input is null. */
export const effectiveDescription = (description: string | null) => description?.trim() ? description : null;
export const inputDigest = (diff: string, title: string | null, description: string | null) => digest({ profile: 'diff-only-v1', diff, title, description: effectiveDescription(description) });
