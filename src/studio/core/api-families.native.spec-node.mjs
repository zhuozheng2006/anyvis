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
  svgMobjects(f) {
    const { api, check } = f;
    api('Circle', 'circle', { radius: 1 }, {}, 'assert objects["circle"] is not None');
    check(`
import os, tempfile, svgelements, xml.etree.ElementTree as ET
_svg_path = tempfile.mktemp(suffix=".svg")
with open(_svg_path, "w") as _f:
    _f.write("""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect x="10" y="10" width="80" height="80" fill="red" />
  <circle cx="50" cy="50" r="30" fill="blue" />
  <line x1="0" y1="0" x2="100" y2="100" stroke="black" />
  <polygon points="20,20 40,40 20,40" fill="green" />
  <polyline points="10,10 30,30 50,10" stroke="yellow" />
  <path d="M 10 10 L 90 90" stroke="purple" />
  <text x="20" y="20">Hi</text>
</svg>""")
objects["_svg_doc"] = svgelements.SVG.parse(_svg_path)
objects["_rect_el"] = [el for el in objects["_svg_doc"].elements() if isinstance(el, svgelements.Rect)][0]
objects["_circ_el"] = [el for el in objects["_svg_doc"].elements() if isinstance(el, (svgelements.Circle, svgelements.Ellipse))][0]
objects["_line_el"] = [el for el in objects["_svg_doc"].elements() if isinstance(el, svgelements.SimpleLine)][0]
objects["_poly_el"] = [el for el in objects["_svg_doc"].elements() if isinstance(el, svgelements.Polygon)][0]
objects["_pl_el"] = [el for el in objects["_svg_doc"].elements() if isinstance(el, svgelements.Polyline)][0]
objects["_path_el"] = [el for el in objects["_svg_doc"].elements() if isinstance(el, svgelements.Path)][0]
objects["_text_el"] = svgelements.Text("Hi")
objects["_path_obj"] = svgelements.Path("M 0 0 L 10 10 Z")
objects["_xml_tree"] = ET.parse(_svg_path)
`);
    api('Circle', 'rect_shape', {}, {}, 'objects["rect_shape"] = objects["_rect_el"]');
    api('Circle', 'circ_shape', {}, {}, 'objects["circ_shape"] = objects["_circ_el"]');
    api('Circle', 'line_shape', {}, {}, 'objects["line_shape"] = objects["_line_el"]');
    api('Circle', 'poly_shape', {}, {}, 'objects["poly_shape"] = objects["_poly_el"]');
    api('Circle', 'pl_shape', {}, {}, 'objects["pl_shape"] = objects["_pl_el"]');
    api('Circle', 'path_shape', {}, {}, 'objects["path_shape"] = objects["_path_el"]');
    api('Circle', 'text_shape', {}, {}, 'objects["text_shape"] = objects["_text_el"]');
    api('Circle', 'path_obj_ref', {}, {}, 'objects["path_obj_ref"] = objects["_path_obj"]');
    api('Circle', 'xml_tree_ref', {}, {}, 'objects["xml_tree_ref"] = objects["_xml_tree"]');
    api('Circle', 'doc_ref', {}, {}, 'objects["doc_ref"] = objects["_svg_doc"]');
    api('Circle', 'matrix_ref', {}, {}, 'objects["matrix_ref"] = objects["_rect_el"].transform');

    api('SVGMobject', 'svg_mob', { file_name: 'test_icon.svg' }, {}, 'assert len($result.submobjects) >= 1');
    api('SVGMobject.get_file_path', 'svg_fp', {}, { receiver: 'svg_mob' }, 'assert str($result).endswith(".svg")');
    api('SVGMobject.rect_to_mobject', 'svg_rect', { rect: ref('rect_shape') }, {}, 'assert len($result.get_all_points()) > 0');
    api('SVGMobject.ellipse_to_mobject', 'svg_ellipse', { ellipse: ref('circ_shape') }, {}, 'assert len($result.get_all_points()) > 0');
    api('SVGMobject.line_to_mobject', 'svg_line', { line: ref('line_shape') }, {}, 'assert len($result.get_all_points()) > 0');
    api('SVGMobject.polygon_to_mobject', 'svg_poly', { polygon: ref('poly_shape') }, {}, 'assert len($result.get_all_points()) > 0');
    api('SVGMobject.polyline_to_mobject', 'svg_pl', { polyline: ref('pl_shape') }, { receiver: 'svg_mob' }, 'assert len($result.get_all_points()) > 0');
    api('SVGMobject.path_to_mobject', 'svg_path_mob', { path: ref('path_shape') }, { receiver: 'svg_mob' }, 'assert len($result.get_all_points()) > 0');
    api('SVGMobject.text_to_mobject', 'svg_text_mob', { text: ref('text_shape') }, {}, 'assert objects["svg_mob"] is not None');
    api('SVGMobject.apply_style_to_mobject', 'svg_styled', { mob: ref('circle'), shape: ref('rect_shape') }, {}, 'assert objects["circle"] is not None');
    api('SVGMobject.handle_transform', 'svg_trans', { mob: ref('circle'), matrix: ref('matrix_ref') }, {}, 'assert objects["circle"] is not None');
    api('SVGMobject.get_mob_from_shape_element', 'svg_from_shape', { shape: ref('rect_shape') }, { receiver: 'svg_mob' }, 'assert len($result.get_all_points()) > 0');
    api('SVGMobject.get_mobjects_from', 'svg_from_doc', { svg: ref('doc_ref') }, { receiver: 'svg_mob' }, 'assert len($result) > 0');
    api('SVGMobject.generate_config_style_dict', 'svg_style_dict', {}, { receiver: 'svg_mob' }, 'assert isinstance($result, dict)');
    api('SVGMobject.init_svg_mobject', 'svg_init', { use_svg_cache: false }, { receiver: 'svg_mob' }, 'assert objects["svg_mob"] is not None');
    api('SVGMobject.modify_xml_tree', 'svg_mod_tree', { element_tree: ref('xml_tree_ref') }, { receiver: 'svg_mob' }, 'assert $result is not None');
    api('SVGMobject.move_into_position', 'svg_mv_pos', {}, { receiver: 'svg_mob' }, 'assert objects["svg_mob"] is not None');
    api('SVGMobject.generate_mobject', 'svg_gen_mob', {}, { receiver: 'svg_mob' }, 'assert objects["svg_mob"] is not None');
    api('VMobjectFromSVGPath', 'v_svg_path', { path_obj: ref('path_obj_ref') }, {}, 'assert len($result.get_all_points()) > 0');
    api('VMobjectFromSVGPath.handle_commands', 'v_hnd_cmd', {}, { receiver: 'v_svg_path' }, 'assert len(objects["v_svg_path"].points) > 0');
    api('VMobjectFromSVGPath.init_points', 'v_init_pts', {}, { receiver: 'v_svg_path' }, 'assert len(objects["v_svg_path"].points) > 0');
    api('VMobjectFromSVGPath.generate_points', 'v_gen_pts', {}, { receiver: 'v_svg_path' }, 'assert len(objects["v_svg_path"].points) > 0');

    // Mobject methods & overrides
    api('Circle', 'anim_fn_ref', {}, {}, 'objects["anim_fn_ref"] = lambda m: Write(m)');
    api('Circle', 'anim_class_ref', {}, {}, 'objects["anim_class_ref"] = FadeIn');
    api('manim.mobject.mobject.Mobject.add_animation_override', 'm_add_override', { animation_class: ref('anim_class_ref'), override_func: ref('anim_fn_ref') }, {}, 'assert objects["circle"] is not None');
    api('manim.mobject.mobject.Mobject.animation_override_for', 'm_override_for', { animation_class: ref('anim_class_ref') }, {}, 'assert callable($result)');
    check('Mobject._original__init__ = Mobject.__init__');
    api('manim.mobject.mobject.Mobject.set_default', 'm_set_default', {}, {}, 'assert Square is not None');
    api('manim.mobject.mobject.override_animate', 'm_over_anim', { method: ref('anim_fn_ref') }, {}, 'assert callable($result)');
    check('config.video_dir = tempfile.mkdtemp()');
    api('manim.mobject.mobject.Mobject.save_image', 'm_save_img', { name: 'saved_circle' }, { receiver: 'circle' }, 'assert os.path.exists(os.path.join(config.get_dir("video_dir"), "saved_circle.png"))');
  },
  vectorAndZoomScenes(f) {
    const { api, check } = f;
    // VectorScene
    api('VectorScene', 'vs_inst', {}, {}, 'assert $result is not None');
    check(`
objects["vs_inst"].skip_animations = True
objects["vs_inst"].plane = objects["vs_inst"].add_plane()
`);
    api('Vector', 'vs_vec', { direction: vec(1, 2, 0) }, {}, 'assert len($result.get_all_points()) > 0');
    api('Line', 'vs_x_line', { start: vec(0, 0, 0), end: vec(1, 0, 0) }, {}, 'assert len($result.get_all_points()) > 0');
    api('Line', 'vs_y_line', { start: vec(1, 0, 0), end: vec(1, 2, 0) }, {}, 'assert len($result.get_all_points()) > 0');
    api('MathTex', 'vs_x_coord', { tex_strings: ['1'] }, {}, 'assert len($result.get_all_points()) > 0');
    api('MathTex', 'vs_y_coord', { tex_strings: ['2'] }, {}, 'assert len($result.get_all_points()) > 0');

    api('VectorScene.get_vector', 'vs_get_vec', { numerical_vector: vec(1, 2, 0) }, { receiver: 'vs_inst' }, 'assert len($result.get_all_points()) > 0');
    api('VectorScene.get_basis_vector_labels', 'vs_basis', {}, { receiver: 'vs_inst' }, 'assert len($result) == 2');
    api('VectorScene.position_x_coordinate', 'vs_pos_x', { x_coord: ref('vs_x_coord'), x_line: ref('vs_x_line'), vector: vec(1, 2, 0) }, { receiver: 'vs_inst' }, 'assert $result is objects["vs_x_coord"]');
    api('VectorScene.position_y_coordinate', 'vs_pos_y', { y_coord: ref('vs_y_coord'), y_line: ref('vs_y_line'), vector: vec(1, 2, 0) }, { receiver: 'vs_inst' }, 'assert $result is objects["vs_y_coord"]');
    api('VectorScene.write_vector_coordinates', 'vs_wvc', { vector: ref('vs_vec') }, { receiver: 'vs_inst' }, 'assert $result is not None');

    // LinearTransformationScene
    api('LinearTransformationScene', 'lts_inst', {}, {}, 'assert $result is not None');
    api('Vector', 'lts_v1', { direction: vec(1, 0, 0) }, {}, 'assert len($result.get_all_points()) > 0');
    check(`
objects["lts_inst"].skip_animations = True
objects["lts_inst"].setup()
objects["lts_inst"].add_vector(objects["lts_v1"])
for _m in objects["lts_v1"].get_family(): _m.target = _m.copy()
objects["lts_fn"] = lambda p: p * 2
objects["lts_mat"] = np.array([[2, 0], [0, 2]])
objects["lts_conf1"] = [{"a": 1}]
objects["lts_conf2"] = [{"b": 2}]
`);
    api('Circle', 'lts_fn', {}, {}, 'objects["lts_fn"] = lambda p: p * 2');
    api('Circle', 'lts_mat', {}, {}, 'objects["lts_mat"] = np.array([[2, 0], [0, 2]])');
    api('Circle', 'lts_conf1', {}, {}, 'objects["lts_conf1"] = [{"a": 1}]');
    api('Circle', 'lts_conf2', {}, {}, 'objects["lts_conf2"] = [{"b": 2}]');

    api('LinearTransformationScene.update_default_configs', 'lts_cfg', { default_configs: ref('lts_conf1'), passed_configs: ref('lts_conf2') }, {}, 'assert objects["lts_conf1"][0]["b"] == 2');
    api('LinearTransformationScene.get_piece_movement', 'lts_pc_mov', { pieces: ref('lts_v1') }, { receiver: 'lts_inst' }, 'assert $result is not None');
    api('LinearTransformationScene.get_moving_mobject_movement', 'lts_mv_mov', { func: ref('lts_fn') }, { receiver: 'lts_inst' }, 'assert isinstance($result, Animation)');
    api('LinearTransformationScene.get_vector_movement', 'lts_vec_mov', { func: ref('lts_fn') }, { receiver: 'lts_inst' }, 'assert isinstance($result, Animation)');
    api('LinearTransformationScene.write_vector_coordinates', 'lts_wvc', { vector: ref('lts_v1') }, { receiver: 'lts_inst' }, 'assert $result is not None');
    api('LinearTransformationScene.add_transformable_label', 'lts_add_lbl', { vector: ref('lts_v1'), label: 'v1' }, { receiver: 'lts_inst' }, 'assert $result is not None');
    check(`
objects["lts_v1"].target = objects["lts_v1"].copy()
for _m in objects["lts_add_lbl"].get_family(): _m.target = _m.copy()
`);
    api('LinearTransformationScene.get_transformable_label_movement', 'lts_tl_mov', {}, { receiver: 'lts_inst' }, 'assert isinstance($result, Animation)');
    api('LinearTransformationScene.apply_function', 'lts_app_fn', { function: ref('lts_fn') }, { receiver: 'lts_inst' }, 'assert objects["lts_inst"] is not None');

    api('LinearTransformationScene', 'lts_inst2', {}, {}, 'assert $result is not None');
    check(`
objects["lts_inst2"].skip_animations = True
objects["lts_inst2"].setup()
`);
    api('LinearTransformationScene.apply_inverse', 'lts_app_inv', { matrix: ref('lts_mat') }, { receiver: 'lts_inst2' }, 'assert objects["lts_inst2"] is not None');

    api('LinearTransformationScene', 'lts_inst3', {}, {}, 'assert $result is not None');
    check(`
objects["lts_inst3"].skip_animations = True
objects["lts_inst3"].setup()
`);
    api('LinearTransformationScene.apply_inverse_transpose', 'lts_app_inv_t', { t_matrix: ref('lts_mat') }, { receiver: 'lts_inst3' }, 'assert objects["lts_inst3"] is not None');

    api('LinearTransformationScene', 'lts_inst4', {}, {}, 'assert $result is not None');
    check(`
objects["lts_inst4"].skip_animations = True
objects["lts_inst4"].setup()
`);
    api('LinearTransformationScene.apply_nonlinear_transformation', 'lts_app_nonlin', { function: ref('lts_fn') }, { receiver: 'lts_inst4' }, 'assert objects["lts_inst4"] is not None');

    // ZoomedScene
    api('ZoomedScene', 'zs_scene', {}, {}, 'assert $result is not None');
    api('ZoomedScene.setup', 'zs_setup', {}, { receiver: 'zs_scene' }, 'assert objects["zs_scene"] is not None');
    api('ZoomedScene.get_zoom_factor', 'zs_zf', {}, { receiver: 'zs_scene' }, 'assert $result > 0');
    api('ZoomedScene.activate_zooming', 'zs_act', { animate: false }, { receiver: 'zs_scene' }, 'assert objects["zs_scene"] is not None');
    api('ZoomedScene.get_zoom_in_animation', 'zs_zin', {}, { receiver: 'zs_scene' }, 'assert $result is not None');
    api('ZoomedScene.get_zoomed_display_pop_out_animation', 'zs_zout', {}, { receiver: 'zs_scene' }, 'assert $result is not None');
  },
  renderingAndFileWriter(f) {
    const { api, check } = f;
    // CairoRenderer
    api('CairoRenderer', 'cairo_rend', {}, {}, 'assert $result is not None');
    api('Scene', 'rend_scene', {}, {}, 'assert $result is not None');
    api('Circle', 'rend_circle', {}, {}, 'assert objects["rend_circle"] is not None');
    check('objects["rend_static"] = [objects["rend_circle"]]');
    api('Circle', 'rend_static', {}, {}, 'assert len(objects["rend_static"]) == 1');

    api('CairoRenderer.init_scene', 'cr_init_sc', { scene: ref('rend_scene') }, { receiver: 'cairo_rend' }, 'assert objects["cairo_rend"] is not None');
    api('CairoRenderer.update_skipping_status', 'cr_upd_skip', {}, { receiver: 'cairo_rend' }, 'assert objects["cairo_rend"] is not None');
    api('CairoRenderer.get_frame', 'cr_frame', {}, { receiver: 'cairo_rend' }, 'assert $result.shape[2] == 4');
    api('CairoRenderer.save_static_frame_data', 'cr_save_stat', { scene: ref('rend_scene'), static_mobjects: ref('rend_static') }, { receiver: 'cairo_rend' }, 'assert objects["cairo_rend"] is not None');
    api('CairoRenderer.update_frame', 'cr_upd_fr', { scene: ref('rend_scene') }, { receiver: 'cairo_rend' }, 'assert objects["cairo_rend"] is not None');
    api('CairoRenderer.freeze_current_frame', 'cr_frz_fr', { duration: 0.1 }, { receiver: 'cairo_rend' }, 'assert objects["cairo_rend"] is not None');
    api('CairoRenderer.scene_finished', 'cr_sc_fin', { scene: ref('rend_scene') }, { receiver: 'cairo_rend' }, 'assert objects["cairo_rend"] is not None');

    // vectorized_mobject_rendering
    check(`
from manim.mobject.opengl.opengl_geometry import OpenGLCircle
objects["gl_circle"] = OpenGLCircle()
`);
    api('Circle', 'gl_circle', {}, {}, 'objects["gl_circle"] = OpenGLCircle()');
    api('manim.renderer.vectorized_mobject_rendering.triangulate_mobject', 'vmr_tri', { mob: ref('gl_circle') }, {}, 'assert len($result[0]) > 0');
    api('manim.renderer.vectorized_mobject_rendering.build_matrix_lists', 'vmr_mat_list', { mob: ref('gl_circle') }, {}, 'assert len($result) >= 1');

    // SceneFileWriter
    check(`
from pydub import AudioSegment
import os, tempfile
config.output_file = "test_output.mp4"
objects["sfw_audio_seg"] = AudioSegment.silent(duration=1000)
`);
    api('Circle', 'sfw_audio_seg', {}, {}, 'objects["sfw_audio_seg"] = AudioSegment.silent(duration=1000)');
    api('SceneFileWriter', 'sfw_inst', { renderer: ref('cairo_rend'), scene_name: 'TestSceneFileWriter' }, {}, 'assert $result is not None');
    api('SceneFileWriter.init_output_directories', 'sfw_init_out', { scene_name: 'TestSceneFileWriter' }, { receiver: 'sfw_inst' }, 'assert objects["sfw_inst"] is not None');
    api('SceneFileWriter.get_resolution_directory', 'sfw_res_dir', {}, { receiver: 'sfw_inst' }, 'assert len($result) > 0');
    api('SceneFileWriter.is_already_cached', 'sfw_cached', { hash_invocation: 'test_hash' }, { receiver: 'sfw_inst' }, 'assert $result is False');
    api('SceneFileWriter.init_audio', 'sfw_init_aud', {}, { receiver: 'sfw_inst' }, 'assert objects["sfw_inst"] is not None');
    api('SceneFileWriter.add_audio_segment', 'sfw_add_aud', { new_segment: ref('sfw_audio_seg'), time: 0, gain_to_background: 0 }, { receiver: 'sfw_inst' }, 'assert objects["sfw_inst"] is not None');
    api('SceneFileWriter.write_subcaption_file', 'sfw_subcap', {}, { receiver: 'sfw_inst' }, 'assert objects["sfw_inst"] is not None');
    api('SceneFileWriter.next_section', 'sfw_next_sec', { name: 's2', type_: 'normal', skip_animations: false }, { receiver: 'sfw_inst' }, 'assert objects["sfw_inst"] is not None');
    api('SceneFileWriter.finish_last_section', 'sfw_fin_sec', {}, { receiver: 'sfw_inst' }, 'assert objects["sfw_inst"] is not None');
    api('manim.scene.scene_file_writer.to_av_frame_rate', 'sfw_av_fps', { fps: 30 }, {}, 'assert $result == 30');

    // manimpango & pango utils
    check(`
_test_svg_pango = tempfile.mktemp(suffix=".svg")
with open(_test_svg_pango, "w") as _f:
    _f.write("<svg><path d=\\"M 0 0 L 10 10 M 20 20\\" /></svg>")
objects["pango_svg_file"] = _test_svg_pango
`);
    api('Circle', 'pango_svg_file', {}, {}, 'objects["pango_svg_file"] = _test_svg_pango');
    api('manimpango.cmanimpango.MarkupUtils', 'mp_mu_cls', {}, {}, 'assert $result is not None');
    api('manimpango.cmanimpango.MarkupUtils.text2svg', 'mp_t2s', { text: '<b>Pango</b>', font: 'sans-serif', slant: 'NORMAL', weight: 'NORMAL', size: 16, _: 0, disable_liga: false, file_name: ref('pango_svg_file'), START_X: 0, START_Y: 0, width: 100, height: 100 }, {}, 'assert os.path.exists($result)');
    api('manimpango.utils.PangoUtils', 'mp_pu_cls', {}, {}, 'assert $result is not None');
    api('manimpango.utils.PangoUtils.remove_last_M', 'mp_rem_m', { file_name: ref('pango_svg_file') }, {}, 'assert objects["pango_svg_file"] is not None');

    // commands, constants, TexTemplate.from_file
    check(`
_tpl_path = tempfile.mktemp(suffix=".tex")
with open(_tpl_path, "w") as _f:
    _f.write(r"""\\documentclass{article}
\\usepackage{amsmath}
\\begin{document}
\\begin{align*}
X
\\end{align*}
\\end{document}
""")
objects["tex_tpl_file"] = _tpl_path
`);
    api('Circle', 'tex_tpl_file', {}, {}, 'objects["tex_tpl_file"] = _tpl_path');

    api('manim.constants.QualityDict', 'qd_inst', { args: [{ pixel_width: 1920, pixel_height: 1080, frame_rate: 60 }] }, {}, 'assert $result["pixel_width"] == 1920');
    api('manim.utils.commands.VideoMetadata', 'vm_inst', { args: [{ width: 1920, height: 1080, fps: 60.0 }] }, {}, 'assert $result["width"] == 1920 and $result["height"] == 1080');
    api('manim.utils.commands.capture', 'cmd_cap', { command: ['echo', 'hello'] }, {}, 'assert "hello" in $result[0]');
    api('manim.utils.commands.get_dir_layout', 'dir_layout', { dirpath: '.' }, {}, 'assert hasattr($result, "__iter__")');
    api('manim.utils.tex.TexTemplate.from_file', 'tex_from_file', { file: ref('tex_tpl_file') }, {}, 'assert "amsmath" in $result.preamble');

    // Scene lifecycle & interactive events
    api('manim.scene.scene.Scene.setup', 'sc_setup', {}, { receiver: 'rend_scene' }, 'assert objects["rend_scene"] is not None');
    api('manim.scene.scene.Scene.construct', 'sc_construct', {}, { receiver: 'rend_scene' }, 'assert objects["rend_scene"] is not None');
    api('manim.scene.scene.Scene.tear_down', 'sc_teardown', {}, { receiver: 'rend_scene' }, 'assert objects["rend_scene"] is not None');
    api('manim.scene.scene.SceneInteractContinue', 'sic_inst', { sender: 'rend_scene' }, {}, 'assert $result.sender == "rend_scene"');
    api('manim.scene.scene.SceneInteractContinue.sender', 'sic_snd', {}, { receiver: 'sic_inst' }, 'assert $result == "rend_scene"');
    api('manim.scene.scene.SceneInteractRerun', 'sir_inst', { sender: 'rend_scene', kwargs: { step: 1 } }, {}, 'assert $result.sender == "rend_scene"');
    api('manim.scene.scene.SceneInteractRerun.sender', 'sir_snd', {}, { receiver: 'sir_inst' }, 'assert $result == "rend_scene"');
    api('manim.scene.scene.SceneInteractRerun.kwargs', 'sir_kw', {}, { receiver: 'sir_inst' }, 'assert $result["step"] == 1');
  },
  systemAndFileUtilities(f) {
    const { api, check } = f;
    check(`
import glob, re, os, tempfile, subprocess
from pathlib import Path
from queue import Queue
from PIL import Image
from pydub import AudioSegment
from manim.constants import RendererType, CapStyleType, LineJointType
from manim.scene.section import DefaultSectionType, Section
from manim.utils.deprecation import deprecated, deprecated_params
from manim.utils.caching import handle_caching_play
from manim.mobject.types.image_mobject import ImageMobjectFromCamera
from manim.camera.camera import Camera

_test_tmpdir = tempfile.mkdtemp(prefix="anyvis_sys_")
_test_path = Path(_test_tmpdir) / "guarantee_dir"
_test_code_file = Path(_test_tmpdir) / "test_import.py"
_test_code_file.write_text("x = 10\\n")
_test_wav_file = Path(_test_tmpdir) / "test_audio.wav"
_test_out_wav = Path(_test_tmpdir) / "test_audio_out.wav"
AudioSegment.silent(duration=500).export(str(_test_wav_file), format="wav")
_test_png_file = Path(_test_tmpdir) / "test_img.png"
Image.new("RGB", (64, 64), (255, 0, 0)).save(str(_test_png_file))
_test_svg_file = Path(_test_tmpdir) / "test_vec.svg"
_test_svg_file.write_text('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" /></svg>')
_test_vid_file = Path(_test_tmpdir) / "dummy.mp4"
subprocess.run(["ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=red:s=32x32:d=0.2", "-pix_fmt", "yuv420p", str(_test_vid_file)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
objects["sys_tmpdir_path"] = _test_path
objects["sys_code_path"] = _test_code_file
objects["sys_wav_path"] = str(_test_wav_file)
objects["sys_out_wav_path"] = _test_out_wav
objects["sys_png_path"] = str(_test_png_file)
objects["sys_svg_path"] = str(_test_svg_file)
objects["sys_video_path"] = _test_vid_file
objects["sys_video_dir"] = _test_vid_file.parent
`);
    api('Circle', 'sys_tmpdir_path', {}, {}, 'objects["sys_tmpdir_path"] = _test_path');
    api('Circle', 'sys_code_path', {}, {}, 'objects["sys_code_path"] = _test_code_file');
    api('Circle', 'sys_wav_path', {}, {}, 'objects["sys_wav_path"] = str(_test_wav_file)');
    api('Circle', 'sys_out_wav_path', {}, {}, 'objects["sys_out_wav_path"] = _test_out_wav');
    api('Circle', 'sys_png_path', {}, {}, 'objects["sys_png_path"] = str(_test_png_file)');
    api('Circle', 'sys_svg_path', {}, {}, 'objects["sys_svg_path"] = str(_test_svg_file)');
    api('Circle', 'sys_video_path', {}, {}, 'objects["sys_video_path"] = _test_vid_file');
    api('Circle', 'sys_video_dir', {}, {}, 'objects["sys_video_dir"] = _test_vid_file.parent');

    // 2. file_ops
    api('manim.utils.file_ops.guarantee_existence', 'fop_ge', { path: ref('sys_tmpdir_path') }, {}, 'assert objects["sys_tmpdir_path"].is_dir()');
    api('manim.utils.file_ops.guarantee_empty_existence', 'fop_gee', { path: ref('sys_tmpdir_path') }, {}, 'assert objects["sys_tmpdir_path"].is_dir()');
    api('manim.utils.file_ops.add_import_statement', 'fop_ais', { file: ref('sys_code_path') }, {}, 'assert "from manim import *" in objects["sys_code_path"].read_text()');
    api('manim.utils.file_ops.modify_atime', 'fop_mat', { file_path: ref('sys_code_path') }, {}, 'assert objects["sys_code_path"].exists()');
    api('manim.utils.file_ops.ensure_executable', 'fop_ee', { path_to_exe: ref('sys_code_path') }, {}, 'assert isinstance($result, bool)');
    api('manim.utils.file_ops.copy_template_files', 'fop_ctf', { project_dir: ref('sys_tmpdir_path') }, {}, 'assert (objects["sys_tmpdir_path"] / "manim.cfg").exists()');

    // 3. deprecation & exceptions
    check(`
@deprecated(since="v0.20.0", message="Test deprecated")
def _sample_dep_fn(x):
    return x * 2

@deprecated_params(redirections=[("old_k", "new_k")])
def _sample_dep_params(**kwargs):
    return kwargs.get("new_k")

objects["dep_fn_sample"] = _sample_dep_fn
objects["dep_params_sample"] = _sample_dep_params
`);
    api('Circle', 'dep_fn_sample', {}, {}, 'objects["dep_fn_sample"] = _sample_dep_fn');
    api('Circle', 'dep_params_sample', {}, {}, 'objects["dep_params_sample"] = _sample_dep_params');

    api('manim.utils.deprecation.deprecated', 'dep_dec', { func: ref('dep_fn_sample') }, {}, 'assert callable($result) and $result(5) == 10');
    api('manim.utils.deprecation.deprecated_params', 'dep_param_dec', { params: 'old_k' }, {}, 'assert callable($result)');
    api('manim.utils.exceptions.EndSceneEarlyException', 'exc_esee', { args: ['early exit'] }, {}, 'assert str($result) == "early exit"');
    api('manim.utils.exceptions.MultiAnimationOverrideException', 'exc_maoe', { args: ['override conflict'] }, {}, 'assert str($result) == "override conflict"');
    api('manim.utils.exceptions.RerunSceneException', 'exc_rse', { args: ['rerun requested'] }, {}, 'assert str($result) == "rerun requested"');

    // 4. constants & data_structures
    api('manim.constants.CapStyleType', 'const_cst', { values: [1] }, {}, 'assert $result.ROUND.name == "ROUND"');
    api('manim.constants.LineJointType', 'const_ljt', { values: [1] }, {}, 'assert $result.MITER.name == "MITER"');
    api('manim.constants.RendererType', 'const_rt', { values: ['cairo'] }, {}, 'assert $result.CAIRO.name == "CAIRO"');

    api('Circle', 'mwa_circle', { radius: 0.5 }, {}, 'assert $result is not None');
    api('manim.data_structures.MethodWithArgs', 'mwa_inst', { method: { $method: { api: 'Mobject.shift', receiver: ref('mwa_circle') } }, args: [vec(1, 0, 0)], kwargs: {} }, {}, 'np.testing.assert_allclose($result.args[0], [1, 0, 0])');

    // 5. plugins_flags
    api('manim.plugins.plugins_flags.get_plugins', 'plg_get', {}, {}, 'assert isinstance($result, dict)');
    api('manim.plugins.plugins_flags.list_plugins', 'plg_list', {}, {}, 'assert True');

    // 6. sounds, images, family
    api('manim.utils.sounds.get_full_sound_file_path', 'snd_path', { sound_file_name: ref('sys_wav_path') }, {}, 'assert str($result).endswith(".wav")');
    api('manim.utils.images.get_full_raster_image_path', 'img_path', { image_file_name: ref('sys_png_path') }, {}, 'assert str($result).endswith(".png")');
    api('manim.utils.images.get_full_vector_image_path', 'vec_path', { image_file_name: ref('sys_svg_path') }, {}, 'assert str($result).endswith(".svg")');
    api('manim.utils.family.extract_mobject_family_members', 'fam_ext', { mobjects: [ref('mwa_circle')] }, {}, 'assert len($result) >= 1');

    // 7. animation updaters & override
    api('ApplyMethod', 'am_inst', { method: { $method: { api: 'Mobject.shift', receiver: ref('mwa_circle') } }, args: [vec(1, 0, 0)] }, {}, 'assert True');
    api('manim.animation.transform.ApplyMethod.check_validity_of_input', 'app_chk', { method: { $method: { api: 'Mobject.shift', receiver: ref('mwa_circle') } } }, { receiver: 'am_inst' }, 'assert True');
    api('manim.animation.updaters.mobject_update_utils.assert_is_mobject_method', 'upd_aimm', { method: { $method: { api: 'Mobject.shift', receiver: ref('mwa_circle') } } }, {}, 'assert True');
    check('objects["fade_in_cls"] = FadeIn');
    api('Circle', 'fade_in_cls', {}, {}, 'objects["fade_in_cls"] = FadeIn');
    api('manim.animation.animation.override_animation', 'oa_dec', { animation_class: ref('fade_in_cls') }, {}, 'assert callable($result)');

    // 8. VMobject background images
    api('Circle', 'vm_bg_c1', {}, {}, 'assert $result is not None');
    api('Circle', 'vm_bg_c2', {}, {}, 'assert $result is not None');
    api('manim.mobject.types.vectorized_mobject.VMobject.color_using_background_image', 'vm_cubi', { background_image: ref('sys_png_path') }, { receiver: 'vm_bg_c1' }, 'assert $result.get_background_image() == objects["sys_png_path"]');
    api('manim.mobject.types.vectorized_mobject.VMobject.get_background_image', 'vm_gbi', {}, { receiver: 'vm_bg_c1' }, 'assert $result == objects["sys_png_path"]');
    api('manim.mobject.types.vectorized_mobject.VMobject.match_background_image', 'vm_mbi', { vmobject: ref('vm_bg_c1') }, { receiver: 'vm_bg_c2' }, 'assert $result.get_background_image() == objects["sys_png_path"]');

    // 9. BackgroundColoredVMobjectDisplayer & CoordinateSystem
    api('Camera', 'sys_camera', {}, {}, 'assert $result is not None');
    api('manim.camera.camera.BackgroundColoredVMobjectDisplayer', 'bcvm_disp', { camera: ref('sys_camera') }, {}, 'assert $result is not None');
    api('manim.camera.camera.BackgroundColoredVMobjectDisplayer.get_background_array', 'bcvm_gba', { image: ref('sys_png_path') }, { receiver: 'bcvm_disp' }, 'assert len($result.shape) >= 2');
    api('manim.mobject.graphing.coordinate_systems.CoordinateSystem', 'coord_sys', {}, {}, 'assert $result is not None');

    // 10. Code mobject, register_font, video metadata
    api('manim.mobject.text.code_mobject.Code', 'code_mob', { code_string: "a = 1\\nb = 2\\n", language: 'python' }, {}, 'assert len($result.code_lines) >= 1');
    api('manim.utils.commands.get_video_metadata', 'vid_meta', { path_to_video: ref('sys_video_path') }, {}, 'assert $result["width"] > 0 and $result["height"] > 0');
    check(`
font_candidates = glob.glob("/System/Library/Fonts/*.ttf") + glob.glob("/System/Library/Fonts/*.ttc") + glob.glob("/usr/share/fonts/**/*.ttf", recursive=True) + glob.glob("/usr/share/fonts/**/*.ttc", recursive=True) + glob.glob("C:/Windows/Fonts/*.ttf")
_sys_font = font_candidates[0] if font_candidates else str(_test_png_file)
objects["sys_font_path"] = _sys_font
`);
    api('Circle', 'sys_font_path', {}, {}, 'objects["sys_font_path"] = _sys_font');
    api('manim.mobject.text.text_mobject.register_font', 'reg_font_ctx', { font_file: ref('sys_font_path') }, {}, 'assert hasattr($result, "__enter__")');

    // 11. Section & DefaultSectionType
    api('manim.scene.section.DefaultSectionType', 'sec_type', { values: ['default.normal'] }, {}, 'assert $result.NORMAL.name == "NORMAL"');
    check(`
_sec_inst = Section(DefaultSectionType.NORMAL, objects["sys_video_path"].name, "demo_sec", False)
objects["sec_instance"] = _sec_inst
`);
    api('Circle', 'sec_instance', {}, {}, 'objects["sec_instance"] = _sec_inst');
    api('manim.scene.section.Section.get_dict', 'sec_get_dict', { sections_dir: ref('sys_video_dir') }, { receiver: 'sec_instance' }, 'assert $result["name"] == "demo_sec" and $result["width"] > 0');

    // 12. VectorScene
    api('manim.scene.vector_space_scene.VectorScene', 'vec_scene', {}, {}, 'assert $result is not None');

    // 13. SceneFileWriter advanced
    api('Scene', 'rend_scene', {}, {}, 'assert $result is not None');
    api('CairoRenderer', 'cairo_rend', {}, {}, 'assert $result is not None');
    api('SceneFileWriter', 'sfw_adv', { renderer: ref('cairo_rend'), scene_name: 'AdvWriter' }, {}, 'assert $result is not None');
    api('SceneFileWriter.init_output_directories', 'sfw_adv_init', { scene_name: 'AdvWriter' }, { receiver: 'sfw_adv' }, 'assert objects["sfw_adv"] is not None');
    api('SceneFileWriter.next_section', 'sfw_adv_sec', { name: 'sec_adv', type_: 'normal', skip_animations: false }, { receiver: 'sfw_adv' }, 'assert objects["sfw_adv"] is not None');
    check(`
config["write_to_movie"] = True
_pmd = Path(_test_tmpdir) / "partial_movies"
_pmd.mkdir(parents=True, exist_ok=True)
(_pmd / "cached_part.mp4").write_text("dummy")
objects["sfw_adv"].partial_movie_directory = _pmd
`);
    api('SceneFileWriter.add_partial_movie_file', 'sfw_adv_apmf', { hash_animation: 'test_hash_adv' }, { receiver: 'sfw_adv' }, 'assert any("test_hash_adv" in str(x) for x in objects["sfw_adv"].partial_movie_files)');
    api('SceneFileWriter.begin_animation', 'sfw_adv_ba', { allow_write: false, file_path: null }, { receiver: 'sfw_adv' }, 'assert objects["sfw_adv"] is not None');
    api('SceneFileWriter.end_animation', 'sfw_adv_ea', { allow_write: false }, { receiver: 'sfw_adv' }, 'assert objects["sfw_adv"] is not None');
    api('SceneFileWriter.clean_cache', 'sfw_adv_cc', {}, { receiver: 'sfw_adv' }, 'assert objects["sfw_adv"] is not None');
    api('SceneFileWriter.flush_cache_directory', 'sfw_adv_fcd', {}, { receiver: 'sfw_adv' }, 'assert objects["sfw_adv"] is not None');
    api('SceneFileWriter.create_audio_segment', 'sfw_adv_cas', {}, { receiver: 'sfw_adv' }, 'assert objects["sfw_adv"].audio_segment is not None');
    api('SceneFileWriter.add_sound', 'sfw_adv_as', { sound_file: ref('sys_wav_path'), time: 0, gain: 0 }, { receiver: 'sfw_adv' }, 'assert len(objects["sfw_adv"].audio_segment) >= 500');
    api('manim.scene.scene_file_writer.convert_audio', 'sfw_conv_aud', { input_path: ref('sys_wav_path'), output_path: ref('sys_out_wav_path'), codec_name: 'pcm_s16le' }, {}, 'assert objects["sys_out_wav_path"].exists()');
    api('SceneFileWriter.print_file_ready_message', 'sfw_adv_pfrm', { file_path: ref('sys_wav_path') }, { receiver: 'sfw_adv' }, 'assert objects["sfw_adv"] is not None');

    check(`
_test_img_obj = Image.new("RGBA", (10, 10), (0, 255, 0, 255))
_test_arr = np.zeros((10, 10, 4), dtype=np.uint8)
objects["sys_pil_img"] = _test_img_obj
objects["sys_frame_arr"] = _test_arr
objects["sys_tmpdir_str"] = str(_test_tmpdir) + "/"
config["format"] = "png"
config["write_to_movie"] = False
`);
    api('Circle', 'sys_pil_img', {}, {}, 'objects["sys_pil_img"] = _test_img_obj');
    api('Circle', 'sys_frame_arr', {}, {}, 'objects["sys_frame_arr"] = _test_arr');
    api('Circle', 'sys_tmpdir_str', {}, {}, 'objects["sys_tmpdir_str"] = str(_test_tmpdir) + "/"');
    api('SceneFileWriter.output_image', 'sfw_out_img', { image: ref('sys_pil_img'), target_dir: ref('sys_tmpdir_str'), ext: '.png', zero_pad: 0 }, { receiver: 'sfw_adv' }, 'assert objects["sfw_adv"].frame_count > 0');
    api('SceneFileWriter.save_image', 'sfw_sav_img', { image: ref('sys_pil_img') }, { receiver: 'sfw_adv' }, 'assert objects["sfw_adv"] is not None');
    api('SceneFileWriter.write_frame', 'sfw_wrt_frame', { frame_or_renderer: ref('sys_frame_arr'), num_frames: 1 }, { receiver: 'sfw_adv' }, 'assert objects["sfw_adv"] is not None');

    // 14. CairoRenderer add_frame & Scene add_sound
    check('objects["cairo_rend"].file_writer = objects["sfw_adv"]');
    api('CairoRenderer.add_frame', 'cr_add_frame', { frame: ref('sys_frame_arr'), num_frames: 1 }, { receiver: 'cairo_rend' }, 'assert objects["cairo_rend"].time > 0');
    api('manim.scene.scene.Scene.add_sound', 'sc_add_sound', { sound_file: ref('sys_wav_path'), time_offset: 0, gain: 0 }, { receiver: 'rend_scene' }, 'assert objects["rend_scene"] is not None');

    // 15. RerunSceneHandler
    check(`
_rsh_q = Queue()
objects["sys_queue"] = _rsh_q
`);
    api('Circle', 'sys_queue', {}, {}, 'objects["sys_queue"] = _rsh_q');
    api('manim.scene.scene.RerunSceneHandler', 'rsh_inst', { queue: ref('sys_queue') }, {}, 'assert $result is not None');
    api('manim.scene.scene.RerunSceneHandler.on_modified', 'rsh_mod', { event: null }, { receiver: 'rsh_inst' }, 'assert not objects["sys_queue"].empty() and objects["sys_queue"].get().sender == "file"');

    // 16. ImageMobjectFromCamera.interpolate_color
    check(`
_imfc_cam = Camera()
_imfc_1 = ImageMobjectFromCamera(_imfc_cam)
_imfc_1.pixel_array = np.zeros((10, 10, 4), dtype=np.uint8)
_imfc_2 = ImageMobjectFromCamera(_imfc_cam)
_imfc_2.pixel_array = np.full((10, 10, 4), 100, dtype=np.uint8)
objects["imfc_1"] = _imfc_1
objects["imfc_2"] = _imfc_2
`);
    api('Circle', 'imfc_1', {}, {}, 'objects["imfc_1"] = _imfc_1');
    api('Circle', 'imfc_2', {}, {}, 'objects["imfc_2"] = _imfc_2');
    api('manim.mobject.types.image_mobject.ImageMobjectFromCamera', 'imfc_target', { camera: ref('sys_camera') }, {}, 'assert $result is not None');
    api('manim.mobject.types.image_mobject.ImageMobjectFromCamera.interpolate_color', 'imfc_interp', { mobject1: ref('imfc_1'), mobject2: ref('imfc_2'), alpha: 0.5 }, { receiver: 'imfc_target' }, 'assert objects["imfc_target"].pixel_array[0, 0, 0] == 50');

    // 17. Hashing & caching play
    check(`
objects["sys_anim_circle"] = Circle()
objects["sys_anim_fade"] = FadeIn(objects["sys_anim_circle"])
`);
    api('Circle', 'sys_anim_circle', {}, {}, 'objects["sys_anim_circle"] = Circle()');
    api('Circle', 'sys_anim_fade', {}, {}, 'objects["sys_anim_fade"] = FadeIn(objects["sys_anim_circle"])');
    api('manim.utils.hashing.get_hash_from_play_call', 'hsh_play', { scene_object: ref('rend_scene'), camera_object: ref('sys_camera'), animations_list: [ref('sys_anim_fade')], current_mobjects_list: [ref('sys_anim_circle')] }, {}, 'assert "_" in $result');
    check(`
@handle_caching_play
def _mock_cache_play(renderer, scene, *args, **kwargs):
    return "ok"
objects["mock_cached_play_fn"] = _mock_cache_play
`);
    api('Circle', 'mock_cached_play_fn', {}, {}, 'objects["mock_cached_play_fn"] = _mock_cache_play');
    api('manim.utils.caching.handle_caching_play', 'hcp_dec', { func: ref('mock_cached_play_fn') }, {}, 'assert callable($result)');

    // 18. tex_file_writing
    api('manim.utils.tex_file_writing.make_tex_compilation_command', 'tfw_mcmd', { tex_compiler: 'pdflatex', output_format: '.pdf', tex_file: ref('sys_code_path'), tex_dir: ref('sys_tmpdir_path') }, {}, 'assert len($result) >= 5');
    api('manim.utils.tex_file_writing.generate_tex_file', 'tfw_gen_tex', { expression: 'Hello' }, {}, 'assert str($result).endswith(".tex")');
    api('manim.utils.tex_file_writing.delete_nonsvg_files', 'tfw_del_nonsvg', {}, {}, 'assert True');
    api('manim.utils.tex_file_writing.tex_to_svg_file', 'tfw_t2s', { expression: 'Hello' }, {}, 'assert str($result).endswith(".svg") and os.path.exists($result)');
    api('manim.utils.tex_file_writing.compile_tex', 'tfw_comp', { tex_file: ref('tfw_gen_tex'), tex_compiler: 'latex', output_format: '.dvi' }, {}, 'assert str($result).endswith(".dvi") and os.path.exists($result)');
    api('manim.utils.tex_file_writing.convert_to_svg', 'tfw_c2s', { dvi_file: ref('tfw_comp'), extension: '.dvi', page: 1 }, {}, 'assert str($result).endswith(".svg") and os.path.exists($result)');
    check(`
_m_input = re.search(r"([0-9a-fA-F]+)", "0041")
_m_pkg = re.search(r"(\\w+)", "amsmath")
objects["re_match_input"] = _m_input
objects["re_match_pkg"] = _m_pkg
`);
    api('Circle', 're_match_input', {}, {}, 'objects["re_match_input"] = _m_input');
    api('Circle', 're_match_pkg', {}, {}, 'objects["re_match_pkg"] = _m_pkg');
    api('manim.utils.tex_file_writing.insight_inputenc_error', 'tfw_iie', { matching: ref('re_match_input') }, {}, 'assert "LATIN CAPITAL LETTER A" in list($result)[0]');
    api('manim.utils.tex_file_writing.insight_package_not_found_error', 'tfw_ipnfe', { matching: ref('re_match_pkg') }, {}, 'assert "amsmath" in list($result)[0]');
    check(`
_comp_log = ["! Undefined control sequence.", "l.4 \\\\foo", "End error."]
_tex_src = ["line1\\n", "line2\\n", "line3\\n", "\\\\foo\\n", "line5\\n", "line6\\n"]
_log_file = Path(_test_tmpdir) / "test.log"
_log_file.write_text("! Error\\nl.4 \\\\bad\\n")
_bad_tex = Path(_test_tmpdir) / "bad.tex"
_bad_tex.write_text("line1\\nline2\\nline3\\n\\\\bad\\nline5\\nline6\\n")
objects["sys_log_lines"] = _comp_log
objects["sys_tex_src"] = _tex_src
objects["sys_log_file"] = _log_file
objects["sys_bad_tex"] = _bad_tex
`);
    api('Circle', 'sys_log_lines', {}, {}, 'objects["sys_log_lines"] = _comp_log');
    api('Circle', 'sys_tex_src', {}, {}, 'objects["sys_tex_src"] = _tex_src');
    api('Circle', 'sys_log_file', {}, {}, 'objects["sys_log_file"] = _log_file');
    api('Circle', 'sys_bad_tex', {}, {}, 'objects["sys_bad_tex"] = _bad_tex');
    api('manim.utils.tex_file_writing.print_tex_error', 'tfw_pte', { tex_compilation_log: ref('sys_log_lines'), error_start_index: 0, tex_source: ref('sys_tex_src') }, {}, 'assert True');
    api('manim.utils.tex_file_writing.print_all_tex_errors', 'tfw_pate', { log_file: ref('sys_log_file'), tex_compiler: 'latex', tex_file: ref('sys_bad_tex') }, {}, 'assert True');
  },
};

test('native API families have executable postconditions', { timeout: 300_000 }, async t => {
  const health = await discoverPython(); if (!health.available) { t.skip('Manim required'); return; }
  const directory = await mkdtemp(path.join(tmpdir(), 'anyvis-api-families-'));
  const results = [];
  try {
    for (const [family, build] of Object.entries(families)) {
      await t.test(family, { timeout: 40_000 }, async () => {
        const f = fixture(); build(f);
        const c = compileProject(f.project); assert.deepEqual(c.diagnostics.filter(d => d.severity === 'error'), []);
        await writeFile(path.join(directory, 'test_icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80" fill="red" /></svg>');
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
