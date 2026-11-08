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
const animation = 'manim.animation.animation.Animation.';
const util = 'manim.animation.updaters.mobject_update_utils.';
const updater = 'manim.animation.updaters.update.';
const mobject = 'manim.mobject.mobject.Mobject.';
const transform = 'manim.animation.transform.';
const composition = 'manim.animation.composition.';
const creation = 'manim.animation.creation.';
const tracker = 'manim.mobject.value_tracker.';

// No-op abstract interpolators are excluded. Each recorded API is the registry
// entry actually compiled below; fixture/setup calls are not counted as evidence.
add(animation + 'begin', 's = Animation(Square().shift(RIGHT))', {},
  'assert s.mobject.updating_suspended; assert s.starting_mobject is not s.mobject; close(s.starting_mobject.get_center(), [1,0,0]); s.mobject.shift(UP); close(s.starting_mobject.get_center(), [1,0,0])');
add(animation + 'finish', 's = Animation(Square()); s.begin()', {}, 'assert not s.mobject.updating_suspended');
add(animation + 'clean_up_from_scene', 'a = Square(); s = Animation(a, remover=True); scene = Scene(); scene.add(a); objects["scene"] = scene', { scene: ref('scene') }, 'assert a not in scene.mobjects');
add(animation + 'copy', 's = Animation(Square().shift(RIGHT), run_time=3)', {}, 'assert result is not s and result.mobject is not s.mobject; result.mobject.shift(UP); close(s.mobject.get_center(), [1,0,0]); close(result.mobject.get_center(), [1,1,0]); close(result.run_time, 3)');
add(animation + 'create_starting_mobject', 's = Animation(Square().shift(LEFT))', {}, 'assert result is not s.mobject; result.shift(UP); close(result.get_center(), [-1,1,0]); close(s.mobject.get_center(), [-1,0,0])');
add(animation + 'get_sub_alpha', 's = Animation(Square(), lag_ratio=0.5, rate_func=linear)', { alpha: 0.3, index: 1, num_submobjects: 4 }, 'close(result, 0.25)');
add(animation + 'set_name', 's = Animation(Square())', { name: 'precise-animation' }, 'assert s.name == "precise-animation" and str(s) == "precise-animation"; assert result is s');
add(animation + 'set_run_time', 's = Animation(Square(), run_time=1)', { run_time: 2.75 }, 'close(s.get_run_time(), 2.75); assert result is s');
add(animation + 'set_rate_func', 's = Animation(Square()); objects["fn"] = lambda t: t*t', { rate_func: ref('fn') }, 'close(s.get_rate_func()(0.25), 0.0625); assert result is s');
add(animation + 'update_mobjects', 's = Animation(Square()); s.begin(); s.starting_mobject.add_updater(shift_dt)', { dt: 0.5 }, 'close(s.starting_mobject.get_center(), [1,0,0]); close(s.mobject.get_center(), [0,0,0])');
// This base entry intentionally exercises dynamic dispatch on a concrete Rotate.
add(animation + 'interpolate', 's = Rotate(Square().shift(RIGHT), angle=PI, about_point=ORIGIN, rate_func=linear); s.begin()', { alpha: 0.5 }, 'close(s.mobject.get_center(), [0,1,0])');
add('manim.animation.animation.prepare_animation', 'a = Square(); objects["builder"] = a.animate.shift(RIGHT*2)', { anim: ref('builder') }, 'result.begin(); result.interpolate(0.5); close(a.get_center(), [1,0,0]); result.finish(); close(a.get_center(), [2,0,0])');

