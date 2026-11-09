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
const ref = name => ({ $ref: name });
const array = value => ({ $array: value });
const fn = (params, body) => ({ $lambda: { params, body } });
const cases = [];
const add = (id, setup, params, check) => cases.push({ id, setup, params, check });
const pm = 'manim.mobject.types.point_cloud_mobject.';
const vf = 'manim.mobject.vector_field.VectorField.';
const vd = 'manim.mobject.types.vectorized_mobject.VDict';

// Setup calls are not counted. These assertions check points and RGBA together,
// so filtering, reordering and copying cannot pass after losing color alignment.
add(pm + 'PMobject', '', { stroke_width: 9, color: '#204060' },
  'assert result.stroke_width == 9; assert result.color == ManimColor("#204060"); eq(result.points.shape, [0,3]); eq(result.rgbas.shape, [0,4])');
add(pm + 'PMobject.add_points', 's = cloud()', { points: array([[4,0,0],[5,0,0]]), color: '#204060', alpha: 0.5 },
  'eq(s.points, [[0,0,0],[1,0,0],[2,0,0],[3,0,0],[4,0,0],[5,0,0]]); close(s.rgbas[-2:], [[32/255,64/255,96/255,0.5]]*2); close(s.rgbas[:4], rgba); assert result is s');
add(pm + 'PMobject.add_points', 's = cloud()', { points: array([[4,0,0]]), rgbas: array([[0.2,0.3,0.4,0.5]]) },
  'eq(s.points[-1], [4,0,0]); close(s.rgbas[-1], [0.2,0.3,0.4,0.5]); assert result is s');
add(pm + 'PMobject.set_color', 's = cloud(); child = cloud(); s.add(child)', { color: '#204060' },
  'close(s.rgbas, np.tile([32/255,64/255,96/255,1],(4,1))); close(child.rgbas,s.rgbas); assert result is s');
add(pm + 'PMobject.set_color', 's = cloud(); child = cloud(); s.add(child)', { color: '#204060', family: false },
  'close(s.rgbas, np.tile([32/255,64/255,96/255,1],(4,1))); close(child.rgbas,rgba)');
add(pm + 'PMobject.set_stroke_width', 's = cloud(); child = cloud(); s.add(child)', { width: 11 },
  'assert s.stroke_width == 11 and child.stroke_width == 11; assert result is s');
add(pm + 'PMobject.set_color_by_gradient', 's = cloud()', { colors: ['#000000','#FFFFFF'] },
  'close(s.rgbas, [[0,0,0,1],[1/3,1/3,1/3,1],[2/3,2/3,2/3,1],[1,1,1,1]])');
add(pm + 'PMobject.set_colors_by_radial_gradient', 's = cloud()', { center: array([0,0,0]), radius: 3, inner_color: '#FFFFFF', outer_color: '#000000' },
  'close(s.rgbas, [[1,1,1,1],[2/3,2/3,2/3,1],[1/3,1/3,1/3,1],[0,0,0,1]])');
add(pm + 'PMobject.fade_to', 's = cloud()', { color: '#FFFFFF', alpha: 0.25 }, 'close(s.rgbas, rgba*0.75 + np.ones((4,4))*0.25); assert result is s');
add(pm + 'PMobject.filter_out', 's = cloud()', { condition: fn(['p'], { $op: ['>', { $index: { value: { $local: 'p' }, index: 0 } }, 1] }) },
  'eq(s.points, [[0,0,0],[1,0,0]]); close(s.rgbas, rgba[:2]); assert result is s');
add(pm + 'PMobject.thin_out', 's = cloud()', { factor: 2 }, 'eq(s.points, [[0,0,0],[2,0,0]]); close(s.rgbas, rgba[[0,2]]); assert result is s');
add(pm + 'PMobject.sort_points', 's = cloud()', { function: fn(['p'], { $op: ['*', -1, { $index: { value: { $local: 'p' }, index: 0 } }] }) },
  'eq(s.points, [[3,0,0],[2,0,0],[1,0,0],[0,0,0]]); close(s.rgbas, rgba[::-1]); assert result is s');
add(pm + 'PMobject.reset_points', 's = cloud()', {}, 'eq(s.points.shape,[0,3]); eq(s.rgbas.shape,[0,4]); assert result is s');
add(pm + 'PMobject.ingest_submobjects', 's = PMobject(); a=cloud(); b=cloud().shift(UP); s.add(a,b)', {},
  'assert not s.submobjects; eq(s.points, np.concatenate([a.points,b.points])); close(s.rgbas,np.concatenate([rgba,rgba])); assert result is s');
