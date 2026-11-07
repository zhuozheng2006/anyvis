import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { API_ENTRIES } from './api-registry.ts';
import { createApiCompiler, API_RUNTIME } from './api-compiler.ts';
import { createAction } from './catalog.ts';
import { discoverPython } from '../../../server/server.mjs';
import { apiEvidenceSources } from '../../../scripts/api-evidence.mjs';
const execute = promisify(execFile);

// Fixed native fixtures are the comparison oracle only; all observed calls are
// produced by the same API compiler used by the editor. No user Python fallback.
const fixtures = {
  Animation: 'Create(Circle())', AnimationGroup: 'AnimationGroup(Create(Circle()),Create(Square()))',
  DrawBorderThenFill: 'DrawBorderThenFill(Circle())', Wiggle: 'Wiggle(Circle())',
  ChangeSpeed: 'ChangeSpeed(Create(Circle()),speedinfo={0:1,1:1})', FadeTransform: 'FadeTransform(Circle(),Square())', Transform: 'Transform(Circle(),Square())',
  ScreenRectangle: 'ScreenRectangle()', Arc: 'Arc(angle=PI/2)', TipableVMobject: 'Arrow()',
  Angle: 'Angle(Line(ORIGIN,RIGHT),Line(ORIGIN,UP))', Arrow: 'Arrow()', DashedLine: 'DashedLine()', Line: 'Line(LEFT,RIGHT)',
  Polygram: 'Polygon(LEFT,UP,RIGHT)', Square: 'Square()', ArrowTip: 'ArrowTriangleTip()', StealthTip: 'StealthTip()',
  Axes: 'Axes(x_range=[-2,2,1],y_range=[-2,2,1])', CoordinateSystem: 'Axes(x_range=[-2,2,1],y_range=[-2,2,1])',
  PolarPlane: 'PolarPlane(radius_max=2)', ThreeDAxes: 'ThreeDAxes(x_range=[-2,2,1],y_range=[-2,2,1],z_range=[-2,2,1])',
  FunctionGraph: 'FunctionGraph(lambda t:t*t,x_range=[-1,1])', ParametricFunction: 'ParametricFunction(lambda t:np.array([t,t*t,0]),t_range=[-1,1])',
  NumberLine: 'NumberLine(x_range=[-2,2,1])', BarChart: 'BarChart([1,2],y_axis_config={"include_numbers":False})',
  Matrix: 'MobjectMatrix([[Circle(),Square()]])', Mobject: 'Circle().add(Square().shift(RIGHT))',
  Brace: 'Brace(Square())', SVGMobject: 'SVGMobject("fixture.svg")', Table: 'Table([["a","b"],["c","d"]],element_to_mobject=Text,row_labels=[Text("r1"),Text("r2")],col_labels=[Text("c1"),Text("c2")])',
  Arrow3D: 'Arrow3D()', Cone: 'Cone(resolution=(4,4))', Cylinder: 'Cylinder(resolution=(4,4))', Line3D: 'Line3D()',
  AbstractImageMobject: 'ImageMobject(np.ones((4,4,3),dtype=np.uint8)*127)', ImageMobject: 'ImageMobject(np.ones((4,4,3),dtype=np.uint8)*127)',
  ImageMobjectFromCamera: 'ImageMobjectFromCamera(Camera())', PMobject: 'PMobject().add_points(np.array([[0,0,0],[1,1,0]]))',
  VDict: 'VDict({"circle":Circle(),"square":Square()})', VMobject: 'Circle(radius=0.7)', VectorizedPoint: 'VectorizedPoint([1,2,3])',
  ComplexValueTracker: 'ComplexValueTracker(1+2j)', ValueTracker: 'ValueTracker(2)',
  VectorField: 'ArrowVectorField(lambda p:np.array([0.1,0.2,0]),x_range=[-1,1,1],y_range=[-1,1,1])',
  HSV: 'HSV([0.2,0.5,0.7])', TexTemplate: 'TexTemplate()',
  MethodWithArgs: '__import__("manim.data_structures",fromlist=["MethodWithArgs"]).MethodWithArgs(Circle().shift,[RIGHT],{})',
};

