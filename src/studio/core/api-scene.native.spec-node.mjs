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
import { apiEvidenceSources } from '../../../scripts/api-evidence.mjs';

const execute = promisify(execFile);
const ref = name => ({ $ref: name });
const array = value => ({ $array: value });
const cases = [];
const add = (id, setup, params, check) => cases.push({ id, setup, params, check });
const scene = 'manim.scene.scene.Scene';
const moving = 'manim.scene.moving_camera_scene.MovingCameraScene';
const three = 'manim.scene.three_d_scene.ThreeDScene';

// Only compiled calls count. Setup calls prepare concrete, non-default state;
// no-op abstract lifecycle methods and interactive GUI hooks are excluded.
add(scene, '', { skip_animations: true }, 'result.add(a); result.play(a.animate.shift(RIGHT*2),run_time=0.4); close(a.get_x(),2); close(result.time,0.4); assert result.renderer.skip_animations');
add(scene+'.add', 's.add(a,b)', { mobjects:[ref('a'),ref('c')] }, 'assert s.mobjects == [b,a,c]; assert result is s');
add(scene+'.add', 's.add(b,a); s.add_foreground_mobject(a); s.moving_mobjects=[b,a]', { mobjects:[ref('a'),ref('c'),ref('a')] }, 'assert s.mobjects == [b,c,a]; assert s.moving_mobjects == [b,c,a]; assert s.foreground_mobjects == [a]');
add(scene+'.add', 'a.add_updater(lambda m,dt:m.shift(RIGHT*dt)); g=VGroup(VGroup(a,b),c); objects["g"]=g; s.add_foreground_mobject(a); s.moving_mobjects=[a]', { mobjects:[ref('g')] }, 'assert s.mobjects == [b,c,a]; assert s.moving_mobjects == [b,c,a]; assert s.foreground_mobjects == [a]; s.update_mobjects(0.5); close(a.get_x(),0.5); close(b.get_x(),0); close(c.get_x(),0)');
add(scene+'.add_foreground_mobject', 'a.add_updater(lambda m,dt:m.shift(RIGHT*dt)); g=VGroup(VGroup(a,b),c); s.add(g); s.moving_mobjects=[g]', { mobject:ref('a') }, 'assert s.mobjects == [b,c,a]; assert s.moving_mobjects == [b,c,a]; assert s.foreground_mobjects == [a]; s.update_mobjects(0.5); close(a.get_x(),0.5); close(b.get_x(),0); close(c.get_x(),0)');
add(scene+'.add', 'a.add_updater(lambda m,dt:m.shift(RIGHT*dt)); inner=VGroup(a,b); g=VGroup(inner); objects["g"]=g; s.add_foreground_mobject(c); s.moving_mobjects=[c]', { mobjects:[ref('g')] }, 'assert s.mobjects == [g,c]; assert s.moving_mobjects == [g,c]; assert s.foreground_mobjects == [c]; assert g.submobjects == [inner] and inner.submobjects == [a,b]; s.update_mobjects(0.5); close(a.get_x(),0.5); close(b.get_x(),0)');
add(scene+'.remove', 'g = VGroup(a,b); s.add(g,c)', { mobjects:[ref('a')] }, 'assert s.mobjects == [b,c]; assert result is s');
add(scene+'.replace', 'g = VGroup(a,b); s.add(g)', { old_mobject:ref('a'),new_mobject:ref('c') }, 'assert s.mobjects == [g]; assert g.submobjects == [c,b]');
add(scene+'.replace', 's.add(a,b)', { old_mobject:ref('a'),new_mobject:ref('c') }, 'assert s.mobjects == [c,b]');
add(scene+'.bring_to_front', 's.add(a,b,c)', { mobjects:[ref('a')] }, 'assert s.mobjects == [b,c,a]; assert result is s');
add(scene+'.bring_to_back', 's.add(a,b,c)', { mobjects:[ref('c')] }, 'assert s.mobjects == [c,a,b]; assert result is s');
add(scene+'.add_foreground_mobject', 'a.add_updater(lambda m,dt:m.shift(RIGHT*dt)); s.add(a,b)', { mobject:ref('a') }, 'assert s.foreground_mobjects == [a]; assert s.mobjects == [b,a]; s.update_mobjects(0.5); close(a.get_x(),0.5); assert result is s');
add(scene+'.add_foreground_mobjects', 's.add(a,b,c)', { mobjects:[ref('a'),ref('b')] }, 'assert s.foreground_mobjects == [a,b]; assert s.mobjects == [c,a,b]; assert result is s');
add(scene+'.remove_foreground_mobject', 's.add_foreground_mobjects(a,b)', { mobject:ref('a') }, 'assert s.foreground_mobjects == [b]; assert a in s.mobjects; assert result is s');
add(scene+'.remove_foreground_mobjects', 's.add_foreground_mobjects(a,b,c)', { to_remove:[ref('a'),ref('c')] }, 'assert s.foreground_mobjects == [b]; assert a in s.mobjects and c in s.mobjects');
add(scene+'.get_attrs', 's.add(a,b); s.renderer.time = 1.25', { keys:['time','mobjects'] }, 'close(result[0],1.25); assert result[1] is s.mobjects and result[1] == [a,b]');
add(scene+'.get_mobject_family_members', 'g = VGroup(a,b); s.add(g,c)', {}, 'assert result == [g,a,b,c]');
add(scene+'.get_top_level_mobjects', 'g = VGroup(a,b); s.mobjects = [g,a,c]', {}, 'assert result == [g,c]');
add(scene+'.get_restructured_mobject_list', 'g = VGroup(a,b); objects["g"] = g; s.add(g,c)', { mobjects:[ref('g'),ref('c')],to_remove:[ref('a')] }, 'assert result == [b,c]; assert s.mobjects == [g,c]');
add(scene+'.restructure_mobjects', 'g = VGroup(a,b); s.add(g,c)', { to_remove:[ref('a')] }, 'assert s.mobjects == [b,c]; assert result is s');
add(scene+'.camera', '', {}, 'assert result is s.renderer.camera; result.frame_center = np.array([2.,1.,0.]); close(s.renderer.camera.frame_center,[2,1,0])');
add(scene+'.time', 's.renderer.time = 1.75', {}, 'close(result,1.75)');