add('manim.animation.fading.FadeIn.create_starting_mobject', 's = FadeIn(Square(fill_opacity=1), shift=UP)', {}, 'close(result.get_fill_opacity(), 0); close(result.get_center(), [0,-1,0]); close(s.mobject.get_fill_opacity(), 1)');
add('manim.animation.fading.FadeIn.create_target', 's = FadeIn(Square(fill_opacity=0.7).shift(RIGHT))', {}, 'assert result is s.mobject; close(result.get_center(), [1,0,0]); close(result.get_fill_opacity(), 0.7)');
add('manim.animation.fading.FadeOut.create_target', 's = FadeOut(Square(fill_opacity=1), shift=UP)', {}, 'close(result.get_fill_opacity(), 0); close(result.get_center(), [0,1,0]); close(s.mobject.get_fill_opacity(), 1)');
add('manim.animation.fading.FadeOut.clean_up_from_scene', 'a = Square(fill_opacity=1); scene = Scene(); scene.add(a); s = FadeOut(a); s.begin(); s.finish(); objects["scene"] = scene', { scene: ref('scene') }, 'assert a not in scene.mobjects; close(a.get_fill_opacity(), 1)');
add('manim.animation.growing.GrowFromPoint.create_starting_mobject', 's = GrowFromPoint(Square(), [2,1,0])', {}, 'close(result.width, 0); close(result.get_center(), [2,1,0]); close(s.mobject.width, 2)');
add('manim.animation.growing.GrowFromPoint.create_target', 's = GrowFromPoint(Square().shift(RIGHT), [2,1,0])', {}, 'assert result is s.mobject; close(result.width, 2); close(result.get_center(), [1,0,0])');
add('manim.animation.rotation.Rotate.create_target', 's = Rotate(Square().shift(RIGHT), angle=PI/2, about_point=ORIGIN)', {}, 'close(result.get_center(), [0,1,0]); close(s.mobject.get_center(), [1,0,0])');
add('manim.animation.indication.Indicate.create_target', 's = Indicate(Square(), scale_factor=1.5, color=RED)', {}, 'close(result.width, 3); assert result.get_color() == RED; close(s.mobject.width, 2)');
add(transform + 'ApplyMethod.create_target', 's = ApplyMethod(Square().shift, RIGHT*2)', {}, 'close(result.get_center(), [2,0,0]); close(s.mobject.get_center(), [0,0,0])');
add(transform + 'ApplyFunction.create_target', 's = ApplyFunction(lambda m: m.shift(UP*3), Square())', {}, 'close(result.get_center(), [0,3,0]); close(s.mobject.get_center(), [0,0,0])');
add(transform + 'ApplyMatrix.initialize_matrix', 's = ApplyMatrix(np.eye(2), Square())', { matrix: array([[2,0],[0,3]]) }, 'close(result, [[2,0,0],[0,3,0],[0,0,1]])');
add(transform + 'Transform.begin', 's = Transform(Square(), Circle().shift(RIGHT), rate_func=linear)', {}, 'assert s.target_copy is not s.target_mobject; assert len(s.starting_mobject.points) == len(s.target_copy.points); s.interpolate(0.5); close(s.mobject.get_center(), [0.5,0,0])');
add(transform + 'Transform.create_target', 's = Transform(Square(), Circle().shift(RIGHT*2))', {}, 'assert result is s.target_mobject; close(result.get_center(), [2,0,0])');
add(transform + 'Transform.clean_up_from_scene', 'a = Square(); b = Circle(); scene = Scene(); scene.add(a); s = Transform(a,b,replace_mobject_with_target_in_scene=True); s.begin(); s.finish(); objects["scene"] = scene', { scene: ref('scene') }, 'assert a not in scene.mobjects and b in scene.mobjects');

