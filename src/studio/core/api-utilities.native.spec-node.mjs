import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { discoverPython } from '../../../server/server.mjs';
import { apiEvidenceSources } from '../../../scripts/api-evidence.mjs';
import { getApiEntry } from './api-registry.ts';
import { createApiCompiler, API_RUNTIME } from './api-compiler.ts';
import { createAction } from './catalog.ts';

const execute = promisify(execFile);
const arr = value => ({ $array: value });
const ref = name => ({ $ref: name });
const fn = (params, body) => ({ $lambda: { params, body } });
const local = name => ({ $local: name });
const op = (operator, ...args) => ({ $op: [operator, ...args] });
const cases = [];
// Oracle expressions are independently written native calls. Structured values
// below are passed to the production compiler; no observed call is handwritten.
function add(module, name, params, expected, probe = 'value', setup = '', receiver = '') {
  cases.push({ id: `manim.utils.${module}.${name}`, params, expected, probe, setup, receiver });
}
const curve = [[0, 0, 0], [1, 2, 0], [2, -1, 0], [3, 0, 0]];
const points = arr(curve), p = 'np.array([[0.,0,0],[1,2,0],[2,-1,0],[3,0,0]])';
add('bezier', 'bezier', { points }, `b.bezier(${p})`, 'curve');
add('bezier', 'bezier_remap', { bezier_tuples: arr([curve]), new_number_of_curves: 3 }, `b.bezier_remap(np.array([${p}]),3)`);
add('bezier', 'get_quadratic_approximation_of_cubic', Object.fromEntries(['a0', 'h0', 'h1', 'a1'].map((k, i) => [k, arr(curve[i])])), `b.get_quadratic_approximation_of_cubic(*${p})`);
for (const name of ['get_smooth_cubic_bezier_handle_points', 'get_smooth_open_cubic_bezier_handle_points'])
  add('bezier', name, { anchors: points }, `b.${name}(${p})`);
add('bezier', 'get_smooth_closed_cubic_bezier_handle_points', { anchors: arr([...curve, curve[0]]) }, `b.get_smooth_closed_cubic_bezier_handle_points(np.vstack([${p},[0,0,0]]))`);
for (const alpha of [0, 0.37, 1]) {
  add('bezier', 'integer_interpolate', { start: 2, end: 9, alpha }, `b.integer_interpolate(2,9,${alpha})`);
  add('bezier', 'interpolate', { start: arr([1, 2, 3]), end: arr([4, -1, 0]), alpha }, `b.interpolate(np.array([1,2,3]),np.array([4,-1,0]),${alpha})`);
}
add('bezier', 'inverse_interpolate', { start: 2, end: 10, value: 4 }, 'b.inverse_interpolate(2,10,4)');
add('bezier', 'match_interpolate', { new_start: -1, new_end: 1, old_start: 0, old_end: 10, old_value: 7 }, 'b.match_interpolate(-1,1,0,10,7)');
add('bezier', 'mid', { start: arr([1, 2, 3]), end: arr([3, 4, 5]) }, 'b.mid(np.array([1,2,3]),np.array([3,4,5]))');
for (const close of [false, true]) add('bezier', 'is_closed', { points: arr(close ? [...curve, curve[0]] : curve) }, close ? `b.is_closed(np.vstack([${p},[0,0,0]]))` : `b.is_closed(${p})`);
add('bezier', 'partial_bezier_points', { points, a: 0.2, b: 0.8 }, `b.partial_bezier_points(${p},.2,.8)`);
add('bezier', 'split_bezier', { points, t: 0.4 }, `b.split_bezier(${p},.4)`);
add('bezier', 'subdivide_bezier', { points, n_divisions: 4 }, `b.subdivide_bezier(${p},4)`);
for (const point of [[0, 0, 0], [10, 10, 0]]) {
  add('bezier', 'point_lies_on_bezier', { point: arr(point), control_points: points }, `b.point_lies_on_bezier(np.array(${JSON.stringify(point)}),${p})`);
  add('bezier', 'proportions_along_bezier_curve_for_point', { point: arr(point), control_points: points }, `b.proportions_along_bezier_curve_for_point(np.array(${JSON.stringify(point)}),${p})`);
}