const oracle = `
import json, math, inspect, enum
from pathlib import Path
from collections.abc import Iterator, ValuesView
from PIL.Image import Image as _PILImage

def snapshot(value, subject, depth=0):
    if depth>8: raise ValueError("snapshot depth limit")
    if value is subject: return {"identity":"receiver"}
    if isinstance(value,enum.Enum): return {"enum":type(value).__qualname__,"value":value.value}
    if type(value).__name__=="_AnimationBuilder":
        value.shift(RIGHT)
        return {"target_points":snapshot(subject.target.get_all_points(),subject,depth+1)}
    if type(value).__name__=="_UpdaterBuilder":
        value.shift(RIGHT)
        subject.update(0.1)
        return {"updated_points":snapshot(subject.get_all_points(),subject,depth+1),"updaters":len(subject.updaters)}
    if value is None or isinstance(value,(str,bool,int)): return value
    if isinstance(value,(float,np.floating)):
        if not np.isfinite(value): return str(value)
        return round(float(value),10)
    if isinstance(value,np.bool_): return bool(value)
    if isinstance(value,np.integer): return int(value)
    if isinstance(value,Path): return str(value)
    if isinstance(value,type): return {"type":value.__module__+"."+value.__qualname__}
    if isinstance(value,(Iterator,ValuesView)): return snapshot(list(value),subject,depth+1)
    if inspect.ismethod(value): return {"method":value.__func__.__qualname__,"receiver":snapshot(value.__self__,subject,depth+1)}
    if inspect.isfunction(value):
        signature=inspect.signature(value)
        parameters=list(signature.parameters)
        if parameters==["start","end","alpha"]:
            return {"path_samples":[snapshot(value(np.array([[0,0,0]]),np.array([[2,1,0]]),t),subject,depth+1) for t in [0,0.5,1]]}
        if parameters==["mob","dt"]:
            probe=Dot(); value(probe,0.1)
            return {"nudged_points":snapshot(probe.get_all_points(),subject,depth+1)}
        if parameters and parameters[0] in ("t","x") and all(p.default is not p.empty for p in list(signature.parameters.values())[1:]): return {"samples":[snapshot(value(t),subject,depth+1) for t in [0,0.5,1]]}
        raise ValueError("Function needs a concrete evaluation fixture: "+str(parameters))
    if isinstance(value,complex): return [value.real,value.imag]
    if isinstance(value,np.ndarray): return {"array":snapshot(value.tolist(),subject,depth+1),"shape":list(value.shape),"dtype":str(value.dtype)}
    if isinstance(value,ManimColor): return {"color":snapshot(value.to_rgba(),subject,depth+1)}
    if isinstance(value,Mobject):
        return {"class":type(value).__qualname__,"points":snapshot(value.get_all_points(),subject,depth+1),"children":len(value.submobjects)}
    if isinstance(value,_PILImage): return {"image":snapshot(np.asarray(value),subject,depth+1)}
    if isinstance(value,(tuple,list)): return {"sequence":type(value).__name__,"items":[snapshot(v,subject,depth+1) for v in value]}
    if isinstance(value,dict): return {"dict":[[snapshot(k,subject,depth+1),snapshot(v,subject,depth+1)] for k,v in value.items()]}
    raise ValueError("No comparison oracle for "+type(value).__qualname__)

results=[]
def run_case(api_id, factory, expected, observed):
    try:
        reference=factory()
        if isinstance(reference,Animation): reference.begin()
        expected_value=snapshot(expected(reference),reference)
        if isinstance(reference,Animation): reference.finish()
    except Exception as error:
        results.append({"apiId":api_id,"status":"fixture_gap","reason":type(error).__name__+": "+str(error)[:250]})
        return
    try:
        actual=factory()
        if isinstance(actual,Animation): actual.begin()
        observed_value=snapshot(observed(actual),actual)
        if isinstance(actual,Animation): actual.finish()
        assert observed_value==expected_value, "Compiled result differs from native result"
        results.append({"apiId":api_id,"status":"verified"})
    except Exception as error:
        results.append({"apiId":api_id,"status":"failed","reason":type(error).__name__+": "+str(error)[:250]})
`;