add(scene+'.add_updater', 'values=[]; objects["fn"] = lambda dt: values.append(dt)', { func:ref('fn') }, 's.update_self(0.25); assert values == [0.25] and s.updaters == [objects["fn"]]');
add(scene+'.remove_updater', 'values=[]; objects["fn"] = lambda dt: values.append(dt); s.add_updater(objects["fn"])', { func:ref('fn') }, 's.update_self(0.25); assert values == [] and not s.updaters');
add(scene+'.update_self', 'values=[]; s.add_updater(lambda dt: values.append(dt))', { dt:0.4 }, 'assert values == [0.4]');
add(scene+'.update_mobjects', 'a.add_updater(lambda m,dt:m.shift(RIGHT*2*dt)); s.add(a,b)', { dt:0.5 }, 'close(a.get_center(),[1,0,0]); close(b.get_center(),[0,0,0])');
add(scene+'.should_update_mobjects', 'a.add_updater(lambda m,dt:m.shift(RIGHT*dt)); s.add(a); s.animations=[Wait(1)]', {}, 'assert result is True and s.animations[0].is_static_wait is False');
add(scene+'.should_update_mobjects', 's.add(a); s.animations=[Wait(1)]', {}, 'assert result is False and s.animations[0].is_static_wait is True');
add(scene+'.is_current_animation_frozen_frame', 's.animations=[Wait(1)]; s.animations[0].is_static_wait=True', {}, 'assert result is True');