add(pm + 'PMobject.align_points_with_larger', 's = PMobject().add_points([[0,0,0],[2,0,0]], rgbas=rgba[:2]); objects["a"] = cloud()',
  { larger_mobject: ref('a') }, 'eq(s.points, [[0,0,0],[0,0,0],[2,0,0],[2,0,0]]); close(s.rgbas,rgba[[0,0,1,1]])');
add(pm + 'PMobject.match_colors', 's = cloud().set_color(BLACK); objects["a"] = cloud()', { mobject: ref('a') },
  'close(s.rgbas,rgba); objects["a"].rgbas[:] = 0; close(s.rgbas,rgba); assert result is s');
add(pm + 'PMobject.interpolate_color', 's = cloud(); objects["a"] = cloud().set_color(BLACK).set_stroke_width(2); objects["b"] = cloud().set_color(WHITE).set_stroke_width(10)',
  { mobject1: ref('a'), mobject2: ref('b'), alpha: 0.25 }, 'close(s.rgbas,np.tile([0.25,0.25,0.25,1],(4,1))); close(s.stroke_width,4); assert result is s');
add(pm + 'PMobject.pointwise_become_partial', 's = PMobject(); objects["a"] = cloud()', { mobject: ref('a'), a: 0.25, b: 0.75 },
  'eq(s.points,[[1,0,0],[2,0,0]]); close(s.rgbas,rgba[1:3])');
add(pm + 'PMobject.get_mobject_type_class', '', {}, 'assert result is PMobject');
for (const [alpha, x] of [[0,0], [0.2,0], [0.5,1], [0.999,2], [1,3]]) {
  add(pm + 'PMobject.point_from_proportion', 's = cloud()', { alpha },
    `close(result,[${x},0,0]); close(s.points,[[0,0,0],[1,0,0],[2,0,0],[3,0,0]])`);
}

add(pm + 'Mobject1D', '', { density: 4, stroke_width: 7 }, 'close(result.epsilon,0.25); assert result.density == 4; assert result.stroke_width == 7');
add(pm + 'Mobject2D', '', { density: 8, color: '#204060' }, 'close(result.epsilon,0.125); assert result.density == 8; assert result.color == ManimColor("#204060")');
add(pm + 'Mobject1D.add_line', 's = Mobject1D(density=4)', { start: array([0,1,0]), end: array([1,1,0]), color: '#FF0000' },
  'close(s.points,[[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0]]); close(s.rgbas,np.tile([1,0,0,1],(4,1)))');
add(pm + 'Mobject1D.add_line', 's = Mobject1D(density=4)', { start: array([2,1,0]), end: array([2,1,0]), color: '#FF0000' },
  'close(s.points,[[2,1,0]]); close(s.rgbas,[[1,0,0,1]])');
add(pm + 'Point', '', { location: array([2,-1,3]), color: '#204060' }, 'close(result.points,[[2,-1,3]]); close(result.rgbas,[[32/255,64/255,96/255,1]])');
for (const method of ['generate_points','init_points']) {
  add(pm + 'Point.' + method, 's = Point([2,-1,3],color="#204060"); ' + (method === 'init_points' ? 's.shift(RIGHT*4)' : 's.reset_points()'), {}, 'close(s.points,[[2,-1,3]]); close(s.rgbas,[[32/255,64/255,96/255,1]])');
}
add(pm + 'PointCloudDot', '', { center: array([2,1,0]), radius: 1, density: 4, color: '#204060', stroke_width: 7 },
  'check_disc(result, np.array([2,1,0])); assert result.stroke_width == 7');
for (const method of ['generate_points','init_points']) {
  add(pm + 'PointCloudDot.' + method, 's = PointCloudDot(radius=1,density=4,color="#204060"); ' + (method === 'init_points' ? 's.shift(RIGHT*4)' : 's.reset_points()'), {}, 'check_disc(s,ORIGIN)');
}
add(pm + 'PGroup', 'objects["a"] = cloud(); objects["b"] = cloud().shift(UP)', { pmobs: [ref('a'),ref('b')] },
  'assert result.submobjects == [objects["a"],objects["b"]]; eq(result.get_all_points(), np.concatenate([objects["a"].points,objects["b"].points])); close(result.get_all_rgbas(), np.concatenate([rgba,rgba]))');
