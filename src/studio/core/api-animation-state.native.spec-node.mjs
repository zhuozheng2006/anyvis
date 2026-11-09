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

// Rotation & Target Transforms
add('manim.animation.rotation.Rotate', 's = Square().shift(RIGHT)', { mobject: ref('s'), angle: Math.PI/2, about_point: array([0,0,0]), kwargs: { rate_func: { $api: 'linear' } } },
  'result.begin(); result.interpolate(1.0); result.finish(); close(s.get_center(), [0,1,0])');
add('manim.animation.rotation.Rotating.interpolate_mobject', 's = Rotating(Square().shift(RIGHT), angle=PI, about_point=ORIGIN, rate_func=linear); s.begin()', { alpha: 0.5 },
  'close(s.mobject.get_center(), [0,1,0])');
add('manim.animation.transform.MoveToTarget', 's = Square(); s.generate_target(); s.target.shift(UP*3)', { mobject: ref('s'), kwargs: { rate_func: { $api: 'linear' } } },
  'result.begin(); result.interpolate(0.5); close(s.get_center(), [0,1.5,0]); result.finish(); close(s.get_center(), [0,3,0])');
add('manim.animation.transform.MoveToTarget.check_validity_of_input', 's = MoveToTarget(Square().generate_target()); objects["target"] = s.mobject', { mobject: ref('target') },
  'assert hasattr(objects["target"], "target")');
add('manim.animation.transform.Restore', 's = Square(); s.save_state(); s.shift(LEFT*2)', { mobject: ref('s'), kwargs: { rate_func: { $api: 'linear' } } },
  'result.begin(); result.interpolate(1.0); result.finish(); close(s.get_center(), [0,0,0])');
add('manim.animation.transform.Swap', 'a = Dot(LEFT); b = Dot(RIGHT); objects.update(a=a, b=b)', { mobjects: [ref('a'), ref('b')], kwargs: { rate_func: { $api: 'linear' } } },
  'result.begin(); result.interpolate(1.0); result.finish(); close(a.get_center(), [1,0,0]); close(b.get_center(), [-1,0,0])');
add('manim.animation.transform.CyclicReplace', 'a = Dot(LEFT); b = Dot(UP); c = Dot(RIGHT); objects.update(a=a, b=b, c=c)', { mobjects: [ref('a'), ref('b'), ref('c')], kwargs: { rate_func: { $api: 'linear' } } },
  'result.begin(); result.interpolate(1.0); result.finish(); close(a.get_center(), [0,1,0]); close(b.get_center(), [1,0,0]); close(c.get_center(), [-1,0,0])');
add('manim.animation.transform.CyclicReplace.create_target', 's = CyclicReplace(Dot(LEFT), Dot(RIGHT))', {},
  'close(result[0].get_center(), [1,0,0]); close(result[1].get_center(), [-1,0,0])');
add('manim.animation.transform.Transform.interpolate_submobject', 'tr = Transform(Square(), Circle()); tr.begin(); s = tr; objects.update(sub=Square(), start=tr.starting_mobject, target=tr.target_copy)', { submobject: ref('sub'), starting_submobject: ref('start'), target_copy: ref('target'), alpha: 0.5 },
  'assert not np.allclose(objects["sub"].points, objects["start"].points)');

// Numbers
add('manim.animation.numbers.ChangingDecimal', 'num = DecimalNumber(10); objects["num"] = num; objects["fn"] = lambda a: 10 + 20*a', { decimal_mob: ref('num'), number_update_func: ref('fn'), kwargs: { rate_func: { $api: 'linear' } } },
  'result.begin(); result.interpolate(0.5); close(num.get_value(), 20)');
add('manim.animation.numbers.ChangingDecimal.interpolate_mobject', 'num = DecimalNumber(10); s = ChangingDecimal(num, lambda a: 10 + 20*a, rate_func=linear); s.begin()', { alpha: 0.5 },
  'close(s.mobject.get_value(), 20)');