const animSetup = 'objects["anim"] = Transform(a,a.copy().shift(RIGHT*2),run_time=0.4,rate_func=linear)';
add(scene+'.compile_animations', 'objects["builder"] = a.animate.shift(RIGHT*2)', { args:[ref('builder')],kwargs:{run_time:0.4,rate_func:{$api:'linear'}} }, 'assert len(result)==1; close(result[0].run_time,0.4); result[0].begin(); result[0].interpolate(0.5); close(a.get_center(),[1,0,0])');
add(scene+'.add_mobjects_from_animations', animSetup+'; objects["intro"] = FadeIn(b)', { animations:[ref('anim'),ref('intro')] }, 'assert s.mobjects == [a]');
add(scene+'.compile_animation_data', animSetup, { animations:[ref('anim')] }, 'assert s.animations == [objects["anim"]]; close(s.duration,0.4); assert s.mobjects == [a] and result is s');
add(scene+'.begin_animations', animSetup+'; s.add(b,a); s.compile_animation_data(objects["anim"])', {}, 'assert a.updating_suspended; assert s.moving_mobjects == [a] and s.static_mobjects == [b]; close(s.animations[0].starting_mobject.get_center(),[0,0,0])');
add(scene+'.get_run_time', 'objects["a1"]=Wait(0.2); objects["a2"]=Wait(0.7)', { animations:[ref('a1'),ref('a2')] }, 'close(result,0.7)');
add(scene+'.get_time_progression', '', { run_time:0.4,description:'scene fixture' }, 'close(list(result),[0,0.1,0.2,0.3]); result.close()');
add(scene+'.get_moving_mobjects', animSetup+'; s.add(b,a,c)', { animations:[ref('anim')] }, 'assert result == [a,c]');
add(scene+'.get_moving_and_static_mobjects', animSetup+'; s.add(b,a,c)', { animations:[ref('anim')] }, 'assert result[0] == [a,c] and result[1] == [b]');
add(scene+'.update_to_time', animSetup+'; s.compile_animation_data(objects["anim"]); s.begin_animations()', { t:0.2 }, 'close(a.get_center(),[1,0,0]); close(s.last_t,0.2)');
add(scene+'.play', animSetup, { args:[ref('anim')] }, 'close(a.get_center(),[2,0,0]); close(s.time,0.4); assert a in s.mobjects and not a.updating_suspended');
add(scene+'.play_internal', animSetup+'; s.compile_animation_data(objects["anim"]); s.begin_animations()', { skip_rendering:true }, 'close(a.get_center(),[2,0,0]); assert not a.updating_suspended');
add(scene+'.wait_until', 'a.add_updater(lambda m,dt:m.shift(RIGHT*dt)); s.add(a); objects["fn"]=lambda:a.get_x()>=0.2', { stop_condition:ref('fn'),max_time:1 }, 'assert 0.2 <= a.get_x() < 0.4; assert 0.2 <= s.time < 0.5');
add(scene+'.validate_run_time', 'objects["fn"]=s.play', { run_time:0.01,method:ref('fn') }, 'close(result,0.1)');
add(scene+'.add_subcaption', 's.renderer.time=1.5', { content:'native caption',duration:0.7,offset:0.2 }, 'caption=s.renderer.file_writer.subcaptions[-1]; assert caption.content=="native caption"; close(caption.start.total_seconds(),1.7); close(caption.end.total_seconds(),2.4)');
add(scene+'.next_section', '', { name:'chapter two',skip_animations:true }, 'section=s.renderer.file_writer.sections[-1]; assert section.name=="chapter two" and section.skip_animations');
add(scene+'.set_key_function', 'values=[]; objects["fn"]=lambda:values.append(7)', { char:'k',func:ref('fn') }, 's.key_to_function_map["k"](); assert values==[7]');
// Scene.render dispatches the fixed concrete construct below, which really plays
// animation and paints pixels. Abstract Scene.construct itself is not counted.
add(scene+'.render', 's=FixtureScene()', {}, 'close(s.time,0.5); close(s.subject.get_center(),[1.5,0,0]); frame=s.renderer.get_frame(); ys,xs=np.where((frame[:,:,0]>200)&(frame[:,:,1]<20)&(frame[:,:,2]<20)); assert 180<=len(xs)<=324; assert 41<xs.mean()<47');