add('config_ops', 'merge_dicts_recursively', { dicts: [{ a: { x: 1 }, b: 2 }, { a: { y: 3 }, b: 4 }] }, 'c.merge_dicts_recursively({"a":{"x":1},"b":2},{"a":{"y":3},"b":4})');
add('config_ops', 'update_dict_recursively', { current_dict: ref('data'), others: [{ a: { y: 3 }, b: 4 }] }, 'c.update_dict_recursively(objects["data"],{"a":{"y":3},"b":4})', 'mutation', 'objects={"data":{"a":{"x":1},"b":2}}');
add('iterables', 'adjacent_n_tuples', { objects: [1, 2, 3, 4], n: 3 }, 'i.adjacent_n_tuples([1,2,3,4],3)');
add('iterables', 'adjacent_pairs', { objects: [1, 2, 3] }, 'i.adjacent_pairs([1,2,3])');
add('iterables', 'all_elements_are_instances', { iterable: [ref('a'), ref('b')], Class: { $api: 'Mobject' } }, 'i.all_elements_are_instances([objects["a"],objects["b"]],Mobject)', 'value', 'objects={"a":Circle(),"b":Square()}');
add('iterables', 'batch_by_property', { items: [1, 1, 2, 3, 3], property_func: fn(['x'], local('x')) }, 'i.batch_by_property([1,1,2,3,3],lambda x:x)');
add('iterables', 'concatenate_lists', { list_of_lists: [[1, 2], [3], []] }, 'i.concatenate_lists([1,2],[3],[])');
add('iterables', 'hash_obj', { obj: { a: [1, 2], b: 3 } }, 'i.hash_obj({"a":[1,2],"b":3})');
for (const name of ['list_difference_update', 'list_update']) add('iterables', name, { l1: [1, 2, 3], l2: [2, 4] }, `i.${name}([1,2,3],[2,4])`);
for (const name of ['listify', 'tuplify']) for (const value of [3, 'abc', [1, 2]]) add('iterables', name, { obj: value }, `i.${name}(${JSON.stringify(value)})`);
for (const name of ['make_even', 'make_even_by_cycling']) add('iterables', name, { iterable_1: [1, 2], iterable_2: [3, 4, 5, 6, 7] }, `i.${name}([1,2],[3,4,5,6,7])`);
add('iterables', 'remove_list_redundancies', { lst: [1, 2, 1, 3, 2] }, 'i.remove_list_redundancies([1,2,1,3,2])');
add('iterables', 'remove_nones', { sequence: [null, 0, 1, null, false] }, 'i.remove_nones([None,0,1,None,False])');
for (const name of ['resize_array', 'resize_preserving_order', 'resize_with_interpolation', 'stretch_array_to_length']) add('iterables', name, { nparray: arr([[1, 2], [3, 4], [5, 6]]), length: 7 }, `i.${name}(np.array([[1.,2],[3,4],[5,6]]),7)`);
add('iterables', 'uniq_chain', { args: [[1, 2], [2, 3], [1, 4]] }, 'i.uniq_chain([1,2],[2,3],[1,4])');

