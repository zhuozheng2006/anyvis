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
import { apiEvidenceSources, nativeExecutionEnvironment, behaviorEvidenceGap } from '../../../scripts/api-evidence.mjs';

const execute = promisify(execFile);
const ref = name => ({ $ref: name });
const array = value => ({ $array: value });
const fn = (params, body) => ({ $lambda: { params, body } });
const cases = [];
const add = (id, setup, params, check) => cases.push({ id, setup, params, check });

const cs = 'manim.mobject.graphing.coordinate_systems.';
const coord = cs + 'CoordinateSystem.';
const nl = 'manim.mobject.graphing.number_line.NumberLine.';
const funcs = 'manim.mobject.graphing.functions.';
const gg = 'manim.mobject.graph.GenericGraph.';

// The concrete axes have unequal axis scales and a nonzero translation.
// Base CoordinateSystem entries deliberately verify dispatch to the Axes implementation.
for (const method of ['coords_to_point','c2p']) {
  add(coord + method, 's=axes()', { coords: [1.5,-0.5] }, 'close(result,[4,-2.5,0]); close(s.p2c(result),[1.5,-0.5])');
}
for (const method of ['point_to_coords','p2c']) {
  add(coord + method, 's=axes()', { point: array([4,-2.5,0]) }, 'close(result,[1.5,-0.5]); close(s.c2p(*result),[4,-2.5,0])');
}
for (const method of ['polar_to_point','pr2pt']) {
  add(coord + method, 's=axes()', { radius: 2, azimuth: Math.PI/2 }, 'close(result,[1,0,0],atol=1e-8)');
}
for (const method of ['point_to_polar','pt2pr']) {
  add(coord + method, 's=axes()', { point: array([1,0,0]) }, 'close(result,[2,np.pi/2],atol=1e-8)');
}
add(coord + 'get_axis', 's=axes()', { index: 1 }, 'assert result is s.y_axis; close(result.get_unit_size(),1)');
const parabola = 's=axes(); objects["graph"]=s.plot(lambda x:x*x, x_range=[-1,2], use_smoothing=False)';
for (const method of ['input_to_graph_coords','i2gc']) {
  add(coord + method, parabola, { x: 1.5, graph: ref('graph') }, 'close(result,[1.5,2.25])');
}
for (const method of ['input_to_graph_point','i2gp']) {
  add(coord + method, parabola, { x: 1.5, graph: ref('graph') }, 'close(result,[4,0.25,0])');
}
add(coord + 'angle_of_tangent', parabola, { x: 1, graph: ref('graph'), dx: 0.000001 }, 'close(result,np.arctan(2),atol=1e-6)');
add(coord + 'slope_of_tangent', parabola, { x: 1, graph: ref('graph'), kwargs: { dx: 0.000001 } }, 'close(result,2,atol=2e-6)');
add(coord + 'get_line_from_axis_to_point', 's=axes()', { index: 0, point: array([4,0.25,0]), line_func: { $api: 'Line' } },
  'close(result.get_start(),[4,-2,0]); close(result.get_end(),[4,0.25,0])');
add(coord + 'get_vertical_lines_to_graph', parabola, { graph: ref('graph'), x_range: [0,2], num_lines: 3, kwargs: { line_func: { $api: 'Line' } } },
  'assert len(result)==3; close(result[1].get_start(),[3,-2,0]); close(result[1].get_end(),[3,-1,0]); close(result[2].get_start(),[5,-2,0]); close(result[2].get_end(),[5,2,0])');
add(coord + 'get_secant_slope_group', parabola, { x: 1, graph: ref('graph'), dx: 0.5, secant_line_length: 4 },
  'close(result.dx_line.get_start(),[3,-1,0]); close(result.dx_line.get_end(),[4,-1,0]); close(result.df_line.get_end(),[4,0.25,0]); close(result.secant_line.get_length(),4); close(result.secant_line.get_unit_vector(),np.array([1,1.25,0])/np.sqrt(2.5625))');
add(coord + 'plot_derivative_graph', 's=unit_axes(); objects["graph"]=s.plot(lambda x:x*x,x_range=[-1,2])', { graph: ref('graph'), kwargs: { x_range: [-1,2] } },
  'close(result.underlying_function(1.5),3,atol=1e-5); close(result.get_point_from_function(1.5),[2.5,1,0],atol=1e-5); samples=np.array([s.p2c(p) for p in result.get_start_anchors()]); close(samples[:,1],2*samples[:,0],atol=1e-5); assert len(samples)>10');