add(moving, '', {}, 'assert isinstance(result.camera,MovingCamera); result.play(result.camera.frame.animate.shift(RIGHT),run_time=0.2); close(result.camera.frame.get_center(),[1,0,0]); close(result.time,0.2)');
add(moving+'.get_moving_mobjects', 's=MovingCameraScene(); s.add(a,b); frame=s.camera.frame; s.add(frame); objects["anim"]=Transform(frame,frame.copy().shift(RIGHT))', { animations:[ref('anim')] }, 'assert a in result and b in result and frame in result');
add(three, '', { default_angled_camera_orientation_kwargs:{phi:0.7,theta:0.3} }, 'assert isinstance(result.camera,ThreeDCamera); result.set_camera_orientation(**result.default_angled_camera_orientation_kwargs); close(result.camera.get_phi(),0.7); close(result.camera.get_theta(),0.3)');
add(three+'.set_camera_orientation', 's=ThreeDScene()', { phi:0.4,theta:0.7,gamma:0.2,zoom:1.5,focal_distance:12,frame_center:array([1,2,0]) }, 'assert_camera(s)');
add(three+'.move_camera', 's=ThreeDScene(); s.add(a)', { phi:0.4,theta:0.7,gamma:0.2,zoom:1.5,focal_distance:12,frame_center:array([1,2,0]),kwargs:{run_time:0.2} }, 'assert_camera(s); close(s.time,0.2); assert s.camera._frame_center not in s.mobjects');
add(three+'.set_to_default_angled_camera_orientation', 's=ThreeDScene(default_angled_camera_orientation_kwargs={"phi":0.6,"theta":0.8})', { kwargs:{phi:0.4} }, 'close(s.camera.get_phi(),0.4); close(s.camera.get_theta(),0.8); assert s.default_angled_camera_orientation_kwargs == {"phi":0.6,"theta":0.8}');
add(three+'.begin_ambient_camera_rotation', 's=ThreeDScene(); s.camera.set_theta(0.3)', { rate:0.8,about:'theta' }, 's.update_mobjects(0.5); close(s.camera.get_theta(),0.7); assert s.camera.theta_tracker in s.mobjects');
add(three+'.stop_ambient_camera_rotation', 's=ThreeDScene(); s.camera.set_theta(0.3); s.begin_ambient_camera_rotation(rate=0.8); s.update_mobjects(0.5)', { about:'theta' }, 's.update_mobjects(0.5); close(s.camera.get_theta(),0.7); assert not s.camera.theta_tracker.updaters and s.camera.theta_tracker not in s.mobjects');
add(three+'.begin_3dillusion_camera_rotation', 's=ThreeDScene()', { rate:2,origin_phi:0.6,origin_theta:0.3 }, 's.update_mobjects(0.25); close(s.camera.get_theta(),0.3+0.2*np.sin(0.5)); close(s.camera.get_phi(),0.5+0.1*np.cos(0.5))');
add(three+'.stop_3dillusion_camera_rotation', 's=ThreeDScene(); s.begin_3dillusion_camera_rotation(rate=2,origin_phi=0.6,origin_theta=0.3); s.update_mobjects(0.25); old_phi=s.camera.get_phi(); old_theta=s.camera.get_theta()', {}, 's.update_mobjects(0.5); close(s.camera.get_phi(),old_phi); close(s.camera.get_theta(),old_theta); assert not s.camera.phi_tracker.updaters and not s.camera.theta_tracker.updaters; assert s.camera.phi_tracker not in s.mobjects and s.camera.theta_tracker not in s.mobjects');
for(const kind of ['in_frame','orientation']) {
  const member=kind==='in_frame'?'fixed_in_frame_mobjects':'fixed_orientation_mobjects';
  add(three+`.add_fixed_${kind}_mobjects`, 's=ThreeDScene(); g=VGroup(a,b); objects["g"]=g', {mobjects:[ref('g')]}, `assert g in s.mobjects; assert all(m in s.camera.${member} for m in [g,a,b])`);
  add(three+`.remove_fixed_${kind}_mobjects`, `s=ThreeDScene(); g=VGroup(a,b); objects["g"]=g; s.add_fixed_${kind}_mobjects(g)`, {mobjects:[ref('g')]}, `assert not s.camera.${member}; assert g in s.mobjects`);
}
add(three+'.get_moving_mobjects', 's=ThreeDScene(); s.add(a,b,s.camera.theta_tracker); objects["anim"]=Transform(s.camera.theta_tracker,ValueTracker(0.4))', { animations:[ref('anim')] }, 'assert result == s.mobjects and a in result and b in result');

