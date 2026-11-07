#!/usr/bin/env node
/** Render editable AnyVis projects using exactly the editor compiler and worker. */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { compileProject } from '../src/studio/core/compiler.ts';
import { validateProject } from '../src/studio/core/project.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const value = (flag, fallback) => args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
const input = value('--manifest');
if (!input) throw new Error('Usage: node scripts/render-projects.mjs --manifest <JSON array of project paths> --python <Manim Python> [--output artifacts/film] [--jobs 2] [--check] [--force]');
const python = value('--python', process.env.ANYVIS_PYTHON || 'python3');
const output = path.resolve(value('--output', 'artifacts/rendered-projects'));
const concurrency = Number(value('--jobs', '2'));
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) throw new Error('--jobs must be 1–4');
const sources = JSON.parse(fs.readFileSync(input, 'utf8'));
if (!Array.isArray(sources) || !sources.every(x => typeof x === 'string')) throw new Error('Manifest must contain project file paths relative to its own directory.');
fs.mkdirSync(output, { recursive: true });
const compilerHash = createHash('sha256').update(fs.readFileSync(path.join(root, 'src/studio/core/compiler.ts'))).update(fs.readFileSync(path.join(root, 'server/worker.py'))).digest('hex');
const startedAt = new Date().toISOString();
const jobs = sources.map((source, index) => {
  const filename = path.resolve(path.dirname(input), source);
  const project = validateProject(JSON.parse(fs.readFileSync(filename, 'utf8')));
  const compiled = compileProject(project);
  const errors = compiled.diagnostics.filter(d => d.severity === 'error');
  if (errors.length || compiled.requiresTrust) throw new Error(`${source}: ${errors.map(d => `${d.blockId}: ${d.message}`).join('\n') || 'Batch rendering accepts native blocks only.'}`);
  const settings = { ...project.scene, duration: compiled.duration };
  const hash = createHash('sha256').update(compiled.code).update(JSON.stringify(settings)).update(compilerHash).digest('hex');
  const folder = path.join(output, `${String(index + 1).padStart(3, '0')}-${project.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'scene.py'), compiled.code);
  fs.writeFileSync(path.join(folder, 'job.json'), JSON.stringify(settings));
  fs.writeFileSync(path.join(folder, 'project.anyvis.json'), JSON.stringify(project, null, 2));
  return { index, source, filename, folder, hash, expectedDuration: compiled.duration, projectName: project.name };
});
console.log(`Validated ${jobs.length} native projects; ${jobs.reduce((n, j) => n + j.expectedDuration, 0).toFixed(2)} seconds.`);
if (args.includes('--check')) process.exit(0);
const results = []; let next = 0; let failed = false;
const save = () => fs.writeFileSync(path.join(output, 'render-report.json'), JSON.stringify({ startedAt, updatedAt: new Date().toISOString(), compilerHash, results: [...results].sort((a,b) => a.index-b.index) }, null, 2));
async function render(job) {
  const reportFile = path.join(job.folder, 'result.json');
  let previous;
  try { previous = JSON.parse(fs.readFileSync(reportFile, 'utf8')); } catch {}
  if (!args.includes('--force') && previous?.hash === job.hash && fs.existsSync(path.join(job.folder, previous.media.filename))) {
    results.push({ ...previous, reused: true }); save(); console.log(`Cached ${job.index + 1}/${jobs.length}: ${job.projectName}`); return;
  }
  const start = Date.now(); let done; let error; let buffer = '';
  const log = fs.createWriteStream(path.join(job.folder, 'render.log'));
  await new Promise((resolve, reject) => {
    const child = spawn(python, [path.join(root, 'server/worker.py'), job.folder], {
      cwd: job.folder, env: { ...process.env, PATH: `${path.dirname(python)}:/Library/TeX/texbin:${process.env.PATH || ''}` }, windowsHide: true,
    });
    const timer = setTimeout(() => { child.kill('SIGTERM'); error = 'Render exceeded 30 minutes.'; }, 1_800_000);
    child.stdout.on('data', data => {
      log.write(data); buffer += data.toString(); const lines = buffer.split('\n'); buffer = lines.pop();
      for (const line of lines) if (line.startsWith('ANYVIS_EVENT ')) {
        try { const event = JSON.parse(line.slice(13)); if (event.event === 'done') done = event; if (event.event === 'error') error = event.error; } catch {}
      }
    });
    child.stderr.on('data', data => log.write(data));
    child.once('error', e => { clearTimeout(timer); log.end(); reject(e); });
    child.once('close', code => { clearTimeout(timer); log.end(); code === 0 && done ? resolve() : reject(new Error(error || `Worker exit ${code}; see ${job.folder}/render.log`)); });
  });
  const result = { ...job, elapsedSeconds: (Date.now() - start) / 1000, completedAt: new Date().toISOString(), media: done };
  fs.writeFileSync(reportFile, JSON.stringify(result, null, 2)); results.push(result); save();
  console.log(`Rendered ${job.index + 1}/${jobs.length}: ${job.projectName} (${result.elapsedSeconds.toFixed(1)} s)`);
}
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (next < jobs.length && !failed) { const job = jobs[next++]; try { await render(job); } catch (error) { failed = true; console.error(`${job.source}: ${error.message}`); } }
}));
if (failed) process.exitCode = 1;