for (const name of ['clockwise_path', 'counterclockwise_path', 'straight_path']) add('paths', name, {}, `paths.${name}()`, 'path');
add('paths', 'path_along_arc', { arc_angle: 1.2, axis: arr([0, 0, 1]) }, 'paths.path_along_arc(1.2,np.array([0,0,1]))', 'path');
add('paths', 'path_along_circles', { arc_angle: 1.2, circles_centers: arr([0, 0, 0]) }, 'paths.path_along_circles(1.2,np.zeros(3))', 'path');
add('paths', 'spiral_path', { angle: 1.2 }, 'paths.spiral_path(1.2)', 'path');
add('simple_functions', 'binary_search', { function: fn(['x'], op('*', local('x'), local('x'))), target: 2, lower_bound: 0, upper_bound: 2 }, 's.binary_search(lambda x:x*x,2,0,2)');
for (const a of [-2, 0.3, 4]) add('simple_functions', 'clip', { a, min_a: 0, max_a: 1 }, `s.clip(${a},0,1)`);
for (const x of [-2, 0, 3]) add('simple_functions', 'sigmoid', { x }, `s.sigmoid(${x})`);
const v1 = arr([1, 2, 3]), v2 = arr([-2, 1, 0]), axis = arr([0, 0, 1]);
for (const name of ['angle_between_vectors', 'cross', 'get_unit_normal']) add('space_ops', name, { v1, v2 }, `sp.${name}(np.array([1.,2,3]),np.array([-2.,1,0]))`);
add('space_ops', 'cross2d', { a: arr([1, 2]), b: arr([3, 4]) }, 'sp.cross2d(np.array([1,2]),np.array([3,4]))');
for (const name of ['angle_of_vector', 'z_to_vector']) add('space_ops', name, { vector: v1 }, `sp.${name}(np.array([1.,2,3]))`);
add('space_ops', 'cartesian_to_spherical', { vec: v1 }, 'sp.cartesian_to_spherical(np.array([1.,2,3]))');
add('space_ops', 'spherical_to_cartesian', { spherical: arr([2, 0.3, 0.7]) }, 'sp.spherical_to_cartesian(np.array([2.,.3,.7]))');
add('space_ops', 'R3_to_complex', { point: v1 }, 'sp.R3_to_complex([1,2,3])');
add('space_ops', 'complex_to_R3', { complex_num: { $complex: [2, -3] } }, 'sp.complex_to_R3(2-3j)');
add('space_ops', 'complex_func_to_R3_func', { complex_func: fn(['z'], op('*', local('z'), local('z'))) }, 'sp.complex_func_to_R3_func(lambda z:z*z)', 'vector');
add('space_ops', 'center_of_mass', { points }, `sp.center_of_mass(${p})`);
add('space_ops', 'compass_directions', { n: 5 }, 'sp.compass_directions(5)');
add('space_ops', 'earclip_triangulation', { verts: arr([[0, 0, 0], [2, 0, 0], [2, 1, 0], [0, 1, 0]]), ring_ends: [4] }, 'sp.earclip_triangulation(np.array([[0.,0,0],[2,0,0],[2,1,0],[0,1,0]]),[4])');
add('space_ops', 'find_intersection', { p0s: arr([[0, 0, 0]]), v0s: arr([[1, 1, 0]]), p1s: arr([[0, 1, 0]]), v1s: arr([[1, -1, 0]]) }, 'sp.find_intersection(np.array([[0.,0,0]]),np.array([[1.,1,0]]),np.array([[0.,1,0]]),np.array([[1.,-1,0]]))');
add('space_ops', 'get_winding_number', { points: arr([[1, 0, 0], [0, 1, 0], [-1, 0, 0], [0, -1, 0]]) }, 'sp.get_winding_number(np.array([[1.,0,0],[0,1,0],[-1,0,0],[0,-1,0]]))');
add('space_ops', 'line_intersection', { line1: arr([[0, 0, 0], [2, 2, 0]]), line2: arr([[0, 2, 0], [2, 0, 0]]) }, 'sp.line_intersection(np.array([[0.,0,0],[2,2,0]]),np.array([[0.,2,0],[2,0,0]]))');
add('space_ops', 'midpoint', { point1: v1, point2: v2 }, 'sp.midpoint([1,2,3],[-2,1,0])');
add('space_ops', 'norm_squared', { v: v1 }, 'sp.norm_squared(np.array([1,2,3]))');
add('space_ops', 'normalize', { vect: v1 }, 'sp.normalize(np.array([1.,2,3]))');
add('space_ops', 'normalize_along_axis', { array: ref('data'), axis: 1 }, 'sp.normalize_along_axis(objects["data"],1)', 'mutation', 'objects={"data":np.array([[3.,4,0],[0,0,2]])}');
add('space_ops', 'perpendicular_bisector', { line: arr([[0, 0, 0], [2, 0, 0]]) }, 'sp.perpendicular_bisector(np.array([[0.,0,0],[2,0,0]]))');
const q = [0.8, 0, 0, 0.6];
for (const name of ['angle_axis_from_quaternion', 'quaternion_conjugate']) add('space_ops', name, { quaternion: arr(q) }, `sp.${name}(np.array([.8,0,0,.6]))`);
add('space_ops', 'quaternion_from_angle_axis', { angle: 1.2, axis }, 'sp.quaternion_from_angle_axis(1.2,np.array([0.,0,1]))');
add('space_ops', 'quaternion_mult', { quats: [arr(q), arr([1, 0, 0, 0])] }, 'sp.quaternion_mult(np.array([.8,0,0,.6]),np.array([1.,0,0,0]))');
add('space_ops', 'regular_vertices', { n: 5, radius: 2, start_angle: 0.2 }, 'sp.regular_vertices(5,radius=2,start_angle=.2)');
add('space_ops', 'rotate_vector', { vector: v1, angle: 1.2, axis }, 'sp.rotate_vector(np.array([1.,2,3]),1.2,np.array([0.,0,1]))');
add('space_ops', 'rotation_about_z', { angle: 1.2 }, 'sp.rotation_about_z(1.2)');
for (const name of ['rotation_matrix', 'rotation_matrix_transpose']) add('space_ops', name, { angle: 1.2, axis }, `sp.${name}(1.2,np.array([0.,0,1]))`);
for (const name of ['rotation_matrix_from_quaternion', 'rotation_matrix_transpose_from_quaternion']) add('space_ops', name, { quat: arr(q) }, `sp.${name}(np.array([.8,0,0,.6]))`);
for (const name of ['shoelace', 'shoelace_direction']) add('space_ops', name, { x_y: arr([[0, 0], [2, 0], [2, 1], [0, 1]]) }, `sp.${name}(np.array([[0.,0],[2,0],[2,1],[0,1]]))`);
add('space_ops', 'thick_diagonal', { dim: 5, thickness: 3 }, 'sp.thick_diagonal(5,3)');

