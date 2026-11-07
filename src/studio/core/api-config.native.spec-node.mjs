import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getApiEntry } from './api-registry.ts';
import { createApiCompiler, API_RUNTIME } from './api-compiler.ts';
import { createAction } from './catalog.ts';
import { discoverPython } from '../../../server/server.mjs';
import { apiEvidenceSources } from '../../../scripts/api-evidence.mjs';

const execute = promisify(execFile);

const configCases = [
  // Group A: ManimFrame constructor (1)
  {
    id: 'manim._config.utils.ManimFrame',
    kind: 'class',
    params: { c: { $ref: 'c' } },
    scope: ['c'],
    factory: 'None, {"c": make_base_config()}',
    exp: 'lambda s, ctx: ManimFrame(ctx["c"])',
  },

  // Group B: ManimFrame direction vectors (14)
  { id: 'manim._config.utils.ManimFrame.DL', target: 'frame', exp: 'lambda s, ctx: s.DL' },
  { id: 'manim._config.utils.ManimFrame.DOWN', target: 'frame', exp: 'lambda s, ctx: s.DOWN' },
  { id: 'manim._config.utils.ManimFrame.DR', target: 'frame', exp: 'lambda s, ctx: s.DR' },
  { id: 'manim._config.utils.ManimFrame.IN', target: 'frame', exp: 'lambda s, ctx: s.IN' },
  { id: 'manim._config.utils.ManimFrame.LEFT', target: 'frame', exp: 'lambda s, ctx: s.LEFT' },
  { id: 'manim._config.utils.ManimFrame.ORIGIN', target: 'frame', exp: 'lambda s, ctx: s.ORIGIN' },
  { id: 'manim._config.utils.ManimFrame.OUT', target: 'frame', exp: 'lambda s, ctx: s.OUT' },
  { id: 'manim._config.utils.ManimFrame.RIGHT', target: 'frame', exp: 'lambda s, ctx: s.RIGHT' },
  { id: 'manim._config.utils.ManimFrame.UL', target: 'frame', exp: 'lambda s, ctx: s.UL' },
  { id: 'manim._config.utils.ManimFrame.UP', target: 'frame', exp: 'lambda s, ctx: s.UP' },
  { id: 'manim._config.utils.ManimFrame.UR', target: 'frame', exp: 'lambda s, ctx: s.UR' },
  { id: 'manim._config.utils.ManimFrame.X_AXIS', target: 'frame', exp: 'lambda s, ctx: s.X_AXIS' },
  { id: 'manim._config.utils.ManimFrame.Y_AXIS', target: 'frame', exp: 'lambda s, ctx: s.Y_AXIS' },
  { id: 'manim._config.utils.ManimFrame.Z_AXIS', target: 'frame', exp: 'lambda s, ctx: s.Z_AXIS' },

  // Group C: ManimFrame boundary & dimension properties (11)
  { id: 'manim._config.utils.ManimFrame.aspect_ratio', target: 'frame', exp: 'lambda s, ctx: s.aspect_ratio' },
  { id: 'manim._config.utils.ManimFrame.bottom', target: 'frame', exp: 'lambda s, ctx: s.bottom' },
  { id: 'manim._config.utils.ManimFrame.frame_height', target: 'frame', exp: 'lambda s, ctx: s.frame_height' },
  { id: 'manim._config.utils.ManimFrame.frame_width', target: 'frame', exp: 'lambda s, ctx: s.frame_width' },
  { id: 'manim._config.utils.ManimFrame.frame_x_radius', target: 'frame', exp: 'lambda s, ctx: s.frame_x_radius' },
  { id: 'manim._config.utils.ManimFrame.frame_y_radius', target: 'frame', exp: 'lambda s, ctx: s.frame_y_radius' },
  { id: 'manim._config.utils.ManimFrame.left_side', target: 'frame', exp: 'lambda s, ctx: s.left_side' },
  { id: 'manim._config.utils.ManimFrame.pixel_height', target: 'frame', exp: 'lambda s, ctx: s.pixel_height' },
  { id: 'manim._config.utils.ManimFrame.pixel_width', target: 'frame', exp: 'lambda s, ctx: s.pixel_width' },
  { id: 'manim._config.utils.ManimFrame.right_side', target: 'frame', exp: 'lambda s, ctx: s.right_side' },
  { id: 'manim._config.utils.ManimFrame.top', target: 'frame', exp: 'lambda s, ctx: s.top' },

  // Group D: ManimConfig read-only properties & methods (7)
  { id: 'manim._config.utils.ManimConfig.aspect_ratio', target: 'cfg', exp: 'lambda s, ctx: s.aspect_ratio' },
  { id: 'manim._config.utils.ManimConfig.bottom', target: 'cfg', exp: 'lambda s, ctx: s.bottom' },
  { id: 'manim._config.utils.ManimConfig.left_side', target: 'cfg', exp: 'lambda s, ctx: s.left_side' },
  { id: 'manim._config.utils.ManimConfig.right_side', target: 'cfg', exp: 'lambda s, ctx: s.right_side' },
  { id: 'manim._config.utils.ManimConfig.top', target: 'cfg', exp: 'lambda s, ctx: s.top' },
  { id: 'manim._config.utils.ManimConfig.copy', target: 'cfg', exp: 'lambda s, ctx: s.copy()' },
  { id: 'manim._config.utils.ManimConfig.get_dir', target: 'cfg', params: { key: 'media_dir' }, exp: 'lambda s, ctx: s.get_dir("media_dir")' },

  // Group E: ManimConfig writable properties - numerical (12)
  { id: 'manim._config.utils.ManimConfig.frame_width', target: 'cfg', mode: 'set', val: 16.0, prop: 'frame_width' },
  { id: 'manim._config.utils.ManimConfig.frame_height', target: 'cfg', mode: 'set', val: 9.0, prop: 'frame_height' },
  { id: 'manim._config.utils.ManimConfig.frame_x_radius', target: 'cfg', mode: 'set', val: 8.0, prop: 'frame_x_radius' },
  { id: 'manim._config.utils.ManimConfig.frame_y_radius', target: 'cfg', mode: 'set', val: 4.5, prop: 'frame_y_radius' },
  { id: 'manim._config.utils.ManimConfig.pixel_width', target: 'cfg', mode: 'set', val: 1280, prop: 'pixel_width' },
  { id: 'manim._config.utils.ManimConfig.pixel_height', target: 'cfg', mode: 'set', val: 720, prop: 'pixel_height' },
  { id: 'manim._config.utils.ManimConfig.frame_rate', target: 'cfg', mode: 'set', val: 60.0, prop: 'frame_rate' },
  { id: 'manim._config.utils.ManimConfig.background_opacity', target: 'cfg', mode: 'set', val: 0.5, prop: 'background_opacity' },
  { id: 'manim._config.utils.ManimConfig.max_files_cached', target: 'cfg', mode: 'set', val: 50, prop: 'max_files_cached' },
  { id: 'manim._config.utils.ManimConfig.zero_pad', target: 'cfg', mode: 'set', val: 6, prop: 'zero_pad' },
  { id: 'manim._config.utils.ManimConfig.from_animation_number', target: 'cfg', mode: 'set', val: 2, prop: 'from_animation_number' },
  { id: 'manim._config.utils.ManimConfig.upto_animation_number', target: 'cfg', mode: 'set', val: 8, prop: 'upto_animation_number' },

  // Group F: ManimConfig writable properties - booleans (10)
  { id: 'manim._config.utils.ManimConfig.disable_caching', target: 'cfg', mode: 'set', val: true, prop: 'disable_caching' },
  { id: 'manim._config.utils.ManimConfig.disable_caching_warning', target: 'cfg', mode: 'set', val: true, prop: 'disable_caching_warning' },
  { id: 'manim._config.utils.ManimConfig.dry_run', target: 'cfg', mode: 'set', val: true, prop: 'dry_run' },
  { id: 'manim._config.utils.ManimConfig.flush_cache', target: 'cfg', mode: 'set', val: true, prop: 'flush_cache' },
  { id: 'manim._config.utils.ManimConfig.force_window', target: 'cfg', mode: 'set', val: true, prop: 'force_window' },
  { id: 'manim._config.utils.ManimConfig.fullscreen', target: 'cfg', mode: 'set', val: true, prop: 'fullscreen' },
  { id: 'manim._config.utils.ManimConfig.log_to_file', target: 'cfg', mode: 'set', val: true, prop: 'log_to_file' },
  { id: 'manim._config.utils.ManimConfig.no_latex_cleanup', target: 'cfg', mode: 'set', val: true, prop: 'no_latex_cleanup' },
  { id: 'manim._config.utils.ManimConfig.save_as_gif', target: 'cfg', mode: 'set', val: true, prop: 'save_as_gif' },
  { id: 'manim._config.utils.ManimConfig.save_last_frame', target: 'cfg', mode: 'set', val: true, prop: 'save_last_frame' },

  // Group G: ManimConfig writable properties - strings & paths (8)
  { id: 'manim._config.utils.ManimConfig.background_color', target: 'cfg', mode: 'set', val: '#123456', prop: 'background_color' },
  { id: 'manim._config.utils.ManimConfig.output_file', target: 'cfg', mode: 'set', val: 'custom_output.mp4', prop: 'output_file' },
  { id: 'manim._config.utils.ManimConfig.media_width', target: 'cfg', mode: 'set', val: '75%', prop: 'media_width' },
  { id: 'manim._config.utils.ManimConfig.format', target: 'cfg', mode: 'set', val: 'mp4', prop: 'format' },
  { id: 'manim._config.utils.ManimConfig.movie_file_extension', target: 'cfg', mode: 'set', val: '.mov', prop: 'movie_file_extension' },
  { id: 'manim._config.utils.ManimConfig.verbosity', target: 'cfg', mode: 'set', val: 'DEBUG', prop: 'verbosity' },
  { id: 'manim._config.utils.ManimConfig.media_dir', target: 'cfg', mode: 'set', val: 'custom_media', prop: 'media_dir' },
  { id: 'manim._config.utils.ManimConfig.images_dir', target: 'cfg', mode: 'set', val: 'custom_images', prop: 'images_dir' },
];