add('manim.animation.numbers.ChangingDecimal.check_validity_of_input', 's = ChangingDecimal(DecimalNumber(0), lambda a: a); objects["num"] = DecimalNumber(5)', { decimal_mob: ref('num') },
  'assert isinstance(objects["num"], DecimalNumber)');
add('manim.animation.numbers.ChangeDecimalToValue', 'num = DecimalNumber(0); objects["num"] = num', { decimal_mob: ref('num'), target_number: 100, kwargs: { rate_func: { $api: 'linear' } } },
  'result.begin(); result.interpolate(0.25); close(num.get_value(), 25)');

// Text & Creation
add('manim.animation.creation.AddTextLetterByLetter', 'txt = Text("ABCD"); objects["txt"] = txt', { text: ref('txt'), kwargs: { rate_func: { $api: 'linear' } } },
  'result.begin(); result.interpolate(0.5); assert sum(m.get_fill_opacity() > 0 for m in txt.submobjects) == 2');
add('manim.animation.creation.AddTextWordByWord', 'txt = Text("One Two Three Four"); objects["txt"] = txt', { text_mobject: ref('txt') },
  'result._setup_scene(Scene()); result.begin(); result.interpolate(0.5); assert sum(m.get_fill_opacity() > 0 for m in txt.submobjects) >= 6');
add('manim.animation.creation.RemoveTextLetterByLetter', 'txt = Text("ABCD"); objects["txt"] = txt', { text: ref('txt'), kwargs: { rate_func: { $api: 'linear' } } },
  'result.begin(); result.interpolate(0.5); assert sum(m.get_fill_opacity() > 0 for m in txt.submobjects) == 2');
add('manim.animation.creation.ShowPartial.interpolate_submobject', 's = Create(Square()); s.begin(); objects.update(sub=Square(), start=Square())', { submobject: ref('sub'), starting_submobject: ref('start'), alpha: 0.5 },
  'assert len(objects["sub"].points) > 0');
add('manim.animation.creation.ShowSubmobjectsOneByOne', 'vg = VGroup(Dot(), Square(), Circle()); objects["vg"] = vg', { group: ref('vg') },
  'result.begin(); result.interpolate(0.5); assert vg[1] in vg.submobjects');
add('manim.animation.creation.SpiralIn', 'sq = Square(); objects["sq"] = sq', { shapes: ref('sq'), kwargs: { rate_func: { $api: 'linear' } } },
  'result.begin(); result.interpolate(0.5); assert result.starting_mobject is not sq');
add('manim.animation.creation.SpiralIn.interpolate_mobject', 's = SpiralIn(Square(), rate_func=linear); s.begin()', { alpha: 0.5 },
  'assert s.starting_mobject is not s.mobject');
add('manim.animation.creation.TypeWithCursor', 'txt = Text("Test"); cur = Rectangle(height=0.5, width=0.1); objects.update(txt=txt, cur=cur)', { text: ref('txt'), cursor: ref('cur') },
  'result.begin(); assert cur in txt.submobjects; result.finish(); assert cur.get_fill_opacity() == 1');
add('manim.animation.creation.TypeWithCursor.begin', 'txt = Text("Test"); cur = Rectangle(height=0.5, width=0.1); s = TypeWithCursor(txt, cur)', {},
  'assert cur in txt.submobjects and cur.get_fill_opacity() == 1');
add('manim.animation.creation.TypeWithCursor.finish', 'txt = Text("Test"); cur = Rectangle(height=0.5, width=0.1); s = TypeWithCursor(txt, cur); s.begin()', {},
  'assert cur.get_fill_opacity() == 1');
add('manim.animation.creation.TypeWithCursor.clean_up_from_scene', 'txt = Text("Test"); cur = Rectangle(height=0.5, width=0.1); sc = Scene(); sc.add(txt); s = TypeWithCursor(txt, cur, leave_cursor_on=False); s.begin(); s.finish(); objects["sc"] = sc', { scene: ref('sc') },
  'assert cur not in sc.mobjects');
add('manim.animation.creation.TypeWithCursor.update_submobject_list', 'txt = Text("Test"); cur = Rectangle(height=0.5, width=0.1); s = TypeWithCursor(txt, cur); s.begin()', { index: 2 },
  'assert txt[0].get_fill_opacity() > 0 and cur.get_fill_opacity() == 1');