// Color utilities and HSV/ManimColor methods
add('color.core', 'color_to_rgb', { color: '#FF0000' }, 'cc.color_to_rgb("#FF0000")');
add('color.core', 'color_to_rgba', { color: '#FF0000', alpha: 0.5 }, 'cc.color_to_rgba("#FF0000",0.5)');
add('color.core', 'color_to_int_rgb', { color: '#FF0000' }, 'cc.color_to_int_rgb("#FF0000")');
add('color.core', 'color_to_int_rgba', { color: '#FF0000', alpha: 0.5 }, 'cc.color_to_int_rgba("#FF0000",0.5)');
add('color.core', 'hex_to_rgb', { hex_code: '#FF0000' }, 'cc.hex_to_rgb("#FF0000")');
add('color.core', 'rgb_to_hex', { rgb: arr([255, 0, 0]) }, 'cc.rgb_to_hex(np.array([255,0,0]))');
add('color.core', 'rgb_to_color', { rgb: arr([255, 0, 0]) }, 'cc.rgb_to_color(np.array([255,0,0]))');
add('color.core', 'rgba_to_color', { rgba: arr([1, 0, 0, 0.5]) }, 'cc.rgba_to_color(np.array([1.,0,0,0.5]))');
add('color.core', 'interpolate_color', { color1: ref('red'), color2: ref('green'), alpha: 0.5 }, 'cc.interpolate_color(objects["red"],objects["green"],0.5)', 'value', 'objects={"red":cc.ManimColor("#FF0000"),"green":cc.ManimColor("#00FF00")}');
add('color.core', 'invert_color', { color: ref('red') }, 'cc.invert_color(objects["red"])', 'value', 'objects={"red":cc.ManimColor("#FF0000")}');
add('color.core', 'average_color', { colors: ['#FF0000', '#00FF00'] }, 'cc.average_color("#FF0000","#00FF00")');
add('color.core', 'color_gradient', { reference_colors: ['#FF0000', '#00FF00'], length_of_output: 3 }, 'cc.color_gradient(["#FF0000","#00FF00"],3)');
add('color.core', 'get_shaded_rgb', { rgb: arr([1, 0, 0]), point: arr([0, 0, 0]), unit_normal_vect: arr([0, 0, 1]), light_source: arr([0, 0, 10]) }, 'cc.get_shaded_rgb(np.array([1.,0,0]),np.array([0.,0,0]),np.array([0.,0,1.]),np.array([0.,0,10.]))');
add('color.core', 'random_color', {}, 'cc.random_color()');
add('color.core', 'random_bright_color', {}, 'cc.random_bright_color()');
add('color.core', 'RandomColorGenerator', { seed: 42 }, 'cc.RandomColorGenerator(seed=42)', 'color_gen');
add('color.core', 'RandomColorGenerator.next', {}, 'objects["gen"].next()', 'value', 'objects={"gen":cc.RandomColorGenerator(seed=42)}', 'gen');

