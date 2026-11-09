import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { discoverPython } from '../../../server/server.mjs';

const execute = promisify(execFile);

// Tests actual compiled projects and Manim interpolation, not encoded frames or
// rendered pixels. No fixture/setup calls are added to API coverage evidence.
test('native editor cuts preserve linear motion and copied sequences move their own objects', { timeout: 60_000 }, async t => {
  const health = await discoverPython();
  if (!health.available) {
    if (process.env.ANYVIS_REQUIRE_MANIM === '1') assert.fail(health.error || 'Manim required');
    t.skip(health.error || 'Manim required');
    return;
  }
  const directory = await mkdtemp(path.join(tmpdir(), 'anyvis-editor-semantics-'));
  try {
    // Like media.integration.mjs, bundle the editor modules whose imports omit
    // extensions; load the real compiler and edit functions without mocks.
    const modulePath = path.join(directory, 'editor.mjs');
    await build({
      stdin: {
        contents: `export { createAction } from './catalog.ts';
export { createEmptyProject } from './project.ts';
export { compileProject } from './compiler.ts';
export { splitActionClip } from '../timeline-model.ts';
export { timelineClips, duplicateAction } from '../authoring.ts';`,
        resolveDir: fileURLToPath(new URL('.', import.meta.url)),
        loader: 'ts',
      },
      outfile: modulePath, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
    });
    const { createAction, createEmptyProject, compileProject, splitActionClip, timelineClips, duplicateAction } = await import(pathToFileURL(modulePath).href);
    const circle = createAction('circle', { name: 'c', appear: 'none' });
    const displacement = [0.00001, -2.1234567, 3.3333333];
    const shift = createAction('shift', {
      target: 'c', dx: displacement[0], dy: displacement[1], dz: displacement[2], duration: 2, easing: 'linear',
    });
    const original = { ...createEmptyProject(), actions: [circle, shift] };
    const split = splitActionClip(original, timelineClips(original.actions)[1], 0.5).project;
    const sequence = createAction('sequence');
    sequence.children = [createAction('circle', { name: 'c', appear: 'none' }), createAction('shift', { target: 'c', dx: 2, dy: 0, dz: 0, duration: 1, easing: 'linear' })];
    const source = { ...createEmptyProject(), actions: [sequence] };
    const copied = duplicateAction(source, sequence.id).project;
    for (const [name, project, expectedDuration] of [['original', original, 2], ['split', split, 2], ['copied', copied, 2]]) {
      const compiled = compileProject(project);
      assert.deepEqual(compiled.diagnostics, [], name);
      assert.equal(compiled.requiresTrust, false, name);
      assert.equal(compiled.duration, expectedDuration, name);
      await writeFile(path.join(directory, `${name}.py`), compiled.code);
    }
    const script = path.join(directory, 'measure.py');
    await writeFile(script, `from pathlib import Path
import json
import numpy as np
from manim import tempconfig
from manim.animation.animation import prepare_animation

SAMPLE_TIMES = [0.25, 0.5, 0.75, 1.25, 2.0]
DISPLACEMENT = np.array(${JSON.stringify(displacement)})

def measure(name, sample_times):
    namespace = {"__name__": "editor_fixture_" + name}
    exec(compile(Path(name + ".py").read_text(encoding="utf-8"), name + ".py", "exec"), namespace)
    class MeasuredScene(namespace["AnyVisScene"]):
        def __init__(self):
            super().__init__()
            self.elapsed = 0.0
            self.samples = []
        def play(self, *args, **kwargs):
            # These fixtures compile one .animate.shift per play. Fail rather
            # than silently approximate any new parallel/keyword scheduling.
            assert len(args) == 1 and not kwargs, (args, kwargs)
            animation = prepare_animation(args[0])
            animation._setup_scene(self)
            animation.begin()
            duration = animation.run_time
            assert duration > 0
            for at in sample_times:
                if self.elapsed < at <= self.elapsed + duration:
                    animation.interpolate((at - self.elapsed) / duration)
                    assert len(self.mobjects) == 1, len(self.mobjects)
                    self.samples.append(self.mobjects[0].get_center().copy())
            animation.finish()
            animation.clean_up_from_scene(self)
            self.elapsed += duration
        def wait(self, *args, **kwargs):
            raise AssertionError("Unexpected wait in these motion fixtures")
    scene = MeasuredScene()
    scene.construct()
    np.testing.assert_allclose(scene.elapsed, 2.0, rtol=0, atol=1e-12)
    assert len(scene.samples) == len(sample_times)
    return scene

with tempconfig({"renderer": "cairo", "write_to_movie": False, "save_last_frame": False, "pixel_width": 64, "pixel_height": 32, "media_dir": "media", "verbosity": "ERROR"}):
    original = measure("original", SAMPLE_TIMES)
    split = measure("split", SAMPLE_TIMES)
    expected = np.array([DISPLACEMENT * at / 2 for at in SAMPLE_TIMES])
    np.testing.assert_allclose(original.samples, expected, rtol=0, atol=1e-10)
    np.testing.assert_allclose(split.samples, expected, rtol=0, atol=1e-10)
    np.testing.assert_allclose(split.samples, original.samples, rtol=0, atol=1e-10)
    copied = measure("copied", [])
    assert len(copied.mobjects) == 2, len(copied.mobjects)
    assert copied.mobjects[0] is not copied.mobjects[1]
    centers = [mob.get_center().tolist() for mob in copied.mobjects]
    np.testing.assert_allclose(centers, [[2, 0, 0], [2, 0, 0]], rtol=0, atol=1e-10)
    print("ANYVIS_EDITOR_SEMANTICS " + json.dumps({"times": SAMPLE_TIMES, "splitCenters": np.array(split.samples).tolist(), "copiedCenters": centers}))
`);
    const { stdout } = await execute(health.python, [script], { cwd: directory, timeout: 40_000, maxBuffer: 1024 * 1024 });
    const record = stdout.split(/\r?\n/).find(line => line.startsWith('ANYVIS_EDITOR_SEMANTICS '));
    assert.ok(record, stdout);
    const results = JSON.parse(record.slice('ANYVIS_EDITOR_SEMANTICS '.length));
    assert.deepEqual(results.times, [0.25, 0.5, 0.75, 1.25, 2]);
    assert.equal(results.splitCenters.length, 5);
    assert.equal(results.copiedCenters.length, 2);
    t.diagnostic(`Manim ${health.version}: five interpolation samples match at absolute tolerance 1e-10; copied circles both end at [2, 0, 0]. No video/pixel or API coverage claim.`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