add(coord + 'plot_antiderivative_graph', 's=unit_axes(); objects["graph"]=s.plot(lambda x:2*x,x_range=[-1,2])', { graph: ref('graph'), y_intercept: 3, samples: 20, kwargs: { x_range: [-1,2] } },
  'close(result.underlying_function(1.5),5.25,atol=1e-8); close(result.get_point_from_function(1.5),[2.5,3.25,0]); samples=np.array([s.p2c(p) for p in result.get_start_anchors()]); close(samples[:,1],samples[:,0]**2+3,atol=1e-8); assert len(samples)>10');
add(coord + 'plot_polar_graph', 's=axes()', { r_func: fn(['theta'], 2), theta_range: [0,Math.PI,0.1], kwargs: { use_smoothing: false } },
  'close(result.get_start(),[5,-2,0]); close(result.get_end(),[-3,-2,0],atol=1e-8); close(result.get_point_from_function(np.pi/2),[1,0,0],atol=1e-8)');
add(cs + 'Axes.plot_line_graph', 's=axes()', { x_values: [-1,0,2], y_values: [1,-1,2], add_vertex_dots: true },
  'close(result["line_graph"].get_start(),[-1,-1,0]); close(result["line_graph"].get_end(),[5,0,0]); close([d.get_center() for d in result["vertex_dots"]],[[-1,-1,0],[1,-3,0],[5,0,0]])');

for (const method of ['number_to_point','n2p']) {
  add(cs + 'ComplexPlane.' + method, 's=plane(ComplexPlane)', { number: { $complex: [1.5,-0.5] } }, 'close(result,[4,-2.5,0]); assert abs(s.p2n(result)-(1.5-0.5j))<1e-8');
}
for (const method of ['point_to_number','p2n']) {
  add(cs + 'ComplexPlane.' + method, 's=plane(ComplexPlane)', { point: array([4,-2.5,0]) }, 'assert abs(result-(1.5-0.5j))<1e-8');
}
add(cs + 'NumberPlane.get_vector', 's=plane()', { coords: [1.5,-0.5], kwargs: { buff: 0 } }, 'close(result.get_start(),[1,-2,0]); close(result.get_end(),[4,-2.5,0])');
add(cs + 'NumberPlane.prepare_for_nonlinear_transform', 's=plane(); before=[(m.get_start().copy(),m.get_end().copy()) for m in s.family_members_with_points()]', { num_inserted_curves: 12 },
  'assert result is s; assert all(m.get_num_curves()>=12 for m in s.family_members_with_points()); close([(m.get_start(),m.get_end()) for m in s.family_members_with_points()],before)');

add(nl + 'n2p', 's=line()', { number: 1.5 }, 'close(result,[2,-2,0]); close(s.p2n(result),1.5)');
add(nl + 'p2n', 's=line()', { point: array([2,-2,0]) }, 'close(result,1.5)');
add(nl + 'rotate_about_number', 's=line(); fixed=s.n2p(1).copy()', { number: 1, angle: Math.PI/2 },
  'close(s.n2p(1),fixed,atol=1e-8); close(s.n2p(2),[1,0,0],atol=1e-8); assert result is s');
add(nl + 'rotate_about_zero', 's=line(); fixed=s.n2p(0).copy()', { angle: Math.PI/2 },
  'close(s.n2p(0),fixed,atol=1e-8); close(s.n2p(1),[-1,0,0],atol=1e-8); assert result is s');
add(nl + 'add_ticks', 's=line()', {}, 'assert len(s.ticks)==7; close([tick.get_center() for tick in s.ticks],[[-5+2*i,-2,0] for i in range(7)])');
add('manim.mobject.graphing.number_line.UnitInterval', '', { unit_size: 6, include_numbers: false },
  'close(result.n2p(0),[-3,0,0]); close(result.n2p(1),[3,0,0]); close(result.p2n([0,0,0]),0.5)');