add(util + 'always_shift', 'a = Square(); objects["a"] = a', { mobject: ref('a'), direction: array([2,0,0]), rate: 3 }, 'assert result is a; a.update(0.5); close(a.get_center(), [1.5,0,0]); a.update(0.5); close(a.get_center(), [3,0,0])');
add(util + 'always_rotate', 'a = Square().shift(RIGHT); objects["a"] = a', { mobject: ref('a'), rate: Math.PI, kwargs: { about_point: array([0,0,0]) } }, 'a.update(0.5); close(a.get_center(), [0,1,0]); assert result is a');
add(util + 'always', 'a = Square(); objects["method"] = a.shift', { method: ref('method'), args: [array([0.5,0,0])] }, 'assert result is a; a.update(0.1); close(a.get_center(), [0.5,0,0]); a.update(0.1); close(a.get_center(), [1,0,0])');
add(util + 'f_always', 'a = Square(); value = ValueTracker(1); objects["method"] = a.set_x; objects["fn"] = value.get_value', { method: ref('method'), arg_generators: [ref('fn')] }, 'a.update(); close(a.get_x(), 1); value.set_value(3); a.update(); close(a.get_x(), 3); assert result is a');
add(util + 'turn_animation_into_updater', 'a = Square(); objects["anim"] = Transform(a,a.copy().shift(RIGHT*2),run_time=1,rate_func=linear)', { animation: ref('anim'), delay: 0.5 }, 'assert result is a; a.update(0.5); close(a.get_x(),0); a.update(0.5); close(a.get_x(),0); a.update(0.5); close(a.get_x(),1); a.update(0.1); close(a.get_x(),2); assert not a.updaters');
add(util + 'cycle_animation', 'a = Square(); objects["anim"] = Transform(a,a.copy().shift(RIGHT*2),run_time=1,rate_func=linear)', { animation: ref('anim') }, 'a.update(0.5); a.update(0.5); close(a.get_x(),1); a.update(0.5); close(a.get_x(),0); assert a.updaters and result is a');
add(updater + 'MaintainPositionRelativeTo', 'a = Square().shift(UP); b = Dot(); objects.update(a=a,b=b)', { mobject: ref('a'), tracked_mobject: ref('b') }, 'result.begin(); b.shift(RIGHT*3); result.interpolate(0.5); close(a.get_center(),[3,1,0])');
add(updater + 'MaintainPositionRelativeTo.interpolate_mobject', 'a = Square().shift(UP); b = Dot(); s = MaintainPositionRelativeTo(a,b); s.begin(); b.shift(RIGHT*3)', { alpha: 0.5 }, 'close(a.get_center(),[3,1,0])');
add(updater + 'UpdateFromFunc.interpolate_mobject', 'a = Square(); s = UpdateFromFunc(a,lambda m: m.set_x(3))', { alpha: 0.2 }, 'close(a.get_x(),3)');
add(updater + 'UpdateFromAlphaFunc.interpolate_mobject', 'a = Square(); s = UpdateFromAlphaFunc(a,lambda m,alpha: m.set_x(4*alpha),rate_func=linear)', { alpha: 0.25 }, 'close(a.get_x(),1)');
add(mobject + 'update', 's = Square().add_updater(shift_dt)', { dt: 0.75 }, 'close(s.get_x(),1.5); assert result is s');
add(mobject + 'remove_updater', 's = Square().add_updater(shift_dt); objects["fn"] = shift_dt', { update_function: ref('fn') }, 's.update(0.5); close(s.get_x(),0); assert not s.updaters and result is s');
add(mobject + 'suspend_updating', 's = VGroup(Square().add_updater(shift_dt)); s.add_updater(shift_dt)', { recursive: true }, 's.update(0.5); close(s.get_x(),0); assert s.updating_suspended and s[0].updating_suspended');
add(mobject + 'resume_updating', 's = VGroup(Square().add_updater(shift_dt)); s.suspend_updating()', { recursive: true }, 's.update(0.5); close(s[0].get_x(),1); assert not s.updating_suspended and not s[0].updating_suspended');
add(mobject + 'match_updaters', 's = Square(); objects["a"] = Dot().add_updater(shift_dt)', { mobject: ref('a') }, 's.update(0.5); close(s.get_x(),1); close(objects["a"].get_x(),0); assert result is s');
add(tracker + 'ComplexValueTracker', '', { value: { $complex: [2,3] } }, 'close(result.get_value(),2+3j); result.set_value(-1+4j); close(result.get_value(),-1+4j)');
add(tracker + 'ComplexValueTracker.set_value', 's = ComplexValueTracker(1+2j)', { value: { $complex: [-2,5] } }, 'close(s.get_value(),-2+5j); assert result is s');
add(tracker + 'ValueTracker.increment_value', 's = ValueTracker(1.25)', { d_value: -0.75 }, 'close(s.get_value(),0.5); assert result is s');
add(tracker + 'ValueTracker.interpolate', 's = ValueTracker(0); objects["a"] = ValueTracker(2); objects["b"] = ValueTracker(10)', { mobject1: ref('a'), mobject2: ref('b'), alpha: 0.25 }, 'close(s.get_value(),4); assert result is s');