test('native scene membership, playback, updates and camera controls', { timeout:120_000 }, async t => {
  const health=await discoverPython();
  if(!health.available){t.skip('Manim required');return;}
  const directory=await mkdtemp(path.join(tmpdir(),'anyvis-api-scene-'));
  try {
    const compiler=createApiCompiler();
    const scope=new Set(['s','a','b','c','g','fn','anim','intro','builder','a1','a2']);
    const probes=cases.map((c,index)=>{
      const entry=getApiEntry(c.id);assert.ok(entry,c.id);
      const fields={receiver:'s',mode:'store'};
      for(const [key,value] of Object.entries(c.params))fields[`p_${key}`]=JSON.stringify(value);
      const compiled=compiler.compile(createAction(entry.type,fields),entry,scope,{});
      return `def probe_${index}():
    s=Scene()
    a=Square(); b=Circle(); c=Triangle()
    objects={"a":a,"b":b,"c":c}
${c.setup?'    '+c.setup:''}
    objects["s"]=s
${compiled.prelude.map(line=>'    '+line).join('\n')}
    result=${compiled.expression}
    ${c.check}
`;
    });
    const script=path.join(directory,'scene-fixture.py');
    await writeFile(script,`from manim import *
import numpy as np
import json,traceback
${API_RUNTIME}
${compiler.imports().join('\n')}
def close(actual,expected): np.testing.assert_allclose(actual,expected,atol=1e-7)
def assert_camera(s):
    close([s.camera.get_phi(),s.camera.get_theta(),s.camera.get_gamma(),s.camera.get_zoom(),s.camera.get_focal_distance()],[0.4,0.7,0.2,1.5,12])
    close(s.camera.frame_center,[1,2,0])
class FixtureScene(Scene):
    def construct(self):
        self.subject=Square(side_length=2,fill_color="#FF0000",fill_opacity=1,stroke_width=0)
        self.add(self.subject)
        self.play(self.subject.animate.shift(RIGHT*1.5),run_time=0.4,rate_func=linear)
        self.wait(0.1)
${probes.join('\n')}
results=[]
with tempconfig({"renderer":"cairo","pixel_width":64,"pixel_height":32,"frame_width":8,"frame_height":4,"frame_rate":10,"media_dir":"media","verbosity":"ERROR","progress_bar":"none","write_to_movie":False,"save_last_frame":False}):
    for api_id,probe in [${cases.map((c,i)=>`(${JSON.stringify(c.id)},probe_${i})`).join(',')}]:
        try:
            probe()
            results.append({"apiId":api_id,"status":"verified"})
        except Exception:
            results.append({"apiId":api_id,"status":"failed","reason":traceback.format_exc(limit=3)})
print("ANYVIS_SCENE "+json.dumps(results))
`);
    const output=await execute(health.python,[script],{cwd:directory,timeout:100_000,maxBuffer:4*1024*1024});
    const line=output.stdout.split('\n').find(row=>row.startsWith('ANYVIS_SCENE '));assert.ok(line,output.stdout);
    const outcomes=JSON.parse(line.slice('ANYVIS_SCENE '.length));assert.equal(outcomes.length,cases.length);
    const failures=outcomes.filter(row=>row.status!=='verified');
    const apiIds=[...new Set(outcomes.filter(row=>row.status==='verified').map(row=>row.apiId))].sort();
    const fixture='src/studio/core/api-scene.native.spec-node.mjs';
    const reportPath=process.env.ANYVIS_API_SCENE_REPORT||path.resolve('artifacts/api/native-scene-evidence.json');
    await mkdir(path.dirname(reportPath),{recursive:true});
    await writeFile(reportPath,JSON.stringify({fixture,sourceFiles:await apiEvidenceSources(fixture),registrySha256:createHash('sha256').update(await readFile(new URL('./api-registry.json',import.meta.url))).digest('hex'),passed:failures.length===0,engineVersion:health.version,renderer:'cairo',apiIds,outcomes,checks:'Compiled registry calls with explicit membership/order, nested replacement, updater effects, timing, real scene rendering pixels and 2D/3D camera state assertions. Scene.render dispatches a fixed concrete construct. Setup calls, no-op abstract methods and interactive hooks are excluded.'},null,2)+'\n');
    t.diagnostic(`${apiIds.length} scene APIs, ${outcomes.length} cases, ${failures.length} failures.`);
    assert.deepEqual(failures,[]);
  } finally {await rm(directory,{recursive:true,force:true});}
});

