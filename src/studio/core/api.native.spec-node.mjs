import { apiEvidenceSources, nativeExecutionEnvironment } from '../../../scripts/api-evidence.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,readFile,mkdir,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {discoverPython} from '../../../server/server.mjs';
import {createAction} from './catalog.ts';
import {getApiEntry} from './api-registry.ts';
import {compileProject} from './compiler.ts';
import {createEmptyProject} from './project.ts';

const execute=promisify(execFile);
const ref=name=>({$ref:name});
const vec=(...values)=>({$array:values});
const call=(api,args=[],kwargs={})=>({$call:{api,args,kwargs}});
const fn=(params,body)=>({$lambda:{params,body}});

test('native API behavior: arguments, objects, methods, callbacks, properties, contexts and real frames',{timeout:60_000},async t=>{
  const health=await discoverPython();if(!health.available){t.skip('Manim required');return;}
  const directory=await mkdtemp(path.join(tmpdir(),'anyvis-api-native-'));
  const p=createEmptyProject();const used=new Set();
  const api=(id,name,params={},fields={})=>{const entry=getApiEntry(id);assert.ok(entry,id);used.add(entry.id);const a=createAction(entry.type,{name,...Object.fromEntries(Object.entries(params).map(([k,v])=>[`p_${k}`,JSON.stringify(v)])),...fields});p.actions.push(a);return a;};
  const value=(name,content)=>p.actions.push(createAction('api_value',{name,value:JSON.stringify(content)}));
  const check=source=>p.actions.push(createAction('code',{code:source}));
  try{
    api('Circle','circle',{radius:0.7,color:{$constant:'BLUE'},fill_opacity:0.3});
    api('Mobject.shift','shifted',{vectors:[vec(-2,0,0),vec(0,1,0)]},{receiver:'circle',mode:'animate',duration:0.2});
    check('np.testing.assert_allclose(objects["circle"].get_center(), [-2,1,0], atol=1e-6)');
    api('Mobject.width','width',{}, {receiver:'circle'});
    check('assert abs(objects["width"]-1.4)<1e-5');
    api('Mobject.width','resized',{}, {receiver:'circle',mode:'set',setValue:'2'});
    check('assert abs(objects["circle"].width-2)<1e-5');
    value('wide',{$if:[{$op:['>',{$property:{api:'Circle.width',receiver:ref('circle')}},1]},true,false]});
    check('assert objects["wide"] is True');
    api('Mobject.get_center','center',{}, {receiver:'circle'});
    api('Dot','center_dot',{point:ref('center'),color:{$constant:'RED'}});
    check('np.testing.assert_allclose(objects["center_dot"].get_center(), objects["circle"].get_center())');
    api('ManimColor.from_rgb','green',{rgb:[0.2,0.8,0.4]});
    api('ManimColor.to_hex','hex',{}, {receiver:'green'});
    check('assert objects["hex"].upper()=="#33CC66"');
    api('Square','square',{side_length:1,color:ref('green')},{mode:'store'});
    value('colored',{$call:{api:'Mobject.set_color',receiver:ref('square'),args:['#FF0000']}});
    used.add(getApiEntry('Mobject.set_color').id);
    check('assert objects["colored"] is objects["square"]\nassert objects["square"].get_fill_color().to_hex().upper()=="#FF0000"\nassert objects["square"].get_stroke_color().to_hex().upper()=="#FF0000"');
    value('scaled',{$call:{api:'Mobject.scale',receiver:ref('square'),args:[2],kwargs:{scale_stroke:true}}});
    used.add(getApiEntry('Mobject.scale').id);
    check('assert abs(objects["scaled"].width-2)<1e-6\nassert abs(objects["scaled"].get_stroke_width()-8)<1e-6');
    api('Transform','transform',{mobject:ref('circle'),target_mobject:ref('square')},{duration:0.2});
    check('np.testing.assert_allclose(objects["circle"].get_center(),[0,0,0],atol=1e-6)');
    api('Axes','axes',{x_range:[-3,3,1],y_range:[-2,2,1],x_length:6,y_length:3,tips:false});
    api('Axes.plot','curve',{function:fn(['x'],{$expr:'sin(x)'}),x_range:[-3,3]},{receiver:'axes',mode:'show'});
    check('assert len(objects["curve"].points)>10');
    api('bezier','path',{points:vec([-3,-2,0],[0,2,0],[3,-2,0])});
    value('midpoint',{$call:{function:ref('path'),args:[0.5]}});
    check('np.testing.assert_allclose(objects["midpoint"],[0,0,0],atol=1e-6)');
    api('interpolate','lerp',{start:1,end:5,alpha:0.25});
    check('assert objects["lerp"]==2');
    api('rotate_vector','rotated',{vector:vec(1,0,0),angle:{$expr:'pi/2'}});
    check('np.testing.assert_allclose(objects["rotated"],[0,1,0],atol=1e-6)');
    api('ValueTracker','tracker',{value:0});
    api('always_redraw','dynamic',{func:fn([],call('Dot',[vec({$call:{api:'ValueTracker.get_value',receiver:ref('tracker')}},-1,0)]))},{mode:'show'});
    api('ValueTracker.set_value','changed',{value:2},{receiver:'tracker',mode:'animate',duration:0.2});
    check('assert abs(objects["tracker"].get_value()-2)<1e-5\nnp.testing.assert_allclose(objects["dynamic"].get_center(),[2,-1,0],atol=1e-5)');
    api('Dot','moving',{point:vec(-2,-2,0)});
    api('Mobject.add_updater','updater',{update_function:fn(['m','dt'],{$call:{api:'Mobject.shift',receiver:{$local:'m'},args:[vec({$expr:'dt'},0,0)]}})},{receiver:'moving'});
    api('Scene.wait','wait',{duration:0.3,frozen_frame:false},{receiver:'@scene'});
    check('assert objects["moving"].get_x()>-2');
    api('Mobject.clear_updaters','cleared',{}, {receiver:'moving'});
    api('VGroup','group',{vmobjects:[ref('dynamic'),ref('moving')]},{mode:'store'});
    api('Mobject.arrange','arranged',{direction:{$constant:'RIGHT'},buff:0.5},{receiver:'group'});
    check('assert len(objects["group"])==2\nassert objects["dynamic"].get_x()<objects["moving"].get_x()');
    api('ArrowVectorField','field',{func:fn(['p'],vec(0.3,0.2,0)),x_range:[-1,1,1],y_range:[-1,1,1]},{mode:'store'});
    check('assert len(objects["field"].submobjects)==9');
    api('Mobject.copy','copy',{}, {receiver:'circle'});
    api('FadeOut','fade_a',{mobjects:[ref('circle')]},{mode:'store'});
    api('FadeIn','fade_b',{mobjects:[ref('copy')]},{mode:'store'});
    api('Succession','sequence',{animations:[ref('fade_a'),ref('fade_b')]},{duration:0.4});
    check('assert objects["copy"] in self.mobjects');
    const context=createAction('api_context',{context:JSON.stringify(call('tempconfig',[{frame_width:20}]))});
    context.children=[createAction('code',{code:'assert config.frame_width==20'})];p.actions.push(context);
    check('assert config.frame_width!=20');
    // Inspect the runtime helper with positional-only/default/vararg/keyword-only
    // parameters. This uses a fixed test function, never a user-code fallback.
    check(`def _probe(a=1, /, b=2, *args, c=3, **kw):
    return a,b,args,c,kw
assert _av_invoke(_probe, {"b":4,"c":5}, [6,7], {"x":8}) == (1,4,(6,7),5,{"x":8})
try:
    _av_invoke(_probe, {"c":1}, [], {"c":2})
    raise AssertionError("Duplicate kwargs accepted")
except TypeError:
    pass
self.camera.reset()
self.camera.capture_mobjects(self.mobjects)
assert np.std(self.camera.pixel_array[:,:,:3])>5
print("ANYVIS_API_OK")`);
    const c=compileProject(p);assert.deepEqual(c.diagnostics.filter(d=>d.severity==='error'),[]);
    const filename=path.join(directory,'scene.py');
    await writeFile(filename,c.code+'\nwith tempconfig({"write_to_movie":False,"save_last_frame":False,"renderer":"cairo","media_dir":"media","pixel_width":320,"pixel_height":180,"frame_rate":10,"progress_bar":"none","verbosity":"WARNING"}):\n    AnyVisScene().render()\n');
    const result=await execute(health.python,[filename],{ env: nativeExecutionEnvironment(health.python),cwd:directory,timeout:45_000,maxBuffer:1024*1024});
    assert.match(result.stdout,/ANYVIS_API_OK/);t.diagnostic(`Verified ${used.size} distinct registry APIs with native assertions and frame pixels.`);
    if(process.env.ANYVIS_API_REPORT){
      const registry=await readFile(new URL('./api-registry.json',import.meta.url));
      const report=path.resolve(process.env.ANYVIS_API_REPORT);await mkdir(path.dirname(report),{recursive:true});
      await writeFile(report,JSON.stringify({fixture:'src/studio/core/api.native.spec-node.mjs',sourceFiles:await apiEvidenceSources('src/studio/core/api.native.spec-node.mjs'),registrySha256:createHash('sha256').update(registry).digest('hex'),apiIds:[...used].sort(),engineVersion:health.version,renderer:'cairo',checks:'Runtime assertions for geometry, return values, property writes, callbacks/updaters, grouping, animation composition, context restoration and nonblank frame pixels. This fixture does not export a movie.',passed:true},null,2)+'\n');
    }
  }finally{await rm(directory,{recursive:true,force:true});}
});