const groupSetup = 'a = Square(); b = Circle().shift(UP*2); s = AnimationGroup(Transform(a,a.copy().shift(RIGHT*2),run_time=2,rate_func=linear),Transform(b,b.copy().shift(RIGHT*4),run_time=4,rate_func=linear),lag_ratio=0.5)';
add(composition + 'AnimationGroup.build_animations_with_timings', groupSetup + '; s.anims_with_timings = None', {}, 'close(s.anims_with_timings["start"],[0,1]); close(s.anims_with_timings["end"],[2,5]); assert not s.anims_begun.any() and not s.anims_finished.any()');
add(composition + 'AnimationGroup.init_run_time', groupSetup + '; s.animations[1].run_time = 6', { run_time: null }, 'close(result,7); close(s.max_end_time,7)');
add(composition + 'AnimationGroup.begin', groupSetup, {}, 'assert a.updating_suspended and b.updating_suspended; assert hasattr(s.animations[0],"starting_mobject") and hasattr(s.animations[1],"starting_mobject")');
add(composition + 'AnimationGroup.interpolate', groupSetup + '; s.begin()', { alpha: 0.4 }, 'close(a.get_x(),2); close(b.get_x(),1)');
add(composition + 'AnimationGroup.finish', groupSetup + '; s.begin()', {}, 'close(a.get_x(),2); close(b.get_x(),4); assert not a.updating_suspended and not b.updating_suspended');
add(composition + 'LaggedStart', 'a = Square(); b = Circle(); objects["a"] = Transform(a,a.copy().shift(RIGHT*2),run_time=2,rate_func=linear); objects["b"] = Transform(b,b.copy().shift(UP*4),run_time=4,rate_func=linear)', { animations: [ref('a'),ref('b')], lag_ratio: 0.5 }, 'close(result.run_time,5); result.begin(); result.interpolate(0.4); close(a.get_x(),2); close(b.get_y(),1)');
add(creation + 'ShowIncreasingSubsets', 'a = VGroup(Square(fill_opacity=1),Circle(fill_opacity=1),Triangle(fill_opacity=1),Dot()); objects["a"] = a', { group: ref('a') }, 'result.begin(); result.interpolate(0.5); close([m.get_fill_opacity() for m in a],[1,1,0,0])');
add(creation + 'ShowIncreasingSubsets.interpolate_mobject', 'a = VGroup(Square(fill_opacity=1),Circle(fill_opacity=1),Triangle(fill_opacity=1),Dot()); s = ShowIncreasingSubsets(a)', { alpha: 0.75 }, 'close([m.get_fill_opacity() for m in a],[1,1,1,0])');
add(creation + 'ShowIncreasingSubsets.update_submobject_list', 'a = VGroup(Square(fill_opacity=1),Circle(fill_opacity=1),Triangle(fill_opacity=1)); s = ShowIncreasingSubsets(a)', { index: 1 }, 'close([m.get_fill_opacity() for m in a],[1,0,0])');
add(creation + 'ShowSubmobjectsOneByOne.update_submobject_list', 'a = VGroup(Square(fill_opacity=1),Circle(fill_opacity=1),Triangle(fill_opacity=1)); s = ShowSubmobjectsOneByOne(a)', { index: 2 }, 'close([m.get_fill_opacity() for m in a],[0,1,0])');
add('manim.animation.movement.MoveAlongPath', 'a = Dot(); objects.update(a=a,path=Line(LEFT*2,RIGHT*2))', { mobject: ref('a'), path: ref('path'), kwargs: { rate_func: { $api: 'linear' } } }, 'result.begin(); result.interpolate(0.25); close(a.get_center(),[-1,0,0]); result.finish(); close(a.get_center(),[2,0,0])');
add('manim.animation.movement.MoveAlongPath.interpolate_mobject', 'a = Dot(); s = MoveAlongPath(a,Line(LEFT*2,RIGHT*2),rate_func=linear); s.begin()', { alpha: 0.75 }, 'close(a.get_center(),[1,0,0])');