test('native config and frame APIs match independent direct Python calls', { timeout: 120_000 }, async t => {
  const health = await discoverPython();
  if (!health.available) {
    t.skip('Manim required');
    return;
  }

  const directory = await mkdtemp(path.join(tmpdir(), 'anyvis-api-config-'));
  try {
    const compiler = createApiCompiler();
    const pyProbes = [];
    const pyRuns = [];

    configCases.forEach((c, idx) => {
      const entry = getApiEntry(c.id);
      assert.ok(entry, `Entry not found for ${c.id}`);

      const fields = {};
      const isStaticOrClass = c.kind === 'class';
      if (!isStaticOrClass) {
        fields.receiver = 'subject';
      }
      fields.mode = c.mode || 'store';
      if (c.val !== undefined) {
        fields.setValue = JSON.stringify(c.val);
      }
      if (c.params) {
        for (const [k, v] of Object.entries(c.params)) {
          fields[`p_${k}`] = JSON.stringify(v);
        }
      }

      const action = createAction(entry.type, fields);
      const scope = new Set(c.scope || (isStaticOrClass ? [] : ['subject']));
      const compiled = compiler.compile(action, entry, scope, {});

      pyProbes.push(`def probe_${idx}(subject, context):
    objects = {${isStaticOrClass ? '' : '"subject": subject, '}**context}
${compiled.prelude.map(l => '    ' + l).join('\n')}
    return ${compiled.expression}
`);

      let factoryExpr;
      if (c.factory) {
        factoryExpr = `lambda: (${c.factory})`;
      } else if (c.target === 'frame') {
        factoryExpr = 'lambda: (ManimFrame(make_base_config()), {})';
      } else {
        factoryExpr = 'lambda: (make_base_config(), {})';
      }

      let expectedExpr = c.exp;
      if (!expectedExpr && c.mode === 'set') {
        let valRepr;
        if (typeof c.val === 'boolean') {
          valRepr = c.val ? 'True' : 'False';
        } else if (typeof c.val === 'number') {
          valRepr = String(c.val);
        } else {
          valRepr = JSON.stringify(c.val);
        }
        expectedExpr = `make_setter_fn(${JSON.stringify(c.prop)}, ${valRepr})`;
      }

      const propArg = c.prop ? JSON.stringify(c.prop) : 'None';
      pyRuns.push(`run_case(${JSON.stringify(c.id)}, ${factoryExpr}, ${expectedExpr}, probe_${idx}, ${propArg})`);
    });

    const runner = `
from manim import *
import numpy as np
import random, json
from pathlib import Path
from manim._config.utils import ManimConfig, ManimFrame

${API_RUNTIME}
${compiler.imports().join('\n')}

results = []

def make_base_config():
    c = config.copy()
    c.frame_rate = 24
    c.pixel_width = 640
    c.pixel_height = 360
    c.frame_width = 12.0
    c.frame_height = 6.75
    return c

def make_setter_fn(prop, val):
    def _setter(s, ctx):
        setattr(s, prop, val)
        return getattr(s, prop)
    return _setter

def compare_values(a, b):
    if isinstance(a, np.ndarray) or isinstance(b, np.ndarray):
        assert isinstance(a, np.ndarray) and isinstance(b, np.ndarray)
        np.testing.assert_allclose(a, b, atol=1e-5)
    elif isinstance(a, float) or isinstance(b, float):
        assert np.isclose(float(a), float(b), atol=1e-5)
    elif isinstance(a, (ManimFrame, ManimConfig)):
        assert type(a) is type(b)
        assert a.pixel_width == b.pixel_width
        assert a.pixel_height == b.pixel_height
        assert a.frame_width == b.frame_width
        assert a.frame_height == b.frame_height
    elif isinstance(a, Path) or isinstance(b, Path):
        assert str(a) == str(b)
    elif hasattr(a, "value") and hasattr(b, "value"):
        assert a.value == b.value
    else:
        assert a == b, f"Mismatch: {a!r} != {b!r}"

def run_case(api_id, factory, expected_fn, compiled_probe, prop_name=None):
    np.random.seed(42); random.seed(42)
    try:
        exp_sub, exp_ctx = factory()
        before = getattr(exp_sub, prop_name) if prop_name else None
        exp_res = expected_fn(exp_sub, exp_ctx)
        if prop_name:
            assert before != getattr(exp_sub, prop_name), "Setter fixture must change the initial value"
    except Exception as error:
        results.append({"apiId": api_id, "status": "fixture_gap", "reason": type(error).__name__ + ": " + str(error)[:250]})
        return

    np.random.seed(42); random.seed(42)
    try:
        act_sub, act_ctx = factory()
        act_res = compiled_probe(act_sub, act_ctx)
        compare_values(exp_res, act_res)
        if api_id.endswith("ManimConfig.copy"):
            before_width = act_sub.pixel_width
            act_res.pixel_width = before_width + 17
            assert act_sub.pixel_width == before_width, "copy must be independent"
            assert act_res.pixel_width == before_width + 17
        if prop_name is not None and exp_sub is not None and act_sub is not None:
            sub_exp_val = getattr(exp_sub, prop_name)
            sub_act_val = getattr(act_sub, prop_name)
            compare_values(sub_exp_val, sub_act_val)
        results.append({"apiId": api_id, "status": "verified"})
    except Exception as error:
        results.append({"apiId": api_id, "status": "failed", "reason": type(error).__name__ + ": " + str(error)[:250]})

${pyProbes.join('\n')}

with tempconfig({"renderer": "cairo", "media_dir": "media", "verbosity": "ERROR"}):
${pyRuns.map(r => '    ' + r).join('\n')}

print("ANYVIS_CONFIG " + json.dumps(results))
`;

    const pyFile = path.join(directory, 'config_test.py');
    await writeFile(pyFile, runner);

    const result = await execute(health.python, [pyFile], {
      cwd: directory,
      timeout: 100_000,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, PATH: `${path.dirname(health.python)}:/Library/TeX/texbin:${process.env.PATH || ''}` }
    });

    const line = result.stdout.split('\n').find(l => l.startsWith('ANYVIS_CONFIG '));
    assert.ok(line, result.stdout);
    const outcomes = JSON.parse(line.slice('ANYVIS_CONFIG '.length));
    const failures = outcomes.filter(o => o.status === 'failed');
    const verified = outcomes.filter(o => o.status === 'verified').map(o => o.apiId).sort();
    const gaps = outcomes.filter(o => o.status === 'fixture_gap');

    t.diagnostic(`${verified.length} native config/frame APIs verified; ${gaps.length} explicit fixture gaps; ${failures.length} adapter failures.`);

    const reportPath = process.env.ANYVIS_API_CONFIG_REPORT || path.resolve('artifacts/api/native-config-evidence.json');
    const fixture = 'src/studio/core/api-config.native.spec-node.mjs';
    const registry = await readFile(new URL('./api-registry.json', import.meta.url));
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(
      reportPath,
      JSON.stringify(
        {
          fixture,
          fixtureId: 'api-config-v1',
          sourceFiles: await apiEvidenceSources(fixture),
          registrySha256: createHash('sha256').update(registry).digest('hex'),
          passed: failures.length === 0,
          engineVersion: health.version,
          renderer: 'cairo',
          apiIds: verified,
          outcomes,
          checks: 'Behavioral evidence for ManimConfig and ManimFrame properties, methods and constructors comparing compiled API calls against native Python executions.'
        },
        null,
        2
      ) + '\n'
    );

    assert.deepEqual(failures, []);
    assert.ok(verified.length >= 40, `Expected at least 40 verified APIs, got ${verified.length}`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