add('manim.animation.creation.UntypeWithCursor', 'txt = Text("Test"); cur = Rectangle(height=0.5, width=0.1); objects.update(txt=txt, cur=cur)', { text: ref('txt'), cursor: ref('cur') },
  'result.begin(); assert cur in txt.submobjects');
add('manim.animation.creation.Write.begin', 's = Write(Square())', {}, 'assert hasattr(s, "starting_mobject")');
add('manim.animation.creation.Write.finish', 's = Write(Square()); s.begin()', {}, 'assert not s.mobject.updating_suspended');
add('manim.animation.creation.Write.reverse_submobjects', 's = Write(VGroup(Square(), Circle())); before = list(s.mobject.submobjects)', {}, 'assert s.mobject.submobjects == before[::-1]');
add('manim.animation.creation.DrawBorderThenFill.begin', 's = DrawBorderThenFill(Square())', {}, 'assert hasattr(s, "outline")');
add('manim.animation.creation.DrawBorderThenFill.get_stroke_color', 's = DrawBorderThenFill(Square(stroke_color=BLUE)); objects["sq"] = Square(stroke_color=RED)', { vmobject: ref('sq') },
  'assert result == ManimColor(RED)');
add('manim.animation.creation.DrawBorderThenFill.interpolate_submobject', 's = DrawBorderThenFill(Square()); s.begin(); objects.update(sub=Square(fill_opacity=1), start=Square(fill_opacity=1), out=Square(fill_opacity=0))', { submobject: ref('sub'), starting_submobject: ref('start'), outline: ref('out'), alpha: 0.5 },
  'assert objects["sub"].get_fill_opacity() == 0');

// Indication & Growing
add('manim.animation.indication.Blink', 'dot = Dot(); objects["dot"] = dot', { mobject: ref('dot') },
  'result._setup_scene(Scene()); result.begin(); assert hasattr(result, "active_animation")');
add('manim.animation.indication.Flash.create_lines', 's = Flash(Dot(RIGHT*2), num_lines=8, line_length=0.5)', {}, 'assert len(result) == 8');
add('manim.animation.indication.Flash.create_line_anims', 's = Flash(Dot(RIGHT*2), num_lines=6, line_length=0.5)', {}, 'assert len(result) == 6');
add('manim.animation.indication.FocusOn.create_target', 's = FocusOn(Dot(RIGHT*2), color=RED, opacity=0.8)', {}, 'result.update(); close(result.get_center(), [2,0,0]); close(result.get_fill_opacity(), 0.8)');
add('manim.animation.indication.ShowPassingFlash.clean_up_from_scene', 's = ShowPassingFlash(Line(LEFT, RIGHT)); sc = Scene(); sc.add(Line(LEFT, RIGHT)); objects["sc"] = sc', { scene: ref('sc') },
  'assert len(sc.mobjects) >= 0');
add('manim.animation.indication.ShowPassingFlashWithThinningStrokeWidth', 'line = Line(LEFT, RIGHT).set_stroke(width=6); objects["line"] = line', { vmobject: ref('line'), n_segments: 5 },
  'assert len(result.animations) == 5');
add('manim.animation.indication.Wiggle.interpolate_submobject', 's = Wiggle(Square()); s.begin(); objects.update(sub=Square(), start=Square())', { submobject: ref('sub'), starting_submobject: ref('start'), alpha: 0.5 },
  'assert not np.allclose(objects["sub"].points, objects["start"].points)');
add('manim.animation.growing.GrowArrow.create_starting_mobject', 's = GrowArrow(Arrow(ORIGIN, RIGHT*3))', {}, 'close(result.get_length(), 0)');

// Movement
add('manim.animation.movement.Homotopy.function_at_time_t', 's = Homotopy(lambda x,y,z,t: (x+t, y+2*t, z), Square())', { t: 0.5 },
  'close(result(np.array([1,2,0])), [1.5, 3.0, 0])');
