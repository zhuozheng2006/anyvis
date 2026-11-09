import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import { discoverPython } from '../../server/server.mjs';
import { nativeExecutionEnvironment } from '../../scripts/api-evidence.mjs';
import {createEmptyProject} from './core/project.ts';
import {compileProject} from './core/compiler.ts';
import {createSurfaceActions,SURFACE_PRESETS} from './surface3d.ts';
import {createProbabilityActions,DISTRIBUTION_PRESETS} from './probability.ts';
import {createPolarParametricActions,POLAR_PARAMETRIC_PRESETS} from './polar-parametric.ts';
import {createComplexMappingActions,COMPLEX_PRESETS} from './complex-mapping.ts';
import {createVectorFieldActions,VECTOR_FIELD_PRESETS} from './vector-field.ts';
import {createGeometryActions,GEOMETRY_PRESETS} from './geometry-euclidean.ts';
import {createGraphActions,GRAPH_PRESETS} from './graph-network.ts';
import {createCalculusActions,CALCULUS_PRESETS} from './calculus.ts';
import {createFourierActions,computeDft,getFourierPreset} from './fourier.ts';
const run=promisify(execFile);
test('workbench insertion runs native Manim and produces geometry and non-background pixels',{timeout:200000},async t=>{
 const health = await discoverPython();
 if (!health.available) {
  if (process.env.ANYVIS_REQUIRE_MANIM === '1') assert.fail(health.error || 'Manim required');
  t.skip(health.error || 'Manim required'); return;
 }
 const cases=[];
 const add=(id,result,extra={})=>{
   const compiled=compileProject(result.project);
   assert.deepEqual(compiled.diagnostics,[],id);assert.equal(compiled.requiresTrust,false,id);
   cases.push({id,code:compiled.code.replace('        objects = {}', '        objects = {}\n        self._review_objects = objects'),...extra});
 };
 for(const p of SURFACE_PRESETS){const r=createSurfaceActions(createEmptyProject(),p);add('surface:'+p.id,r,{kind:'surface',name:r.project.actions.find(a=>a.type==='surface').fields.name,point:p.func(0.4,0.7)});}
 for(const p of POLAR_PARAMETRIC_PRESETS){const params=Object.fromEntries(p.params.map(p=>[p.key,p.defaultValue]));const r=createPolarParametricActions(createEmptyProject(),p,params);add('polar:'+p.id,r,{kind:'curve',name:r.project.actions[0].fields.name,point:[...p.evalPoint(0.8,params),0]});}
 for(const p of DISTRIBUTION_PRESETS)add('probability:'+p.id,createProbabilityActions(createEmptyProject(),p));
 for(const p of GEOMETRY_PRESETS)add('geometry:'+p.id,createGeometryActions(createEmptyProject(),p,p.initialA,p.initialB,p.initialC));
 for(const p of COMPLEX_PRESETS)add('complex:'+p.id,createComplexMappingActions(createEmptyProject(),p,p.defaultBounds));
 for(const p of VECTOR_FIELD_PRESETS)for(const mode of ['arrows','streamlines'])add('field:'+p.id+':'+mode,createVectorFieldActions(createEmptyProject(),p,p.defaultBounds,mode));
 for(const p of GRAPH_PRESETS)add('graph:'+p.id,createGraphActions(createEmptyProject(),p));
 for(const p of CALCULUS_PRESETS){const r=createCalculusActions(createEmptyProject(),p);add('calculus:'+p.id,r,{kind:'tracker',name:r.project.actions.find(a=>a.type==='tracker').fields.name});}
 add('fourier:60-harmonics',createFourierActions(createEmptyProject(),computeDft(getFourierPreset('pi',180),60)));
 const dir=await mkdtemp(path.join(tmpdir(),'anyvis-playground-'));
 try{
 await writeFile(path.join(dir,'cases.json'),JSON.stringify(cases));
 const python=health.python;
 const script=String.raw`
import json,sys,numpy as np
from manim import tempconfig
cases=json.load(open(sys.argv[1]))
for case in cases:
 with tempconfig(dict(pixel_width=256,pixel_height=144,frame_rate=2,dry_run=True,skip_animations=True,disable_caching=True,verbosity='ERROR',media_dir=sys.argv[2])):
  ns={};exec(compile(case['code'],case['id'],'exec'),ns)
  scene=ns['AnyVisScene']();scene.render()
  objects=scene._review_objects
  if case.get('kind')=='surface': np.testing.assert_allclose(objects[case['name']].func(0.4,0.7),case['point'],atol=1e-8)
  if case.get('kind')=='curve': np.testing.assert_allclose(objects[case['name']].function(0.8),case['point'],atol=1e-8)
  if case.get('kind')=='tracker': assert abs(objects[case['name']].get_value()-0.01)<1e-8
  family=[m for root in scene.mobjects for m in root.family_members_with_points()]
  assert family,case['id']+' missing geometry'
  assert all(np.isfinite(m.points).all() for m in family),case['id']+' non-finite geometry'
  scene.renderer.update_frame(scene)
  pixels=scene.renderer.get_frame()[:,:,:3]
  assert np.any(np.ptp(pixels.reshape(-1,3),axis=0)>20),case['id']+' blank pixels'
  print('PASS',case['id'],len(family),flush=True)
print('TOTAL',len(cases))
`;
 const result=await run(python,['-u','-c',script,path.join(dir,'cases.json'),dir],{timeout:180000,maxBuffer:12*1024*1024,env:nativeExecutionEnvironment(python)});
 console.log(result.stdout);assert.match(result.stdout,new RegExp(`TOTAL ${cases.length}`));
 }finally{await rm(dir,{recursive:true,force:true});}
});
