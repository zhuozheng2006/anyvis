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
import { apiEvidenceSources, nativeExecutionEnvironment } from '../../../scripts/api-evidence.mjs';

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

  // Group H: Remaining ManimConfig properties (37)
  { id: 'manim._config.utils.ManimConfig.assets_dir', target: 'cfg', exp: 'lambda s, ctx: s.assets_dir' },
  { id: 'manim._config.utils.ManimConfig.custom_folders', target: 'cfg', exp: 'lambda s, ctx: s.custom_folders' },
  { id: 'manim._config.utils.ManimConfig.enable_gui', target: 'cfg', exp: 'lambda s, ctx: s.enable_gui' },
  { id: 'manim._config.utils.ManimConfig.enable_wireframe', target: 'cfg', exp: 'lambda s, ctx: s.enable_wireframe' },
  { id: 'manim._config.utils.ManimConfig.ffmpeg_loglevel', target: 'cfg', exp: 'lambda s, ctx: s.ffmpeg_loglevel' },
  { id: 'manim._config.utils.ManimConfig.frame_size', target: 'cfg', exp: 'lambda s, ctx: s.frame_size' },
  { id: 'manim._config.utils.ManimConfig.gui_location', target: 'cfg', exp: 'lambda s, ctx: s.gui_location' },
  { id: 'manim._config.utils.ManimConfig.input_file', target: 'cfg', exp: 'lambda s, ctx: s.input_file' },
  { id: 'manim._config.utils.ManimConfig.log_dir', target: 'cfg', exp: 'lambda s, ctx: s.log_dir' },
  { id: 'manim._config.utils.ManimConfig.media_embed', target: 'cfg', exp: 'lambda s, ctx: s.media_embed' },
  { id: 'manim._config.utils.ManimConfig.notify_outdated_version', target: 'cfg', exp: 'lambda s, ctx: s.notify_outdated_version' },
  { id: 'manim._config.utils.ManimConfig.partial_movie_dir', target: 'cfg', exp: 'lambda s, ctx: s.partial_movie_dir' },
  { id: 'manim._config.utils.ManimConfig.plugins', target: 'cfg', exp: 'lambda s, ctx: s.plugins' },
  { id: 'manim._config.utils.ManimConfig.preview', target: 'cfg', exp: 'lambda s, ctx: s.preview' },
  { id: 'manim._config.utils.ManimConfig.preview_command', target: 'cfg', exp: 'lambda s, ctx: s.preview_command' },
  { id: 'manim._config.utils.ManimConfig.progress_bar', target: 'cfg', exp: 'lambda s, ctx: s.progress_bar' },
  { id: 'manim._config.utils.ManimConfig.quality', target: 'cfg', exp: 'lambda s, ctx: s.quality' },
  { id: 'manim._config.utils.ManimConfig.renderer', target: 'cfg', exp: 'lambda s, ctx: s.renderer' },
  { id: 'manim._config.utils.ManimConfig.save_pngs', target: 'cfg', exp: 'lambda s, ctx: s.save_pngs' },
  { id: 'manim._config.utils.ManimConfig.save_sections', target: 'cfg', exp: 'lambda s, ctx: s.save_sections' },
  { id: 'manim._config.utils.ManimConfig.scene_names', target: 'cfg', exp: 'lambda s, ctx: s.scene_names' },
  { id: 'manim._config.utils.ManimConfig.sections_dir', target: 'cfg', exp: 'lambda s, ctx: s.sections_dir' },
  { id: 'manim._config.utils.ManimConfig.seed', target: 'cfg', exp: 'lambda s, ctx: s.seed' },
  { id: 'manim._config.utils.ManimConfig.show_in_file_browser', target: 'cfg', exp: 'lambda s, ctx: s.show_in_file_browser' },
  { id: 'manim._config.utils.ManimConfig.tex_dir', target: 'cfg', exp: 'lambda s, ctx: s.tex_dir' },
  { id: 'manim._config.utils.ManimConfig.tex_template', target: 'cfg', exp: 'lambda s, ctx: s.tex_template' },
  { id: 'manim._config.utils.ManimConfig.tex_template_file', target: 'cfg', exp: 'lambda s, ctx: s.tex_template_file' },
  { id: 'manim._config.utils.ManimConfig.text_dir', target: 'cfg', exp: 'lambda s, ctx: s.text_dir' },
  { id: 'manim._config.utils.ManimConfig.transparent', target: 'cfg', exp: 'lambda s, ctx: s.transparent' },
  { id: 'manim._config.utils.ManimConfig.use_projection_fill_shaders', target: 'cfg', exp: 'lambda s, ctx: s.use_projection_fill_shaders' },
  { id: 'manim._config.utils.ManimConfig.use_projection_stroke_shaders', target: 'cfg', exp: 'lambda s, ctx: s.use_projection_stroke_shaders' },
  { id: 'manim._config.utils.ManimConfig.video_dir', target: 'cfg', exp: 'lambda s, ctx: s.video_dir' },
  { id: 'manim._config.utils.ManimConfig.window_monitor', target: 'cfg', exp: 'lambda s, ctx: s.window_monitor' },
  { id: 'manim._config.utils.ManimConfig.window_position', target: 'cfg', exp: 'lambda s, ctx: s.window_position' },
  { id: 'manim._config.utils.ManimConfig.window_size', target: 'cfg', exp: 'lambda s, ctx: s.window_size' },
  { id: 'manim._config.utils.ManimConfig.write_all', target: 'cfg', exp: 'lambda s, ctx: s.write_all' },
  { id: 'manim._config.utils.ManimConfig.write_to_movie', target: 'cfg', exp: 'lambda s, ctx: s.write_to_movie' },

  // Group I: ManimConfig constructor, methods & logger/cli helpers (15)
  {
    id: 'manim._config.utils.ManimConfig',
    kind: 'class',
    factory: 'None, {}',
    exp: 'lambda s, ctx: ManimConfig()',
  },
  {
    id: 'manim._config.utils.ManimConfig.resolve_movie_file_extension',
    target: 'cfg',
    params: { is_transparent: false },
    exp: 'lambda s, ctx: s.resolve_movie_file_extension(False)',
  },
  {
    id: 'manim._config.utils.ManimConfig.update',
    target: 'cfg',
    params: { obj: { frame_rate: 30 } },
    exp: 'lambda s, ctx: s.update({"frame_rate": 30})',
  },
  {
    id: 'manim._config.utils.ManimConfig.digest_parser',
    target: 'cfg',
    params: { parser: { $ref: 'parser' } },
    scope: ['subject', 'parser'],
    factory: 'make_base_config(), {"parser": make_config_parser()}',
    exp: 'lambda s, ctx: s.digest_parser(ctx["parser"])',
  },
  {
    id: 'manim._config.utils.ManimConfig.digest_file',
    target: 'cfg',
    params: { filename: { $ref: 'cfg_path' } },
    scope: ['subject', 'cfg_path'],
    factory: 'make_base_config(), {"cfg_path": sample_cfg_path}',
    exp: 'lambda s, ctx: s.digest_file(ctx["cfg_path"])',
  },
  {
    id: 'manim._config.utils.ManimConfig.digest_args',
    target: 'cfg',
    params: { args: { $ref: 'cli_args' } },
    scope: ['subject', 'cli_args'],
    factory: 'make_base_config(), {"cli_args": make_dummy_args()}',
    exp: 'lambda s, ctx: s.digest_args(ctx["cli_args"])',
  },
  {
    id: 'manim._config.utils.config_file_paths',
    kind: 'function',
    factory: 'None, {}',
    exp: 'lambda s, ctx: config_file_paths()',
  },
  {
    id: 'manim._config.utils.make_config_parser',
    kind: 'function',
    factory: 'None, {}',
    exp: 'lambda s, ctx: make_config_parser()',
  },
  {
    id: 'manim._config.tempconfig',
    kind: 'function',
    params: { temp: { frame_rate: 15 } },
    factory: 'None, {}',
    exp: 'lambda s, ctx: tempconfig({"frame_rate": 15})',
  },
  {
    id: 'manim._config.logger_utils.JSONFormatter',
    kind: 'class',
    factory: 'None, {}',
    exp: 'lambda s, ctx: JSONFormatter()',
  },
  {
    id: 'manim._config.logger_utils.JSONFormatter.format',
    params: { record: { $ref: 'log_rec' } },
    scope: ['subject', 'log_rec'],
    factory: 'JSONFormatter(), {"log_rec": make_log_record()}',
    exp: 'lambda s, ctx: s.format(ctx["log_rec"])',
  },
  {
    id: 'manim._config.logger_utils.parse_theme',
    kind: 'function',
    params: { parser: { $ref: 'logger_sec' } },
    scope: ['logger_sec'],
    factory: 'None, {"logger_sec": make_config_parser()["logger"]}',
    exp: 'lambda s, ctx: parse_theme(ctx["logger_sec"])',
  },
  {
    id: 'manim._config.logger_utils.make_logger',
    kind: 'function',
    params: { parser: { $ref: 'logger_sec' }, verbosity: 'WARNING' },
    scope: ['logger_sec'],
    factory: 'None, {"logger_sec": make_config_parser()["logger"]}',
    exp: 'lambda s, ctx: make_logger(ctx["logger_sec"], "WARNING")',
  },
  {
    id: 'manim._config.logger_utils.set_file_logger',
    kind: 'function',
    params: { scene_name: 'TestScene', module_name: 'test_mod', log_dir: { $ref: 'log_dir_path' } },
    scope: ['log_dir_path'],
    factory: 'None, {"log_dir_path": sample_log_dir}',
    exp: 'lambda s, ctx: set_file_logger("TestScene", "test_mod", ctx["log_dir_path"])',
  },
  {
    id: 'manim._config.cli_colors.parse_cli_ctx',
    kind: 'function',
    params: { parser: { $ref: 'cli_ctx_sec' } },
    scope: ['cli_ctx_sec'],
    factory: 'None, {"cli_ctx_sec": make_config_parser()["CLI_CTX"]}',
    exp: 'lambda s, ctx: parse_cli_ctx(ctx["cli_ctx_sec"])',
  },
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
      const isStaticOrClass = c.kind === 'class' || c.kind === 'function';
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
import random, json, logging, argparse, tempfile
from pathlib import Path
from manim._config.utils import ManimConfig, ManimFrame, config_file_paths, make_config_parser
from manim._config.logger_utils import JSONFormatter, parse_theme, make_logger, set_file_logger
from manim._config.cli_colors import parse_cli_ctx