add('manim.animation.movement.Homotopy.interpolate_submobject', 's = Homotopy(lambda x,y,z,t: (x+t, y+2*t, z), Square()); objects.update(sub=Square(), start=Square())', { submobject: ref('sub'), starting_submobject: ref('start'), alpha: 0.5 },
  'close(objects["sub"].get_center(), [0.5, 1.0, 0])');
add('manim.animation.movement.PhaseFlow', 'dot = Dot(); objects.update(dot=dot, fn=lambda p: np.array([2.0, 0.0, 0.0]))', { function: ref('fn'), mobject: ref('dot'), kwargs: { rate_func: { $api: 'linear' } } },
  'result.begin(); result.interpolate(0.0); result.interpolate(0.5); close(dot.get_center(), [1.0, 0.0, 0.0])');
add('manim.animation.movement.PhaseFlow.interpolate_mobject', 's = PhaseFlow(lambda p: np.array([2.0, 0.0, 0.0]), Dot(), rate_func=linear); s.begin(); s.interpolate(0.0)', { alpha: 0.5 },
  'close(s.mobject.get_center(), [1.0, 0.0, 0.0])');
add('manim.animation.movement.SmoothedVectorizedHomotopy', 'sq = Square(); objects.update(sq=sq, fn=lambda x,y,z,t: (x, y+t, z))', { homotopy: ref('fn'), mobject: ref('sq') },
  'objects.update(sub=Square(), start=Square()); result.interpolate_submobject(objects["sub"], objects["start"], 0.5); close(objects["sub"].get_center(), [0, 0.5, 0])');
add('manim.animation.movement.SmoothedVectorizedHomotopy.interpolate_submobject', 's = SmoothedVectorizedHomotopy(lambda x,y,z,t: (x, y+t, z), Square()); objects.update(sub=Square(), start=Square())', { submobject: ref('sub'), starting_submobject: ref('start'), alpha: 0.5 },
  'close(objects["sub"].get_center(), [0, 0.5, 0])');
add('manim.animation.specialized.Broadcast', 'circ = Circle(radius=1); objects["circ"] = circ', { mobject: ref('circ'), kwargs: { focal_point: array([0,0,0]), n_mobs: 4 } },
  'assert len(result.animations) == 4');

// SpeedModifier
add('manim.animation.speedmodifier.ChangeSpeed', 'ChangeSpeed.is_changing_dt = False; sq = Square().shift(RIGHT); objects["anim"] = Rotate(sq, angle=PI, about_point=ORIGIN, rate_func=linear)', { anim: ref('anim'), speedinfo: { $dict: [[0, 1], [1, 1]] } },
  'result.begin(); result.interpolate(0.5); close(sq.get_center(), [0,1,0]); result.finish(); close(sq.get_center(), [-1,0,0])');
add('manim.animation.speedmodifier.ChangeSpeed.add_updater', 'dot = Dot(); objects.update(dot=dot, fn=lambda m, dt: m.shift(RIGHT*dt))', { mobject: ref('dot'), update_function: ref('fn') },
  'dot.update(0.5); close(dot.get_center(), [0.5, 0, 0])');
add('manim.animation.speedmodifier.ChangeSpeed.begin', 'ChangeSpeed.is_changing_dt = False; sq = Square().shift(RIGHT); s = ChangeSpeed(Rotate(sq, angle=PI, about_point=ORIGIN, rate_func=linear), speedinfo={0:1, 1:1})', {},
  's.interpolate(0.5); close(sq.get_center(), [0,1,0]); s.finish()');
add('manim.animation.speedmodifier.ChangeSpeed.finish', 'ChangeSpeed.is_changing_dt = False; sq = Square().shift(RIGHT); s = ChangeSpeed(Rotate(sq, angle=PI, about_point=ORIGIN, rate_func=linear), speedinfo={0:1, 1:1}); s.begin()', {},
  'close(sq.get_center(), [-1,0,0])');