const parabolaFn = fn(['t'], array([{ $local: 't' }, { $op: ['*', { $local: 't' }, { $local: 't' }] }, 0]));
add(funcs + 'ParametricFunction', '', { function: parabolaFn, t_range: [-1,2,0.25], use_smoothing: false },
  'close(result.get_start(),[-1,1,0]); close(result.get_end(),[2,4,0]); close(result.get_point_from_function(0.5),[0.5,0.25,0]); close(result.get_start_anchors(),[[t,t*t,0] for t in np.arange(-1,2,0.25)])');
add(funcs + 'ParametricFunction.get_point_from_function', 's=curve()', { t: 0.5 }, 'close(result,[0.5,0.25,0])');
for (const method of ['generate_points','init_points']) {
  add(funcs + 'ParametricFunction.' + method, 's=curve(); s.clear_points()', {}, 'close(s.get_start(),[-1,1,0]); close(s.get_end(),[2,4,0]); assert s.get_num_curves()==12');
}
add(funcs + 'FunctionGraph', '', { function: fn(['x'], { $op: ['*', { $local: 'x' }, { $local: 'x' }] }), x_range: [-1,2,0.25], kwargs: { use_smoothing: false } },
  'close(result.get_start(),[-1,1,0]); close(result.get_end(),[2,4,0]); close(result.get_point_from_function(0.5),[0.5,0.25,0])');
add(funcs + 'FunctionGraph.get_point_from_function', 's=FunctionGraph(lambda x:x*x)', { x: -1.5 }, 'close(result,[-1.5,2.25,0])');

const layout = { a: array([-2,0,0]), b: array([0,1,0]), c: array([2,0,0]) };
for (const cls of ['Graph','DiGraph']) {
  add('manim.mobject.graph.' + cls, '', { vertices: ['a','b','c'], edges: [{ $tuple: ['a','b'] }, { $tuple: ['b','c'] }], layout }, 'check_graph(result)');
}
add(gg + 'add_vertices', 's=graph()', { vertices: ['d'], positions: { d: array([1,-2,0]) } },
  'assert set(s.vertices)=={"a","b","c","d"}; close(s["d"].get_center(),[1,-2,0]); assert result == [s["d"]]; assert s["d"] in s.submobjects');
add(gg + 'add_edges', 's=graph()', { edges: [{ $tuple: ['a','c'] }] },
  'assert ("a","c") in s.edges; close(s.edges[("a","c")].get_start(),[-2,0,0]); close(s.edges[("a","c")].get_end(),[2,0,0]); assert s.edges[("a","c")] in result.submobjects');
add(gg + 'remove_edges', 's=graph(); edge=s.edges[("a","b")]', { edges: [{ $tuple: ['a','b'] }] },
  'assert set(s.edges)=={("b","c")}; assert edge not in s.submobjects; assert edge in result.submobjects; assert set(s.vertices)=={"a","b","c"}');
add(gg + 'remove_vertices', 's=graph(); vertex=s["b"]; edges=list(s.edges.values())', { vertices: ['b'] },
  'assert set(s.vertices)=={"a","c"}; assert not s.edges; assert vertex not in s.submobjects; assert vertex in result.submobjects; assert all(e not in s.submobjects and e in result.submobjects for e in edges)');
add(gg + 'change_layout', 's=graph()', { layout: { a: array([0,0,0]), b: array([0,2,0]), c: array([3,0,0]) } },
  'close(s["a"].get_center(),[0,0,0]); close(s["b"].get_center(),[0,2,0]); close(s["c"].get_center(),[3,0,0]); s.update(0); close(s.edges[("a","b")].get_end(),[0,2,0]); assert result is s');
for (const cls of ['Graph','DiGraph']) {
  add('manim.mobject.graph.' + cls + '.update_edges', `s=graph(${cls}); s["b"].move_to([1,3,0]); objects["graph"]=s`, { graph: ref('graph') },
    'check_edges(s); assert np.linalg.norm(s.edges[("a","b")].get_end()-np.array([1,3,0])) < 0.12; assert np.linalg.norm(s.edges[("b","c")].get_start()-np.array([1,3,0])) < 0.12');
}

// LinearBase & LogBase
add('manim.mobject.graphing.scale.LinearBase', '', { scale_factor: 2.5 },
  'close(result.function(4), 10); close(result.inverse_function(10), 4)');