test('native animation lifecycle, updaters and trackers change observable state', { timeout: 120_000 }, async t => {
  const health = await discoverPython();
  if (!health.available) { t.skip('Manim required'); return; }
  const directory = await mkdtemp(path.join(tmpdir(), 'anyvis-api-animation-state-'));
  try {
    const compiler = createApiCompiler();
    const scope = new Set(['s','a','b','scene','fn','method','anim','builder','path']);
    const probes = cases.map((c,index) => {
      const entry = getApiEntry(c.id); assert.ok(entry, c.id);
      const fields = { receiver:'s', mode:'store' };
      for(const [key,value] of Object.entries(c.params)) fields[`p_${key}`] = JSON.stringify(value);
      const compiled = compiler.compile(createAction(entry.type,fields),entry,scope,{});
      return `def probe_${index}():
    objects = {}
    s = None
${c.setup ? '    '+c.setup : ''}
    objects["s"] = s
${compiled.prelude.map(line=>'    '+line).join('\n')}
    result = ${compiled.expression}
    ${c.check}
`;
    });
    const script = path.join(directory,'animation-state.py');
    await writeFile(script, `from manim import *
import numpy as np
import json, traceback
${API_RUNTIME}
${compiler.imports().join('\n')}
def close(actual, expected): np.testing.assert_allclose(actual,expected,atol=1e-7)
def shift_dt(m,dt): m.shift(RIGHT*2*dt)
${probes.join('\n')}
results = []
with tempconfig({"renderer":"cairo","pixel_width":64,"pixel_height":32,"media_dir":"media","verbosity":"ERROR","write_to_movie":False}):
    for api_id,probe in [${cases.map((c,i)=>`(${JSON.stringify(c.id)},probe_${i})`).join(',')}]:
        try:
            probe()
            results.append({"apiId":api_id,"status":"verified"})
        except Exception:
            results.append({"apiId":api_id,"status":"failed","reason":traceback.format_exc(limit=3)})
print("ANYVIS_ANIMATION_STATE " + json.dumps(results))
`);
    const output = await execute(health.python,[script],{cwd:directory,timeout:100_000,maxBuffer:4*1024*1024});
    const line = output.stdout.split('\n').find(row=>row.startsWith('ANYVIS_ANIMATION_STATE ')); assert.ok(line,output.stdout);
    const outcomes = JSON.parse(line.slice('ANYVIS_ANIMATION_STATE '.length)); assert.equal(outcomes.length,cases.length);
    const failures = outcomes.filter(row=>row.status!=='verified');
    const apiIds = [...new Set(outcomes.filter(row=>row.status==='verified').map(row=>row.apiId))].sort();
    const fixture = 'src/studio/core/api-animation-state.native.spec-node.mjs';
    const reportPath = process.env.ANYVIS_API_ANIMATION_STATE_REPORT || path.resolve('artifacts/api/native-animation-state-evidence.json');
    await mkdir(path.dirname(reportPath),{recursive:true});
    await writeFile(reportPath,JSON.stringify({fixture,sourceFiles:await apiEvidenceSources(fixture),registrySha256:createHash('sha256').update(await readFile(new URL('./api-registry.json',import.meta.url))).digest('hex'),passed:failures.length===0,engineVersion:health.version,renderer:'cairo',apiIds,outcomes,checks:'Compiled registry calls checked against explicit intermediate/final geometry, opacity, identity, timing, updater suspension/removal and tracker values. Animation.interpolate deliberately uses dynamic dispatch on Rotate. Setup calls and abstract no-op interpolators are not counted.'},null,2)+'\n');
    t.diagnostic(`${apiIds.length} animation-state APIs, ${outcomes.length} cases, ${failures.length} failures.`);
    assert.deepEqual(failures,[]);
  } finally { await rm(directory,{recursive:true,force:true}); }
});
