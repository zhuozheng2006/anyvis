import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const root = path.resolve('dist');
const manifest = JSON.parse(readFileSync(path.join(root, '.vite/manifest.json'), 'utf8'));
const studio = Object.keys(manifest).find(key => manifest[key].name === 'StudioApp' && manifest[key].file.endsWith('.js'));
assert(studio, 'Studio entry is missing from the production manifest');
const visited = new Set();
const files = new Set();
function visit(key) {
  if (visited.has(key)) return;
  visited.add(key);
  const chunk = manifest[key];
  assert(chunk, `Missing imported chunk: ${key}`);
  files.add(chunk.file);
  for (const file of chunk.css || []) files.add(file);
  for (const dependency of chunk.imports || []) visit(dependency);
}
visit('index.html');
visit(studio);
const optional = [...files].filter(file => /vendor-(three|math|codemirror|timeline)-|Modal-|\/Timeline-/.test(file));
assert.deepEqual(optional, [], 'Optional tools or vendors leaked into the Studio startup graph');
// Check all deferred resources as well; desktop builds must include them too.
for (const chunk of Object.values(manifest)) {
  for (const file of [chunk.file, ...(chunk.css || []), ...(chunk.assets || [])]) readFileSync(path.join(root, file));
  for (const key of [...(chunk.imports || []), ...(chunk.dynamicImports || [])]) assert(manifest[key], `Missing deferred chunk: ${key}`);
}
const checked = new Set();
function checkCycles(key, chain = []) {
  assert(!chain.includes(key), `Circular production chunk imports: ${[...chain, key].join(' -> ')}`);
  if (checked.has(key)) return;
  for (const dependency of manifest[key].imports || []) checkCycles(dependency, [...chain, key]);
  checked.add(key);
}
for (const key of Object.keys(manifest)) checkCycles(key);
const sizes = extension => [...files].filter(file => file.endsWith(extension)).reduce((total, file) => {
  const data = readFileSync(path.join(root, file));
  return { files: total.files + 1, bytes: total.bytes + data.length, gzipBytes: total.gzipBytes + gzipSync(data).length };
}, { files: 0, bytes: 0, gzipBytes: 0 });
console.log(JSON.stringify({ studioStartup: { javascript: sizes('.js'), css: sizes('.css') }, optionalStartupChunks: optional }, null, 2));
