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
    ]) api(id, id, params, {}, shape);
    api('Line', 'horizontal', { start: vec(0, 0, 0), end: vec(2, 0, 0) }, {}, 'assert abs($result.get_length()-2)<1e-6');
    api('Line', 'vertical', { start: vec(0, 0, 0), end: vec(0, 2, 0) }, {}, 'assert abs($result.get_length()-2)<1e-6');
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
    ]) api(id, id, params, {}, shape);
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
