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
const add = (id, setup, params, check, fields = {}) => cases.push({ id, setup, params, check, fields });

const m = 'manim.mobject.opengl.opengl_mobject.OpenGLMobject';
const v = 'manim.mobject.opengl.opengl_vectorized_mobject.OpenGLVMobject';
const surf = 'manim.mobject.opengl.opengl_surface.OpenGLSurface';
// All geometry snapshots use copy(): OpenGL getters can expose mutable data views.
add(m, '', { color: '#204060', opacity: 0.4, gloss: 0.3, shadow: 0.2 },
  'close(result.rgbas,[[32/255,64/255,96/255,0.4]]); close(result.get_gloss(),0.3); close(result.get_shadow(),0.2)');
add(m+'.set_points','s=mob()', { points: array([[1,2,3],[4,5,6]]) }, 'close(s.points,[[1,2,3],[4,5,6]]); close(s.get_bounding_box(),[[1,2,3],[2.5,3.5,4.5],[4,5,6]]); assert result is s');
add(m+'.append_points','s=mob()', { new_points: array([[4,5,6]]) }, 'close(s.points,np.vstack([pts,[4,5,6]])); close(s.get_bounding_box()[2],[4,5,6])');
add(m+'.clear_points','s=mob()',{},'assert len(s.points)==0; assert result is s');
add(m+'.reverse_points','s=mob()',{},'close(s.points,pts[::-1]); assert result is s');
add(m+'.shift','s=mob()', { vector: array([3,-1,2]) }, 'close(s.points,pts+[3,-1,2]); close(s.get_bounding_box(),bbox+[3,-1,2])');
add(m+'.scale','s=mob()', { scale_factor: 2, about_point: array([0,0,0]) }, 'close(s.points,pts*2); close(s.get_bounding_box(),bbox*2)');
add(m+'.rotate','s=mob()', { angle: Math.PI/2, about_point: array([0,0,0]) }, 'close(s.points,[[0,0,0],[0,2,1],[-4,0,2]],atol=1e-8)');
add(m+'.stretch','s=mob()', { factor: 0.5, dim: 1, kwargs: { about_point: array([0,0,0]) } }, 'close(s.points,pts*[1,0.5,1])');
add(m+'.apply_matrix','s=mob()', { matrix: array([[2,0,0],[0,3,0],[0,0,4]]), kwargs: { about_point: array([0,0,0]) } }, 'close(s.points,pts*[2,3,4])');
add(m+'.apply_function','s=mob()', { function: fn(['p'], { $op: ['+', { $local: 'p' }, array([1,2,3])] }), kwargs: { about_point: array([0,0,0]) } }, 'close(s.points,pts+[1,2,3])');
add(m+'.center','s=mob().shift([4,5,6])',{},'close(s.points,pts-[1,2,1]); close(s.get_center(),[0,0,0])');
add(m+'.move_to','s=mob()', { point_or_mobject: array([4,5,6]) }, 'close(s.get_center(),[4,5,6]); close(s.points,pts+[3,3,5])');
add(m+'.set_coord','s=mob()', { value: 5, dim: 1 }, 'close(s.get_center(),[1,5,1]); close(s.points,pts+[0,3,0])');
for (const [axis, value, center] of [['x',4,[4,2,1]],['y',5,[1,5,1]],['z',6,[1,2,6]]]) {
  add(m+'.set_'+axis,'s=mob()', { [axis]: value }, `close(s.get_center(),${JSON.stringify(center)})`);
}
for (const name of ['get_bounding_box','compute_bounding_box']) add(m+'.'+name,'s=mob()',{},'close(result,bbox)');
for (const [name,expected] of [['get_center',[1,2,1]],['get_center_of_mass',[2/3,4/3,1]],['get_top',[1,4,1]],['get_bottom',[1,0,1]],['get_left',[0,2,1]],['get_right',[2,2,1]],['get_start',[0,0,0]],['get_end',[0,4,2]]]) {
  add(m+'.'+name,'s=mob()',{},`close(result,${JSON.stringify(expected)})`);
}
for (const [name,expected] of [['get_width',2],['get_height',4],['get_depth',2],['get_num_points',3]]) add(m+'.'+name,'s=mob()',{},`close(result,${expected})`);
add(m+'.get_all_points','s=mob(); s.add(mob().shift([3,0,0]))',{},'close(result,np.vstack([pts,pts+[3,0,0]]))');
add(m+'.get_corner','s=mob()', { direction: array([-1,1,1]) }, 'close(result,[0,4,2])');
add(m+'.get_coord','s=mob()', { dim: 1, direction: array([0,1,0]) }, 'close(result,4)');
add(m+'.length_over_dim','s=mob()', { dim: 1 }, 'close(result,4)');
for (const [name,value,scale] of [['width',6,3],['height',8,2],['depth',6,3]]) {
  add(m+'.'+name,'s=mob()',{},`close(s.get_${name}(),${value}); close(s.points,(pts-[1,2,1])*${scale}+[1,2,1])`, { mode: 'set', setValue: JSON.stringify(value) });
}
for (const method of ['copy','deepcopy']) {
  add(m+'.'+method,'s=mob(); child=mob().shift([3,0,0]); s.add(child)',{},
    'assert result is not s and result.submobjects[0] is not child; close(result.points,s.points); result.shift([1,2,3]); close(s.points,pts); close(child.points,pts+[3,0,0]); close(result.points,pts+[1,2,3])');
}
add(m+'.save_state','s=mob()',{},'s.shift([4,5,6]); close(s.saved_state.points,pts); close(s.points,pts+[4,5,6]); assert result is s');
add(m+'.restore','s=mob(); s.save_state(); s.shift([4,5,6]).set_color("#204060")',{},'close(s.points,pts); assert ManimColor(s.get_color())==WHITE; assert result is s');
add(m+'.generate_target','s=mob()',{},'assert result is s.target and result is not s; result.shift([4,5,6]); close(s.points,pts); close(result.points,pts+[4,5,6])');
add(m+'.become','s=mob(); objects["a"]=mob().shift([3,1,2]).set_color("#204060")', { mobject: ref('a') },
  'close(s.points,pts+[3,1,2]); assert ManimColor(s.get_color())==ManimColor("#204060"); assert result is s');