add('manim.mobject.graphing.scale.LinearBase.function', 's = LinearBase(3)', { value: 4 },
  'close(result, 12)');
add('manim.mobject.graphing.scale.LinearBase.inverse_function', 's = LinearBase(4)', { value: 20 },
  'close(result, 5)');
add('manim.mobject.graphing.scale.LogBase', '', { base: 10 },
  'close(result.function(2), 100); close(result.inverse_function(100), 2)');
add('manim.mobject.graphing.scale.LogBase.function', 's = LogBase(2)', { value: 3 },
  'close(result, 8)');
add('manim.mobject.graphing.scale.LogBase.inverse_function', 's = LogBase(2)', { value: 8 },
  'close(result, 3)');
add('manim.mobject.graphing.scale.LogBase.get_custom_labels', 's = LogBase(10)', { val_range: [1, 10, 100] },
  'assert len(result) == 3');
add('manim.mobject.graphing.scale._ScaleBase.get_custom_labels', 's = LogBase(10)', { val_range: [1, 10, 100] },
  'assert len(result) == 3');

// NumberLine
add('manim.mobject.graphing.number_line.NumberLine.add_labels', 's = line()', { dict_values: { $dict: [[1, 'Mon'], [2, 'Tue']] } },
  'assert len(s.labels) == 2; close(s.labels[0].get_center(), [1, -2.4, 0], atol=0.2)');
add('manim.mobject.graphing.number_line.NumberLine.add_numbers', 's = line()', { x_values: [0, 1, 2] },
  'assert len(s.numbers) == 3; close(s.numbers[0].get_center(), [-1, -2.4, 0], atol=0.2)');
add('manim.mobject.graphing.number_line.NumberLine.get_labels', 's = line()', {},
  'assert len(result) == 7');
add('manim.mobject.graphing.number_line.NumberLine.get_number_mobject', 's = line()', { x: 2 },
  'close(result.get_center(), [3, -2.4, 0], atol=0.2)');
add('manim.mobject.graphing.number_line.NumberLine.get_number_mobjects', 's = line()', { numbers: [0, 2] },
  'assert len(result) == 2; close(result[0].get_center(), [-1, -2.4, 0], atol=0.2)');

// CoordinateSystem methods
add('manim.mobject.graphing.coordinate_systems.CoordinateSystem.add_coordinates', 's = axes()', {},
  'assert len(s.submobjects) >= 2');
add('manim.mobject.graphing.coordinate_systems.CoordinateSystem.get_T_label', parabola, { x_val: 1, graph: ref('graph'), label: 'T' },
  'close(result.get_center(), [3, -1.92, 0], atol=0.2)');
add('manim.mobject.graphing.coordinate_systems.CoordinateSystem.get_graph_label', parabola, { graph: ref('graph'), label: 'f' },
  'assert result is not None');
add('manim.mobject.graphing.coordinate_systems.CoordinateSystem.get_x_axis_label', 's = axes()', { label: 'x' },
  'assert result is not None');
add('manim.mobject.graphing.coordinate_systems.CoordinateSystem.get_y_axis_label', 's = axes()', { label: 'y' },
  'assert result is not None');
add('manim.mobject.graphing.coordinate_systems.CoordinateSystem.plot_implicit_curve', 's = axes()', { func: fn(['x', 'y'], { $op: ['-', { $op: ['+', { $op: ['*', { $local: 'x' }, { $local: 'x' }] }, { $op: ['*', { $local: 'y' }, { $local: 'y' }] }] }, 4] }) },
  'assert len(result.points) > 100');
add('manim.mobject.graphing.coordinate_systems.CoordinateSystem.plot_surface', 's = ThreeDAxes()', { function: fn(['u', 'v'], { $op: ['*', { $local: 'u' }, { $local: 'v' }] }), kwargs: { u_range: [-1, 1], v_range: [-1, 1] } },
  'assert len(result.get_all_points()) > 1000');

// ComplexPlane & PolarPlane
add('manim.mobject.graphing.coordinate_systems.ComplexPlane.add_coordinates', 's = ComplexPlane(x_range=[-2,2,1], y_range=[-2,2,1])', { numbers: [1, 2] },
  'assert len(s.submobjects) >= 2');