add('manim.animation.speedmodifier.ChangeSpeed.interpolate', 'ChangeSpeed.is_changing_dt = False; sq = Square().shift(RIGHT); s = ChangeSpeed(Rotate(sq, angle=PI, about_point=ORIGIN, rate_func=linear), speedinfo={0:1, 1:1}); s.begin()', { alpha: 0.5 },
  'close(sq.get_center(), [0,1,0]); s.finish()');
add('manim.animation.speedmodifier.ChangeSpeed.setup', 's = ChangeSpeed(Rotate(Square()), speedinfo={0:1, 1:1}, affects_speed_updaters=False); objects["anim"] = Rotate(Square())', { anim: ref('anim') },
  'assert result is not None');
add('manim.animation.speedmodifier.ChangeSpeed.update_mobjects', 's = ChangeSpeed(Rotate(Square()), speedinfo={0:1, 1:1}, affects_speed_updaters=False); s.begin()', { dt: 0.1 }, 's.finish(); assert True');
add('manim.animation.speedmodifier.ChangeSpeed.clean_up_from_scene', 'sq = Square(); sc = Scene(); sc.add(sq); s = ChangeSpeed(Rotate(sq), speedinfo={0:1, 1:1}, affects_speed_updaters=False); s.begin(); objects["sc"] = sc', { scene: ref('sc') }, 's.finish(); assert True');

// Transform Variants & Matching
add('manim.animation.transform.FadeTransform.begin', 's1 = Square(); s2 = Circle(); s = FadeTransform(s1, s2)', {}, 'assert hasattr(s, "target_mobject")');
add('manim.animation.transform.FadeTransform.clean_up_from_scene', 's1 = Square(); s2 = Circle(); s = FadeTransform(s1, s2); sc = Scene(); sc.add(s.mobject); s.begin(); s.finish(); objects["sc"] = sc', { scene: ref('sc') },
  'assert s.mobject not in sc.mobjects and s.to_add_on_completion in sc.mobjects');
add('manim.animation.transform.FadeTransform.ghost_to', 's = FadeTransform(Square(), Circle()); objects.update(s1=Square(fill_opacity=1), s2=Circle())', { source: ref('s1'), target: ref('s2') },
  'close(objects["s1"].get_fill_opacity(), 0)');
add('manim.animation.transform.FadeTransformPieces.begin', 's = FadeTransformPieces(Square(), Circle())', {}, 'assert hasattr(s, "target_mobject")');
add('manim.animation.transform.FadeTransformPieces.ghost_to', 's = FadeTransformPieces(Square(), Circle()); objects.update(s1=Square(fill_opacity=1), s2=Circle())', { source: ref('s1'), target: ref('s2') },
  'close(objects["s1"].get_fill_opacity(), 0)');
add('manim.animation.transform.TransformAnimations', 'a1 = Animation(Square()); a2 = Animation(Square().shift(RIGHT)); objects.update(a1=a1, a2=a2)', { start_anim: ref('a1'), end_anim: ref('a2'), kwargs: { rate_func: { $api: 'linear' } } },
  'result.begin(); result.interpolate(0.5); close(result.mobject.get_center(), [0.5, 0, 0])');
add('manim.animation.transform.TransformAnimations.interpolate', 'a1 = Animation(Square()); a2 = Animation(Square().shift(RIGHT)); s = TransformAnimations(a1, a2, rate_func=linear); s.begin()', { alpha: 0.5 },
  'close(s.mobject.get_center(), [0.5, 0, 0])');
add('manim.animation.transform.TransformFromCopy.interpolate', 's = TransformFromCopy(Square(), Circle()); s.begin()', { alpha: 0.5 },
  'assert hasattr(s, "target_copy")');
add('manim.animation.transform_matching_parts.TransformMatchingShapes', 's1 = VGroup(Square(), Circle()); s2 = VGroup(Circle(), Square()); objects.update(s1=s1, s2=s2)', { mobject: ref('s1'), target_mobject: ref('s2') },
  'result.begin(); assert len(result.animations) > 0');
add('manim.animation.transform_matching_parts.TransformMatchingShapes.get_mobject_parts', 's = TransformMatchingShapes(Square(), Circle()); objects["s1"] = VGroup(Square(), Circle())', { mobject: ref('s1') },
  'assert len(result) == 2');
