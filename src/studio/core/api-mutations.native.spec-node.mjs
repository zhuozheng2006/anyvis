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

const mutationCases = [
  // Group A: Mobject transforms & positioning (20)
  { id: 'manim.mobject.mobject.Mobject.center', params: {}, factory: 'Square().shift(LEFT*2 + UP)', exp: 's.center()' },
  { id: 'manim.mobject.mobject.Mobject.align_to', params: { mobject_or_point: { $ref: 'target' }, direction: { $array: [1, 0, 0] } }, factory: 'Square()', ctx: '{ "target": Circle().shift(RIGHT*3) }', ctxVars: ['target'], exp: 's.align_to(ctx["target"], RIGHT)' },
  { id: 'manim.mobject.mobject.Mobject.align_on_border', params: { direction: { $array: [0, 1, 0] }, buff: 0.5 }, factory: 'Square()', exp: 's.align_on_border(UP, buff=0.5)' },
  { id: 'manim.mobject.mobject.Mobject.to_edge', params: { edge: { $array: [0, 1, 0] }, buff: 0.5 }, factory: 'Square()', exp: 's.to_edge(UP, buff=0.5)' },
  { id: 'manim.mobject.mobject.Mobject.to_corner', params: { corner: { $array: [-1, 1, 0] }, buff: 0.5 }, factory: 'Square()', exp: 's.to_corner(UL, buff=0.5)' },
  { id: 'manim.mobject.mobject.Mobject.next_to', params: { mobject_or_point: { $ref: 'target' }, direction: { $array: [1, 0, 0] }, buff: 0.5 }, factory: 'Square()', ctx: '{ "target": Circle() }', ctxVars: ['target'], exp: 's.next_to(ctx["target"], RIGHT, buff=0.5)' },
  { id: 'manim.mobject.mobject.Mobject.shift_onto_screen', params: {}, factory: 'Square().shift(RIGHT*20)', exp: 's.shift_onto_screen()' },
  { id: 'manim.mobject.mobject.Mobject.stretch', params: { factor: 2.0, dim: 0 }, factory: 'Square()', exp: 's.stretch(2.0, 0)' },
  { id: 'manim.mobject.mobject.Mobject.rescale_to_fit', params: { length: 3.0, dim: 0 }, factory: 'Square()', exp: 's.rescale_to_fit(3.0, 0)' },
  { id: 'manim.mobject.mobject.Mobject.match_width', params: { mobject: { $ref: 'target' } }, factory: 'Square()', ctx: '{ "target": Rectangle(width=5.0, height=3.0) }', ctxVars: ['target'], exp: 's.match_width(ctx["target"])' },
  { id: 'manim.mobject.mobject.Mobject.match_height', params: { mobject: { $ref: 'target' } }, factory: 'Square()', ctx: '{ "target": Rectangle(width=5.0, height=3.0) }', ctxVars: ['target'], exp: 's.match_height(ctx["target"])' },
  { id: 'manim.mobject.mobject.Mobject.match_depth', params: { mobject: { $ref: 'target' } }, factory: 'Square()', ctx: '{ "target": Rectangle(width=5.0, height=3.0) }', ctxVars: ['target'], exp: 's.match_depth(ctx["target"])' },
  { id: 'manim.mobject.mobject.Mobject.match_dim_size', params: { mobject: { $ref: 'target' }, dim: 0 }, factory: 'Square()', ctx: '{ "target": Rectangle(width=5.0, height=3.0) }', ctxVars: ['target'], exp: 's.match_dim_size(ctx["target"], 0)' },
  { id: 'manim.mobject.mobject.Mobject.match_x', params: { mobject: { $ref: 'target' } }, factory: 'Square()', ctx: '{ "target": Circle().shift(RIGHT*2) }', ctxVars: ['target'], exp: 's.match_x(ctx["target"])' },
  { id: 'manim.mobject.mobject.Mobject.match_y', params: { mobject: { $ref: 'target' } }, factory: 'Square()', ctx: '{ "target": Circle().shift(UP*2) }', ctxVars: ['target'], exp: 's.match_y(ctx["target"])' },
  { id: 'manim.mobject.mobject.Mobject.match_z', params: { mobject: { $ref: 'target' } }, factory: 'Square()', ctx: '{ "target": Circle().shift(OUT*2) }', ctxVars: ['target'], exp: 's.match_z(ctx["target"])' },
  { id: 'manim.mobject.mobject.Mobject.match_coord', params: { mobject: { $ref: 'target' }, dim: 0 }, factory: 'Square()', ctx: '{ "target": Circle().shift(RIGHT*2) }', ctxVars: ['target'], exp: 's.match_coord(ctx["target"], 0)' },
  { id: 'manim.mobject.mobject.Mobject.set_coord', params: { value: 2.5, dim: 0 }, factory: 'Square()', exp: 's.set_coord(2.5, 0)' },
  { id: 'manim.mobject.mobject.Mobject.apply_matrix', params: { matrix: { $array: [[2, 0, 0], [0, 3, 0], [0, 0, 1]] } }, factory: 'Square()', exp: 's.apply_matrix(np.array([[2, 0, 0], [0, 3, 0], [0, 0, 1]]))' },
  { id: 'manim.mobject.mobject.Mobject.rotate_about_origin', params: { angle: 1.5707963267948966 }, factory: 'Square().shift(RIGHT)', exp: 's.rotate_about_origin(PI/2)' },

  // Group B: Mobject points & geometry alignment (9)
  { id: 'manim.mobject.mobject.Mobject.match_points', params: { mobject: { $ref: 'target' } }, factory: 'Square()', ctx: '{ "target": Circle() }', ctxVars: ['target'], exp: 's.match_points(ctx["target"])' },
  { id: 'manim.mobject.mobject.Mobject.become', params: { mobject: { $ref: 'target' } }, factory: 'Square()', ctx: '{ "target": Circle().set_color(RED) }', ctxVars: ['target'], exp: 's.become(ctx["target"])' },
  { id: 'manim.mobject.mobject.Mobject.reverse_points', params: {}, factory: 'Square()', exp: 's.reverse_points()' },
  { id: 'manim.mobject.mobject.Mobject.reset_points', params: {}, factory: 'Square()', exp: 's.reset_points()' },
  { id: 'manim.mobject.mobject.Mobject.align_data', params: { mobject: { $ref: 'target' } }, factory: 'Square()', ctx: '{ "target": Circle() }', ctxVars: ['target'], exp: 's.align_data(ctx["target"])' },
  { id: 'manim.mobject.mobject.Mobject.apply_function_to_position', params: { function: { $lambda: { params: ['p'], body: { $expr: 'p + 1' } } } }, factory: 'Square().shift(RIGHT)', exp: 's.apply_function_to_position(lambda p: p + 1)' },
  { id: 'manim.mobject.mobject.Mobject.apply_function_to_submobject_positions', params: { function: { $lambda: { params: ['p'], body: { $expr: 'p + 1' } } } }, factory: 'VGroup(Square(), Circle())', exp: 's.apply_function_to_submobject_positions(lambda p: p + 1)' },
  { id: 'manim.mobject.mobject.Mobject.apply_points_function_about_point', params: { func: { $lambda: { params: ['pts'], body: { $expr: 'pts * 2' } } }, about_point: { $array: [0, 0, 0] } }, factory: 'Square()', exp: 's.apply_points_function_about_point(lambda pts: pts * 2, about_point=ORIGIN)' },
  { id: 'manim.mobject.mobject.Mobject.replace', params: { mobject: { $ref: 'target' } }, factory: 'Square()', ctx: '{ "target": Circle().shift(RIGHT*2).scale(2) }', ctxVars: ['target'], exp: 's.replace(ctx["target"])' },

  // Group C: Submobjects & structure (14)
  { id: 'manim.mobject.mobject.Mobject.add_to_back', params: { mobjects: [{ $ref: 'target' }] }, factory: 'VGroup(Square())', ctx: '{ "target": Circle() }', ctxVars: ['target'], exp: 's.add_to_back(ctx["target"])' },
  { id: 'manim.mobject.mobject.Mobject.insert', params: { index: 1, mobject: { $ref: 'target' } }, factory: 'VGroup(Square(), Dot())', ctx: '{ "target": Circle() }', ctxVars: ['target'], exp: 's.insert(1, ctx["target"])' },
  { id: 'manim.mobject.mobject.Mobject.add_n_more_submobjects', params: { n: 2 }, factory: 'VGroup(Square(), Circle())', exp: 's.add_n_more_submobjects(2)' },
  { id: 'manim.mobject.mobject.Mobject.arrange_submobjects', params: {}, factory: 'VGroup(Square(), Circle())', exp: 's.arrange_submobjects(direction=RIGHT)' },
  { id: 'manim.mobject.mobject.Mobject.align_submobjects', params: { mobject: { $ref: 'target' } }, factory: 'VGroup(Square())', ctx: '{ "target": VGroup(Square(), Circle()) }', ctxVars: ['target'], exp: 's.align_submobjects(ctx["target"])' },
  { id: 'manim.mobject.mobject.Mobject.shuffle_submobjects', params: {}, factory: 'VGroup(Square().shift(LEFT), Circle().shift(RIGHT))', exp: 's.shuffle_submobjects()' },
  { id: 'manim.mobject.mobject.Mobject.shuffle', params: {}, factory: 'VGroup(Square().shift(LEFT), Circle().shift(RIGHT))', exp: 's.shuffle()' },
  { id: 'manim.mobject.mobject.Mobject.sort', params: {}, factory: 'VGroup(Square().shift(RIGHT), Circle().shift(LEFT))', exp: 's.sort()' },
  { id: 'manim.mobject.mobject.Mobject.space_out_submobjects', params: { factor: 2.0 }, factory: 'VGroup(Square().shift(LEFT), Circle().shift(RIGHT))', exp: 's.space_out_submobjects(2.0)' },
  { id: 'manim.mobject.mobject.Mobject.invert', params: {}, factory: 'VGroup(Square(), Circle())', exp: 's.invert()' },
  { id: 'manim.mobject.mobject.Mobject.repeat', params: { count: 3 }, factory: 'Square()', exp: 's.repeat(3)' },
  { id: 'manim.mobject.mobject.Mobject.nonempty_submobjects', mode: 'store', params: {}, factory: 'VGroup(Square(), VGroup())', exp: 's.nonempty_submobjects()' },
  { id: 'manim.mobject.mobject.Mobject.push_self_into_submobjects', params: {}, factory: 'Square()', exp: 's.push_self_into_submobjects()' },
  { id: 'manim.mobject.mobject.Mobject.surround', params: { mobject: { $ref: 'target' } }, factory: 'Square()', ctx: '{ "target": Circle().shift(RIGHT*2) }', ctxVars: ['target'], exp: 's.surround(ctx["target"])' },

  // Group D: Styles & colors (9)
  { id: 'manim.mobject.mobject.Mobject.fade', params: { darkness: 0.5 }, factory: 'Square().set_opacity(1.0)', exp: 's.fade(0.5)' },
  { id: 'manim.mobject.mobject.Mobject.match_color', params: { mobject: { $ref: 'target' } }, factory: 'Square().set_color(WHITE)', ctx: '{ "target": Circle().set_color(RED) }', ctxVars: ['target'], exp: 's.match_color(ctx["target"])' },
  { id: 'manim.mobject.mobject.Mobject.interpolate_color', params: { mobject1: { $ref: 'm1' }, mobject2: { $ref: 'm2' }, alpha: 0.5 }, factory: 'Square()', ctx: '{ "m1": Square().set_color(WHITE), "m2": Square().set_color(BLACK) }', ctxVars: ['m1', 'm2'], exp: 's.interpolate_color(ctx["m1"], ctx["m2"], 0.5)' },
  { id: 'manim.mobject.mobject.Mobject.set_submobject_colors_by_gradient', params: { colors: ['#FF0000', '#00FF00', '#0000FF'] }, factory: 'VGroup(Square(), Circle(), Dot())', exp: 's.set_submobject_colors_by_gradient(RED, GREEN, BLUE)' },
  { id: 'manim.mobject.mobject.Mobject.add_background_rectangle', params: { color: '#000000', opacity: 0.8 }, factory: 'Square()', exp: 's.add_background_rectangle(color=BLACK, opacity=0.8)' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.set_opacity', params: { opacity: 0.4 }, factory: 'Circle()', exp: 's.set_opacity(0.4)' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.set_background_stroke', params: { kwargs: { color: '#FFFF00', width: 5.0 } }, factory: 'Circle()', exp: 's.set_background_stroke(color=YELLOW, width=5.0)' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.set_sheen_direction', params: { direction: { $array: [0, 1, 0] } }, factory: 'Circle()', exp: 's.set_sheen_direction(UP)' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.rotate_sheen_direction', params: { angle: 0.7853981633974483 }, factory: 'Circle()', exp: 's.rotate_sheen_direction(PI/4)' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.set_cap_style', params: { cap_style: { $ref: 'ROUND' } }, factory: 'Circle()', ctx: '{ "ROUND": CapStyleType.ROUND }', ctxVars: ['ROUND'], exp: 's.set_cap_style(CapStyleType.ROUND)' },

  // Group E: VMobject paths & curves (13)
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.start_new_path', params: { point: { $array: [0, 0, 0] } }, factory: 'VMobject()', exp: 's.start_new_path(ORIGIN)' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.add_cubic_bezier_curve', params: { anchor1: { $array: [0,0,0] }, handle1: { $array: [0,1,0] }, handle2: { $array: [1,1,0] }, anchor2: { $array: [1,0,0] } }, factory: 'VMobject().start_new_path(ORIGIN)', exp: 's.add_cubic_bezier_curve(ORIGIN, UP, RIGHT+UP, RIGHT)' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.add_quadratic_bezier_curve_to', params: { handle: { $array: [0,1,0] }, anchor: { $array: [1,0,0] } }, factory: 'VMobject().start_new_path(ORIGIN)', exp: 's.add_quadratic_bezier_curve_to(UP, RIGHT)' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.add_points_as_corners', params: { points: { $array: [[0,1,0], [1,0,0]] } }, factory: 'VMobject().start_new_path(ORIGIN)', exp: 's.add_points_as_corners([UP, RIGHT])' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.add_subpath', params: { points: { $array: [[0,0,0], [0,1,0], [1,1,0], [1,0,0]] } }, factory: 'VMobject()', exp: 's.add_subpath([ORIGIN, UP, RIGHT+UP, RIGHT])' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.clear_points', params: {}, factory: 'Circle()', exp: 's.clear_points()' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.append_points', params: { new_points: { $array: [[1,0,0], [2,0,0], [3,0,0]] } }, factory: 'VMobject()', exp: 's.append_points(np.array([[1, 0, 0], [2, 0, 0], [3, 0, 0]]))' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.append_vectorized_mobject', params: { vectorized_mobject: { $ref: 'target' } }, factory: 'Square()', ctx: '{ "target": Circle() }', ctxVars: ['target'], exp: 's.append_vectorized_mobject(ctx["target"])' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.reverse_direction', params: {}, factory: 'Circle()', exp: 's.reverse_direction()' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.make_smooth', params: {}, factory: 'VMobject().start_new_path(ORIGIN).add_points_as_corners([UP, RIGHT])', exp: 's.make_smooth()' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.make_jagged', params: {}, factory: 'Circle()', exp: 's.make_jagged()' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.insert_n_curves', params: { n: 5 }, factory: 'Circle()', exp: 's.insert_n_curves(5)' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.resize_points', params: { new_length: 32 }, factory: 'Circle()', exp: 's.resize_points(32)' },

  // Group F: Parameterized queries & measurements (10)
  { id: 'manim.mobject.mobject.Mobject.get_boundary_point', mode: 'store', params: { direction: { $array: [1, 0, 0] } }, factory: 'Square(side_length=2.0)', exp: 's.get_boundary_point(RIGHT)' },
  { id: 'manim.mobject.mobject.Mobject.get_edge_center', mode: 'store', params: { direction: { $array: [0, 1, 0] } }, factory: 'Square(side_length=2.0)', exp: 's.get_edge_center(UP)' },
  { id: 'manim.mobject.mobject.Mobject.get_coord', mode: 'store', params: { dim: 0, direction: { $array: [1, 0, 0] } }, factory: 'Square(side_length=2.0)', exp: 's.get_coord(0, RIGHT)' },
  { id: 'manim.mobject.mobject.Mobject.length_over_dim', mode: 'store', params: { dim: 0 }, factory: 'Square(side_length=2.0)', exp: 's.length_over_dim(0)' },
  { id: 'manim.mobject.mobject.Mobject.point_from_proportion', mode: 'store', params: { alpha: 0.5 }, factory: 'Square(side_length=2.0)', exp: 's.point_from_proportion(0.5)' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.proportion_from_point', mode: 'store', params: { point: { $array: [1, 0, 0] } }, factory: 'Circle()', exp: 's.proportion_from_point(np.array([1, 0, 0]))' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.get_nth_curve_points', mode: 'store', params: { n: 0 }, factory: 'Circle()', exp: 's.get_nth_curve_points(0)' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.get_nth_curve_length', mode: 'store', params: { n: 0 }, factory: 'Circle()', exp: 's.get_nth_curve_length(0)' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.get_subcurve', mode: 'store', params: { a: 0.25, b: 0.75 }, factory: 'Circle()', exp: 's.get_subcurve(0.25, 0.75)' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.consider_points_equals', mode: 'store', params: { p0: { $array: [0, 0, 0] }, p1: { $array: [0, 0, 0] } }, factory: 'Circle()', exp: 's.consider_points_equals(np.array([0, 0, 0]), np.array([0, 0, 0]))' },

  // Group G: Specific geometry methods (13)
  { id: 'manim.mobject.geometry.line.Line.put_start_and_end_on', params: { start: { $array: [-2, 0, 0] }, end: { $array: [2, 0, 0] } }, factory: 'Line(LEFT, RIGHT)', exp: 's.put_start_and_end_on(LEFT*2, RIGHT*2)' },
  { id: 'manim.mobject.geometry.line.Line.set_points_by_ends', params: { start: { $array: [0, 1, 0] }, end: { $array: [0, -1, 0] } }, factory: 'Line(LEFT, RIGHT)', exp: 's.set_points_by_ends(UP, DOWN)' },
  { id: 'manim.mobject.geometry.line.Line.set_angle', params: { angle: 1.0471975511965976 }, factory: 'Line(ORIGIN, RIGHT)', exp: 's.set_angle(PI/3)' },
  { id: 'manim.mobject.geometry.line.Line.set_length', params: { length: 4.0 }, factory: 'Line(ORIGIN, RIGHT)', exp: 's.set_length(4.0)' },
  { id: 'manim.mobject.geometry.line.Line.set_path_arc', params: { new_value: 1.5707963267948966 }, factory: 'Line(LEFT, RIGHT)', exp: 's.set_path_arc(PI/2)' },
  { id: 'manim.mobject.geometry.line.Line.get_projection', mode: 'store', params: { point: { $array: [0.5, 1, 0] } }, factory: 'Line(LEFT, RIGHT)', exp: 's.get_projection(UP + RIGHT*0.5)' },
  { id: 'manim.mobject.geometry.arc.Arc.move_arc_center_to', params: { point: { $array: [1, 0, 0] } }, factory: 'Arc(radius=2.0)', exp: 's.move_arc_center_to(RIGHT)' },
  { id: 'manim.mobject.geometry.arc.Arc.stop_angle', mode: 'store', params: {}, factory: 'Arc(start_angle=0, angle=PI/2)', exp: 's.stop_angle()' },
  { id: 'manim.mobject.geometry.arc.Circle.from_three_points', isStatic: true, mode: 'store', params: { p1: { $array: [-1, 0, 0] }, p2: { $array: [0, 1, 0] }, p3: { $array: [1, 0, 0] } }, factory: 'None', exp: 'Circle.from_three_points(LEFT, UP, RIGHT)' },
  { id: 'manim.mobject.geometry.arc.Circle.surround', params: { mobject: { $ref: 'target' } }, factory: 'Circle()', ctx: '{ "target": Square(side_length=2.0) }', ctxVars: ['target'], exp: 's.surround(ctx["target"])' },
  { id: 'manim.mobject.geometry.arc.TipableVMobject.add_tip', params: {}, factory: 'Line(LEFT, RIGHT)', exp: 's.add_tip()' },
  { id: 'manim.mobject.geometry.arc.TipableVMobject.pop_tips', params: {}, factory: 'Arrow(LEFT, RIGHT)', exp: 's.pop_tips()' },
  { id: 'manim.mobject.geometry.polygram.Polygram.round_corners', params: { radius: 0.2 }, factory: 'Polygon(LEFT, UP, RIGHT)', exp: 's.round_corners(radius=0.2)' }
];

test('native mutations match independent direct Python calls', { timeout: 120_000 }, async t => {
  const health = await discoverPython();
  if (!health.available) {
    t.skip('Manim required');
    return;
  }

  const directory = await mkdtemp(path.join(tmpdir(), 'anyvis-api-mutations-'));
  try {
    const compiler = createApiCompiler();
    const pyProbes = [];
    const pyRuns = [];

    mutationCases.forEach((c, idx) => {
      const entry = getApiEntry(c.id);
      assert.ok(entry, `Entry not found for ${c.id}`);
      const mode = c.mode || 'mutate';
      const actionFields = c.isStatic ? { mode } : { receiver: 'subject', mode };
      for (const [k, v] of Object.entries(c.params)) {
        actionFields[`p_${k}`] = JSON.stringify(v);
      }
      const action = createAction(entry.type, actionFields);
      const scope = new Set(c.isStatic ? (c.ctxVars || []) : ['subject', ...(c.ctxVars || [])]);
      const compiled = compiler.compile(action, entry, scope, {});

      pyProbes.push(`def probe_${idx}(subject, context):
    objects = {${c.isStatic ? '' : '"subject": subject, '}**context}
${compiled.prelude.map(l => '    ' + l).join('\n')}
    return ${compiled.expression}
`);
      pyRuns.push(`run_case(${JSON.stringify(c.id)}, lambda: (${c.factory}, ${c.ctx || '{}'}), lambda s, ctx: ${c.exp}, probe_${idx})`);
    });

    const runner = `
from manim import *
import numpy as np
import random, json

${API_RUNTIME}
${compiler.imports().join('\n')}

results = []

def compare_postconditions(exp_sub, exp_res, act_sub, act_res):
    if exp_sub is not None:
        assert act_sub is not None
        assert type(act_sub) is type(exp_sub)
        np.testing.assert_allclose(act_sub.get_all_points(), exp_sub.get_all_points(), atol=1e-5)
        assert len(act_sub.submobjects) == len(exp_sub.submobjects)
        for c_act, c_exp in zip(act_sub.submobjects, exp_sub.submobjects):
            assert type(c_act) is type(c_exp)
            np.testing.assert_allclose(c_act.get_all_points(), c_exp.get_all_points(), atol=1e-5)
        if isinstance(exp_sub, VMobject):
            assert act_sub.get_fill_color() == exp_sub.get_fill_color()
            assert np.isclose(act_sub.get_fill_opacity(), exp_sub.get_fill_opacity(), atol=1e-4)
            assert act_sub.get_stroke_color() == exp_sub.get_stroke_color()
            assert np.isclose(act_sub.get_stroke_width(), exp_sub.get_stroke_width(), atol=1e-4)
            assert np.isclose(act_sub.get_stroke_opacity(), exp_sub.get_stroke_opacity(), atol=1e-4)
        elif hasattr(exp_sub, "color") and hasattr(act_sub, "color"):
            assert act_sub.color == exp_sub.color

    if exp_res is exp_sub:
        assert act_res is act_sub
    elif exp_res is None:
        assert act_res is None
    elif isinstance(exp_res, (bool, np.bool_)):
        assert bool(act_res) == bool(exp_res)
    elif isinstance(exp_res, (int, float, np.number)):
        assert np.isclose(float(act_res), float(exp_res), atol=1e-5)
    elif isinstance(exp_res, np.ndarray):
        np.testing.assert_allclose(act_res, exp_res, atol=1e-5)
    elif isinstance(exp_res, (list, tuple)):
        assert len(act_res) == len(exp_res)
        for a, b in zip(act_res, exp_res):
            if isinstance(b, np.ndarray):
                np.testing.assert_allclose(a, b, atol=1e-5)
            elif isinstance(b, (int, float, np.number)):
                assert np.isclose(float(a), float(b), atol=1e-5)
            elif isinstance(b, Mobject):
                np.testing.assert_allclose(a.get_all_points(), b.get_all_points(), atol=1e-5)
            else:
                assert a == b
    elif isinstance(exp_res, Mobject):
        assert type(act_res) is type(exp_res)
        np.testing.assert_allclose(act_res.get_all_points(), exp_res.get_all_points(), atol=1e-5)
    else:
        assert act_res == exp_res

def run_case(api_id, factory, expected_fn, compiled_probe):
    np.random.seed(42); random.seed(42)
    try:
        exp_sub, exp_ctx = factory()
        exp_res = expected_fn(exp_sub, exp_ctx)
    except Exception as error:
        results.append({"apiId": api_id, "status": "fixture_gap", "reason": type(error).__name__ + ": " + str(error)[:250]})
        return

    np.random.seed(42); random.seed(42)
    try:
        act_sub, act_ctx = factory()
        act_res = compiled_probe(act_sub, act_ctx)
        compare_postconditions(exp_sub, exp_res, act_sub, act_res)
        results.append({"apiId": api_id, "status": "verified"})
    except Exception as error:
        results.append({"apiId": api_id, "status": "failed", "reason": type(error).__name__ + ": " + str(error)[:250]})

${pyProbes.join('\n')}

with tempconfig({"renderer": "cairo", "media_dir": "media", "verbosity": "ERROR"}):
${pyRuns.map(r => '    ' + r).join('\n')}

print("ANYVIS_MUTATIONS " + json.dumps(results))
`;

    const pyFile = path.join(directory, 'mutations.py');
    await writeFile(pyFile, runner);

    const result = await execute(health.python, [pyFile], {
      cwd: directory,
      timeout: 100_000,
      maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, PATH: `${path.dirname(health.python)}:/Library/TeX/texbin:${process.env.PATH || ''}` }
    });

    const line = result.stdout.split('\n').find(l => l.startsWith('ANYVIS_MUTATIONS '));
    assert.ok(line, result.stdout);
    const outcomes = JSON.parse(line.slice('ANYVIS_MUTATIONS '.length));
    const failures = outcomes.filter(o => o.status === 'failed');
    const verified = outcomes.filter(o => o.status === 'verified').map(o => o.apiId).sort();
    const gaps = outcomes.filter(o => o.status === 'fixture_gap');

    t.diagnostic(`${verified.length} native mutations verified; ${gaps.length} explicit fixture gaps; ${failures.length} adapter failures.`);

    const reportPath = process.env.ANYVIS_API_MUTATIONS_REPORT || path.resolve('artifacts/api/native-mutations-evidence.json');
    const fixture = 'src/studio/core/api-mutations.native.spec-node.mjs';
    const registry = await readFile(new URL('./api-registry.json', import.meta.url));
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(
      reportPath,
      JSON.stringify(
        {
          fixture,
          sourceFiles: await apiEvidenceSources(fixture),
          registrySha256: createHash('sha256').update(registry).digest('hex'),
          passed: failures.length === 0,
          engineVersion: health.version,
          renderer: 'cairo',
          apiIds: verified,
          outcomes,
          checks: 'Actual compiled calls compared to direct native calls on equivalent concrete fixtures; points, submobjects, style, colors, and return identity. Fixture gaps are not counted.'
        },
        null,
        2
      ) + '\n'
    );

    assert.deepEqual(failures, []);
    assert.ok(verified.length >= 60, `Expected at least 60 verified APIs, got ${verified.length}`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