add('manim.mobject.graphing.coordinate_systems.ComplexPlane.get_coordinate_labels', 's = ComplexPlane(x_range=[-2,2,1], y_range=[-2,2,1])', { numbers: [1, 2] },
  'assert len(result) == 2');
add('manim.mobject.graphing.coordinate_systems.PolarPlane.add_coordinates', 's = PolarPlane(radius_max=2, size=4)', { r_values: [1, 2], a_values: [0, Math.PI/2] },
  'assert len(s.submobjects) >= 2');
add('manim.mobject.graphing.coordinate_systems.PolarPlane.get_coordinate_labels', 's = PolarPlane(radius_max=2, size=4)', { r_values: [1, 2], a_values: [0, Math.PI/2] },
  'assert len(result) == 2');
add('manim.mobject.graphing.coordinate_systems.PolarPlane.get_radian_label', 's = PolarPlane(radius_max=2, size=4)', { number: Math.PI/2 },
  'assert result is not None');
add('manim.mobject.graphing.coordinate_systems.PolarPlane.get_vector', 's = PolarPlane(radius_max=2, size=4)', { coords: [1.5, Math.PI/4] },
  'close(result.get_start(), [0,0,0]); close(result.get_end(), [1.5, np.pi/4, 0])');
add('manim.mobject.graphing.coordinate_systems.PolarPlane.prepare_for_nonlinear_transform', 's = PolarPlane(radius_max=2, size=4)', { num_inserted_curves: 10 },
  'assert result is s');

// ThreeDAxes
add('manim.mobject.graphing.coordinate_systems.ThreeDAxes', '', { x_range: [-3,3,1], y_range: [-3,3,1], z_range: [-3,3,1] },
  'close(result.get_center(), [0,0,0])');
add('manim.mobject.graphing.coordinate_systems.ThreeDAxes.get_y_axis_label', 's = ThreeDAxes()', { label: 'Y' },
  'assert result is not None');
add('manim.mobject.graphing.coordinate_systems.ThreeDAxes.get_z_axis_label', 's = ThreeDAxes()', { label: 'Z' },
  'assert result is not None');

// ImplicitFunction
add('manim.mobject.graphing.functions.ImplicitFunction', '', { func: fn(['x', 'y'], { $op: ['-', { $op: ['+', { $op: ['*', { $local: 'x' }, { $local: 'x' }] }, { $op: ['*', { $local: 'y' }, { $local: 'y' }] }] }, 4] }), min_depth: 3, max_quads: 100 },
  'assert len(result.points) > 100');
add('manim.mobject.graphing.functions.ImplicitFunction.generate_points', 's = ImplicitFunction(lambda x,y: x**2+y**2-4, min_depth=3, max_quads=100); s.clear_points()', {},
  'assert len(s.points) > 100');
add('manim.mobject.graphing.functions.ImplicitFunction.init_points', 's = ImplicitFunction(lambda x,y: x**2+y**2-4, min_depth=3, max_quads=100); s.clear_points()', {},
  'assert len(s.points) > 100');

// BarChart
add('manim.mobject.graphing.probability.BarChart', '', { values: [1, 2, 3], y_range: [0, 5, 1] },
  'assert len(result.bars) == 3');
add('manim.mobject.graphing.probability.BarChart.change_bar_values', 's = BarChart(values=[1, 2, 3], y_range=[0, 5, 1])', { values: [2, 4, 1] },
  'assert len(s.bars) == 3; close(s.values[:3], [2, 4, 1])');

// SampleSpace
add('manim.mobject.graphing.probability.SampleSpace', '', { height: 4, width: 6 },
  'close(result.height, 4); close(result.width, 6)');
add('manim.mobject.graphing.probability.SampleSpace.complete_p_list', 's = SampleSpace()', { p_list: [0.3, 0.5] },
  'close(result, [0.3, 0.5, 0.2])');
add('manim.mobject.graphing.probability.SampleSpace.get_division_along_dimension', 's = SampleSpace(height=4, width=6)', { p_list: [0.25, 0.75], dim: 0, colors: ['#FF0000', '#0000FF'], vect: array([1, 0, 0]) },
  'assert len(result) == 2');
add('manim.mobject.graphing.probability.SampleSpace.get_horizontal_division', 's = SampleSpace(height=4, width=6)', { p_list: [0.3, 0.7], colors: ['#00FF00', '#FFFF00'] },
  'assert len(result) == 2');
