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
  { id: 'manim.mobject.geometry.polygram.Polygram.round_corners', params: { radius: 0.2 }, factory: 'Polygon(LEFT, UP, RIGHT)', exp: 's.round_corners(radius=0.2)' },

  // Group H: VMobject curves, styling & subpaths (28)
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.add_smooth_curve_to', params: { points: [{ $array: [1, 1, 0] }] }, factory: 'VMobject().start_new_path(ORIGIN).add_line_to(RIGHT)', exp: 's.add_smooth_curve_to(np.array([1, 1, 0]))' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.gen_cubic_bezier_tuples_from_points', mode: 'store', params: { points: { $ref: 'pts' } }, factory: 'Circle()', ctx: '{ "pts": Circle().points }', ctxVars: ['pts'], exp: 'list(s.gen_cubic_bezier_tuples_from_points(ctx["pts"]))' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.get_cubic_bezier_tuples_from_points', mode: 'store', params: { points: { $ref: 'pts' } }, factory: 'Circle()', ctx: '{ "pts": Circle().points }', ctxVars: ['pts'], exp: 's.get_cubic_bezier_tuples_from_points(ctx["pts"])' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.get_nth_curve_function', mode: 'store', params: { n: 0 }, factory: 'Circle()', exp: 's.get_nth_curve_function(0)' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.get_nth_curve_function_with_length', mode: 'store', params: { n: 0 }, factory: 'Circle()', exp: 's.get_nth_curve_function_with_length(0)' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.get_nth_curve_length_pieces', mode: 'store', params: { n: 0 }, factory: 'Circle()', exp: 's.get_nth_curve_length_pieces(0)' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.gen_subpaths_from_points_2d', mode: 'store', params: { points: { $ref: 'pts' } }, factory: 'Circle()', ctx: '{ "pts": Circle().points }', ctxVars: ['pts'], exp: 'list(s.gen_subpaths_from_points_2d(ctx["pts"]))' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.get_subpaths_from_points', mode: 'store', params: { points: { $ref: 'pts' } }, factory: 'Circle()', ctx: '{ "pts": Circle().points }', ctxVars: ['pts'], exp: 's.get_subpaths_from_points(ctx["pts"])' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.insert_n_curves_to_point_list', mode: 'store', params: { n: 3, points: { $ref: 'pts' } }, factory: 'Circle()', ctx: '{ "pts": Circle().points }', ctxVars: ['pts'], exp: 's.insert_n_curves_to_point_list(3, ctx["pts"])' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.pointwise_become_partial', params: { vmobject: { $ref: 'target' }, a: 0.2, b: 0.8 }, factory: 'Circle()', ctx: '{ "target": Square() }', ctxVars: ['target'], exp: 's.pointwise_become_partial(ctx["target"], 0.2, 0.8)' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.set_anchors_and_handles', params: { anchors1: { $array: [[0,0,0]] }, handles1: { $array: [[0,1,0]] }, handles2: { $array: [[1,1,0]] }, anchors2: { $array: [[1,0,0]] } }, factory: 'VMobject()', exp: 's.set_anchors_and_handles(np.array([[0,0,0]]), np.array([[0,1,0]]), np.array([[1,1,0]]), np.array([[1,0,0]]))' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.scale_handle_to_anchor_distances', params: { factor: 1.5 }, factory: 'Circle()', exp: 's.scale_handle_to_anchor_distances(1.5)' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.force_direction', params: { target_direction: 'CCW' }, factory: 'Circle()', exp: 's.force_direction("CCW")' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.change_anchor_mode', params: { mode: 'jagged' }, factory: 'Circle()', exp: 's.change_anchor_mode("jagged")' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.consider_points_equals_2d', mode: 'store', params: { p0: { $array: [1, 0, 0] }, p1: { $array: [1, 0, 5] } }, factory: 'Circle()', exp: 's.consider_points_equals_2d(np.array([1, 0, 0]), np.array([1, 0, 5]))' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.align_points', params: { vmobject: { $ref: 'target' } }, factory: 'Line(LEFT, RIGHT)', ctx: '{ "target": Square() }', ctxVars: ['target'], exp: 's.align_points(ctx["target"])' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.align_rgbas', params: { vmobject: { $ref: 'target' } }, factory: 'Circle()', ctx: '{ "target": Square() }', ctxVars: ['target'], exp: 's.align_rgbas(ctx["target"])' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.generate_rgbas_array', mode: 'store', params: { color: '#FF0000', opacity: 0.5 }, factory: 'Circle()', exp: 's.generate_rgbas_array(ManimColor("#FF0000"), 0.5)' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.update_rgbas_array', params: { array_name: 'fill_rgba', color: '#0000FF', opacity: 0.8 }, factory: 'Circle()', exp: 's.update_rgbas_array("fill_rgba", color=ManimColor("#0000FF"), opacity=0.8)' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.set_shade_in_3d', params: { value: true }, factory: 'Circle()', exp: 's.set_shade_in_3d(True)' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.set_style', params: { fill_color: '#FF0000', fill_opacity: 0.7, stroke_color: '#0000FF', stroke_width: 5.0, stroke_opacity: 0.9 }, factory: 'Circle()', exp: 's.set_style(fill_color=ManimColor("#FF0000"), fill_opacity=0.7, stroke_color=ManimColor("#0000FF"), stroke_width=5.0, stroke_opacity=0.9)' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.set_points', params: { points: { $array: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]] } }, factory: 'VMobject()', exp: 's.set_points(np.array([[0,0,0],[0,1,0],[1,1,0],[1,0,0]]))' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.set_color', params: { color: '#FF0000' }, factory: 'Circle()', exp: 's.set_color(ManimColor("#FF0000"))' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.fade', params: { darkness: 0.5 }, factory: 'Circle().set_opacity(0.8)', exp: 's.fade(0.5)' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.rotate', params: { angle: 1.5707963267948966, about_point: { $array: [0, 0, 0] } }, factory: 'Square().shift(RIGHT)', exp: 's.rotate(PI/2, about_point=ORIGIN)' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.scale', params: { scale_factor: 2.0, scale_stroke: true }, factory: 'Square()', exp: 's.scale(2.0, scale_stroke=True)' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.apply_function', params: { function: { $lambda: { params: ['p'], body: { $expr: 'p * 2.0' } } } }, factory: 'Square()', exp: 's.apply_function(lambda p: p * 2.0)' },
  { id: 'manim.mobject.types.vectorized_mobject.VMobject.interpolate_color', params: { mobject1: { $ref: 'm1' }, mobject2: { $ref: 'm2' }, alpha: 0.5 }, factory: 'Square()', ctx: '{ "m1": Square().set_color(RED), "m2": Square().set_color(BLUE) }', ctxVars: ['m1', 'm2'], exp: 's.interpolate_color(ctx["m1"], ctx["m2"], 0.5)' },
  { id: 'manim.mobject.types.vectorized_mobject.VectorizedPoint.set_location', params: { new_loc: { $array: [4, 5, 6] } }, factory: 'VectorizedPoint([1, 2, 3])', exp: 's.set_location(np.array([4, 5, 6]))' },
  { id: 'manim.mobject.types.vectorized_mobject.CurvesAsSubmobjects.point_from_proportion', mode: 'store', params: { alpha: 0.25 }, factory: 'CurvesAsSubmobjects(Circle())', exp: 's.point_from_proportion(0.25)' },

  // Group I: Mobject positioning, family & gradient methods (21)
  { id: 'manim.mobject.mobject.Mobject.fade_to', params: { color: { $ref: 'red' }, alpha: 0.5 }, factory: 'Square()', ctx: '{ "red": ManimColor("#FF0000") }', ctxVars: ['red'], exp: 's.fade_to(ctx["red"], 0.5)' },
  { id: 'manim.mobject.mobject.Mobject.proportion_from_point', mode: 'store', params: { point: { $array: [1, 0, 0] } }, factory: 'Circle()', exp: 's.proportion_from_point(np.array([1, 0, 0]))' },
  { id: 'manim.mobject.mobject.Mobject.put_start_and_end_on', params: { start: { $array: [-2, 0, 0] }, end: { $array: [2, 0, 0] } }, factory: 'Line(LEFT, RIGHT)', exp: 's.put_start_and_end_on(LEFT*2, RIGHT*2)' },
  { id: 'manim.mobject.mobject.Mobject.set_color_by_gradient', params: { colors: ['#FF0000', '#0000FF'] }, factory: 'Square()', exp: 's.set_color_by_gradient(ManimColor("#FF0000"), ManimColor("#0000FF"))' },
  { id: 'manim.mobject.mobject.Mobject.set_colors_by_radial_gradient', params: { center: { $array: [0, 0, 0] }, radius: 2.0, inner_color: { $ref: 'red' }, outer_color: { $ref: 'blue' } }, factory: 'Square()', ctx: '{ "red": ManimColor("#FF0000"), "blue": ManimColor("#0000FF") }', ctxVars: ['red', 'blue'], exp: 's.set_colors_by_radial_gradient(center=ORIGIN, radius=2.0, inner_color=ctx["red"], outer_color=ctx["blue"])' },
  { id: 'manim.mobject.mobject.Mobject.set_submobject_colors_by_radial_gradient', params: { center: { $array: [0, 0, 0] }, radius: 2.0, inner_color: { $ref: 'red' }, outer_color: { $ref: 'blue' } }, factory: 'VGroup(Square().shift(LEFT), Circle().shift(RIGHT))', ctx: '{ "red": ManimColor("#FF0000"), "blue": ManimColor("#0000FF") }', ctxVars: ['red', 'blue'], exp: 's.set_submobject_colors_by_radial_gradient(center=ORIGIN, radius=2.0, inner_color=ctx["red"], outer_color=ctx["blue"])' },
  { id: 'manim.mobject.mobject.Mobject.stretch_about_point', params: { factor: 2.0, dim: 0, point: { $array: [0, 0, 0] } }, factory: 'Square()', exp: 's.stretch_about_point(2.0, 0, ORIGIN)' },
  { id: 'manim.mobject.mobject.Mobject.stretch_to_fit_depth', params: { depth: 1.5 }, factory: 'Square()', exp: 's.stretch_to_fit_depth(1.5)' },
  { id: 'manim.mobject.mobject.Mobject.scale_to_fit_depth', params: { depth: 2.0 }, factory: 'Square()', exp: 's.scale_to_fit_depth(2.0)' },
  { id: 'manim.mobject.mobject.Mobject.sort_submobjects', params: { args: [{ $lambda: { params: ['p'], body: { $index: { value: { $local: 'p' }, index: 0 } } } }] }, factory: 'VGroup(Square().shift(RIGHT), Square().shift(LEFT))', exp: 's.sort_submobjects(lambda p: p[0])' },
  { id: 'manim.mobject.mobject.Mobject.apply_to_family', params: { func: { $lambda: { params: ['m'], body: { $call: { api: 'Mobject.scale', receiver: { $local: 'm' }, args: [2.0] } } } } }, factory: 'VGroup(Square(), Circle())', exp: 's.apply_to_family(lambda m: m.scale(2.0))' },
  { id: 'manim.mobject.mobject.Mobject.align_points', params: { mobject: { $ref: 'target' } }, factory: 'PMobject().add_points(np.array([[0,0,0], [1,0,0]]))', ctx: '{ "target": PMobject().add_points(np.array([[0,0,0], [1,0,0], [2,0,0]])) }', ctxVars: ['target'], exp: 's.align_points(ctx["target"])' },
  { id: 'manim.mobject.mobject.Mobject.align_points_with_larger', params: { larger_mobject: { $ref: 'target' } }, factory: 'PMobject().add_points(np.array([[0,0,0], [1,0,0]]))', ctx: '{ "target": PMobject().add_points(np.array([[0,0,0], [1,0,0], [2,0,0], [3,0,0]])) }', ctxVars: ['target'], exp: 's.align_points_with_larger(ctx["target"])' },
  { id: 'manim.mobject.mobject.Mobject.null_point_align', params: { mobject: { $ref: 'target' } }, factory: 'VGroup()', ctx: '{ "target": Square() }', ctxVars: ['target'], exp: 's.null_point_align(ctx["target"])' },
  { id: 'manim.mobject.mobject.Mobject.interpolate', params: { mobject1: { $ref: 'm1' }, mobject2: { $ref: 'm2' }, alpha: 0.5 }, factory: 'Square()', ctx: '{ "m1": Square().shift(LEFT), "m2": Square().shift(RIGHT) }', ctxVars: ['m1', 'm2'], exp: 's.interpolate(ctx["m1"], ctx["m2"], 0.5)' },
  { id: 'manim.mobject.mobject.Mobject.add_background_rectangle_to_family_members_with_points', params: {}, factory: 'Square()', exp: 's.add_background_rectangle_to_family_members_with_points()' },
  { id: 'manim.mobject.mobject.Mobject.add_background_rectangle_to_submobjects', params: {}, factory: 'Square()', exp: 's.add_background_rectangle_to_submobjects()' },
  { id: 'manim.mobject.mobject.Mobject.pose_at_angle', params: {}, factory: 'Square()', exp: 's.pose_at_angle()' },
  { id: 'manim.mobject.mobject.Mobject.to_original_color', params: {}, factory: 'Square().set_color(RED)', exp: 's.to_original_color()' },
  { id: 'manim.mobject.mobject.Mobject.repeat_submobject', params: { submob: { $ref: 'target' } }, factory: 'VGroup(Square())', ctx: '{ "target": Circle() }', ctxVars: ['target'], exp: 's.repeat_submobject(ctx["target"])' },
  { id: 'manim.mobject.mobject.Mobject.reduce_across_dimension', mode: 'store', params: { reduce_func: { $lambda: { params: ['pts'], body: { $index: { value: { $local: 'pts' }, index: 0 } } } }, dim: 0 }, factory: 'Square()', exp: 's.reduce_across_dimension(lambda pts: pts[0], 0)' },

  // Group J: 3D and Arc geometry (22)
  { id: 'manim.mobject.three_d.three_dimensions.Line3D.parallel_to', isStatic: true, mode: 'store', params: { line: { $ref: 'target' } }, factory: 'None', ctx: '{ "target": Line3D(start=ORIGIN, end=OUT) }', ctxVars: ['target'], exp: 'Line3D.parallel_to(ctx["target"])' },
  { id: 'manim.mobject.three_d.three_dimensions.Line3D.perpendicular_to', isStatic: true, mode: 'store', params: { line: { $ref: 'target' }, point: { $array: [0, 0, 0] } }, factory: 'None', ctx: '{ "target": Line3D(start=RIGHT*2, end=UP+OUT) }', ctxVars: ['target'], exp: 'Line3D.perpendicular_to(ctx["target"], point=ORIGIN)' },
  { id: 'manim.mobject.three_d.three_dimensions.Line3D.pointify', mode: 'store', params: { mob_or_point: { $array: [0, 0, 0] } }, factory: 'Line3D(start=ORIGIN, end=OUT)', exp: 's.pointify(ORIGIN)' },
  { id: 'manim.mobject.three_d.three_dimensions.Line3D.set_start_and_end_attrs', params: { start: { $array: [0, 0, 0] }, end: { $array: [0, 0, 2] } }, factory: 'Line3D(start=ORIGIN, end=OUT)', exp: 's.set_start_and_end_attrs(start=ORIGIN, end=OUT*2)' },
  { id: 'manim.mobject.three_d.three_dimensions.Cone.set_direction', params: { direction: { $array: [0, 0, 1] } }, factory: 'Cone()', exp: 's.set_direction(OUT)' },
  { id: 'manim.mobject.three_d.three_dimensions.Cylinder.set_direction', params: { direction: { $array: [0, 0, 1] } }, factory: 'Cylinder()', exp: 's.set_direction(OUT)' },
  { id: 'manim.mobject.three_d.three_dimensions.Cylinder.add_bases', params: {}, factory: 'Cylinder()', exp: 's.add_bases()' },
  { id: 'manim.mobject.three_d.three_dimensions.Surface.set_fill_by_checkerboard', params: { colors: ['#FF0000', '#0000FF'] }, factory: 'Surface(lambda u, v: np.array([u, v, 0]), u_range=[-1, 1], v_range=[-1, 1])', exp: 's.set_fill_by_checkerboard(ManimColor("#FF0000"), ManimColor("#0000FF"))' },
  { id: 'manim.mobject.three_d.three_dimensions.Surface.set_fill_by_value', params: { axes: { $ref: 'axes' }, colorscale: ['#FF0000', '#0000FF'] }, factory: 'Surface(lambda u, v: np.array([u, v, 0]), u_range=[-1, 1], v_range=[-1, 1])', ctx: '{ "axes": ThreeDAxes(x_range=[-1, 1], y_range=[-1, 1], z_range=[-1, 1]) }', ctxVars: ['axes'], exp: 's.set_fill_by_value(axes=ctx["axes"], colorscale=[ManimColor("#FF0000"), ManimColor("#0000FF")])' },
  { id: 'manim.mobject.three_d.three_dimensions.Cube.generate_points', params: {}, factory: 'Cube()', exp: 's.generate_points()' },
  { id: 'manim.mobject.three_d.three_dimensions.Cube.init_points', params: {}, factory: 'Cube()', exp: 's.init_points()' },
  { id: 'manim.mobject.three_d.three_dimensions.Prism.generate_points', params: {}, factory: 'Prism()', exp: 's.generate_points()' },
  { id: 'manim.mobject.geometry.arc.Arc.generate_points', params: {}, factory: 'Arc(angle=PI/2)', exp: 's.generate_points()' },
  { id: 'manim.mobject.geometry.arc.Arc.init_points', params: {}, factory: 'Arc(angle=PI/2)', exp: 's.init_points()' },
  { id: 'manim.mobject.geometry.arc.Annulus.generate_points', params: {}, factory: 'Annulus(inner_radius=0.5, outer_radius=1.0)', exp: 's.generate_points()' },
  { id: 'manim.mobject.geometry.arc.Annulus.init_points', params: {}, factory: 'Annulus(inner_radius=0.5, outer_radius=1.0)', exp: 's.init_points()' },
  { id: 'manim.mobject.geometry.arc.AnnularSector.generate_points', params: {}, factory: 'AnnularSector(inner_radius=0.5, outer_radius=1.0, angle=PI/2)', exp: 's.generate_points()' },
  { id: 'manim.mobject.geometry.arc.AnnularSector.init_points', params: {}, factory: 'AnnularSector(inner_radius=0.5, outer_radius=1.0, angle=PI/2)', exp: 's.init_points()' },
  { id: 'manim.mobject.geometry.arc.TipableVMobject.create_tip', mode: 'store', params: {}, factory: 'Line(LEFT, RIGHT)', exp: 's.create_tip()' },
  { id: 'manim.mobject.geometry.arc.TipableVMobject.assign_tip_attr', params: { tip: { $ref: 'tip' }, at_start: false }, factory: 'Line(LEFT, RIGHT)', ctx: '{ "tip": ArrowTriangleTip() }', ctxVars: ['tip'], exp: 's.assign_tip_attr(ctx["tip"], at_start=False)' },
  { id: 'manim.mobject.geometry.arc.TipableVMobject.position_tip', params: { tip: { $ref: 'tip' } }, factory: 'Line(LEFT, RIGHT)', ctx: '{ "tip": ArrowTriangleTip() }', ctxVars: ['tip'], exp: 's.position_tip(ctx["tip"])' },
  { id: 'manim.mobject.geometry.arc.TipableVMobject.reset_endpoints_based_on_tip', params: { tip: { $ref: 'tip' }, at_start: false }, factory: 'Line(LEFT, RIGHT)', ctx: '{ "tip": ArrowTriangleTip() }', ctxVars: ['tip'], exp: 's.reset_endpoints_based_on_tip(ctx["tip"], at_start=False)' },

  // Group K: Brace and Table methods (9)
  { id: 'manim.mobject.svg.brace.Brace.get_text', mode: 'store', params: { text: ['label'] }, factory: 'Brace(Square())', exp: 's.get_text("label")' },
  { id: 'manim.mobject.svg.brace.Brace.get_tex', mode: 'store', params: { tex: ['x'] }, factory: 'Brace(Square())', exp: 's.get_tex("x")' },
  { id: 'manim.mobject.svg.brace.Brace.put_at_tip', params: { mob: { $ref: 'target' } }, factory: 'Brace(Square())', ctx: '{ "target": Text("hello") }', ctxVars: ['target'], exp: 's.put_at_tip(ctx["target"])' },
  { id: 'manim.mobject.svg.brace.BraceLabel.change_label', params: { text: ['new_label'] }, factory: 'BraceLabel(Square(), "old_label")', exp: 's.change_label("new_label")' },
  { id: 'manim.mobject.table.Table.add_background_to_entries', params: {}, factory: 'Table([["a", "b"], ["c", "d"]], element_to_mobject=Text)', exp: 's.add_background_to_entries()' },
  { id: 'manim.mobject.table.Table.add_highlighted_cell', params: { pos: [1, 1], color: '#FF0000' }, factory: 'Table([["a", "b"], ["c", "d"]], element_to_mobject=Text)', exp: 's.add_highlighted_cell((1, 1), color=ManimColor("#FF0000"))' },
  { id: 'manim.mobject.table.Table.set_column_colors', params: { colors: ['#FF0000', '#0000FF'] }, factory: 'Table([["a", "b"], ["c", "d"]], element_to_mobject=Text)', exp: 's.set_column_colors(ManimColor("#FF0000"), ManimColor("#0000FF"))' },
  { id: 'manim.mobject.table.Table.set_row_colors', params: { colors: ['#FF0000', '#0000FF'] }, factory: 'Table([["a", "b"], ["c", "d"]], element_to_mobject=Text)', exp: 's.set_row_colors(ManimColor("#FF0000"), ManimColor("#0000FF"))' },
  { id: 'manim.mobject.table.Table.scale', params: { scale_factor: 1.5 }, factory: 'Table([["a", "b"], ["c", "d"]], element_to_mobject=Text)', exp: 's.scale(1.5)' }
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
import random, json, inspect

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

    if inspect.isgenerator(exp_res): exp_res = list(exp_res)
    if inspect.isgenerator(act_res): act_res = list(act_res)

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
    elif callable(exp_res):
        assert callable(act_res)
        for t in [0.0, 0.25, 0.5, 0.75, 1.0]:
            pt_exp = exp_res(t)
            pt_act = act_res(t)
            if isinstance(pt_exp, np.ndarray):
                np.testing.assert_allclose(pt_act, pt_exp, atol=1e-5)
            else:
                assert np.isclose(float(pt_act), float(pt_exp), atol=1e-5)
    elif isinstance(exp_res, (list, tuple)):
        assert len(act_res) == len(exp_res)
        for a, b in zip(act_res, exp_res):
            if isinstance(b, np.ndarray):
                np.testing.assert_allclose(a, b, atol=1e-5)
            elif callable(b):
                assert callable(a)
                for t in [0.0, 0.5, 1.0]:
                    np.testing.assert_allclose(a(t), b(t), atol=1e-5)
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
    assert.ok(verified.length >= 170, `Expected at least 170 verified APIs, got ${verified.length}`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
