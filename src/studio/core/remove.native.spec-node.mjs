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

test('native remove clears grouped families and fixed Chinese captions without losing their reusable screen position', { timeout: 30_000 }, async t => {
  const health = await discoverPython();
  if (!health.available) { t.skip('A Manim environment is required.'); return; }
  const temporary = await mkdtemp(path.join(tmpdir(), 'anyvis-remove-'));
  try {
    const project = createEmptyProject();
    project.scene.dimension = '3d';
    const actions = project.actions = [];
    const add = (type, fields = {}) => actions.push(createAction(type, fields));
    const code = source => add('code', { code: source });
    const circle = (name, x, appear = 'none') => add('circle', { name, x, radius: 0.4, appear });
    const group = (name, members) => add('group', { name, members: members.join(',') });
    const remove = target => add('remove', { target });
    code(`import json
_checks = []
def _visible_ids():
    return {id(member) for mob in self.mobjects for member in mob.get_family() if len(member.points)}
def _assert_only(name):
    expected = {id(member) for member in objects[name].get_family() if len(member.points)} if name else set()
    assert _visible_ids() == expected, (name, len(_visible_ids()), len(expected))
def _frame():
    self.camera.reset()
    self.camera.capture_mobjects(self.mobjects)
    return self.camera.pixel_array.copy()
_blank = _frame()`);

    circle('loose_a', -2); circle('loose_b', 0); circle('loose_keep', 2);
    group('loose_cleanup', ['loose_a', 'loose_b']);
    code('assert objects["loose_cleanup"] not in self.mobjects');
    remove('loose_cleanup');
    code('_assert_only("loose_keep")\n_checks.append("unadded group removes independent members")');
    remove('loose_keep');

    circle('added_a', -2, 'hidden'); circle('added_b', 0, 'hidden'); circle('added_keep', 2);
    group('added_cleanup', ['added_a', 'added_b']);
    add('add', { target: 'added_cleanup' });
    code('assert objects["added_cleanup"] in self.mobjects');
    remove('added_cleanup');
    code('_assert_only("added_keep")\n_checks.append("added group removes itself and its members")');
    remove('added_keep');

    circle('nested_a', -3); circle('nested_b', -1); circle('nested_c', 1); circle('nested_keep', 3);
    group('nested_ab', ['nested_a', 'nested_b']);
    group('overlap_bc', ['nested_b', 'nested_c']);
    group('nested_cleanup', ['nested_ab', 'overlap_bc']);
    add('add', { target: 'nested_ab' });
    add('add', { target: 'overlap_bc' });
    remove('nested_cleanup');
    code('_assert_only("nested_keep")\n_checks.append("nested overlapping families preserve unrelated objects")');
    remove('nested_keep');
    code('_assert_only(None)\nnp.testing.assert_array_equal(_frame(), _blank)');

    add('camera', { phi: 65, theta: -60, zoom: 0.9, duration: 0 });
    add('text', { name: 'caption_title', text: '固定字幕：移除后不残留', fontSize: 28, x: 0, y: 1, appear: 'none' });
    add('fixed_in_frame', { target: 'caption_title' });
    add('text', { name: 'caption_body', text: '下一镜头\n仍可重新显示', fontSize: 24, x: 0, y: -1, appear: 'none' });
    add('fixed_in_frame', { target: 'caption_body' });
    group('caption_cleanup', ['caption_title', 'caption_body']);
    code(`_shown = _frame()
assert np.count_nonzero(_shown != _blank) > 100
_fixed_before = set(self.camera.fixed_in_frame_mobjects)`);
    remove('caption_cleanup');
    code(`_assert_only(None)
assert not self.mobjects
np.testing.assert_array_equal(_frame(), _blank)
assert self.camera.fixed_in_frame_mobjects == _fixed_before
_checks.append("fixed Chinese caption removal restores exact blank pixels")`);
    add('camera', { phi: 80, theta: 30, zoom: 1.8, duration: 0 });
    add('add', { target: 'caption_cleanup' });
    code(`np.testing.assert_array_equal(_frame(), _shown)
assert self.camera.fixed_in_frame_mobjects == _fixed_before
_checks.append("removed then readded captions retain fixed screen position")`);
    remove('caption_cleanup');
    code('_assert_only(None)\nnp.testing.assert_array_equal(_frame(), _blank)\nprint("ANYVIS_REMOVE " + json.dumps(_checks))');

    const compiled = compileProject(project);
    assert.deepEqual(compiled.diagnostics.filter(diagnostic => diagnostic.severity === 'error'), []);
    assert.equal(compiled.requiresTrust, true); // Fixed self-authored measurement fixture.
    const filename = path.join(temporary, 'measure.py');
    await writeFile(filename, `${compiled.code}\nif __name__ == "__main__":\n    with tempconfig({"renderer": "cairo", "write_to_movie": False, "save_last_frame": False, "media_dir": "media", "progress_bar": "none", "verbosity": "WARNING", "pixel_width": 320, "pixel_height": 180, "frame_rate": 15}):\n        AnyVisScene().render()\n`, 'utf8');
    const { stdout } = await execute(health.python, [filename], { cwd: temporary, timeout: 20_000, maxBuffer: 1024 * 1024 });
    const record = stdout.split(/\r?\n/).find(line => line.startsWith('ANYVIS_REMOVE '));
    assert.ok(record, stdout);
    const checks = JSON.parse(record.slice('ANYVIS_REMOVE '.length));
    assert.equal(checks.length, 5);
    t.diagnostic(`Verified ${checks.join('; ')}.`);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