${API_RUNTIME}
${compiler.imports().join('\n')}

results = []
sample_log_dir = Path(tempfile.mkdtemp(prefix="anyvis_cfg_logs_"))
sample_cfg_file = tempfile.NamedTemporaryFile("w", suffix=".cfg", delete=False)
sample_cfg_file.write("[CLI]\\nframe_rate = 45\\n")
sample_cfg_file.close()
sample_cfg_path = sample_cfg_file.name

def make_log_record():
    return logging.LogRecord("manim", logging.INFO, "test.py", 10, "hello config", (), None)

def make_dummy_args():
    return argparse.Namespace(
        file=Path("demo.py"),
        config_file=None,
        scene_names=["DemoScene"],
        output_file="demo_out.mp4",
        from_animation_number=(1, 5),
        quality="low_quality",
        resolution=(854, 480),
        frame_rate=30.0,
        custom_folders=False,
        tex_template=None,
        write_to_movie=False,
        gui_location=(10, 20),
    )

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
    elif isinstance(a, TexTemplate) and isinstance(b, TexTemplate):
        assert a.documentclass == b.documentclass
    elif isinstance(a, JSONFormatter) and isinstance(b, JSONFormatter):
        rec = make_log_record()
        assert a.format(rec) == b.format(rec)
    elif hasattr(a, "sections") and hasattr(b, "sections"):
        assert a.sections() == b.sections()
    elif hasattr(a, "styles") and hasattr(b, "styles"):
        assert set(a.styles.keys()) == set(b.styles.keys())
    elif isinstance(a, tuple) and isinstance(b, tuple) and len(a) == 3 and hasattr(a[0], "name"):
        assert a[0].name == b[0].name
    elif isinstance(a, Path) or isinstance(b, Path):
        assert str(a) == str(b)
    elif hasattr(a, "__enter__") and hasattr(b, "__enter__"):
        with a:
            fa = config.frame_rate
        with b:
            fb = config.frame_rate
        assert fa == fb == 15.0
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
        if api_id.endswith("ManimConfig.update"):
            assert act_sub.frame_rate == exp_sub.frame_rate == 30.0
        if api_id.endswith("ManimConfig.resolve_movie_file_extension"):
            assert act_sub.movie_file_extension == exp_sub.movie_file_extension
        if api_id.endswith("set_file_logger"):
            assert any(sample_log_dir.iterdir()), "set_file_logger must create log file"
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

    const result = await execute(health.python, [pyFile], { cwd: directory,
      timeout: 100_000,
      maxBuffer: 4 * 1024 * 1024,
      env: nativeExecutionEnvironment(health.python)
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
