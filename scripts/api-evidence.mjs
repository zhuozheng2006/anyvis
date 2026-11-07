import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
export const API_EVIDENCE_SOURCES = [
  'package-lock.json',
  'src/studio/core/api-compiler.ts', 'src/studio/core/api-values.ts',
  'src/studio/core/compiler.ts', 'src/studio/core/expression.ts',
  'src/studio/core/api-catalog.ts', 'src/studio/core/api-registry.ts',
  'src/studio/core/catalog.ts', 'src/studio/core/project.ts', 'src/studio/core/assets.ts',
];
export async function apiEvidenceSources(fixture) {
  const files = [...API_EVIDENCE_SOURCES, fixture];
  return Object.fromEntries(await Promise.all(files.map(async file => [file, createHash('sha256').update(await readFile(new URL(file, root))).digest('hex')])));
}