test('native read APIs match independent direct Python calls', { timeout: 120_000 }, async t => {
  const health = await discoverPython(); if (!health.available) { t.skip('Manim required'); return; }
  const directory = await mkdtemp(path.join(tmpdir(), 'anyvis-api-query-'));
  try {
    const entries = API_ENTRIES.filter(e => e.renderer === 'any' && !e.requiresTrust && (e.kind === 'property' || e.kind === 'method' && /^(get_|has_|is_)/.test(e.name) && !e.parameters.some(p => p.required)));
    const compiler = createApiCompiler(), cases = [], gaps = [];
    for (const entry of entries) {
      const factory = entry.path === 'CoordinateSystem.get_z_axis' ? fixtures.ThreeDAxes : fixtures[entry.owner.split('.').at(-1)];
      if (!factory) { gaps.push({ apiId: entry.id, status: 'fixture_gap', reason: 'No concrete owner fixture' }); continue; }
      const action = createAction(entry.type, { name: 'result', receiver: 'subject', mode: 'store' });
      const c = compiler.compile(action, entry, new Set(['subject']), {});
      assert.equal(c.mode, 'store');
      const name = `_probe_${cases.length}`;
      cases.push(`def ${name}(subject):\n    objects={"subject":subject}\n${[...c.prelude, `return ${c.expression}`].map(line => '    ' + line).join('\n')}\nrun_case(${JSON.stringify(entry.id)}, lambda: ${factory}, lambda subject: subject.${entry.name}${entry.kind === 'method' ? '()' : ''}, ${name})`);
    }
    const source = `from manim import *\nimport numpy as np\n${compiler.imports().join('\n')}\n${API_RUNTIME}\n${oracle}\nwith tempconfig({"renderer":"cairo","pixel_width":64,"pixel_height":64,"media_dir":"media","verbosity":"ERROR"}):\n${cases.join('\n').split('\n').map(l => '    ' + l).join('\n')}\nprint("ANYVIS_QUERIES "+json.dumps(results))\n`;
    const file = path.join(directory, 'queries.py'); await writeFile(file, source);
    await writeFile(path.join(directory, 'fixture.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="25"/></svg>');
    const result = await execute(health.python, [file], { cwd: directory, timeout: 100_000, maxBuffer: 2 * 1024 * 1024, env: { ...process.env, PATH: `${path.dirname(health.python)}:/Library/TeX/texbin:${process.env.PATH || ''}` } });
    const line = result.stdout.split('\n').find(l => l.startsWith('ANYVIS_QUERIES ')); assert.ok(line, result.stdout);
    const outcomes = [...JSON.parse(line.slice('ANYVIS_QUERIES '.length)), ...gaps];
    const failures = outcomes.filter(o => o.status === 'failed');
    const verified = outcomes.filter(o => o.status === 'verified').map(o => o.apiId).sort();
    t.diagnostic(`${verified.length} native queries verified; ${outcomes.filter(o => o.status === 'fixture_gap').length} explicit fixture gaps; ${failures.length} adapter failures.`);
    if (process.env.ANYVIS_API_QUERIES_REPORT) {
      const fixture = 'src/studio/core/api-queries.native.spec-node.mjs';
      const registry = await readFile(new URL('./api-registry.json', import.meta.url));
      const destination = path.resolve(process.env.ANYVIS_API_QUERIES_REPORT); await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, JSON.stringify({ fixture, sourceFiles: await apiEvidenceSources(fixture), registrySha256: createHash('sha256').update(registry).digest('hex'), passed: failures.length === 0, engineVersion: health.version, renderer: 'cairo', apiIds: verified, outcomes, checks: 'Actual compiled calls compared to direct native calls on equivalent concrete fixtures; geometry, arrays, colors, identity, primitives and image snapshots. Fixture gaps are not counted. This is not a per-API movie or all-parameter claim.' }, null, 2) + '\n');
    }
    assert.deepEqual(failures, []);
    assert.ok(verified.length > 100, 'The fixture oracle unexpectedly lost most query coverage.');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