// ManimColor class and methods
add('color.core', 'ManimColor', { value: '#FF0000', alpha: 1.0 }, 'cc.ManimColor("#FF0000",1.0)');
add('color.core', 'ManimColor.contrasting', {}, 'objects["red"].contrasting()', 'value', 'objects={"red":cc.ManimColor("#FF0000")}', 'red');
add('color.core', 'ManimColor.to_int_rgb', {}, 'objects["red"].to_int_rgb()', 'value', 'objects={"red":cc.ManimColor("#FF0000")}', 'red');
add('color.core', 'ManimColor.to_int_rgba', {}, 'objects["red"].to_int_rgba()', 'value', 'objects={"red":cc.ManimColor("#FF0000")}', 'red');
add('color.core', 'ManimColor.to_int_rgba_with_alpha', { alpha: 0.6 }, 'objects["red"].to_int_rgba_with_alpha(0.6)', 'value', 'objects={"red":cc.ManimColor("#FF0000")}', 'red');
add('color.core', 'ManimColor.to_rgba_with_alpha', { alpha: 0.6 }, 'objects["red"].to_rgba_with_alpha(0.6)', 'value', 'objects={"red":cc.ManimColor("#FF0000")}', 'red');
add('color.core', 'ManimColor.opacity', { opacity: 0.4 }, 'objects["red"].opacity(0.4)', 'value', 'objects={"red":cc.ManimColor("#FF0000")}', 'red');
add('color.core', 'ManimColor.into', { class_type: { $api: 'manim.utils.color.core.HSV' } }, 'objects["red"].into(cc.HSV)', 'value', 'objects={"red":cc.ManimColor("#FF0000")}', 'red');
add('color.core', 'ManimColor.parse', { color: '#123456', alpha: 0.8 }, 'cc.ManimColor.parse("#123456",0.8)');

// HSV class and properties
add('color.core', 'HSV', { hsv: arr([0.5, 0.8, 0.9]), alpha: 1.0 }, 'cc.HSV(np.array([0.5,0.8,0.9]),1.0)');
add('color.core', 'HSV.h', {}, 'objects["hsv_obj"].h', 'value', 'objects={"hsv_obj":cc.HSV(np.array([0.5,0.8,0.9]),1.0)}', 'hsv_obj');
add('color.core', 'HSV.hue', {}, 'objects["hsv_obj"].hue', 'value', 'objects={"hsv_obj":cc.HSV(np.array([0.5,0.8,0.9]),1.0)}', 'hsv_obj');
add('color.core', 'HSV.s', {}, 'objects["hsv_obj"].s', 'value', 'objects={"hsv_obj":cc.HSV(np.array([0.5,0.8,0.9]),1.0)}', 'hsv_obj');
add('color.core', 'HSV.saturation', {}, 'objects["hsv_obj"].saturation', 'value', 'objects={"hsv_obj":cc.HSV(np.array([0.5,0.8,0.9]),1.0)}', 'hsv_obj');
add('color.core', 'HSV.v', {}, 'objects["hsv_obj"].v', 'value', 'objects={"hsv_obj":cc.HSV(np.array([0.5,0.8,0.9]),1.0)}', 'hsv_obj');
add('color.core', 'HSV.value', {}, 'objects["hsv_obj"].value', 'value', 'objects={"hsv_obj":cc.HSV(np.array([0.5,0.8,0.9]),1.0)}', 'hsv_obj');