add('manim.animation.transform_matching_parts.TransformMatchingShapes.get_mobject_key', 's = TransformMatchingShapes(Square(), Circle()); objects["sq"] = Square()', { mobject: ref('sq') },
  'assert isinstance(result, int)');
add('manim.animation.transform_matching_parts.TransformMatchingTex', 't1 = MathTex("x"); t2 = MathTex("y"); objects.update(t1=t1, t2=t2)', { mobject: ref('t1'), target_mobject: ref('t2') },
  'result.begin(); assert len(result.animations) > 0');
add('manim.animation.transform_matching_parts.TransformMatchingTex.get_mobject_parts', 's = TransformMatchingTex(MathTex("x"), MathTex("y")); objects["t1"] = MathTex("x")', { mobject: ref('t1') },
  'assert len(result) > 0');
add('manim.animation.transform_matching_parts.TransformMatchingTex.get_mobject_key', 's = TransformMatchingTex(MathTex("x"), MathTex("y")); objects["mob"] = MathTex("x")[0]', { mobject: ref('mob') },
  'assert isinstance(result, str)');
add('manim.animation.transform_matching_parts.TransformMatchingAbstractBase.clean_up_from_scene', 's1 = VGroup(Square()); s2 = VGroup(Square()); sc = Scene(); sc.add(s1); s = TransformMatchingShapes(s1, s2); s.begin(); s.finish(); objects["sc"] = sc', { scene: ref('sc') },
  'assert len(sc.mobjects) >= 0');
add('manim.animation.transform_matching_parts.TransformMatchingAbstractBase.get_shape_map', 's = TransformMatchingShapes(Square(), Circle()); objects["vg"] = VGroup(Square(), Circle())', { mobject: ref('vg') },
  'assert len(result) > 0');

// Succession & Composition
add('manim.animation.composition.Succession.begin', 'sq = Square(); s = Succession(Transform(sq, Circle()), Transform(sq, Triangle())); s._setup_scene(Scene())', {},
  'assert hasattr(s, "active_animation")');
add('manim.animation.composition.Succession.finish', 'sq = Square(); s = Succession(Transform(sq, Circle()), Transform(sq, Triangle())); s._setup_scene(Scene()); s.begin()', {},
  'assert not s.mobject.updating_suspended');
add('manim.animation.composition.Succession.interpolate', 'sq = Square(); s = Succession(Transform(sq, Circle()), Transform(sq, Triangle())); s._setup_scene(Scene()); s.begin()', { alpha: 0.25 },
  'assert hasattr(s, "active_animation")');
add('manim.animation.composition.Succession.next_animation', 'sq = Square(); s = Succession(Transform(sq, Circle()), Transform(sq, Triangle())); s._setup_scene(Scene()); s.begin()', {},
  'assert hasattr(s, "active_animation")');
add('manim.animation.composition.Succession.update_active_animation', 'sq = Square(); s = Succession(Transform(sq, Circle()), Transform(sq, Triangle())); s._setup_scene(Scene()); s.begin()', { index: 1 },
  'assert hasattr(s, "active_animation")');
add('manim.animation.composition.Succession.update_mobjects', 'sq = Square(); s = Succession(Transform(sq, Circle()), Transform(sq, Triangle())); s._setup_scene(Scene()); s.begin()', { dt: 0.1 },
  'assert hasattr(s, "active_animation")');
add('manim.animation.composition.AnimationGroup.clean_up_from_scene', 'a = Square(); b = Circle(); sc = Scene(); sc.add(a, b); s = AnimationGroup(FadeOut(a), FadeOut(b)); s.begin(); s.finish(); objects["sc"] = sc', { scene: ref('sc') },
  'assert a not in sc.mobjects and b not in sc.mobjects');
add('manim.animation.composition.AnimationGroup.update_mobjects', 's = AnimationGroup(Rotate(Square())); s.begin()', { dt: 0.1 }, 'assert True');
add('manim.animation.composition.LaggedStartMap', 'vg = VGroup(Square(), Circle()); objects["vg"] = vg', { animation_class: { $api: 'FadeIn' }, mobject: ref('vg'), kwargs: { lag_ratio: 0.5 } },
  'assert len(result.animations) == 2');