add(pm + 'PGroup.fade_to', 'a=cloud(); b=cloud(); s=PGroup(a,b)', { color: '#FFFFFF', alpha: 0.25 },
  'close(a.rgbas,rgba*0.75+0.25); close(b.rgbas,rgba*0.75+0.25); assert result is s');

add(vd, 'objects["a"] = Square(); objects["b"] = Circle()', { mapping_or_iterable: { square: ref('a'), circle: ref('b') } },
  'assert result["square"] is objects["a"] and result["circle"] is objects["b"]; assert result.submobjects == [objects["a"],objects["b"]]');
add(vd + '.add', 'a=Square(); b=Circle(); s=VDict({"square":a}); objects["b"]=b', { mapping_or_iterable: { circle: ref('b') } },
  'assert s["square"] is a and s["circle"] is b; assert s.submobjects == [a,b]; assert result is s');
add(vd + '.add_key_value_pair', 's=VDict(); objects["a"]=Circle()', { key: 'circle', value: ref('a') },
  'assert s["circle"] is objects["a"]; assert s.submobjects == [objects["a"]]');
add(vd + '.remove', 'a=Square(); b=Circle(); s=VDict({"square":a,"circle":b})', { key: 'square' },
  'assert list(s.submob_dict) == ["circle"]; assert s["circle"] is b; assert s.submobjects == [b]; assert result is s');

const linear = fn(['p'], { $op: ['*', { $local: 'p' }, 2] });
add('manim.mobject.vector_field.VectorField', '', { func: linear, color: '#204060' },
  'close(result.func(np.array([1,2,3])),[2,4,6]); assert result.single_color; assert result.color == ManimColor("#204060")');
// Nonlinear input distinguishes f(scalar*p) from scalar*f(p).
add(vf + 'scale_func', '', { func: fn(['p'], { $op: ['*', { $local: 'p' }, { $local: 'p' }] }), scalar: 3 }, 'close(result(np.array([1,2,3])),[9,36,81])');
add(vf + 'shift_func', '', { func: linear, shift_vector: array([1,2,0]) }, 'close(result(np.array([3,4,1])),[4,4,2])');
add(vf + 'get_vectorized_rgba_gradient_function', 's=VectorField(lambda p: RIGHT)', { start: 2, end: 4, colors: ['#FF0000','#0000FF'] },
  'close(result([0,2,3,4,8],opacity=0.4),[[1,0,0,0.4],[1,0,0,0.4],[0.5,0,0.5,0.4],[0,0,1,0.4],[0,0,1,0.4]])');
add(vf + 'nudge', 's=VectorField(lambda p: np.array([2.0,1.0,0.0])); a=Dot(LEFT); objects["a"]=a', { mob: ref('a'), dt: 0.5, substeps: 4 },
  'close(a.get_center(),[0,0.5,0],atol=1e-8); assert result is s');
add(vf + 'nudge', 's=VectorField(lambda p: p); a=Square(); before=a.points.copy(); objects["a"]=a', { mob: ref('a'), dt: 0.1, substeps: 5, pointwise: true },
  'close(a.points,before*np.exp(0.1),atol=1e-8); assert result is s');
add(vf + 'nudge_submobjects', 's=VectorField(lambda p: np.array([2.0,1.0,0.0])); a=Dot(LEFT); b=Dot(RIGHT); s.add(a,b)', { dt: 0.5, substeps: 4 },
  'close(a.get_center(),[0,0.5,0],atol=1e-8); close(b.get_center(),[2,0.5,0],atol=1e-8); assert result is s');
add(vf + 'start_submobject_movement', 's=VectorField(lambda p: np.array([2.0,1.0,0.0])); a=Dot(); s.add(a)', { speed: 2 },
  's.update(0.25); close(a.get_center(),[1,0.5,0],atol=1e-8); assert result is s');
add(vf + 'stop_submobject_movement', 's=VectorField(lambda p: np.array([2.0,1.0,0.0])); a=Dot(); s.add(a); s.start_submobject_movement(speed=2); s.update(0.25); before=a.get_center().copy()', {},
  'close(before,[1,0.5,0],atol=1e-8); s.update(0.5); close(a.get_center(),before,atol=1e-8); assert not s.updaters; assert result is s');
