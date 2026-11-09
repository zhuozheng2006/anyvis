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

// Editor-output regression only: no API coverage counts or video/pixel claims.
// Runs the real compiled construct and Manim animation interpolation without
// encoding video; observes actual object geometry, glyph colors and event times.
test('workbench output constructs native vectors, quadrature, colored formulas, subtitles and camera paths', { timeout: 180_000 }, async t => {
  const health = await discoverPython();
  if (!health.available) {
    if (process.env.ANYVIS_REQUIRE_MANIM === '1') assert.fail(health.error || 'Manim required');
    t.skip(health.error || 'Manim required'); return;
  }
  const directory = await mkdtemp(path.join(tmpdir(), 'anyvis-workbench-semantics-'));
  try {
    const modulePath = path.join(directory, 'workbenches.mjs');
    await build({ stdin: { contents: `export * from '../vector3d.ts';
export * from '../riemann.ts';
export * from '../subtitles.ts';
export * from '../tex-color.ts';
export * from '../camera-director.ts';
export { createEmptyProject } from './project.ts';
export { compileProject } from './compiler.ts';`, resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'ts' }, outfile: modulePath, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
    const helpers = await import(pathToFileURL(modulePath).href);
    const fixtures = [];
    async function fixture(id, project, check, samples = [], requiresTrust = false) {
      const compiled = helpers.compileProject(project);
      assert.deepEqual(compiled.diagnostics, [], id);
      assert.equal(compiled.requiresTrust, requiresTrust, id);
      await writeFile(path.join(directory, `${id}.py`), compiled.code);
      fixtures.push({ id, check, samples });
    }
    const u = { x: 2, y: 1, z: 0.5 }, v = { x: 0.5, y: 2, z: 1 };
    for (const op of ['add', 'dot', 'cross']) {
      const expected = op === 'add' ? helpers.add3D(u, v) : op === 'dot' ? helpers.project3D(u, v) : helpers.cross3D(u, v);
      await fixture(`vector_${op}`, helpers.createVector3DActions(helpers.createEmptyProject(), u, v, op).project,
        `result = named(objects, ${JSON.stringify(op === 'dot' ? '投影' : '结果向量')})\nclose(result.get_end(), ${JSON.stringify([expected.x, expected.y, expected.z])})\nassert isinstance(result, Arrow3D)\nclose(scene.camera.get_phi(), 65 * DEGREES)\nclose(scene.camera.get_theta(), -125 * DEGREES)\nclose(named(objects, "向量u").get_end(), [2,1,0.5])\nclose(named(objects, "向量v").get_end(), [0.5,2,1])`);
    }
    await fixture('vector_zero', helpers.createVector3DActions(helpers.createEmptyProject(), { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, 'dot').project,
      'result = named(objects, "投影")\nassert isinstance(result, Dot3D)\nclose(result.get_center(), [0,0,0])');
    for (const [mode, heights] of [['left', [0, 0]], ['right', [1, 1]], ['mid', [0.25, 0.25]], ['trapezoid', [1, 0]]]) {
      await fixture(`riemann_${mode}`, helpers.createRiemannActions(helpers.createEmptyProject(), helpers.RIEMANN_PRESETS[0], 0, 2, 2, mode).project,
        `axes = named(objects, "坐标系_黎曼")\npolygons = [mob for name,mob in objects.items() if name.startswith(${JSON.stringify(mode === 'trapezoid' ? '梯形_' : '黎曼矩形_')})]\nassert len(polygons) == 2\nvertices = np.array([axes.p2c(p) for p in polygons[0].get_vertices()])\nclose(vertices, [[0,0],[1,0],[1,${heights[0]}],[0,${heights[1]}]])\nclose(polygons[0].get_fill_opacity(), 0.55)`);
    }
    await fixture('tex_colors', helpers.createColoredMathTexActions(helpers.createEmptyProject(), 'a+b', { a: '#e2b340', b: '#58c4dd' }).project,
      'formula = named(objects, "彩色公式")\ncolors = {mob.get_fill_color().to_hex().upper() for mob in formula.family_members_with_points()}\nassert {"#E2B340", "#58C4DD", "#FFFFFF"} <= colors, colors', [], true);
    for (const [index, preset] of helpers.TEX_STYLING_PRESETS.entries()) {
      await fixture(`tex_preset_${index}`, helpers.createColoredMathTexActions(helpers.createEmptyProject(), preset.rawTex, preset.defaultColors).project,
        'formula = named(objects, "彩色公式")\nassert formula.width > 0 and len(formula.family_members_with_points()) > 0', [], true);
    }
    await fixture('subtitles', helpers.createSubtitleActions(helpers.createEmptyProject(), [
      { id: 'a', startTime: 0.123, endTime: 2.345, text: 'first "caption"\nline 2', color: '#123456', position: 'top' },
      { id: 'b', startTime: 1.111, endTime: 3.456, text: 'overlap', position: 'center' },
    ]).project,
    'events = [(time, visible) for time,visible in scene.text_events]\nassert len(events) == 4, events\nclose([time for time,_ in events], [0.123,1.111,2.345,3.456])\nassert [len(visible) for _,visible in events] == [1,2,1,0], events\ntexts = [mob for name,mob in objects.items() if name.startswith("字幕_")]\nclose(texts[0].get_center()[1], 3)\nclose(texts[1].get_center()[1], 0)\nassert texts[0].get_color().to_hex().upper() == "#123456"\nclose(scene.elapsed, 3.456)');
    for (const rateFunc of ['linear', 'smooth', 'ease_in_out']) {
      const shots = [helpers.DEFAULT_CAMERA_SHOTS[0], { ...helpers.DEFAULT_CAMERA_SHOTS[1], time: 4, duration: 2, x: 4, y: 2, zoom: 2, rateFunc }];
      const times = [2.5, 3, 4];
      const expected = times.map(time => { const pose = helpers.interpolateCameraPose(shots, time); return [pose.x, pose.y, helpers.BASE_FRAME_WIDTH / pose.zoom]; });
      await fixture(`camera_${rateFunc}`, helpers.createCameraDirectorActions(helpers.createEmptyProject(), shots).project,
        `assert len(scene.camera_samples) == 3\nclose(scene.camera_samples, ${JSON.stringify(expected)})\nclose(scene.elapsed, 4)`, times);
    }
    const runner = path.join(directory, 'measure.py');
    await writeFile(runner, `from pathlib import Path
import json, sys
import numpy as np
from manim import *
from manim.animation.animation import prepare_animation

def close(actual, expected):
    np.testing.assert_allclose(actual, expected, rtol=0, atol=1e-7)
def named(objects, prefix):
    matches = [mob for name,mob in objects.items() if name.startswith(prefix + "_")]
    assert len(matches) == 1, (prefix, len(matches))
    return matches[0]
def run_fixture(spec):
    filename = spec["id"] + ".py"
    namespace = {"__name__": "fixture_" + spec["id"]}
    exec(compile(Path(filename).read_text(encoding="utf-8"), filename, "exec"), namespace)
    base = namespace["AnyVisScene"]
    objects = {}
    class MeasuredScene(base):
        def __init__(self):
            self.elapsed = 0.0
            self.text_events = []
            self.camera_samples = []
            super().__init__()
        def record_text(self):
            visible = sorted(mob.text for mob in self.mobjects if isinstance(mob, Text))
            if not self.text_events or visible != self.text_events[-1][1]:
                if visible or self.text_events: self.text_events.append((self.elapsed, visible))
        def add(self, *mobjects):
            result = super().add(*mobjects)
            self.record_text()
            return result
        def remove(self, *mobjects):
            result = super().remove(*mobjects)
            self.record_text()
            return result
        def play(self, *args, **kwargs):
            assert len(args) == 1 and not kwargs, "Unexpected scheduling in workbench fixture"
            animation = prepare_animation(args[0])
            self.add_mobjects_from_animations([animation])
            animation._setup_scene(self)
            animation.begin()
            for time in spec["samples"]:
                if self.elapsed < time <= self.elapsed + animation.run_time:
                    animation.interpolate((time - self.elapsed) / animation.run_time)
                    center = self.camera.frame.get_center()
                    self.camera_samples.append([center[0], center[1], self.camera.frame.width])
            animation.finish()
            animation.clean_up_from_scene(self)
            self.elapsed += animation.run_time
        def wait(self, duration=1, **kwargs):
            self.elapsed += duration
    scene = MeasuredScene()
    def observe(frame, event, arg):
        if event == "return" and frame.f_code is base.construct.__code__:
            objects.update(frame.f_locals["objects"])
    try:
        sys.setprofile(observe)
        scene.construct()
    finally:
        sys.setprofile(None)
    exec(spec["check"], globals(), {"objects": objects, "scene": scene})
    return spec["id"]

with tempconfig({"renderer": "cairo", "pixel_width": 160, "pixel_height": 90, "frame_width": 128/9, "frame_height": 8, "write_to_movie": False, "save_last_frame": False, "media_dir": "media", "verbosity": "ERROR"}):
    specs = json.loads(${JSON.stringify(JSON.stringify(fixtures))})
    completed = [run_fixture(spec) for spec in specs]
print("ANYVIS_WORKBENCH " + json.dumps(completed))
`);
    const { stdout } = await execute(health.python, [runner], { cwd: directory, timeout: 150_000, maxBuffer: 4 * 1024 * 1024 });
    const record = stdout.split(/\r?\n/).find(line => line.startsWith('ANYVIS_WORKBENCH '));
    assert.ok(record, stdout);
    assert.deepEqual(JSON.parse(record.slice('ANYVIS_WORKBENCH '.length)), fixtures.map(fixture => fixture.id));
    t.diagnostic(`Manim ${health.version}: ${fixtures.length} real compiled construct/interpolation cases. Colored MathTex retains the existing trust requirement. No audio analysis or video claim.`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