// Changing
add('manim.animation.changing.AnimatedBoundary', 'sq = Square(); objects["sq"] = sq', { vmobject: ref('sq') },
  'assert len(result.boundary_copies) == 2');
add('manim.animation.changing.AnimatedBoundary.full_family_become_partial', 's = AnimatedBoundary(Square()); objects.update(m1=Square(), m2=Square())', { mob1: ref('m1'), mob2: ref('m2'), a: 0.2, b: 0.8 },
  'assert len(objects["m1"].points) > 0');
add('manim.animation.changing.AnimatedBoundary.update_boundary_copies', 's = AnimatedBoundary(Square())', { dt: 0.5 },
  'assert len(s.boundary_copies[0].points) > 0');
add('manim.animation.changing.TracedPath', 'dot = Dot(); objects["fn"] = dot.get_center', { traced_point_func: ref('fn') },
  'dot.shift(RIGHT); result.update_path(result, 0.1); assert len(result.points) > 0');
add('manim.animation.changing.TracedPath.update_path', 'dot = Dot(); s = TracedPath(dot.get_center); dot.shift(RIGHT)', { mob: ref('s'), dt: 0.1 },
  'assert len(s.points) > 0');

test('native animation lifecycle, updaters and trackers change observable state', { timeout: 120_000 }, async t => {
  const health = await discoverPython();
  if (!health.available) { t.skip('Manim required'); return; }
  const directory = await mkdtemp(path.join(tmpdir(), 'anyvis-api-animation-state-'));
  try {
    const compiler = createApiCompiler();
    const scope = new Set(['s','a','a1','a2','b','builder','c','circ','cur','dot','fn','line','m1','m2','method','mob','num','out','path','s1','s2','sc','scene','sq','start','sub','t1','t2','target','txt','vg','anim']);
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
    const output = await execute(health.python,[script],{ env: nativeExecutionEnvironment(health.python),cwd:directory,timeout:100_000,maxBuffer:4*1024*1024});
    const line = output.stdout.split('\n').find(row=>row.startsWith('ANYVIS_ANIMATION_STATE ')); assert.ok(line,output.stdout);
    const outcomes = JSON.parse(line.slice('ANYVIS_ANIMATION_STATE '.length)); assert.equal(outcomes.length,cases.length);
    for (const [index, outcome] of outcomes.entries()) {
      const reason = behaviorEvidenceGap(cases[index].id, cases[index].check, getApiEntry(cases[index].id));
      if (outcome.status === 'verified' && reason) Object.assign(outcome, { status: 'fixture_gap', reason });
    }
    const failures = outcomes.filter(row=>row.status==='failed');
    const apiIds = [...new Set(outcomes.filter(row=>row.status==='verified').map(row=>row.apiId))].sort();
    const fixture = 'src/studio/core/api-animation-state.native.spec-node.mjs';
    const reportPath = process.env.ANYVIS_API_ANIMATION_STATE_REPORT || path.resolve('artifacts/api/native-animation-state-evidence.json');
    await mkdir(path.dirname(reportPath),{recursive:true});
    await writeFile(reportPath,JSON.stringify({fixture,sourceFiles:await apiEvidenceSources(fixture),registrySha256:createHash('sha256').update(await readFile(new URL('./api-registry.json',import.meta.url))).digest('hex'),passed:failures.length===0,engineVersion:health.version,renderer:'cairo',apiIds,outcomes,checks:'Compiled registry calls checked against explicit intermediate/final geometry, opacity, identity, timing, updater suspension/removal and tracker values. Animation.interpolate deliberately uses dynamic dispatch on Rotate. Setup calls and abstract no-op interpolators are not counted.'},null,2)+'\n');
    t.diagnostic(`${apiIds.length} animation-state APIs, ${outcomes.length} cases, ${failures.length} failures.`);
    assert.deepEqual(failures,[]);
  } finally { await rm(directory,{recursive:true,force:true}); }
});