add('manim.mobject.graphing.probability.SampleSpace.divide_horizontally', 's = SampleSpace(height=4, width=6)', { args: [[0.4, 0.6]], kwargs: { colors: ['#FF0000', '#0000FF'] } },
  'assert len(s.horizontal_parts) == 2');
add('manim.mobject.graphing.probability.SampleSpace.get_vertical_division', 's = SampleSpace(height=4, width=6)', { p_list: [0.5, 0.5], colors: ['#FFC0CB', '#008080'] },
  'assert len(result) == 2');
add('manim.mobject.graphing.probability.SampleSpace.divide_vertically', 's = SampleSpace(height=4, width=6)', { args: [[0.5, 0.5]], kwargs: { colors: ['#FFC0CB', '#008080'] } },
  'assert len(s.vertical_parts) == 2');
add('manim.mobject.graphing.probability.SampleSpace.get_subdivision_braces_and_labels', 's = SampleSpace(height=4, width=6); s.divide_horizontally([0.4, 0.6], colors=[GREEN, YELLOW]); objects["parts"] = s.horizontal_parts', { parts: ref('parts'), labels: ['P1', 'P2'], direction: array([-1, 0, 0]) },
  'assert len(result) == 2');
add('manim.mobject.graphing.probability.SampleSpace.get_side_braces_and_labels', 's = SampleSpace(height=4, width=6); s.divide_horizontally([0.4, 0.6], colors=[GREEN, YELLOW])', { labels: ['Left 1', 'Left 2'] },
  'assert len(result) == 2');
add('manim.mobject.graphing.probability.SampleSpace.get_top_braces_and_labels', 's = SampleSpace(height=4, width=6); s.divide_vertically([0.5, 0.5], colors=[PINK, TEAL])', { labels: ['Top 1', 'Top 2'] },
  'assert len(result) == 2');
add('manim.mobject.graphing.probability.SampleSpace.get_bottom_braces_and_labels', 's = SampleSpace(height=4, width=6); s.divide_vertically([0.5, 0.5], colors=[PINK, TEAL])', { labels: ['Bottom 1', 'Bottom 2'] },
  'assert len(result) == 2');
add('manim.mobject.graphing.probability.SampleSpace.add_braces_and_labels', 's = SampleSpace(height=4, width=6); s.divide_horizontally([0.4, 0.6], colors=[GREEN, YELLOW]); s.get_side_braces_and_labels(["Left 1", "Left 2"])', {},
  'assert len(s.submobjects) >= 3');
add('manim.mobject.graphing.probability.SampleSpace.add_title', 's = SampleSpace(height=4, width=6)', { title: 'Test Space' },
  'assert hasattr(s, "title"); close(s.title.get_center(), [0, 2.47, 0], atol=0.2)');
add('manim.mobject.graphing.probability.SampleSpace.add_label', 's = SampleSpace(height=4, width=6)', { label: 'Center' },
  'assert hasattr(s, "label")');

