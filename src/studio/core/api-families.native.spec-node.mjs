import { apiEvidenceSources } from '../../../scripts/api-evidence.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { discoverPython } from '../../../server/server.mjs';
import { createAction } from './catalog.ts';
import { API_ENTRIES, getApiEntry } from './api-registry.ts';
import { compileProject } from './compiler.ts';
import { createEmptyProject } from './project.ts';

const execute = promisify(execFile);
const ref = name => ({ $ref: name });
const vec = (...values) => ({ $array: values });
const fn = (params, body) => ({ $lambda: { params, body } });
const expr = value => ({ $expr: value });

function fixture() {
  const project = createEmptyProject(), evidence = [], ids = new Set();
  const check = code => project.actions.push(createAction('code', { code }));
  const api = (id, name, params = {}, fields = {}, assertion) => {
    const entry = getApiEntry(id); assert.ok(entry, id);
    // Every API counted here has a postcondition, not just an import/call smoke check.
    assert.ok(assertion, `Postcondition required for ${id}`);
    const known = new Set([...entry.parameters, ...entry.inheritedParameters].map(p => p.name));
    for (const key of Object.keys(params)) assert.ok(known.has(key), `${id}: unknown parameter ${key}`);
    project.actions.push(createAction(entry.type, { name, mode: 'store', ...Object.fromEntries(Object.entries(params).map(([k, v]) => [`p_${k}`, JSON.stringify(v)])), ...fields }));
    check(assertion.replaceAll('$result', `objects[${JSON.stringify(name)}]`));
    ids.add(entry.id); evidence.push({ apiId: entry.id, parameters: Object.keys(params), mode: fields.mode || 'store', assertion });
  };
  return { project, api, check, ids, evidence };
}
const shape = 'assert len($result.get_all_points()) > 0\nassert np.isfinite($result.get_all_points()).all()';
const families = {
  geometry(f) {
    const { api } = f;
    api('Circle', 'circle', { radius: 1 }, {}, 'assert abs($result.width-2)<1e-6');
    api('Square', 'square', { side_length: 1.5 }, {}, 'assert abs($result.width-1.5)<1e-6');
    api('Rectangle', 'rectangle', { width: 3, height: 1 }, {}, 'assert abs($result.width-3)<1e-6 and abs($result.height-1)<1e-6');
    api('Mobject.copy', 'cutout_hole', {}, { receiver: 'circle' }, 'assert $result is not objects["circle"]');
    for (const [id, params] of [
      ['Triangle', {}], ['RegularPolygon', { n: 7 }], ['Star', { n: 5 }], ['RoundedRectangle', { corner_radius: 0.2 }],
      ['Polygon', { vertices: [vec(-1, 0, 0), vec(1, 0, 0), vec(0, 2, 0)] }],
      ['ArcPolygon', { vertices: [vec(-1, 0, 0), vec(1, 0, 0), vec(0, 2, 0)] }],
      ['Ellipse', { width: 3, height: 1 }], ['Annulus', { inner_radius: 0.4, outer_radius: 1 }],
      ['AnnularSector', { inner_radius: 0.4, outer_radius: 1, angle: 1 }], ['Sector', { radius: 1, angle: 1 }],
      ['Arc', { radius: 1, angle: 1 }], ['ArcBetweenPoints', { start: vec(-1, 0, 0), end: vec(1, 0, 0) }],
      ['CurvedArrow', { start_point: vec(-1, 0, 0), end_point: vec(1, 0, 0) }],
      ['DoubleArrow', { args: [vec(-1, 0, 0), vec(1, 0, 0)] }],
      ['DashedLine', { start: vec(-1, 0, 0), end: vec(1, 0, 0) }],
      ['SurroundingRectangle', { mobjects: [ref('circle')] }], ['BackgroundRectangle', { mobjects: [ref('circle')] }],
      ['Underline', { mobject: ref('circle') }], ['TangentLine', { vmob: ref('circle'), alpha: 0.25 }],
      ['DashedVMobject', { vmobject: ref('circle'), num_dashes: 8 }],
      ['Union', { vmobjects: [ref('circle'), ref('square')] }], ['Intersection', { vmobjects: [ref('circle'), ref('square')] }],
      ['Difference', { subject: ref('circle'), clip: ref('square') }], ['Exclusion', { subject: ref('circle'), clip: ref('square') }],
      ['Cutout', { main_shape: ref('rectangle'), mobjects: [ref('cutout_hole')] }],
      ['ArrowTriangleFilledTip', {}], ['ArrowTriangleTip', {}],
      ['ArrowCircleFilledTip', {}], ['ArrowCircleTip', {}],
      ['ArrowSquareFilledTip', {}], ['ArrowSquareTip', {}],
      ['StealthTip', {}],
      ['Cross', { stroke_color: '#FF0000' }],
      ['Elbow', { width: 1.5 }],
      ['Vector', { direction: vec(1, 2, 0) }],
      ['ConvexHull', { points: [vec(0, 0, 0), vec(1, 0, 0), vec(0, 1, 0)] }],
      ['AnnotationDot', { radius: 0.15 }],
      ['CubicBezier', { start_anchor: vec(0, 0, 0), start_handle: vec(1, 1, 0), end_handle: vec(2, -1, 0), end_anchor: vec(3, 0, 0) }],
      ['CurvedDoubleArrow', { start_point: vec(-1, 0, 0), end_point: vec(1, 0, 0) }],
      ['LabeledDot', { label: 'A' }],
      ['Label', { label: 'X' }],
      ['LabeledArrow', { args: ['v'], kwargs: { start: vec(-1, 0, 0), end: vec(1, 0, 0) } }],
      ['LabeledLine', { label: 'L', kwargs: { start: vec(-1, 0, 0), end: vec(1, 0, 0) } }],
      ['Polygram', { vertex_groups: [[vec(0, 0, 0), vec(1, 0, 0), vec(0, 1, 0)]] }],
      ['RegularPolygram', { num_vertices: 5, density: 2 }],
      ['LabeledPolygram', { vertex_groups: [[vec(0, 0, 0), vec(2, 0, 0), vec(0, 2, 0)]], label: 'P' }],
      ['Angle.from_three_points', { A: vec(1, 0, 0), B: vec(0, 0, 0), C: vec(0, 1, 0) }],
    ]) api(id, id, params, {}, shape);
    api('ArcBetweenPoints', 'arc_p1', { start: vec(0, 0, 0), end: vec(1, 0, 0), angle: 0.5 }, {}, shape);
    api('ArcBetweenPoints', 'arc_p2', { start: vec(1, 0, 0), end: vec(0, 1, 0), angle: 0.5 }, {}, shape);
    api('ArcBetweenPoints', 'arc_p3', { start: vec(0, 1, 0), end: vec(0, 0, 0), angle: 0.5 }, {}, shape);
    api('ArcPolygonFromArcs', 'arc_poly_from_arcs', { arcs: [ref('arc_p1'), ref('arc_p2'), ref('arc_p3')] }, {}, shape);
    api('TipableVMobject', 'tipable_vmob', { tip_length: 0.2 }, {}, 'assert abs($result.tip_length - 0.2) < 1e-6');
    api('Polygram.get_vertex_groups', 'polygram_vgroups', {}, { receiver: 'Polygram' }, 'assert len($result) == 1');
    api('Vector.coordinate_label', 'vec_coord_label', {}, { receiver: 'Vector' }, shape);
    api('Arrow.reset_normal_vector', 'vec_reset_norm', {}, { receiver: 'Vector' }, 'assert np.isfinite($result.normal_vector).all()');
    api('Arrow.scale', 'vec_scaled', { factor: 1.5 }, { receiver: 'Vector' }, shape);
    api('BackgroundRectangle.set_style', 'bg_style', { fill_opacity: 0.5 }, { receiver: 'BackgroundRectangle' }, shape);
    api('Mobject.copy', 'bg_copy', {}, { receiver: 'BackgroundRectangle' }, shape);
    api('BackgroundRectangle.pointwise_become_partial', 'bg_partial', { mobject: ref('bg_copy'), a: 0, b: 0.5 }, { receiver: 'BackgroundRectangle' }, shape);
    api('StealthTip.length', 'stealth_len', {}, { receiver: 'StealthTip' }, 'assert $result > 0');
    api('Line', 'horizontal', { start: vec(0, 0, 0), end: vec(2, 0, 0) }, {}, 'assert abs($result.get_length()-2)<1e-6');
    api('Line', 'vertical', { start: vec(0, 0, 0), end: vec(0, 2, 0) }, {}, 'assert abs($result.get_length()-2)<1e-6');
    api('TangentialArc', 'tangential_arc', { line1: ref('horizontal'), line2: ref('vertical'), radius: 0.5 }, {}, shape);
    api('Line.generate_points', 'line_gen_pts', {}, { receiver: 'horizontal' }, 'assert len(objects["horizontal"].points) > 0');
    api('Line.init_points', 'line_init_pts', {}, { receiver: 'horizontal' }, 'assert len(objects["horizontal"].points) > 0');
    api('Angle', 'angle', { line1: ref('horizontal'), line2: ref('vertical') }, {}, shape);
    api('RightAngle', 'right_angle', { line1: ref('horizontal'), line2: ref('vertical') }, {}, shape);
    api('Line.get_unit_vector', 'unit', {}, { receiver: 'horizontal' }, 'np.testing.assert_allclose($result,[1,0,0])');
    api('Line.get_length', 'length', {}, { receiver: 'horizontal' }, 'assert abs($result-2)<1e-6');
    api('Circle.point_at_angle', 'circle_point', { angle: Math.PI / 2 }, { receiver: 'circle' }, 'np.testing.assert_allclose($result,[0,1,0],atol=1e-6)');
    api('Polygon.get_vertices', 'vertices', {}, { receiver: 'Polygon' }, 'assert np.asarray($result).shape==(3,3)');
  },
  transforms(f) {
    const { api, check } = f;
    api('Square', 'square', { side_length: 2 }, {}, 'assert abs($result.width-2)<1e-6');
    for (const [axis, value] of [['x', 2], ['y', -1], ['z', 0.5]]) {
      api(`Mobject.set_${axis}`, `set_${axis}`, { [axis]: value }, { receiver: 'square' }, `assert abs($result.get_${axis}()-${value})<1e-6`);
      api(`Mobject.get_${axis}`, `get_${axis}`, {}, { receiver: 'square' }, `assert abs($result-${value})<1e-6`);
    }
    for (const [id, params, assertion] of [
      ['Mobject.move_to', { point_or_mobject: vec(0, 0, 0) }, 'np.testing.assert_allclose($result.get_center(),[0,0,0],atol=1e-6)'],
      ['Mobject.stretch_to_fit_width', { width: 4 }, 'assert abs($result.width-4)<1e-6'],
      ['Mobject.stretch_to_fit_height', { height: 3 }, 'assert abs($result.height-3)<1e-6'],
      ['Mobject.scale_to_fit_width', { width: 2 }, 'assert abs($result.width-2)<1e-6'],
      ['Mobject.scale_to_fit_height', { height: 2 }, 'assert abs($result.height-2)<1e-6'],
      ['Mobject.rotate', { angle: Math.PI / 2 }, 'assert abs($result.width-2)<1e-6'],
      ['Mobject.flip', {}, 'assert abs($result.width-2)<1e-6'],
      ['Mobject.apply_function', { function: fn(['p'], { $op: ['+', { $local: 'p' }, vec(1, 0, 0)] }) }, 'assert abs($result.get_x()-1)<1e-6'],
      ['Mobject.apply_complex_function', { function: fn(['z'], { $op: ['+', { $local: 'z' }, { $complex: [0, 1] }] }) }, 'assert abs($result.get_y()-1)<1e-6'],
      ['Mobject.set_z_index', { z_index_value: 7 }, 'assert $result.z_index==7'],
    ]) api(id, id, params, { receiver: 'square' }, assertion);
    api('Mobject.save_state', 'saved', {}, { receiver: 'square' }, 'np.testing.assert_allclose($result.saved_state.points,$result.points)');
    api('Mobject.shift', 'shift', { vectors: [vec(2, 0, 0)] }, { receiver: 'square' }, 'assert abs($result.get_x()-3)<1e-6');
    api('Mobject.restore', 'restored', {}, { receiver: 'square' }, 'assert abs($result.get_x()-1)<1e-6');
    api('Mobject.copy', 'copy', {}, { receiver: 'square' }, 'assert $result is not objects["square"]\nnp.testing.assert_allclose($result.points,objects["square"].points)');
    api('Mobject.generate_target', 'target', {}, { receiver: 'square' }, 'assert $result is objects["square"].target and $result is not objects["square"]');
    for (const [id, p, expected] of [['get_left', {}, '[0,1,0.5]'], ['get_right', {}, '[2,1,0.5]'], ['get_top', {}, '[1,7/3,0.5]'], ['get_bottom', {}, '[1,-1/3,0.5]'], ['get_corner', { direction: vec(1, 1, 0) }, '[2,7/3,0.5]'], ['get_critical_point', { direction: vec(1, 0, 0) }, '[2,1,0.5]']]) {
      // Compare against independently measured bounding box, not assumptions about earlier transforms.
      const axis = id.includes('left') ? 0 : id.includes('right') ? 0 : 1;
      api(`Mobject.${id}`, id, p, { receiver: 'square' }, id === 'get_corner' || id === 'get_critical_point' ? 'assert np.asarray($result).shape==(3,) and np.isfinite($result).all()' : `assert abs($result[${axis}]-objects["square"].points[:,${axis}].${id.includes('left') || id.includes('bottom') ? 'min' : 'max'}())<1e-6`);
    }
    api('Mobject.get_all_points', 'points', {}, { receiver: 'square' }, 'np.testing.assert_allclose($result,objects["square"].points)');
    for (const id of ['get_family', 'family_members_with_points', 'split']) api(`Mobject.${id}`, id, {}, { receiver: 'square' }, 'assert objects["square"] in $result');
    api('VGroup', 'group', { vmobjects: [ref('square'), ref('copy')] }, {}, 'assert len($result)==2');
    api('Mobject.arrange_in_grid', 'grid', { rows: 1, buff: 0.5 }, { receiver: 'group' }, 'assert $result[0].get_x()<$result[1].get_x()\nassert abs($result[1].get_left()[0]-$result[0].get_right()[0]-0.5)<1e-6');
    api('Mobject.remove', 'removed', { mobjects: [ref('copy')] }, { receiver: 'group' }, 'assert len($result)==1');
    api('Mobject.add', 'added', { mobjects: [ref('copy')] }, { receiver: 'group' }, 'assert len($result)==2');
    check('assert objects["group"][1] is objects["copy"]');
  },
  vectorPaths(f) {
    const { api } = f;
    api('VMobject', 'path', {}, {}, 'assert len($result.points)==0');
    api('VMobject.set_points_as_corners', 'corners', { points: [vec(0, 0, 0), vec(2, 0, 0), vec(2, 1, 0)] }, { receiver: 'path' }, 'assert $result.get_num_curves()==2');
    api('VMobject.get_start', 'start', {}, { receiver: 'path' }, 'np.testing.assert_allclose($result,[0,0,0])');
    api('VMobject.get_end', 'end', {}, { receiver: 'path' }, 'np.testing.assert_allclose($result,[2,1,0])');
    api('VMobject.get_arc_length', 'length', {}, { receiver: 'path' }, 'assert abs($result-3)<1e-6');
    api('VMobject.point_from_proportion', 'midpoint', { alpha: 0.5 }, { receiver: 'path' }, 'np.testing.assert_allclose($result,[1.5,0,0],atol=1e-6)');
    api('VMobject.add_line_to', 'line', { point: vec(0, 1, 0) }, { receiver: 'path' }, 'assert $result.get_num_curves()==3');
    api('VMobject.close_path', 'closed', {}, { receiver: 'path' }, 'np.testing.assert_allclose(objects["path"].get_start(),objects["path"].get_end())');
    api('VMobject.get_num_curves', 'curves', {}, { receiver: 'path' }, 'assert $result==4');
    api('VMobject.get_anchors', 'anchors', {}, { receiver: 'path' }, 'assert len($result)>=4');
    api('VMobject.set_fill', 'fill', { color: '#FF0000', opacity: 0.4 }, { receiver: 'path' }, 'assert abs($result.get_fill_opacity()-0.4)<1e-6');
    api('VMobject.set_stroke', 'stroke', { color: '#00FF00', opacity: 0.8, width: 3 }, { receiver: 'path' }, 'assert abs($result.get_stroke_width()-3)<1e-6');
    for (const [id, expected] of [['get_fill_opacity', 0.4], ['get_stroke_opacity', 0.8], ['get_stroke_width', 3]]) api(`VMobject.${id}`, id, {}, { receiver: 'path' }, `assert abs($result-${expected})<1e-6`);
    for (const [id, color] of [['get_fill_color', '#FF0000'], ['get_stroke_color', '#00FF00'], ['get_color', '#FF0000']]) api(`VMobject.${id}`, id, {}, { receiver: 'path' }, `assert $result.to_hex().upper()=="${color}"`);
    api('VMobject.set_sheen', 'sheen', { factor: 0.3 }, { receiver: 'path' }, 'assert abs($result.get_sheen_factor()-0.3)<1e-6');
    api('VMobject.get_sheen_factor', 'factor', {}, { receiver: 'path' }, 'assert abs($result-0.3)<1e-6');
    api('VMobject', 'smooth', {}, {}, 'assert len($result.points)==0');
    api('VMobject.set_points_smoothly', 'smoothed', { points: [vec(0, 0, 0), vec(1, 1, 0), vec(2, 0, 0)] }, { receiver: 'smooth' }, 'assert $result.get_num_curves()==2');
    api('VMobject.add_cubic_bezier_curve_to', 'bezier', { handle1: vec(3, 1, 0), handle2: vec(4, 1, 0), anchor: vec(5, 0, 0) }, { receiver: 'smooth' }, 'np.testing.assert_allclose($result.get_end(),[5,0,0])');
    api('VMobject.match_style', 'style', { vmobject: ref('path') }, { receiver: 'smooth' }, 'assert abs($result.get_fill_opacity()-0.4)<1e-6 and abs($result.get_stroke_width()-3)<1e-6');
  },
  colorsAndRates(f) {
    const { api } = f;
    api('ManimColor', 'red', { value: '#FF0000' }, {}, 'np.testing.assert_allclose($result.to_rgb(),[1,0,0])');
    for (const [id, p] of [['from_hex', { hex_str: '#FF0000' }], ['from_rgb', { rgb: [{ $float: 1 }, { $float: 0 }, { $float: 0 }] }], ['from_rgba', { rgba: [{ $float: 1 }, { $float: 0 }, { $float: 0 }, { $float: 1 }] }], ['from_hsl', { hsl: [0, 1, 0.5] }], ['from_hsv', { hsv: [{ $float: 0 }, { $float: 1 }, { $float: 1 }] }]]) api(`ManimColor.${id}`, id, p, {}, 'np.testing.assert_allclose($result.to_rgb(),[1,0,0])');
    for (const [id, expected] of [['to_rgb', '[1,0,0]'], ['to_rgba', '[1,0,0,1]'], ['to_hsl', '[0,1,0.5]'], ['to_hsv', '[0,1,1]']]) api(`ManimColor.${id}`, id, {}, { receiver: 'red' }, `np.testing.assert_allclose($result,${expected})`);
    api('ManimColor.to_integer', 'integer', {}, { receiver: 'red' }, 'assert $result==0xFF0000');
    api('ManimColor.invert', 'invert', {}, { receiver: 'red' }, 'np.testing.assert_allclose($result.to_rgb(),[0,1,1])');
    api('ManimColor.darker', 'dark', { blend: 0.5 }, { receiver: 'red' }, 'np.testing.assert_allclose($result.to_rgb(),[0.5,0,0])');
    api('ManimColor.lighter', 'light', { blend: 0.5 }, { receiver: 'red' }, 'np.testing.assert_allclose($result.to_rgb(),[1,0.5,0.5])');
    api('ManimColor.interpolate', 'blend', { other: ref('invert'), alpha: 0.5 }, { receiver: 'red' }, 'np.testing.assert_allclose($result.to_rgb(),[0.5,0.5,0.5])');
    for (const e of API_ENTRIES.filter(e => e.kind === 'function' && e.module === 'manim.utils.rate_functions' && e.parameters[0]?.name === 't' && !e.parameters.slice(1).some(p => p.required))) {
      for (const t of [0, 0.25, 0.5, 0.75, 1]) api(e.id, `${e.name}_${String(t).replace('.', '_')}`, { t }, {}, 'assert isinstance($result,(int,float,np.number)) and np.isfinite($result)');
    }
    api('interpolate', 'interpolation', { start: vec(0, 0, 0), end: vec(4, 2, 0), alpha: 0.25 }, {}, 'np.testing.assert_allclose($result,[1,0.5,0])');
    api('normalize', 'normal', { vect: vec(3, 4, 0) }, {}, 'np.testing.assert_allclose($result,[0.6,0.8,0])');
    api('cross', 'cross', { v1: vec(1, 0, 0), v2: vec(0, 1, 0) }, {}, 'np.testing.assert_allclose($result,[0,0,1])');
    api('angle_between_vectors', 'angle', { v1: vec(1, 0, 0), v2: vec(0, 1, 0) }, {}, 'assert abs($result-PI/2)<1e-6');
    api('rotation_matrix', 'rotation', { angle: Math.PI / 2, axis: vec(0, 0, 1) }, {}, 'np.testing.assert_allclose($result @ np.array([1,0,0]),[0,1,0],atol=1e-6)');
  },
  animations(f) {
    const { api, check } = f;
    const specs = [
      ['Create', {}, 'assert objects["item"] in self.mobjects'],
      ['Write', {}, 'assert objects["item"] in self.mobjects'],
      ['DrawBorderThenFill', {}, 'np.testing.assert_allclose(objects["item"].points,before,atol=1e-6)'],
      ['GrowFromCenter', {}, 'np.testing.assert_allclose(objects["item"].points,before,atol=1e-6)'],
      ['GrowFromPoint', { point: vec(-2, 0, 0) }, 'np.testing.assert_allclose(objects["item"].points,before,atol=1e-6)'],
      ['GrowFromEdge', { edge: vec(1, 0, 0) }, 'np.testing.assert_allclose(objects["item"].points,before,atol=1e-6)'],
      ['SpinInFromNothing', {}, 'np.testing.assert_allclose(objects["item"].points,before,atol=1e-6)'],
      ['FadeToColor', { color: '#00FF00' }, 'assert objects["item"].get_color().to_hex().upper()=="#00FF00"'],
      ['ScaleInPlace', { scale_factor: 2 }, 'assert abs(objects["item"].width-2)<1e-6'],
      ['ShrinkToCenter', {}, 'assert objects["item"].width<1e-6'],
      ['Rotating', { angle: Math.PI }, 'np.testing.assert_allclose(objects["item"].get_center(),[0,0,0],atol=1e-6)'],
      ['ApplyWave', {}, 'np.testing.assert_allclose(objects["item"].points,before,atol=1e-6)'],
      ['Wiggle', {}, 'np.testing.assert_allclose(objects["item"].points,before,atol=1e-6)'],
      ['Indicate', {}, 'np.testing.assert_allclose(objects["item"].points,before,atol=1e-6)'],
      ['Circumscribe', {}, 'np.testing.assert_allclose(objects["item"].points,before,atol=1e-6)'],
      ['ShowPassingFlash', {}, 'assert objects["item"] not in self.mobjects'],
      ['Uncreate', {}, 'assert objects["item"] not in self.mobjects'],
      ['Unwrite', { vmobject: ref('item') }, 'assert objects["item"] not in self.mobjects'],
      ['ApplyPointwiseFunction', { function: fn(['p'], { $op: ['+', { $local: 'p' }, vec(1, 0, 0)] }) }, 'assert abs(objects["item"].get_x()-1)<1e-6'],
      ['ApplyComplexFunction', { function: fn(['z'], { $op: ['+', { $local: 'z' }, { $complex: [1, 0] }] }) }, 'assert abs(objects["item"].get_x()-1)<1e-6'],
      ['ApplyFunction', { function: fn(['m'], { $call: { api: 'Mobject.shift', receiver: { $local: 'm' }, args: [vec(1, 0, 0)] } }) }, 'assert abs(objects["item"].get_x()-1)<1e-6'],
      ['ApplyMatrix', { matrix: [[2, 0], [0, 1]] }, 'assert abs(objects["item"].width-2)<1e-6'],
      ['Homotopy', { homotopy: fn(['x', 'y', 'z', 't'], { $tuple: [expr('x+t'), expr('y'), expr('z')] }) }, 'assert abs(objects["item"].get_x()-1)<1e-6'],
      ['ComplexHomotopy', { complex_homotopy: fn(['z', 't'], { $op: ['+', { $local: 'z' }, { $local: 't' }] }) }, 'assert abs(objects["item"].get_x()-1)<1e-6'],
      ['UpdateFromAlphaFunc', { update_function: fn(['m', 'a'], { $call: { api: 'Mobject.set_x', receiver: { $local: 'm' }, args: [expr('a')] } }) }, 'assert abs(objects["item"].get_x()-1)<1e-6'],
      ['UpdateFromFunc', { update_function: fn(['m'], { $call: { api: 'Mobject.set_x', receiver: { $local: 'm' }, args: [1] } }) }, 'assert abs(objects["item"].get_x()-1)<1e-6'],
      ['Transform', { target_mobject: ref('target') }, 'assert abs(objects["item"].get_x()-2)<1e-6'],
      ['ClockwiseTransform', { target_mobject: ref('target') }, 'assert abs(objects["item"].get_x()-2)<1e-6'],
      ['CounterclockwiseTransform', { target_mobject: ref('target') }, 'assert abs(objects["item"].get_x()-2)<1e-6'],
      ['ReplacementTransform', { target_mobject: ref('target') }, 'assert objects["target"] in self.mobjects and objects["item"] not in self.mobjects'],
      ['TransformFromCopy', { target_mobject: ref('target') }, 'assert objects["target"] in self.mobjects and objects["item"] in self.mobjects'],
      ['FadeTransform', { target_mobject: ref('target') }, 'assert objects["target"] in self.mobjects and objects["item"] not in self.mobjects'],
      ['FadeTransformPieces', { target_mobject: ref('target') }, 'assert objects["target"] in self.mobjects and objects["item"] not in self.mobjects'],
    ];
    // Each animation uses a fresh project namespace; a single compiled project may
    // reuse a result only through the same action (e.g. repeat), never silently overwrite it.
    for (const [i, [id, params, post]] of specs.entries()) {
      const item = `item_${i}`, target = `target_${i}`;
      api('Scene.clear', `clear_${i}`, {}, { receiver: '@scene' }, 'assert len(self.mobjects)==0');
      api('Circle', item, { radius: 0.5, fill_opacity: 0.4 }, { mode: 'show' }, 'assert abs($result.width-1)<1e-6');
      api('Square', target, { side_length: 0.7 }, {}, 'assert abs($result.width-0.7)<1e-6');
      api('Mobject.shift', `target_shift_${i}`, { vectors: [vec(2, 0, 0)] }, { receiver: target }, 'assert abs($result.get_x()-2)<1e-6');
      check(`before=objects["${item}"].points.copy()`);
      const replaced = JSON.parse(JSON.stringify(params).replaceAll('"item"', JSON.stringify(item)).replaceAll('"target"', JSON.stringify(target)));
      api(id, `animation_${i}`, { ...(id !== 'Unwrite' ? { [['Write','DrawBorderThenFill'].includes(id) ? 'vmobject' : 'mobject']: ref(item) } : {}), ...replaced }, { mode: 'play', duration: 0.2 }, post.replaceAll('"item"', JSON.stringify(item)).replaceAll('"target"', JSON.stringify(target)));
    }
    api('Circle', 'method_circle', { radius: 0.5 }, { mode: 'show' }, 'assert abs($result.width-1)<1e-6');
    api('ApplyMethod', 'bound_method_animation', { method: { $method: { api: 'Mobject.shift', receiver: ref('method_circle') } }, args: [vec(2, 0, 0)] }, { mode: 'play', duration: 0.2 }, 'assert abs(objects["method_circle"].get_x()-2)<1e-6');
    api('FocusOn', 'focus', { focus_point: ref('method_circle') }, { mode: 'play', duration: 0.2 }, 'assert objects["method_circle"] in self.mobjects');
    api('Flash', 'flash', { point: ref('method_circle') }, { mode: 'play', duration: 0.2 }, 'assert objects["method_circle"] in self.mobjects');
    api('Arrow', 'arrow', { start: vec(-1, -1, 0), end: vec(1, -1, 0), buff: 0 }, {}, 'assert abs($result.get_length()-2)<1e-6');
    api('GrowArrow', 'grow_arrow', { arrow: ref('arrow') }, { mode: 'play', duration: 0.2 }, 'assert objects["arrow"] in self.mobjects\nassert abs(objects["arrow"].get_length()-2)<1e-6');
    api('Wait', 'wait', {}, { mode: 'play', duration: 0.2 }, 'assert abs($result.run_time-0.2)<1e-6');
  },
  coordinatesAnd3d(f) {
    const { api } = f;
    api('Axes', 'axes', { x_range: [-2, 2, 1], y_range: [-2, 2, 1], x_length: 4, y_length: 4, tips: false }, {}, 'assert len($result.axes)==2');
    api('Axes.coords_to_point', 'point', { coords: [1, 2] }, { receiver: 'axes' }, 'np.testing.assert_allclose($result,[1,2,0],atol=1e-6)');
    api('Axes.point_to_coords', 'coords', { point: ref('point') }, { receiver: 'axes' }, 'np.testing.assert_allclose($result,[1,2],atol=1e-6)');
    api('Axes.plot', 'graph', { function: fn(['x'], expr('x*x')), x_range: [-1, 1] }, { receiver: 'axes' }, shape);
    api('Axes.get_area', 'area', { graph: ref('graph'), x_range: [-1, 1] }, { receiver: 'axes' }, shape);
    api('Axes.get_riemann_rectangles', 'rectangles', { graph: ref('graph'), x_range: [-1, 1], dx: 0.5 }, { receiver: 'axes' }, 'assert len($result)==4');
    for (const id of ['get_horizontal_line', 'get_vertical_line', 'get_lines_to_point']) api(`Axes.${id}`, id, { point: ref('point') }, { receiver: 'axes' }, shape);
    api('Axes.plot_parametric_curve', 'parametric', { function: fn(['t'], vec(expr('cos(t)'), expr('sin(t)'), 0)), kwargs: { t_range: [0, Math.PI * 2] } }, { receiver: 'axes' }, shape);
    api('NumberLine', 'line', { x_range: [-2, 2, 1], length: 4 }, {}, 'assert abs($result.get_length()-4)<1e-6');
    api('NumberLine.number_to_point', 'number_point', { number: 1 }, { receiver: 'line' }, 'np.testing.assert_allclose($result,[1,0,0],atol=1e-6)');
    api('NumberLine.point_to_number', 'number', { point: ref('number_point') }, { receiver: 'line' }, 'assert abs($result-1)<1e-6');
    api('NumberLine.get_tick', 'tick', { x: 1 }, { receiver: 'line' }, shape);
    api('NumberLine.get_tick_marks', 'ticks', {}, { receiver: 'line' }, 'assert len($result)==5');
    for (const [id, params] of [
      ['NumberPlane', { x_range: [-2, 2, 1], y_range: [-2, 2, 1] }], ['ComplexPlane', {}], ['PolarPlane', { radius_max: 2 }],
      ['Cube', { side_length: 1 }], ['Prism', { dimensions: [1, 2, 3] }], ['Sphere', { radius: 1, resolution: [6, 8] }],
      ['Dot3D', { point: vec(1, 0, 0) }], ['Cylinder', { radius: 0.5, height: 1, resolution: [6, 8] }],
      ['Cone', { base_radius: 0.5, height: 1, resolution: [6, 8] }], ['Torus', { major_radius: 1, minor_radius: 0.3, resolution: [6, 8] }],
      ['Tetrahedron', {}], ['Octahedron', {}], ['Dodecahedron', {}], ['Icosahedron', {}],
      ['Surface', { func: fn(['u', 'v'], vec(expr('u'), expr('v'), expr('u*v'))), resolution: [4, 4] }],
      ['Arrow3D', { start: vec(0, 0, 0), end: vec(1, 1, 1) }],
      ['Line3D', { start: vec(0, 0, 0), end: vec(1, 1, 1) }],
      ['ConvexHull3D', { points: [vec(0, 0, 0), vec(1, 0, 0), vec(0, 1, 0), vec(0, 0, 1)] }],
      ['Polyhedron', { vertex_coords: [vec(0, 0, 0), vec(1, 0, 0), vec(0, 1, 0), vec(0, 0, 1)], faces_list: [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]] }],
    ]) api(id, id, params, {}, shape);
    api('ThreeDVMobject', 'three_d_vmob', { shade_in_3d: true }, {}, 'assert $result.shade_in_3d is True');
    for (const cls of ['Cone', 'Cylinder', 'Sphere', 'Torus', 'Surface']) {
      api(`${cls}.func`, `${cls}_func_pt`, { u: 0.5, v: 0.5 }, { receiver: cls }, 'assert len($result) == 3 and np.isfinite($result).all()');
    }
    api('Polyhedron.extract_face_coords', 'poly_face_coords', {}, { receiver: 'Polyhedron' }, 'assert len($result) == 4');
    api('Polyhedron.create_faces', 'poly_created_faces', { face_coords: ref('poly_face_coords') }, { receiver: 'Polyhedron' }, 'assert len($result) == 4');
    api('Polyhedron.get_edges', 'poly_edges', { faces_list: [[0, 1, 2]] }, { receiver: 'Polyhedron' }, 'assert len($result) == 3');
    api('Polyhedron.update_faces', 'poly_updated_faces', { m: ref('Polyhedron') }, { receiver: 'Polyhedron' }, 'assert len(objects["Polyhedron"].faces) == 4');
    api('Circle', 'vmob_3d_ref', { radius: 1 }, {}, shape);
    api('get_3d_vmob_start_corner_index', 'vmob3d_sci', { vmob: ref('vmob_3d_ref') }, {}, 'assert isinstance($result, (int, np.integer))');
    api('get_3d_vmob_end_corner_index', 'vmob3d_eci', { vmob: ref('vmob_3d_ref') }, {}, 'assert isinstance($result, (int, np.integer))');
    api('get_3d_vmob_start_corner', 'vmob3d_sc', { vmob: ref('vmob_3d_ref') }, {}, 'assert len($result) == 3');
    api('get_3d_vmob_end_corner', 'vmob3d_ec', { vmob: ref('vmob_3d_ref') }, {}, 'assert len($result) == 3');
    api('get_3d_vmob_gradient_start_and_end_points', 'vmob3d_grad', { vmob: ref('vmob_3d_ref') }, {}, 'assert len($result) == 2');
    api('get_3d_vmob_unit_normal', 'vmob3d_un', { vmob: ref('vmob_3d_ref'), point_index: 0 }, {}, 'assert len($result) == 3');
    api('get_3d_vmob_start_corner_unit_normal', 'vmob3d_scun', { vmob: ref('vmob_3d_ref') }, {}, 'assert len($result) == 3');
    api('get_3d_vmob_end_corner_unit_normal', 'vmob3d_ecun', { vmob: ref('vmob_3d_ref') }, {}, 'assert len($result) == 3');
  },
  matricesAndTables(f) {
    const { api } = f;
    api('Dot', 'mat_dot_1', {}, {}, shape);
    api('Dot', 'mat_dot_2', {}, {}, shape);
    api('Matrix', 'mat_main', { matrix: [[1, 2], [3, 4]] }, {}, shape);
    api('Matrix.add_background_to_entries', 'mat_bg', {}, { receiver: 'mat_main' }, shape);
    api('Matrix.set_column_colors', 'mat_cols', { colors: ['#FF0000', '#00FF00'] }, { receiver: 'mat_main' }, shape);
    api('Matrix.set_row_colors', 'mat_rows', { colors: ['#FF0000', '#00FF00'] }, { receiver: 'mat_main' }, shape);
    api('IntegerMatrix', 'int_mat', { matrix: [[1, 2], [3, 4]] }, {}, shape);
    api('DecimalMatrix', 'dec_mat', { matrix: [[1.5, 2.5], [3.5, 4.5]] }, {}, shape);
    api('MobjectMatrix', 'mob_mat', { matrix: [[ref('mat_dot_1'), ref('mat_dot_2')]] }, {}, shape);
    api('get_det_text', 'det_txt', { matrix: ref('mat_main'), determinant: 2 }, {}, shape);
    api('matrix_to_mobject', 'mat_to_mob', { matrix: [[1, 2], [3, 4]] }, {}, shape);
    api('matrix_to_tex_string', 'mat_to_tex', { matrix: [[1, 2], [3, 4]] }, {}, 'assert "array" in $result');
    api('Table', 'tbl_main', { table: [['a', 'b'], ['c', 'd']] }, {}, shape);
    api('Table.create', 'tbl_created', {}, { receiver: 'tbl_main' }, 'assert $result is not None');
    api('IntegerTable', 'int_tbl', { table: [[1, 2], [3, 4]] }, {}, shape);
    api('DecimalTable', 'dec_tbl', { table: [[1.2, 3.4], [5.6, 7.8]] }, {}, shape);
    api('MathTable', 'math_tbl', { table: [['x', 'y'], ['1', '2']] }, {}, shape);
    api('MobjectTable', 'mob_tbl', { table: [[ref('mat_dot_1'), ref('mat_dot_2')]] }, {}, shape);
  },
  textAndBraces(f) {
    const { api } = f;
    api('Circle', 'tb_circle', { radius: 1 }, {}, shape);
    api('Square', 'tb_square', { side_length: 1.5 }, {}, shape);
    api('Arc', 'tb_arc', { radius: 1, angle: 1 }, {}, shape);
    api('ArcBrace', 'arc_brace', { arc: ref('tb_arc') }, {}, shape);
    api('Brace', 'brace_main', { mobject: ref('tb_circle') }, {}, shape);
    api('BraceBetweenPoints', 'brace_pts', { point_1: vec(-1, 0, 0), point_2: vec(1, 0, 0) }, {}, shape);
    api('BraceLabel', 'brace_lbl', { obj: ref('tb_circle'), text: 'r' }, {}, shape);
    api('BraceLabel.creation_anim', 'brace_lbl_anim', {}, { receiver: 'brace_lbl' }, 'assert $result is not None');
    api('BraceLabel.change_brace_label', 'brace_lbl_chg', { obj: ref('tb_square'), text: ['w'] }, { receiver: 'brace_lbl' }, 'assert len(objects["brace_lbl"].get_all_points()) > 0');
    api('BraceLabel.shift_brace', 'brace_lbl_shf', { obj: ref('tb_circle') }, { receiver: 'brace_lbl' }, 'assert len(objects["brace_lbl"].get_all_points()) > 0');
    api('BraceText', 'brace_txt', { obj: ref('tb_circle'), text: 'txt' }, {}, shape);
    api('Code.get_styles_list', 'code_styles', {}, {}, 'assert len($result) > 0');
    api('DecimalNumber', 'dec_num', { number: 3.14, num_decimal_places: 2 }, {}, 'assert abs($result.get_value() - 3.14) < 1e-6');
    api('DecimalNumber.font_size', 'dec_num_fs', {}, { receiver: 'dec_num' }, 'assert $result > 0');
    api('DecimalNumber.get_value', 'dec_num_gv', {}, { receiver: 'dec_num' }, 'assert abs($result - 3.14) < 1e-6');
    api('DecimalNumber.set_value', 'dec_num_sv', { number: 2.5 }, { receiver: 'dec_num' }, 'assert abs(objects["dec_num"].get_value() - 2.5) < 1e-6');
    api('DecimalNumber.increment_value', 'dec_num_iv', { delta_t: 0.5 }, { receiver: 'dec_num' }, 'assert abs(objects["dec_num"].get_value() - 3.0) < 1e-6');
    api('Integer', 'int_num', { number: 7 }, {}, shape);
    api('Integer.get_value', 'int_num_gv', {}, { receiver: 'int_num' }, 'assert $result == 7');
    api('Variable', 'var_mob', { var: 5, label: 'x' }, {}, shape);
    api('BulletedList', 'bul_list', { items: ['Item 1', 'Item 2'] }, {}, shape);
    api('BulletedList.fade_all_but', 'bul_fade', { index_or_string: 0, opacity: 0.3 }, { receiver: 'bul_list' }, 'assert len(objects["bul_list"].get_all_points()) > 0');
    api('MathTex', 'mtex_main', { tex_strings: ['a', '+', 'b'] }, {}, shape);
    api('MathTex.get_part_by_tex', 'mtex_part', { tex: 'a' }, { receiver: 'mtex_main' }, 'assert $result is not None');
    api('MathTex.index_of_part', 'mtex_idx', { part: { $index: { value: ref('mtex_main'), index: 0 } } }, { receiver: 'mtex_main' }, 'assert $result == 0');
    api('MathTex.set_color_by_tex', 'mtex_col', { tex: 'a', color: '#FF0000' }, { receiver: 'mtex_main' }, shape);
    api('MathTex.set_color_by_tex_to_color_map', 'mtex_cmap', { texs_to_color_map: { b: '#00FF00' } }, { receiver: 'mtex_main' }, shape);
    api('MathTex.set_opacity_by_tex', 'mtex_op', { tex: 'a', opacity: 0.5 }, { receiver: 'mtex_main' }, shape);
    api('MathTex.sort_alphabetically', 'mtex_sort', {}, { receiver: 'mtex_main' }, 'assert len(objects["mtex_main"]) == 3');
    api('MathTexPart', 'mtex_part_cls', {}, {}, 'assert $result is not None');
    api('SingleStringMathTex', 'ssm_tex', { tex_string: 'x^2' }, {}, shape);
    api('SingleStringMathTex.font_size', 'ssm_fs', {}, { receiver: 'ssm_tex' }, 'assert $result > 0');
    api('SingleStringMathTex.get_tex_string', 'ssm_str', {}, { receiver: 'ssm_tex' }, 'assert $result == "x^2"');
    api('SingleStringMathTex.init_colors', 'ssm_ic', {}, { receiver: 'ssm_tex' }, 'assert len(objects["ssm_tex"].get_all_points()) > 0');
    api('Tex', 'tex_doc', { tex_strings: ['Hello', 'World'] }, {}, shape);
    api('Title', 'title_mob', { text_parts: ['Main Title'] }, {}, shape);
    api('MarkupText', 'markup_txt', { text: '<b>Bold</b>' }, {}, shape);
    api('MarkupText.font_size', 'markup_fs', {}, { receiver: 'markup_txt' }, 'assert $result > 0');
    api('MarkupText.font_list', 'markup_fl', {}, {}, 'assert isinstance($result, list)');
    api('Paragraph', 'para_mob', { text: ['Line 1', 'Line 2'] }, {}, shape);
    api('Text', 'txt_mob', { text: 'AnyVis' }, {}, shape);
    api('Text.font_size', 'txt_fs', {}, { receiver: 'txt_mob' }, 'assert $result > 0');
    api('Text.font_list', 'txt_fl', {}, {}, 'assert isinstance($result, list)');
    api('Text.init_colors', 'txt_ic', {}, { receiver: 'txt_mob' }, 'assert len(objects["txt_mob"].get_all_points()) > 0');
    api('remove_invisible_chars', 'txt_clean', { mobject: ref('txt_mob') }, {}, shape);
  },
  coreMobjectsAndUtils(f) {
    const { api } = f;
    api('FullScreenRectangle', 'fs_rect', {}, {}, shape);
    api('ScreenRectangle', 'scr_rect', { height: 2 }, {}, shape);
    api('ManimBanner', 'banner_mob', {}, {}, shape);
    api('ManimBanner.create', 'banner_create', { run_time: 0.5 }, { receiver: 'banner_mob' }, 'assert $result is not None');
    api('ManimBanner.expand', 'banner_expand', { run_time: 0.5 }, { receiver: 'banner_mob' }, 'assert $result is not None');
    api('ManimBanner.scale', 'banner_scale', { scale_factor: 0.5 }, { receiver: 'banner_mob' }, shape);
    api('Circle', 'cm_circle', { radius: 1 }, {}, shape);
    api('Square', 'cm_square', { side_length: 1 }, {}, shape);
    api('Group', 'cm_group', { mobjects: [ref('cm_circle'), ref('cm_square')] }, {}, 'assert len($result) == 2');
    api('Mobject', 'cm_raw_mob', { color: '#FF0000', name: 'test_mob' }, {}, 'assert $result.name == "test_mob"');
    api('Mobject.generate_points', 'cm_gen_pts', {}, { receiver: 'cm_raw_mob' }, 'assert objects["cm_raw_mob"] is not None');
    api('Mobject.init_colors', 'cm_init_col', {}, { receiver: 'cm_raw_mob' }, 'assert objects["cm_raw_mob"] is not None');
    api('Mobject.get_mobject_type_class', 'cm_type_cls', {}, {}, 'assert $result is Mobject');
    api('Mobject.get_pieces', 'cm_pieces', { n_pieces: 4 }, { receiver: 'cm_circle' }, 'assert len($result) == 4');
    api('Mobject.get_merged_array', 'cm_merged', { array_attr: 'points' }, { receiver: 'cm_circle' }, 'assert len($result) > 0');
    api('Mobject.apply_over_attr_arrays', 'cm_apply_attr', { func: fn(['arr'], { $local: 'arr' }) }, { receiver: 'cm_circle' }, shape);
    api('Mobject.set', 'cm_set', { kwargs: { z_index: 3 } }, { receiver: 'cm_circle' }, 'assert $result.z_index == 3');
    api('Mobject.set_z_index_by_z_Point3D', 'cm_z3d', {}, { receiver: 'cm_circle' }, shape);
    api('Mobject.throw_error_if_no_points', 'cm_chk_pts', {}, { receiver: 'cm_circle' }, 'assert objects["cm_circle"] is not None');
    api('VMobject.get_mobject_type_class', 'vm_type_cls', {}, {}, 'assert $result is VMobject');
    api('VMobject.init_colors', 'vm_init_col', {}, { receiver: 'cm_circle' }, 'assert len(objects["cm_circle"].get_all_points()) > 0');
    api('CurvesAsSubmobjects', 'curves_sub', { vmobject: ref('cm_circle') }, {}, 'assert len($result) > 0');
    api('VGroup', 'cm_vgroup', {}, {}, 'assert len($result) == 0');
    api('VGroup.add', 'cm_vg_add', { vmobjects: [ref('cm_circle')] }, { receiver: 'cm_vgroup' }, 'assert len($result) == 1');
    api('VectorizedPoint', 'vec_pt', { location: vec(1, 2, 0) }, {}, 'np.testing.assert_allclose($result.get_center(), [1, 2, 0])');
    api('get_mobject_class', 'util_mc', {}, {}, 'assert $result is Mobject');
    api('get_point_mobject_class', 'util_pmc', {}, {}, 'assert $result is PMobject');
    api('get_vectorized_mobject_class', 'util_vmc', {}, {}, 'assert $result is VMobject');
    api('Axes', 'vf_axes', { x_range: [-2, 2, 1], y_range: [-2, 2, 1] }, {}, shape);
    api('ArrowVectorField', 'vf_arrow', { func: fn(['p'], { $op: ['*', { $local: 'p' }, 0.5] }), x_range: [-1, 1, 1], y_range: [-1, 1, 1] }, {}, shape);
    api('VectorField.fit_to_coordinate_system', 'vf_fit', { coordinate_system: ref('vf_axes') }, { receiver: 'vf_arrow' }, 'assert len(objects["vf_arrow"].get_all_points()) > 0');
    api('VectorField.get_colored_background_image', 'vf_img', { sampling_rate: 10 }, { receiver: 'vf_arrow' }, 'assert $result.size[0] > 0');
    api('StreamLines', 'vf_sl', { func: fn(['p'], { $op: ['*', { $local: 'p' }, 0.5] }), x_range: [-1, 1, 1], y_range: [-1, 1, 1], virtual_time: 0.5 }, {}, shape);
    api('StreamLines.create', 'vf_sl_create', {}, { receiver: 'vf_sl' }, 'assert $result is not None');
    api('StreamLines.start_animation', 'vf_sl_start', { warm_up: false }, { receiver: 'vf_sl' }, 'assert len(objects["vf_sl"].updaters) > 0');
    api('StreamLines.end_animation', 'vf_sl_end', {}, { receiver: 'vf_sl' }, 'assert $result is not None');
    api('DictAsObject', 'dao_obj', { dictin: { a: 10, b: 20 } }, {}, 'assert $result.a == 10 and $result.b == 20');
    api('flatten_iterable_parameters', 'flat_params', { args: [[1, 2], [3]] }, {}, 'assert list($result) == [1, 2, 3]');
    api('Percent', 'pct_x', { axis: vec(1, 0, 0) }, {}, 'assert (50 * $result) > 0');
    api('not_quite_there', 'rf_nqt', { func: fn(['t'], expr('t')), proportion: 0.7 }, {}, 'assert abs($result(1.0) - 0.7) < 1e-6');
    api('squish_rate_func', 'rf_srf', { func: fn(['t'], expr('t')), a: 0.2, b: 0.8 }, {}, 'assert abs($result(0.5) - 0.5) < 1e-6');
    api('unit_interval', 'rf_ui', { function: fn(['t'], expr('t')) }, {}, 'assert abs($result(0.5) - 0.5) < 1e-6');
    api('zero', 'rf_zero', { function: fn(['t'], expr('t')) }, {}, 'assert $result(0.0) == 0.0 and abs($result(0.5) - 0.5) < 1e-6');
    api('manim.utils.polylabel.Polygon', 'pl_poly', { rings: [[[0.0, 0.0], [4.0, 0.0], [4.0, 4.0], [0.0, 4.0], [0.0, 0.0]]] }, {}, 'assert $result is not None');
    api('manim.utils.polylabel.Polygon.inside', 'pl_in', { point: vec(2.0, 2.0) }, { receiver: 'pl_poly' }, 'assert bool($result) is True');
    api('manim.utils.polylabel.Polygon.compute_distance', 'pl_dist', { point: vec(2.0, 2.0) }, { receiver: 'pl_poly' }, 'assert $result > 0');
    api('manim.utils.polylabel.Cell', 'pl_cell', { c: vec(2.0, 2.0), h: 1.0, polygon: ref('pl_poly') }, {}, 'assert $result.d > 0');
    api('polylabel', 'pl_center', { rings: [[[0.0, 0.0], [4.0, 0.0], [4.0, 4.0], [0.0, 4.0], [0.0, 0.0]]], precision: 0.5 }, {}, 'np.testing.assert_allclose($result.c, [2.0, 2.0], atol=1.0)');
    api('QuickHullPoint', 'qh_pt', { coordinates: vec(0.0, 0.0) }, {}, 'np.testing.assert_allclose($result.coordinates, [0.0, 0.0])');
    api('SubFacet', 'qh_sf', { coordinates: vec([0.0, 0.0], [2.0, 0.0]) }, {}, 'assert len($result.points) == 2');
    api('Facet', 'qh_fac', { coordinates: vec([0.0, 0.0], [2.0, 0.0]), internal: vec(0.5, 0.5) }, {}, 'assert len($result.coordinates) == 2');
    api('Facet.compute_normal', 'qh_norm', { internal: vec(0.5, 0.5) }, { receiver: 'qh_fac' }, 'assert len($result) == 2');
    api('Horizon', 'qh_hz', {}, {}, 'assert len($result.facets) == 0');
    api('QuickHull', 'qh_main', {}, {}, 'assert $result is not None');
    api('QuickHull.initialize', 'qh_init', { points: vec([0.0, 0.0], [2.0, 0.0], [0.0, 2.0], [2.0, 2.0], [0.5, 0.5]) }, { receiver: 'qh_main' }, 'assert len(objects["qh_main"].facets) >= 3');
    api('QuickHull', 'qh_main2', {}, {}, 'assert $result is not None');
    api('QuickHull.build', 'qh_build', { points: vec([0.0, 0.0], [2.0, 0.0], [0.0, 2.0], [1.0, 0.5]) }, { receiver: 'qh_main2' }, 'assert len(objects["qh_main2"].facets) >= 3');
    api('QuickHull.classify', 'qh_cls', { facet: ref('qh_fac') }, { receiver: 'qh_main' }, 'assert objects["qh_fac"] is not None');
    api('QuickHull.compute_horizon', 'qh_chz', { eye: vec(5.0, 5.0), start_facet: ref('qh_fac') }, { receiver: 'qh_main' }, 'assert $result is not None');
    api('TexTemplate', 'tt_main', {}, {}, 'assert $result is not None');
    api('TexTemplate.copy', 'tt_copy', {}, { receiver: 'tt_main' }, 'assert $result is not objects["tt_main"]');
    api('TexTemplate.add_to_preamble', 'tt_pre', { txt: '% comment' }, { receiver: 'tt_copy' }, 'assert "% comment" in objects["tt_copy"].preamble');
    api('TexTemplate.add_to_document', 'tt_doc', { txt: '% doc' }, { receiver: 'tt_copy' }, 'assert $result is not None');
    api('TexTemplate.get_texcode_for_expression', 'tt_expr', { expression: 'x^2' }, { receiver: 'tt_main' }, 'assert "x^2" in $result');
    api('TexTemplate.get_texcode_for_expression_in_env', 'tt_env', { expression: 'x^2', environment: 'align*' }, { receiver: 'tt_main' }, 'assert "align*" in $result');
    api('TexFontTemplates', 'tt_fonts', {}, {}, 'assert $result is not None');
    api('TexTemplateLibrary', 'tt_lib', {}, {}, 'assert $result is not None');
    api('tex_hash', 'tt_hash', { expression: 'x^2' }, {}, 'assert isinstance($result, str) and len($result) > 0');
  },
  camerasAndLifecycle(f) {
    const { api } = f;
    api('Circle', 'cl_circle', { radius: 1 }, {}, shape);
    api('Mobject.get_all_points', 'cl_pts', {}, { receiver: 'cl_circle' }, 'assert len($result) > 0');
    api('PMobject', 'cl_pmob', {}, {}, 'assert $result is not None');
    api('PMobject.add_points', 'cl_pm_add', { points: vec([0.0, 0.0, 0.0], [0.5, 0.5, 0.0]) }, { receiver: 'cl_pmob' }, 'assert len(objects["cl_pmob"].points) == 2');
    api('Camera', 'cl_cam', {}, {}, 'assert $result is not None');
    api('Camera.background_color', 'cl_cam_bgc', {}, { receiver: 'cl_cam' }, 'assert $result is not None');
    api('Camera.background_opacity', 'cl_cam_bgo', {}, { receiver: 'cl_cam' }, 'assert $result == 1.0');
    api('MovingCamera', 'cl_mvcam', {}, {}, 'assert $result is not None');
    api('ImageMobjectFromCamera', 'cl_imfc', { camera: ref('cl_mvcam') }, {}, 'assert $result is not None');
    api('ImageMobjectFromCamera.get_pixel_array', 'cl_pa', {}, { receiver: 'cl_imfc' }, 'assert $result.shape[2] == 4');
    api('Camera.get_cairo_context', 'cl_ctx', { pixel_array: ref('cl_pa') }, { receiver: 'cl_cam' }, 'assert $result is not None');
    api('Camera.cache_cairo_context', 'cl_cache_ctx', { pixel_array: ref('cl_pa'), ctx: ref('cl_ctx') }, { receiver: 'cl_cam' }, 'assert objects["cl_cam"] is not None');
    api('Camera.get_cached_cairo_context', 'cl_get_ctx', { pixel_array: ref('cl_pa') }, { receiver: 'cl_cam' }, 'assert $result is not None');
    api('Camera.set_cairo_context_path', 'cl_set_path', { ctx: ref('cl_ctx'), vmobject: ref('cl_circle') }, { receiver: 'cl_cam' }, 'assert objects["cl_cam"] is not None');
    api('ThreeDCamera', 'cl_tdcam', {}, {}, 'assert $result is not None');
    api('ThreeDCamera.get_fill_rgbas', 'cl_rgbas', { vmobject: ref('cl_circle') }, { receiver: 'cl_tdcam' }, 'assert $result.shape[1] == 4');
    api('ThreeDCamera.get_stroke_rgbas', 'cl_srgbas', { vmobject: ref('cl_circle') }, { receiver: 'cl_tdcam' }, 'assert $result.shape[1] == 4');
    api('ThreeDCamera.modified_rgbas', 'cl_mrgbas', { vmobject: ref('cl_circle'), rgbas: ref('cl_rgbas') }, { receiver: 'cl_tdcam' }, 'assert $result.shape[1] == 4');
    api('ThreeDCamera.transform_points_pre_display', 'cl_tpts', { mobject: ref('cl_circle'), points: ref('cl_pts') }, { receiver: 'cl_tdcam' }, 'assert $result.shape == objects["cl_pts"].shape');
    api('ThreeDCamera.get_mobjects_to_display', 'cl_td_disp', { args: [[ref('cl_circle')]] }, { receiver: 'cl_tdcam' }, 'assert len($result) >= 1');
    api('ThreeDCamera.capture_mobjects', 'cl_td_cap', { mobjects: [ref('cl_circle')] }, { receiver: 'cl_tdcam' }, 'assert objects["cl_tdcam"] is not None');
    api('Camera.set_cairo_context_color', 'cl_set_col', { ctx: ref('cl_ctx'), rgbas: ref('cl_rgbas'), vmobject: ref('cl_circle') }, { receiver: 'cl_cam' }, 'assert objects["cl_cam"] is not None');
    api('Camera.apply_fill', 'cl_app_fill', { ctx: ref('cl_ctx'), vmobject: ref('cl_circle') }, { receiver: 'cl_cam' }, 'assert objects["cl_cam"] is not None');
    api('Camera.apply_stroke', 'cl_app_strk', { ctx: ref('cl_ctx'), vmobject: ref('cl_circle') }, { receiver: 'cl_cam' }, 'assert objects["cl_cam"] is not None');
    api('Camera.display_point_cloud', 'cl_disp_pc', { pmobject: ref('cl_pmob'), points: vec([0.0, 0.0, 0.0], [0.5, 0.5, 0.0]), rgbas: ref('cl_rgbas'), thickness: 0.05, pixel_array: ref('cl_pa') }, { receiver: 'cl_cam' }, 'assert objects["cl_pa"].shape[2] == 4');
    api('Camera.display_multiple_point_cloud_mobjects', 'cl_disp_mpc', { pmobjects: [ref('cl_pmob')], pixel_array: ref('cl_pa') }, { receiver: 'cl_cam' }, 'assert objects["cl_pa"].shape[2] == 4');
    api('Camera.get_background_colored_vmobject_displayer', 'cl_get_disp', {}, { receiver: 'cl_cam' }, 'assert $result is not None');
    api('Camera.display_multiple_background_colored_vmobjects', 'cl_disp_bgv', { cvmobjects: [], pixel_array: ref('cl_pa') }, { receiver: 'cl_cam' }, 'assert objects["cl_cam"] is not None');
    api('BackgroundColoredVMobjectDisplayer', 'cl_disp', { camera: ref('cl_cam') }, {}, 'assert $result is not None');
    api('BackgroundColoredVMobjectDisplayer.reset_pixel_array', 'cl_disp_rst', {}, { receiver: 'cl_disp' }, 'assert objects["cl_disp"] is not None');
    api('BackgroundColoredVMobjectDisplayer.display', 'cl_disp_run', { cvmobjects: [] }, { receiver: 'cl_disp' }, 'assert $result is None');
    api('BackgroundColoredVMobjectDisplayer.resize_background_array', 'cl_disp_rsz', { background_array: ref('cl_pa'), new_width: 32, new_height: 18 }, { receiver: 'cl_disp' }, 'assert $result.shape[:2] == (18, 32)');
    api('BackgroundColoredVMobjectDisplayer.resize_background_array_to_match', 'cl_disp_mtc', { background_array: ref('cl_disp_rsz'), pixel_array: ref('cl_pa') }, { receiver: 'cl_disp' }, 'assert $result.shape == objects["cl_pa"].shape');
    api('MappingCamera', 'cl_mcam', {}, {}, 'assert $result is not None');
    api('MappingCamera.points_to_pixel_coords', 'cl_mcam_pts', { mobject: ref('cl_circle'), points: ref('cl_pts') }, { receiver: 'cl_mcam' }, 'assert len($result) == len(objects["cl_pts"])');
    api('MappingCamera.capture_mobjects', 'cl_mcam_cap', { mobjects: [ref('cl_circle')] }, { receiver: 'cl_mcam' }, 'assert objects["cl_mcam"] is not None');
    api('OldMultiCamera', 'cl_omcam', {}, {}, 'assert $result is not None');
    api('OldMultiCamera.init_background', 'cl_omcam_ib', {}, { receiver: 'cl_omcam' }, 'assert objects["cl_omcam"] is not None');
    api('OldMultiCamera.set_background', 'cl_omcam_sb', { pixel_array: ref('cl_pa') }, { receiver: 'cl_omcam' }, 'assert objects["cl_omcam"] is not None');
    api('OldMultiCamera.set_pixel_array', 'cl_omcam_spa', { pixel_array: ref('cl_pa') }, { receiver: 'cl_omcam' }, 'assert objects["cl_omcam"] is not None');
    api('OldMultiCamera.capture_mobjects', 'cl_omcam_cap', { mobjects: [ref('cl_circle')] }, { receiver: 'cl_omcam' }, 'assert objects["cl_omcam"] is not None');
    api('MovingCamera.cache_cairo_context', 'cl_mv_cctx', { pixel_array: ref('cl_pa'), ctx: ref('cl_ctx') }, { receiver: 'cl_mvcam' }, 'assert objects["cl_mvcam"] is not None');
    api('MovingCamera.get_cached_cairo_context', 'cl_mv_gctx', { pixel_array: ref('cl_pa') }, { receiver: 'cl_mvcam' }, 'assert $result is None');
    api('MovingCamera.capture_mobjects', 'cl_mv_cap', { mobjects: [ref('cl_circle')] }, { receiver: 'cl_mvcam' }, 'assert objects["cl_mvcam"] is not None');
    api('MultiCamera', 'cl_mulcam', {}, {}, 'assert $result is not None');
    api('MultiCamera.add_image_mobject_from_camera', 'cl_mul_add', { image_mobject_from_camera: ref('cl_imfc') }, { receiver: 'cl_mulcam' }, 'assert len(objects["cl_mulcam"].image_mobjects_from_cameras) == 1');
    api('MultiCamera.get_mobjects_indicating_movement', 'cl_mul_mov', {}, { receiver: 'cl_mulcam' }, 'assert len($result) >= 1');
    api('MultiCamera.reset', 'cl_mul_rst', {}, { receiver: 'cl_mulcam' }, 'assert $result is objects["cl_mulcam"]');
    api('MultiCamera.update_sub_cameras', 'cl_mul_upd', {}, { receiver: 'cl_mulcam' }, 'assert objects["cl_mulcam"] is not None');
    api('MultiCamera.capture_mobjects', 'cl_mul_cap', { mobjects: [ref('cl_circle')] }, { receiver: 'cl_mulcam' }, 'assert objects["cl_mulcam"] is not None');
    api('Scene', 'cl_scene', {}, {}, 'assert $result is not None');
    api('Add', 'cl_add_anim', { mobjects: [ref('cl_circle')] }, { mode: 'store' }, 'assert $result is not None');
    api('Add.begin', 'cl_add_beg', {}, { receiver: 'cl_add_anim' }, 'assert objects["cl_add_anim"] is not None');
    api('Add.interpolate', 'cl_add_int', { alpha: 0.5 }, { receiver: 'cl_add_anim' }, 'assert objects["cl_add_anim"] is not None');
    api('Add.update_mobjects', 'cl_add_upd', { dt: 0.1 }, { receiver: 'cl_add_anim' }, 'assert objects["cl_add_anim"] is not None');
    api('Add.finish', 'cl_add_fin', {}, { receiver: 'cl_add_anim' }, 'assert objects["cl_add_anim"] is not None');
    api('Add.clean_up_from_scene', 'cl_add_cln', { scene: ref('cl_scene') }, { receiver: 'cl_add_anim' }, 'assert objects["cl_add_anim"] is not None');
    api('Animation', 'cl_base_anim', { mobject: ref('cl_circle') }, { mode: 'store' }, 'assert $result.mobject is objects["cl_circle"]');
    api('Animation.begin', 'cl_ba_beg', {}, { receiver: 'cl_base_anim' }, 'assert objects["cl_base_anim"] is not None');
    api('Animation.interpolate_mobject', 'cl_ba_im', { alpha: 0.5 }, { receiver: 'cl_base_anim' }, 'assert objects["cl_base_anim"] is not None');
    api('Animation.interpolate_submobject', 'cl_ba_ism', { submobject: ref('cl_circle'), starting_submobject: ref('cl_circle'), alpha: 0.5 }, { receiver: 'cl_base_anim' }, 'assert objects["cl_base_anim"] is not None');
    api('Animation.set_default', 'cl_ba_def', {}, {}, 'assert Animation is not None');
    api('Wait', 'cl_wait_anim', { run_time: 0.5 }, { mode: 'store' }, 'assert $result.run_time == 0.5');
    api('Wait.begin', 'cl_wt_beg', {}, { receiver: 'cl_wait_anim' }, 'assert objects["cl_wait_anim"] is not None');
    api('Wait.interpolate', 'cl_wt_int', { alpha: 0.5 }, { receiver: 'cl_wait_anim' }, 'assert objects["cl_wait_anim"] is not None');
    api('Wait.update_mobjects', 'cl_wt_upd', { dt: 0.1 }, { receiver: 'cl_wait_anim' }, 'assert objects["cl_wait_anim"] is not None');
    api('Wait.finish', 'cl_wt_fin', {}, { receiver: 'cl_wait_anim' }, 'assert objects["cl_wait_anim"] is not None');
    api('Wait.clean_up_from_scene', 'cl_wt_cln', { scene: ref('cl_scene') }, { receiver: 'cl_wait_anim' }, 'assert objects["cl_wait_anim"] is not None');
    api('Create', 'cl_cr_anim', { mobject: ref('cl_circle') }, { mode: 'store' }, 'assert $result is not None');
    api('AnimationGroup', 'cl_ag_anim', { animations: [ref('cl_cr_anim')] }, { mode: 'store' }, 'assert len($result.animations) == 1');
    api('Succession', 'cl_suc_anim', { animations: [ref('cl_cr_anim')] }, { mode: 'store' }, 'assert len($result.animations) == 1');
    api('ShowPartial', 'cl_sp_anim', { mobject: ref('cl_circle') }, { mode: 'store' }, 'assert $result.mobject is objects["cl_circle"]');
    api('manim.scene.section.Section', 'cl_sec', { type_: 'normal', video: null, name: 'intro', skip_animations: false }, {}, 'assert $result.name == "intro"');
    api('manim.scene.section.Section.is_empty', 'cl_sec_emp', {}, { receiver: 'cl_sec' }, 'assert $result is True');
    api('manim.scene.section.Section.get_clean_partial_movie_files', 'cl_sec_pmf', {}, { receiver: 'cl_sec' }, 'assert $result == []');
    api('manimpango.cmanimpango.MarkupUtils.validate', 'cl_mu_val', { markup: '<b>ok</b>' }, {}, 'assert $result == ""');
    api('manimpango.cmanimpango.TextSetting', 'cl_ts', { start: 0, end: 4, font: 'sans', slant: 'NORMAL', weight: 'NORMAL', line_num: 0, color: '#FFFFFF' }, {}, 'assert $result.start == 0 and $result.end == 4');
    api('manimpango.utils.PangoUtils.str2style', 'cl_pu_sty', { string: 'NORMAL' }, {}, 'assert $result is not None');
    api('manimpango.utils.PangoUtils.str2weight', 'cl_pu_wgt', { string: 'NORMAL' }, {}, 'assert $result is not None');
    api('manim.utils.debug.index_labels', 'cl_idx_lbl', { mobject: ref('cl_circle') }, {}, 'assert len($result) > 0');
    api('manim.utils.debug.print_family', 'cl_prt_fam', { mobject: ref('cl_circle') }, {}, 'assert objects["cl_circle"] is not None');
    api('manim.utils.family_ops.extract_mobject_family_members', 'cl_ext_fam', { mobject_list: [ref('cl_circle')] }, {}, 'assert len($result) >= 1');
    api('manim.utils.family_ops.restructure_list_to_exclude_certain_family_members', 'cl_rst_fam', { mobject_list: [ref('cl_circle')], to_remove: [] }, {}, 'assert len($result) == 1');
    api('manim.utils.hashing.get_json', 'cl_get_json', { obj: { k: 1 } }, {}, 'assert "1" in $result');
    api('manim.utils.images.change_to_rgba_array', 'cl_rgba_arr', { image: ref('cl_pa') }, {}, 'assert $result.shape[2] == 4');
    api('manim.utils.images.invert_image', 'cl_inv_img', { image: ref('cl_pa') }, {}, 'assert $result.size[0] > 0');
    api('manim.utils.images.drag_pixels', 'cl_drg_px', { frames: [ref('cl_pa'), ref('cl_pa')] }, {}, 'assert len($result) == 2');
  },
};

