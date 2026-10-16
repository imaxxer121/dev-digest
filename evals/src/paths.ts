import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// Built files live in evals/dist/src. All source/resource paths remain package-relative.
export const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const REPO_ROOT = resolve(PACKAGE_ROOT, '..');
export const RESULTS_ROOT = resolve(PACKAGE_ROOT, 'results');