add(m+'.set_color','s=mob()', { color: '#204060', opacity: 0.3 }, 'close(s.rgbas,[[32/255,64/255,96/255,0.3]]); assert result is s');
add(m+'.set_opacity','s=mob(); child=mob(); s.add(child)', { opacity: 0.25 }, 'close(s.get_opacity(),0.25); close(child.get_opacity(),0.25)');
add(m+'.get_color','s=mob().set_color("#204060")',{},'assert ManimColor(result)==ManimColor("#204060")');
add(m+'.get_opacity','s=mob().set_opacity(0.25)',{},'close(result,0.25)');
add(m+'.set_gloss','s=mob()', { gloss: 0.7 }, 'close(s.get_gloss(),0.7)');
add(m+'.set_shadow','s=mob()', { shadow: 0.6 }, 'close(s.get_shadow(),0.6)');
add('manim.mobject.opengl.opengl_mobject.OpenGLGroup','objects["a"]=mob(); objects["b"]=mob().shift([3,0,0])', { mobjects: [ref('a'),ref('b')] },
  'assert result.submobjects==[objects["a"],objects["b"]]; close(result.get_all_points(),np.vstack([pts,pts+[3,0,0]]))');
add(m+'.add','s=OpenGLGroup(); objects["a"]=mob()', { mobjects: [ref('a')] }, 'assert s.submobjects==[objects["a"]]; close(s.get_all_points(),pts)');
add(m+'.remove','a=mob(); b=mob().shift([3,0,0]); s=OpenGLGroup(a,b); objects["a"]=a', { mobjects: [ref('a')] }, 'assert s.submobjects==[b]; close(s.get_all_points(),pts+[3,0,0])');
add(m+'.add_updater','s=mob()', { update_function: fn(['ob','dt'], { $call: { api: m+'.shift', receiver: { $local: 'ob' }, args: [array([{ $op: ['*',2,{ $local: 'dt' }] }, { $local: 'dt' },0])] } }) },
  's.update(0.5); close(s.points,pts+[1,0.5,0]); assert len(s.get_updaters())==1');
add(m+'.update','s=mob().add_updater(drift)', { dt: 0.5 }, 'close(s.points,pts+[1,0.5,0])');
add(m+'.remove_updater','s=mob().add_updater(drift); objects["updater"]=drift', { update_function: ref('updater') }, 's.update(0.5); close(s.points,pts); assert not s.get_updaters()');
add(m+'.clear_updaters','s=OpenGLGroup(mob().add_updater(drift)); s.add_updater(drift)',{},'s.update(0.5); close(s.get_all_points(),pts); assert not s.get_updaters() and not s[0].get_updaters()');
add(m+'.suspend_updating','s=mob().add_updater(drift)',{},'s.update(0.5); close(s.points,pts); assert s.updating_suspended');
add(m+'.resume_updating','s=mob().add_updater(drift); s.suspend_updating()',{},'s.update(0.5); close(s.points,pts+[1,0.5,0]); assert not s.updating_suspended');