test('scene compatibility probes preserve other versions, fixed methods and subclass overrides', { timeout:60_000 }, async t => {
  const health=await discoverPython();
  if(!health.available){t.skip('Manim required');return;}
  const directory=await mkdtemp(path.join(tmpdir(),'anyvis-scene-compat-'));
  try {
    const script=path.join(directory,'compat.py');
    await writeFile(script,`from manim import *
import manim
import numpy as np
native_add=Scene.add
native_orientation=ThreeDScene.set_to_default_angled_camera_orientation
native_version=manim.__version__
${API_RUNTIME}
patched_add=Scene.add
patched_orientation=ThreeDScene.set_to_default_angled_camera_orientation
try:
    # Version gating leaves original methods untouched, even when their probes
    # would otherwise reproduce the 0.20.1 defects.
    manim.__version__='0.20.2'
    Scene.add=native_add
    ThreeDScene.set_to_default_angled_camera_orientation=native_orientation
    _av_foreground_compat()
    _av_default_camera_compat()
    assert Scene.add is native_add
    assert ThreeDScene.set_to_default_angled_camera_orientation is native_orientation
    manim.__version__=native_version

    # Simulate vendor backports retaining the native module names: capability
    # probes must preserve the already-correct implementations by identity.
    def fixed_add(self,*mobjects):
        self.mobjects=list(dict.fromkeys([*self.mobjects,*mobjects]))
        return self
    fixed_add.__module__='manim.scene.scene'
    Scene.add=fixed_add
    _av_foreground_compat()
    assert Scene.add is fixed_add
    def fixed_orientation(self,**kwargs):
        settings=dict(self.default_angled_camera_orientation_kwargs)
        settings.update(kwargs)
        return self.set_camera_orientation(**settings)
    fixed_orientation.__module__='manim.scene.three_d_scene'
    ThreeDScene.set_to_default_angled_camera_orientation=fixed_orientation
    _av_default_camera_compat()
    assert ThreeDScene.set_to_default_angled_camera_orientation is fixed_orientation
finally:
    manim.__version__=native_version
    Scene.add=patched_add
    ThreeDScene.set_to_default_angled_camera_orientation=patched_orientation

_av_foreground_compat()
_av_default_camera_compat()
assert Scene.add is patched_add
assert ThreeDScene.set_to_default_angled_camera_orientation is patched_orientation
with tempconfig({"renderer":"cairo","pixel_width":64,"pixel_height":32,"write_to_movie":False,"media_dir":"media","verbosity":"ERROR"}):
    class CustomScene(Scene):
        def add(self,*mobjects):
            self.custom_calls=getattr(self,'custom_calls',0)+1
            return super().add(*mobjects)
    s=CustomScene()
    a=Square().add_updater(lambda m,dt:m.shift(RIGHT*dt))
    s.add_foreground_mobject(a)
    assert s.custom_calls==1 and s.mobjects==[a]
    s.update_mobjects(0.5)
    np.testing.assert_allclose(a.get_x(),0.5,atol=1e-7)
    class CustomThreeDScene(ThreeDScene):
        def set_to_default_angled_camera_orientation(self,**kwargs):
            self.custom_settings=kwargs
    custom=CustomThreeDScene()
    custom.set_to_default_angled_camera_orientation(phi=0.4)
    assert custom.custom_settings=={'phi':0.4}
    class CustomSetterThreeDScene(ThreeDScene):
        def set_camera_orientation(self,**kwargs):
            self.custom_settings=kwargs
            return 7
    custom_setter=CustomSetterThreeDScene(default_angled_camera_orientation_kwargs={'phi':0.2,'theta':0.6})
    assert custom_setter.set_to_default_angled_camera_orientation(phi=0.4) is None
    assert custom_setter.custom_settings=={'phi':0.4,'theta':0.6}
    legacy=ThreeDScene()
    legacy.default_camera_orientation_kwargs={'phi':0.2,'theta':0.6}
    legacy.set_to_default_angled_camera_orientation(phi=0.4)
    np.testing.assert_allclose([legacy.camera.get_phi(),legacy.camera.get_theta()],[0.4,0.6])
    assert legacy.default_camera_orientation_kwargs=={'phi':0.2,'theta':0.6}
print('ANYVIS_SCENE_COMPAT_OK')
`);
    const output=await execute(health.python,[script],{cwd:directory,timeout:45_000,maxBuffer:1024*1024});
    assert.match(output.stdout,/ANYVIS_SCENE_COMPAT_OK/);
  }finally{await rm(directory,{recursive:true,force:true});}
});