test('native coordinate, curve and graph APIs preserve geometry', { timeout: 120_000 }, async t => {
  const health = await discoverPython();
  if (!health.available) { t.skip('Manim required'); return; }
  const directory = await mkdtemp(path.join(tmpdir(), 'anyvis-api-coordinates-'));
  try {
    const compiler = createApiCompiler();
    const probes = cases.map((c, index) => {
      const entry = getApiEntry(c.id);
      assert.ok(entry, `Unknown API: ${c.id}`);
      const fields = { receiver: 's', mode: 'store' };
      for (const [key, value] of Object.entries(c.params)) fields[`p_${key}`] = JSON.stringify(value);
      const compiled = compiler.compile(createAction(entry.type, fields), entry, new Set(['s','a','b','graph','parts']), {});
      return `def probe_${index}():
    objects = {}
    s = None
${c.setup ? '    ' + c.setup : ''}
    objects["s"] = s
${compiled.prelude.map(line => '    ' + line).join('\n')}
    result = ${compiled.expression}
    ${c.check}
`;
    });
    const runner = `from manim import *
import numpy as np
import json, traceback
${API_RUNTIME}
${compiler.imports().join('\n')}
eq = np.testing.assert_array_equal
close = np.testing.assert_allclose
def axes(): return Axes(x_range=[-3,3,1],y_range=[-2,2,1],x_length=12,y_length=4,tips=False).shift([1,-2,0])
def unit_axes(): return Axes(x_range=[-3,3,1],y_range=[-2,2,1],x_length=6,y_length=4,tips=False).shift([1,-2,0])
def plane(cls=NumberPlane): return cls(x_range=[-3,3,1],y_range=[-2,2,1],x_length=12,y_length=4).shift([1,-2,0])
def line(): return NumberLine(x_range=[-2,4,1],length=12,include_ticks=False).shift([1,-2,0])
def curve(): return ParametricFunction(lambda t: np.array([t,t*t,0]),t_range=[-1,2,0.25],use_smoothing=False)
def graph(cls=Graph): return cls(['a','b','c'],[('a','b'),('b','c')],layout={'a':[-2,0,0],'b':[0,1,0],'c':[2,0,0]})
def check_graph(g):
    assert set(g.vertices) == {'a','b','c'}
    assert set(g.edges) == {('a','b'),('b','c')}
    close(g['a'].get_center(),[-2,0,0]); close(g['b'].get_center(),[0,1,0]); close(g['c'].get_center(),[2,0,0])
    check_edges(g)
def check_edges(g):
    for (u,v), edge in g.edges.items():
        if isinstance(g, DiGraph):
            assert np.linalg.norm(edge.get_start()-g[u].get_center()) < 0.12
            assert np.linalg.norm(edge.get_end()-g[v].get_center()) < 0.12
        else:
            close(edge.get_start(),g[u].get_center()); close(edge.get_end(),g[v].get_center())
${probes.join('\n')}
results=[]
with tempconfig({"renderer":"cairo","media_dir":"media","verbosity":"ERROR"}):
    for api_id, probe in [${cases.map((c,i) => `(${JSON.stringify(c.id)}, probe_${i})`).join(',')}]:
        try:
            probe()
            results.append({"apiId":api_id,"status":"verified"})
        except Exception:
            results.append({"apiId":api_id,"status":"failed","reason":traceback.format_exc(limit=3)})
print("ANYVIS_COORDINATES " + json.dumps(results))
`;
    const script = path.join(directory, 'coordinates.py');
    await writeFile(script, runner);
    const output = await execute(health.python, [script], { env: nativeExecutionEnvironment(health.python), cwd: directory, timeout: 100_000, maxBuffer: 4 * 1024 * 1024 });
    const line = output.stdout.split('\n').find(row => row.startsWith('ANYVIS_COORDINATES '));
    assert.ok(line, output.stdout);
    const outcomes = JSON.parse(line.slice('ANYVIS_COORDINATES '.length));
    assert.equal(outcomes.length, cases.length);
    for (const [index, outcome] of outcomes.entries()) {
      const reason = behaviorEvidenceGap(cases[index].id, cases[index].check, getApiEntry(cases[index].id));
      if (outcome.status === 'verified' && reason) Object.assign(outcome, { status: 'fixture_gap', reason });
    }
    const failures = outcomes.filter(row => row.status === 'failed');
    const apiIds = [...new Set(outcomes.filter(row => row.status === 'verified').map(row => row.apiId))].sort();
    const fixture = 'src/studio/core/api-coordinates.native.spec-node.mjs';
    const reportPath = process.env.ANYVIS_API_COORDINATES_REPORT || path.resolve('artifacts/api/native-coordinates-evidence.json');
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, JSON.stringify({ fixture, sourceFiles: await apiEvidenceSources(fixture),
      registrySha256: createHash('sha256').update(await readFile(new URL('./api-registry.json', import.meta.url))).digest('hex'),
      passed: failures.length === 0, engineVersion: health.version, renderer: 'cairo', apiIds, outcomes,
      checks: 'Registry-compiled calls with explicit affine coordinate maps, curve samples, line endpoints, projection and graph topology assertions. CoordinateSystem entries use concrete Axes dynamic dispatch. Setup calls are not counted; no movie-render coverage is claimed.'
    }, null, 2) + '\n');
    t.diagnostic(`${apiIds.length} coordinate/curve/graph APIs, ${outcomes.length} cases, ${failures.length} failures.`);
    assert.deepEqual(failures, []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