add('manim.mobject.vector_field.ArrowVectorField.get_vector', 's=ArrowVectorField(lambda p: np.array([2.0,0.0,0.0]), x_range=[0,0,1], y_range=[0,0,1], length_func=lambda n:n/2, color="#FF0000")',
  { point: array([1,2,0]) }, 'close(result.get_start(),[1,2,0]); close(result.get_end(),[2,2,0]); assert result.get_color() == ManimColor("#FF0000")');

test('native point-cloud, dictionary and vector-field APIs preserve concrete state', { timeout: 120_000 }, async t => {
  const health = await discoverPython();
  if (!health.available) { t.skip('Manim required'); return; }
  const directory = await mkdtemp(path.join(tmpdir(), 'anyvis-api-pointcloud-'));
  try {
    const compiler = createApiCompiler();
    const probes = cases.map((c, index) => {
      const entry = getApiEntry(c.id);
      assert.ok(entry, `Unknown API: ${c.id}`);
      const fields = { receiver: 's', mode: 'store' };
      for (const [key, value] of Object.entries(c.params)) fields[`p_${key}`] = JSON.stringify(value);
      const compiled = compiler.compile(createAction(entry.type, fields), entry, new Set(['s','a','b']), {});
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
from manim.mobject.types.point_cloud_mobject import Mobject1D, Mobject2D
import numpy as np
import json, traceback
${API_RUNTIME}
${compiler.imports().join('\n')}
eq = np.testing.assert_array_equal
close = np.testing.assert_allclose
rgba = np.array([[1,0,0,1],[0,1,0,0.75],[0,0,1,0.5],[1,1,1,0.25]])
def cloud(): return PMobject().add_points([[0,0,0],[1,0,0],[2,0,0],[3,0,0]],rgbas=rgba.copy())
def check_disc(m, center):
    radii = np.linalg.norm(m.points-center,axis=1)
    assert len(radii) == 12+18+25
    close(np.unique(np.round(radii,8)),[0.25,0.5,0.75])
    close(m.points[:,2],center[2])
    close(m.rgbas,np.tile([32/255,64/255,96/255,1],(55,1)))
${probes.join('\n')}
results=[]
with tempconfig({"renderer":"cairo","media_dir":"media","verbosity":"ERROR"}):
    for api_id, probe in [${cases.map((c,i) => `(${JSON.stringify(c.id)}, probe_${i})`).join(',')}]:
        try:
            probe()
            results.append({"apiId":api_id,"status":"verified"})
        except Exception:
            results.append({"apiId":api_id,"status":"failed","reason":traceback.format_exc(limit=3)})
print("ANYVIS_POINTCLOUD " + json.dumps(results))
`;
    const script = path.join(directory, 'pointcloud.py');
    await writeFile(script, runner);
    const output = await execute(health.python, [script], { env: nativeExecutionEnvironment(health.python), cwd: directory, timeout: 100_000, maxBuffer: 4 * 1024 * 1024 });
    const line = output.stdout.split('\n').find(row => row.startsWith('ANYVIS_POINTCLOUD '));
    assert.ok(line, output.stdout);
    const outcomes = JSON.parse(line.slice('ANYVIS_POINTCLOUD '.length));
    assert.equal(outcomes.length, cases.length);
    const failures = outcomes.filter(row => row.status !== 'verified');
    const apiIds = [...new Set(outcomes.filter(row => row.status === 'verified').map(row => row.apiId))].sort();
    const fixture = 'src/studio/core/api-pointcloud.native.spec-node.mjs';
    const reportPath = process.env.ANYVIS_API_POINTCLOUD_REPORT || path.resolve('artifacts/api/native-pointcloud-evidence.json');
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, JSON.stringify({ fixture, sourceFiles: await apiEvidenceSources(fixture),
      registrySha256: createHash('sha256').update(await readFile(new URL('./api-registry.json', import.meta.url))).digest('hex'),
      passed: failures.length === 0, engineVersion: health.version, renderer: 'cairo', apiIds, outcomes,
      checks: 'Registry-compiled calls with explicit point/RGBA alignment, geometry, copy isolation, dictionary identity and vector-field integration/updater assertions. Setup calls are not counted. This fixture does not claim rendered movie coverage.'
    }, null, 2) + '\n');
    t.diagnostic(`${apiIds.length} point-cloud/dictionary/vector-field APIs, ${outcomes.length} cases, ${failures.length} failures.`);
    assert.deepEqual(failures, []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('point-cloud compatibility validates bounds and preserves overrides and fixed implementations', { timeout: 60_000 }, async t => {
  const health = await discoverPython();
  if (!health.available) { t.skip('Manim required'); return; }
  const directory = await mkdtemp(path.join(tmpdir(), 'anyvis-pointcloud-compat-'));
  try {
    const compiler = createApiCompiler();
    const entry = getApiEntry(pm + 'PMobject.point_from_proportion');
    const compiled = compiler.compile(createAction(entry.type, { receiver:'s', p_alpha:JSON.stringify(ref('alpha')) }), entry, new Set(['s','alpha']), {});
    const nested = compiler.value(JSON.stringify({ $call: { api:'PMobject.point_from_proportion', receiver:ref('s'), args:[ref('alpha')] } }), new Set(['s','alpha']), {});
    const script = path.join(directory, 'compat.py');
    await writeFile(script, `from manim import *
import numpy as np
${API_RUNTIME}
${compiler.imports().join('\n')}
def sample(s, alpha):
    objects = {"s":s,"alpha":alpha}
${compiled.prelude.map(line=>'    '+line).join('\n')}
    return ${compiled.expression}
def nested_sample(s, alpha):
    objects = {"s":s,"alpha":alpha}
    return ${nested.code}
cloud = PMobject().add_points([[-2,0,0],[0,1,0],[2,0,0]])
for operation in (sample, nested_sample):
    np.testing.assert_allclose(operation(cloud, 0),[-2,0,0])
    np.testing.assert_allclose(operation(cloud, 0.5),[0,1,0])
    np.testing.assert_allclose(operation(cloud, 1),[2,0,0])
    for alpha in (-0.1, 1.1, float('nan'), float('inf'), '0.5'):
        try:
            operation(cloud,alpha)
            raise AssertionError('Invalid proportion accepted')
        except ValueError:
            pass
    try:
        operation(PMobject(),0.5)
        raise AssertionError('Empty cloud accepted')
    except ValueError:
        pass
    np.testing.assert_allclose(operation(PMobject().add_points([[1,2,3]]),0.5),[1,2,3])
# MoveAlongPath calls the path method internally, outside _av_invoke.
dot = Dot()
animation = MoveAlongPath(dot,cloud,rate_func=linear)
animation.begin()
for alpha, expected in [(0,[-2,0,0]),(0.5,[0,1,0]),(1,[2,0,0])]:
    animation.interpolate(alpha)
    np.testing.assert_allclose(dot.get_center(),expected,atol=1e-8)
animation.finish()
class CustomCloud(PMobject):
    def point_from_proportion(self, alpha): return np.array([7,8,9])
np.testing.assert_allclose(sample(CustomCloud(),0.5),[7,8,9])
class PrefixCloud(PMobject):
    def get_num_points(self): return 2
prefix = PrefixCloud().add_points([[-2,0,0],[0,1,0],[2,0,0]])
np.testing.assert_allclose(sample(prefix,1),[0,1,0])
patched = PMobject.point_from_proportion
_av_point_cloud_compat()
assert PMobject.point_from_proportion is patched
# A working upstream implementation must be left untouched, even at 0.20.1.
def already_fixed(self, alpha): return self.points[int(alpha*(len(self.points)-1))]
PMobject.point_from_proportion = already_fixed
_av_point_cloud_compat()
assert PMobject.point_from_proportion is already_fixed
import manim
version = manim.__version__
def other_version_method(self, alpha): raise IndexError('different implementation')
try:
    manim.__version__ = '0.21.0'
    PMobject.point_from_proportion = other_version_method
    _av_point_cloud_compat()
    assert PMobject.point_from_proportion is other_version_method
finally:
    manim.__version__ = version
print('ANYVIS_POINTCLOUD_COMPAT_OK')
`);
    const output = await execute(health.python, [script], { env: nativeExecutionEnvironment(health.python), cwd:directory, timeout:45_000, maxBuffer:1024*1024 });
    assert.match(output.stdout,/ANYVIS_POINTCLOUD_COMPAT_OK/);
  } finally { await rm(directory,{recursive:true,force:true}); }
});