add(v,'', { fill_color: '#204060', fill_opacity: 0.4, stroke_color: '#FF0000', stroke_opacity: 0.7, stroke_width: 9 },
  'close(result.get_fill_opacity(),0.4); close(result.get_stroke_opacity(),0.7); close(result.get_stroke_width(),9); assert result.get_fill_color()==ManimColor("#204060"); assert result.get_stroke_color()==ManimColor("#FF0000")');
add(v+'.set_points_as_corners','s=OpenGLVMobject()', { points: array([[0,0,0],[2,0,0],[2,4,0]]) }, 'close(s.points,[[0,0,0],[1,0,0],[2,0,0],[2,0,0],[2,2,0],[2,4,0]])');
add(v+'.set_fill','s=path_mob()', { color: '#204060', opacity: 0.4 }, 'close(s.get_fill_opacity(),0.4); assert s.get_fill_color()==ManimColor("#204060")');
add(v+'.set_stroke','s=path_mob()', { color: '#204060', opacity: 0.3, width: 9 }, 'close(s.get_stroke_opacity(),0.3); close(s.get_stroke_width(),9); assert s.get_stroke_color()==ManimColor("#204060")');
add(v+'.point_from_proportion','s=path_mob()', { alpha: 0.5 }, 'close(result,[2,1,0])');
add(v+'.get_arc_length','s=path_mob()', {}, 'close(result,6)');
add(v+'.get_nth_curve_points','s=path_mob()', { n: 1 }, 'close(result,[[2,0,0],[2,2,0],[2,4,0]])');
add(v+'.get_nth_curve_function','s=path_mob()', { n: 1 }, 'close(result(0.25),[2,1,0]); close(result(0.75),[2,3,0])');
add(v+'.get_nth_curve_length','s=path_mob()', { n: 1 }, 'close(result,4)');
add(v+'.get_subcurve','s=path_mob()', { a: 0.25, b: 0.75 }, 'close(result.get_start(),[1,0,0]); close(result.get_end(),[2,2,0]); close(s.get_end(),[2,4,0])');
add(v+'.insert_n_curves','s=path_mob()', { n: 4 }, 'assert s.get_num_curves()==6; close(s.get_start(),[0,0,0]); close(s.get_end(),[2,4,0]); close(polyline_length(s),6)');
add(v+'.reverse_direction','s=path_mob()',{},'close(s.get_start(),[2,4,0]); close(s.get_end(),[0,0,0]); close(polyline_length(s),6)');
add(v+'.add_line_to','s=path_mob()', { point: array([5,4,0]) }, 'close(s.get_end(),[5,4,0]); close(polyline_length(s),9)');
const surfaceFn = fn(['u','w'], array([{ $local: 'u' }, { $local: 'w' }, { $op: ['+', { $local: 'u' }, { $op: ['*',2,{ $local: 'w' }] }] }]));
add(surf,'', { uv_func: surfaceFn, u_range: [0,2], v_range: [0,1], resolution: [3,4] }, 'check_surface(result)');
add(surf+'.get_unit_normals','s=surface()',{},'close(result,np.tile(np.array([-1,-2,1])/np.sqrt(6),(12,1)),atol=1e-8)');
add(surf+'.get_surface_points_and_nudged_points','s=surface()',{},'assert len(result)==3; close(result[0],s.points[:12]); close(result[1]-result[0],np.tile([s.epsilon,0,s.epsilon],(12,1)),atol=1e-10); close(result[2]-result[0],np.tile([0,s.epsilon,2*s.epsilon],(12,1)),atol=1e-10)');
add(surf+'.compute_triangle_indices','s=surface(); s.triangle_indices=np.array([],dtype=int)',{},'assert len(s.triangle_indices)==36; eq(s.triangle_indices[:6],[0,4,1,1,4,5]); eq(s.triangle_indices[-6:],[6,10,7,7,10,11])');
add(surf+'.get_triangle_indices','s=surface()',{},'assert len(result)==36; eq(result[:6],[0,4,1,1,4,5]); eq(result[-6:],[6,10,7,7,10,11]); assert result.min()==0 and result.max()==11');