// Path objects are distinct from strings in Manim's filesystem APIs. The only
// module executed here is a fixed fixture written into this test's temp folder.
add('file_ops', 'add_extension_if_not_present', { file_name: { $path: '图形' }, extension: '.svg' }, 'files.add_extension_if_not_present(Path("图形"),".svg")');
add('file_ops', 'add_extension_if_not_present', { file_name: { $path: '图形.svg' }, extension: '.svg' }, 'files.add_extension_if_not_present(Path("图形.svg"),".svg")');
add('file_ops', 'add_version_before_extension', { file_name: { $path: 'fixture.py' } }, 'files.add_version_before_extension(Path("fixture.py"))');
add('file_ops', 'seek_full_path_from_defaults', { file_name: 'fixture', default_dir: { $path: '.' }, extensions: ['.py'] }, 'files.seek_full_path_from_defaults("fixture",Path("."),[".py"])');
for (const name of ['get_template_names', 'get_template_path', 'is_gif_format', 'is_mov_format', 'is_mp4_format', 'is_png_format', 'is_webm_format', 'write_to_movie']) add('file_ops', name, {}, `files.${name}()`);
add('module_ops', 'get_module', { file_name: { $path: 'fixture.py' } }, 'modules.get_module(Path("fixture.py"))', 'module');
add('module_ops', 'get_scene_classes_from_module', { module: ref('fixture') }, 'modules.get_scene_classes_from_module(objects["fixture"])', 'classes', 'objects={"fixture":modules.get_module(Path("fixture.py"))}');
add('module_ops', 'get_scenes_to_render', { scene_classes: [ref('fixture')] }, 'modules.get_scenes_to_render([objects["fixture"]])', 'classes', 'config.scene_names=[]; objects={"fixture":modules.get_module(Path("fixture.py")).FixtureScene}');
add('module_ops', 'scene_classes_from_file', { file_path: { $path: 'fixture.py' }, full_list: true }, 'modules.scene_classes_from_file(Path("fixture.py"),full_list=True)', 'classes');

const oracle = `
import json, numbers, random
from pathlib import Path
from collections.abc import Iterator
from manim.utils import bezier as b, config_ops as c, iterables as i, paths, simple_functions as s, space_ops as sp
from manim.utils import file_ops as files, module_ops as modules
from manim.utils.color import core as cc

def probe(value, kind, objects):
    if kind == "module":
        assert value.MARKER == 42
        return (value.MARKER, sorted(cls.__name__ for cls in modules.get_scene_classes_from_module(value)))
    if kind == "classes":
        assert len(value) == 1 and issubclass(value[0],Scene)
        return [cls.__name__ for cls in value]
    if kind == "curve": return [value(t) for t in [0,.2,.5,.8,1]]
    if kind == "path":
        return [value(np.array([[0.,0,0],[1,2,0]]),np.array([[2.,1,0],[-1,0,0]]),t) for t in [0,.2,.5,.8,1]]
    if kind == "vector": return [value(np.array(p)) for p in [[0.,0,0],[1,2,0],[-1,.5,0]]]
    if kind == "mutation": return (value, objects["data"])
    if kind == "color_gen": return [value.next() for _ in range(5)]
    return value

def compare(a, b):
    if isinstance(a,Iterator): a=list(a)
    if isinstance(b,Iterator): b=list(b)
    if isinstance(a,np.ndarray) or isinstance(b,np.ndarray):
        assert isinstance(a,np.ndarray) and isinstance(b,np.ndarray), (type(a),type(b))
        assert a.shape==b.shape, (a.shape,b.shape)
        np.testing.assert_allclose(a,b,rtol=1e-9,atol=1e-9,equal_nan=False)
    elif isinstance(a,dict):
        assert isinstance(b,dict) and a.keys()==b.keys()
        for key in a: compare(a[key],b[key])
    elif isinstance(a,(list,tuple)):
        assert type(a) is type(b) and len(a)==len(b)
        for x,y in zip(a,b): compare(x,y)
    elif isinstance(a,numbers.Number): np.testing.assert_allclose(a,b,rtol=1e-9,atol=1e-9,equal_nan=False)
    else: assert a==b, (a,b)

outcomes=[]
def run_case(api_id, expected, observed):
    try:
        np.random.seed(17); random.seed(17); a=expected()
        np.random.seed(17); random.seed(17); b=observed()
        compare(a,b)
        outcomes.append({"apiId":api_id,"status":"verified"})
    except Exception as error:
        outcomes.append({"apiId":api_id,"status":"failed","reason":type(error).__name__+": "+str(error)[:500]})
`;

