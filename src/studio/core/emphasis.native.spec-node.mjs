import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { discoverPython } from '../../../server/server.mjs';
import { createAction } from './catalog.ts';
import { compileProject } from './compiler.ts';
import { createEmptyProject } from './project.ts';

const execute = promisify(execFile);

test('native emphasis restores target geometry and style and removes temporary objects for every rhythm', { timeout: 30_000 }, async t => {
  const health = await discoverPython();
  if (!health.available) { t.skip('A Manim environment is required.'); return; }
  const temporary = await mkdtemp(path.join(tmpdir(), 'anyvis-emphasis-'));
  try {
    const project = createEmptyProject();
    project.actions = [createAction('code', { code: 'import json\n_checks = []' })];
    for (const effect of ['indicate', 'focus_on', 'wiggle', 'circumscribe']) {
      for (const easing of ['smooth', 'linear', 'ease_in_sine', 'ease_out_sine', 'there_and_back']) {
        const name = `${effect}_${easing}`;
        project.actions.push(createAction('circle', { name, color: '#38BDF8', fill: 0.35, x: 1, y: -0.5, appear: 'none' }),
          createAction('code', { code: `_target = objects[${JSON.stringify(name)}]\n_before = _target.copy()\n_before_points = _target.get_all_points().copy()\n_before_ids = [id(m) for m in self.mobjects if len(m.get_all_points())]` }),
          createAction(effect, { target: name, duration: 0.2, easing }),
          createAction('code', { code: `assert objects[${JSON.stringify(name)}] is _target\nnp.testing.assert_allclose(_target.get_all_points(), _before_points, atol=1e-9, rtol=0)\nassert _target.get_fill_color() == _before.get_fill_color()\nassert _target.get_stroke_color() == _before.get_stroke_color()\nnp.testing.assert_allclose(_target.get_fill_opacity(), _before.get_fill_opacity(), atol=1e-9)\nnp.testing.assert_allclose(_target.get_stroke_opacity(), _before.get_stroke_opacity(), atol=1e-9)\nnp.testing.assert_allclose(_target.get_stroke_width(), _before.get_stroke_width(), atol=1e-9)\nassert [id(m) for m in self.mobjects if len(m.get_all_points())] == _before_ids, ${JSON.stringify(name)}\n_checks.append({"effect": ${JSON.stringify(effect)}, "easing": ${JSON.stringify(easing)}, "width": float(_target.width), "color": _target.get_color().to_hex()})` }));
      }
    }
    project.actions.push(createAction('code', { code: 'print("ANYVIS_EMPHASIS " + json.dumps(_checks))' }));
    const compiled = compileProject(project);
    assert.deepEqual(compiled.diagnostics.filter(diagnostic => diagnostic.severity === 'error'), []);
    assert.equal(compiled.requiresTrust, true); // Fixed self-authored measurement fixture.
    const source = `${compiled.code}\nif __name__ == "__main__":\n    with tempconfig({"write_to_movie": False, "save_last_frame": False, "media_dir": "media", "progress_bar": "none", "verbosity": "WARNING", "pixel_width": 320, "pixel_height": 180, "frame_rate": 15}):\n        AnyVisScene().render()\n`;
    const filename = path.join(temporary, 'measure.py');
    await writeFile(filename, source, 'utf8');
    const { stdout } = await execute(health.python, [filename], { cwd: temporary, timeout: 20_000, maxBuffer: 1024 * 1024 });
    const record = stdout.split(/\r?\n/).find(line => line.startsWith('ANYVIS_EMPHASIS '));
    assert.ok(record, stdout);
    const checks = JSON.parse(record.slice('ANYVIS_EMPHASIS '.length));
    assert.equal(checks.length, 20);
    for (const check of checks) {
      assert.ok(Math.abs(check.width - 2) < 1e-9, JSON.stringify(check));
      assert.equal(check.color, '#38BDF8');
    }
    t.diagnostic(`Verified ${checks.length} native effect/rhythm combinations with identical final points, colors, opacity, stroke width, object identity and visible scene membership. Native Circumscribe leaves an empty Group even with its default rhythm; empty bookkeeping groups are ignored.`);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