test('OpenGL object state APIs work without creating a rendering context', { timeout: 120_000 }, async t => {
  const health = await discoverPython();
  if (!health.available) { t.skip('Manim required'); return; }
  const directory = await mkdtemp(path.join(tmpdir(), 'anyvis-api-opengl-state-'));
  try {
    const compiler = createApiCompiler();
    const probes = cases.map((c, index) => {
      const entry = getApiEntry(c.id);
      assert.ok(entry, `Unknown API: ${c.id}`);
      const fields = { receiver: 's', mode: 'store', ...c.fields };
      for (const [key, value] of Object.entries(c.params)) fields[`p_${key}`] = JSON.stringify(value);
      const compiled = compiler.compile(createAction(entry.type, fields), entry, new Set(['s','a','b','updater']), {});
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
from manim.mobject.opengl.opengl_mobject import OpenGLMobject, OpenGLGroup
from manim.mobject.opengl.opengl_vectorized_mobject import OpenGLVMobject
from manim.mobject.opengl.opengl_surface import OpenGLSurface
import numpy as np
import json, traceback
import moderngl
def forbid_context(*args, **kwargs):
    raise AssertionError("State-only fixture must not create an OpenGL context")
moderngl.create_context = forbid_context
moderngl.create_standalone_context = forbid_context
${API_RUNTIME}
${compiler.imports().join('\n')}
eq = np.testing.assert_array_equal
close = np.testing.assert_allclose
pts=np.array([[0.,0,0],[2,0,1],[0,4,2]])
bbox=np.array([[0.,0,0],[1,2,1],[2,4,2]])
def mob(): return OpenGLMobject().set_points(pts.copy())
def polyline_length(m): return float(np.linalg.norm(np.diff(m.points,axis=0),axis=1).sum())
def path_mob(): return OpenGLVMobject().set_points_as_corners([[0.,0,0],[2,0,0],[2,4,0]])
def surface(): return OpenGLSurface(lambda u,v: np.array([u,v,u+2*v]),u_range=[0,2],v_range=[0,1],resolution=(3,4))
def drift(m,dt): m.shift(np.array([2*dt,dt,0]))
def check_surface(m):
    expected=np.array([[u,v,u+2*v] for u in [0,1,2] for v in [0,1/3,2/3,1]])
    close(m.points[:12],expected)
    assert m.points.shape == (36,3)
${probes.join('\n')}
results=[]
with tempconfig({"renderer":"opengl","media_dir":"media","verbosity":"ERROR"}):
    for api_id, probe in [${cases.map((c,i) => `(${JSON.stringify(c.id)}, probe_${i})`).join(',')}]:
        try:
            probe()
            results.append({"apiId":api_id,"status":"verified"})
        except Exception:
            results.append({"apiId":api_id,"status":"failed","reason":traceback.format_exc(limit=3)})
print("ANYVIS_OPENGL_STATE " + json.dumps(results))
`;
    const script = path.join(directory, 'opengl-state.py');
    await writeFile(script, runner);
    const output = await execute(health.python, [script], { env: nativeExecutionEnvironment(health.python), cwd: directory, timeout: 100_000, maxBuffer: 4 * 1024 * 1024 });
    const line = output.stdout.split('\n').find(row => row.startsWith('ANYVIS_OPENGL_STATE '));
    assert.ok(line, output.stdout);
    const outcomes = JSON.parse(line.slice('ANYVIS_OPENGL_STATE '.length));
    assert.equal(outcomes.length, cases.length);
    const failures = outcomes.filter(row => row.status !== 'verified');
    const apiIds = [...new Set(outcomes.filter(row => row.status === 'verified').map(row => row.apiId))].sort();
    const fixture = 'src/studio/core/api-opengl-state.native.spec-node.mjs';
    const reportPath = process.env.ANYVIS_API_OPENGL_STATE_REPORT || path.resolve('artifacts/api/native-opengl-state-evidence.json');
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, JSON.stringify({ fixture, sourceFiles: await apiEvidenceSources(fixture),
      registrySha256: createHash('sha256').update(await readFile(new URL('./api-registry.json', import.meta.url))).digest('hex'),
      passed: failures.length === 0, engineVersion: health.version, renderer: 'opengl', renderValidated: false, apiIds, outcomes,
      checks: 'Registry-compiled OpenGL object state calls with concrete points, bounding boxes, copy isolation, style, updater and surface-array assertions. No GL context, renderer, framebuffer or movie is created. renderValidated=false; these are not OpenGL rendering evidence. Setup calls and abstract no-op methods are not counted.'
    }, null, 2) + '\n');
    t.diagnostic(`${apiIds.length} OpenGL state APIs, ${outcomes.length} cases, ${failures.length} failures.`);
    assert.deepEqual(failures, []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('OpenGL length compatibility preserves sampling, overrides and working native implementations', { timeout: 60_000 }, async t => {
  const health = await discoverPython();
  if (!health.available) { t.skip('Manim required'); return; }
  const directory = await mkdtemp(path.join(tmpdir(), 'anyvis-opengl-length-compat-'));
  try {
    const compiler = createApiCompiler();
    const entry = getApiEntry(v + '.get_arc_length');
    const compiled = compiler.compile(createAction(entry.type, { receiver:'s', p_sample_points_per_curve:JSON.stringify(ref('samples')) }), entry, new Set(['s','samples']), {});
    const script = path.join(directory, 'compat.py');
    await writeFile(script, `from manim import *
from manim.mobject.opengl.opengl_vectorized_mobject import OpenGLVMobject
import numpy as np
import moderngl
def forbid_context(*args, **kwargs):
    raise AssertionError("State-only fixture must not create an OpenGL context")
moderngl.create_context = forbid_context
moderngl.create_standalone_context = forbid_context
${API_RUNTIME}
${compiler.imports().join('\n')}
def length(s, samples):
    objects = {"s":s,"samples":samples}
${compiled.prelude.map(line=>'    '+line).join('\n')}
    return ${compiled.expression}
with tempconfig({"renderer":"opengl"}):
    path = OpenGLVMobject().set_points_as_corners([[0.,0,0],[2,0,0],[2,4,0]])
    np.testing.assert_allclose(length(path,9),6)
    np.testing.assert_allclose(length(OpenGLVMobject(),9),0)
    class SampledPath(OpenGLVMobject):
        def get_curve_functions_with_lengths(self, **kwargs):
            self.observed_samples = kwargs['sample_points']
            return iter([(None,2.25),(None,3.75)])
    sampled = SampledPath()
    assert length(sampled,11) == 6
    assert sampled.observed_samples == 11
    assert length(sampled,None) == 6
    assert sampled.observed_samples is None
    class CustomPath(OpenGLVMobject):
        def get_arc_length(self, sample_points_per_curve=None):
            return 100+sample_points_per_curve
    assert length(CustomPath(),7) == 107
    patched = OpenGLVMobject.get_arc_length
    _av_opengl_length_compat()
    assert OpenGLVMobject.get_arc_length is patched
    # Simulate a fixed native implementation retaining the original module name.
    def fixed_native(self, sample_points_per_curve=None): return 42
    fixed_native.__module__ = 'manim.mobject.opengl.opengl_vectorized_mobject'
    OpenGLVMobject.get_arc_length = fixed_native
    _av_opengl_length_compat()
    assert OpenGLVMobject.get_arc_length is fixed_native
    assert length(path,9) == 42
    def unrelated_failure(self, sample_points_per_curve=None): raise TypeError('unrelated failure')
    unrelated_failure.__module__ = 'manim.mobject.opengl.opengl_vectorized_mobject'
    OpenGLVMobject.get_arc_length = unrelated_failure
    _av_opengl_length_compat()
    assert OpenGLVMobject.get_arc_length is unrelated_failure
    import manim
    version = manim.__version__
    def different_version(self, sample_points_per_curve=None): raise TypeError('generator unsupported')
    different_version.__module__ = 'manim.mobject.opengl.opengl_vectorized_mobject'
    try:
        manim.__version__ = '0.21.0'
        OpenGLVMobject.get_arc_length = different_version
        _av_opengl_length_compat()
        assert OpenGLVMobject.get_arc_length is different_version
    finally:
        manim.__version__ = version
        OpenGLVMobject.get_arc_length = patched
print('ANYVIS_OPENGL_LENGTH_COMPAT_OK')
`);
    const output = await execute(health.python, [script], { env: nativeExecutionEnvironment(health.python), cwd:directory, timeout:45_000, maxBuffer:1024*1024 });
    assert.match(output.stdout,/ANYVIS_OPENGL_LENGTH_COMPAT_OK/);
  } finally { await rm(directory,{recursive:true,force:true}); }
});