test('numeric utilities and returned callbacks match native behavior', { timeout: 120_000 }, async t => {
  const health = await discoverPython(); if (!health.available) { t.skip('Manim required'); return; }
  const directory = await mkdtemp(path.join(tmpdir(), 'anyvis-api-utilities-'));
  try {
    const compiler = createApiCompiler(), probes = [];
    for (const [index, item] of cases.entries()) {
      const entry = getApiEntry(item.id); assert.ok(entry, item.id);
      const known = new Set(entry.parameters.map(p => p.name));
      for (const key of Object.keys(item.params)) assert.ok(known.has(key), `${item.id}: ${key}`);
      const action = createAction(entry.type, { name: 'result', mode: 'store', ...(item.receiver ? { receiver: item.receiver } : {}), ...Object.fromEntries(Object.entries(item.params).map(([k, v]) => [`p_${k}`, JSON.stringify(v)])) });
      const compiled = compiler.compile(action, entry, new Set(['data', 'a', 'b', 'fixture', 'red', 'green', 'gen', 'hsv_obj']), {});
      const setup = item.setup || 'objects={}';
      for (const [name, expression, prelude] of [['expected', item.expected, []], ['observed', compiled.expression, compiled.prelude]])
        probes.push(`def ${name}_${index}():\n${[setup, ...prelude, `value=${expression}`, `return probe(value,${JSON.stringify(item.probe)},objects)`].map(l => '    ' + l).join('\n')}`);
      probes.push(`run_case(${JSON.stringify(item.id)},expected_${index},observed_${index})`);
    }
    const file = path.join(directory, 'utilities.py');
    await writeFile(path.join(directory, 'fixture.py'), 'from manim import Scene\nMARKER=6*7\nclass FixtureScene(Scene):\n    pass\n');
    await writeFile(file, `from manim import *\nimport numpy as np\n${compiler.imports().join('\n')}\n${API_RUNTIME}\n${oracle}\n${probes.join('\n')}\nprint('ANYVIS_UTILITIES '+json.dumps(outcomes))\n`);
    const { stdout } = await execute(health.python, [file], { cwd: directory, timeout: 100_000, maxBuffer: 2 * 1024 * 1024 });
    const line = stdout.split('\n').find(l => l.startsWith('ANYVIS_UTILITIES ')); assert.ok(line, stdout);
    const outcomes = JSON.parse(line.slice('ANYVIS_UTILITIES '.length));
    const failures = outcomes.filter(o => o.status !== 'verified');
    // A failing scenario excludes the entire API, even if its other scenarios pass.
    const failedIds = new Set(failures.map(o => o.apiId));
    const apiIds = [...new Set(outcomes.filter(o => !failedIds.has(o.apiId)).map(o => o.apiId))].sort();
    t.diagnostic(`${cases.length} scenarios; ${apiIds.length} distinct verified utilities; ${failures.length} failures.`);
    if (process.env.ANYVIS_API_UTILITIES_REPORT) {
      const fixture = 'src/studio/core/api-utilities.native.spec-node.mjs';
      const registry = await readFile(new URL('./api-registry.json', import.meta.url));
      const destination = path.resolve(process.env.ANYVIS_API_UTILITIES_REPORT); await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, JSON.stringify({ fixture, sourceFiles: await apiEvidenceSources(fixture), registrySha256: createHash('sha256').update(registry).digest('hex'), passed: failures.length === 0, engineVersion: health.version, renderer: 'cairo', apiIds, outcomes, checks: 'Compiled calls compared against independent direct native calls; numeric values, shapes, sequence types, mutation results and returned callbacks sampled at multiple inputs. No per-API video claim.' }, null, 2) + '\n');
    }
    assert.deepEqual(failures, []);
    assert.ok(apiIds.length >= 75);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
