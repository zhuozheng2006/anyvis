import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
export const API_EVIDENCE_SOURCES = [
  'package-lock.json', 'scripts/api-evidence.mjs',
  'src/studio/core/api-compiler.ts', 'src/studio/core/api-values.ts',
  'src/studio/core/compiler.ts', 'src/studio/core/expression.ts',
  'src/studio/core/api-catalog.ts', 'src/studio/core/api-registry.ts',
  'src/studio/core/catalog.ts', 'src/studio/core/project.ts', 'src/studio/core/assets.ts',
  'src/studio/core/piano.ts',
];
export async function apiEvidenceSources(fixture) {
  const files = [...API_EVIDENCE_SOURCES, fixture];
  return Object.fromEntries(await Promise.all(files.map(async file => [file, createHash('sha256').update(await readFile(new URL(file, root))).digest('hex')])));
}

// Python environments commonly bundle ffmpeg next to python, while the desktop
// app's PATH does not include that directory. Preserve the caller's environment.
export function nativeExecutionEnvironment(python, env = process.env) {
  return { ...env, PATH: [...new Set([path.dirname(python), ...(process.platform === 'darwin' ? ['/Library/TeX/texbin'] : []), ...(env.PATH || '').split(path.delimiter)])].join(path.delimiter) };
}

// Conservative smoke-test exclusions, not a proof that every other assertion is
// sufficient. Keep these calls executable, but never count them as behavior.
export function behaviorEvidenceGap(id, assertion, { kind } = {}) {
  if (/manim\.scene\.scene\.Scene\.(setup|construct|tear_down)$/.test(id)) return 'Base Scene lifecycle hook has no behavior.';
  if (!/(assert|close\(|eq\(|check_)/.test(assertion)) return 'Setup only; no result assertion.';
  if (/assert True\b|len\([^\n;]*\)\s*>=\s*0\b/.test(assertion)) return 'Vacuous postcondition.';
  if (/^assert (?:\$result|result|objects\[[^\n]+\]) is not None$/.test(assertion.trim())) return 'Object existence does not verify API behavior.';
  if (/^assert (?:\$result|result) is (?:s|objects\[[^\n]+\])$/.test(assertion.trim())) return 'Return-self identity alone does not verify state change.';
  if (/^assert len\(s\.submobjects\) >= 2$/.test(assertion.trim())) return 'Existing child count does not verify added coordinates.';
  if (/^assert (?:hasattr\(|isinstance\(|callable\()[^;\n]*$/.test(assertion.trim()) && !/\band\b/.test(assertion)) return 'Type or attribute presence alone does not verify behavior.';
  if (kind === 'method' && assertion === 'assert len($result.get_all_points()) > 0\nassert np.isfinite($result.get_all_points()).all()') return 'Existing geometry does not verify a mutation.';
  if (/\.(?:AnimatedBoundary\.full_family_become_partial|AnimatedBoundary\.update_boundary_copies)$/.test(id)) return 'Existing points do not verify the requested boundary change.';
  return null;
}