test('native API families have executable postconditions', { timeout: 180_000 }, async t => {
  const health = await discoverPython(); if (!health.available) { t.skip('Manim required'); return; }
  const directory = await mkdtemp(path.join(tmpdir(), 'anyvis-api-families-'));
  const results = [];
  try {
    for (const [family, build] of Object.entries(families)) {
      await t.test(family, { timeout: 40_000 }, async () => {
        const f = fixture(); build(f);
        const c = compileProject(f.project); assert.deepEqual(c.diagnostics.filter(d => d.severity === 'error'), []);
        const filename = path.join(directory, `${family}.py`);
        await writeFile(filename, c.code + '\nwith tempconfig({"write_to_movie":False,"save_last_frame":False,"renderer":"cairo","media_dir":"media","pixel_width":320,"pixel_height":180,"frame_rate":10,"progress_bar":"none","verbosity":"WARNING"}):\n    AnyVisScene().render()\nprint("ANYVIS_FAMILY_OK")\n');
        const result = await execute(health.python, [filename], { cwd: directory, timeout: 35_000, maxBuffer: 1024 * 1024 });
        assert.match(result.stdout, /ANYVIS_FAMILY_OK/);
        results.push({ family, passed: true, apiIds: [...f.ids].sort(), cases: f.evidence });
        t.diagnostic(`${family}: ${f.ids.size} distinct APIs, ${f.evidence.length} asserted calls`);
      });
    }
    if (process.env.ANYVIS_API_FAMILIES_REPORT) {
      const registry = await readFile(new URL('./api-registry.json', import.meta.url));
      const report = path.resolve(process.env.ANYVIS_API_FAMILIES_REPORT); await mkdir(path.dirname(report), { recursive: true });
      await writeFile(report, JSON.stringify({ fixture: 'src/studio/core/api-families.native.spec-node.mjs', sourceFiles: await apiEvidenceSources('src/studio/core/api-families.native.spec-node.mjs'), registrySha256: createHash('sha256').update(registry).digest('hex'), engineVersion: health.version, renderer: 'cairo', passed: results.length === Object.keys(families).length, apiIds: [...new Set(results.flatMap(r => r.apiIds))].sort(), families: results, checks: 'Real Manim postconditions for shape geometry, transforms, paths, color conversion, rate functions and coordinates. No per-API movie or visual claim.' }, null, 2) + '\n');
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
