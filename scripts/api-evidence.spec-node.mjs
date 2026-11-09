import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { behaviorEvidenceGap, nativeExecutionEnvironment } from './api-evidence.mjs';
test('smoke assertions and abstract hooks cannot count as behavior evidence', () => {
  for (const assertion of ['assert True', 's.finish(); assert True', 'assert len(sc.mobjects) >= 0', 'assert objects["receiver"] is not None', 'assert result is not None', 'assert result is s', 'assert len(s.submobjects) >= 2', 'assert hasattr(s, "target_copy")', 'objects["helper"] = Square()']) {
    assert.ok(behaviorEvidenceGap('Some.method', assertion), assertion);
  }
  assert.ok(behaviorEvidenceGap('manim.scene.scene.Scene.construct', 'assert result == 1'));
  assert.ok(behaviorEvidenceGap('Some.method', 'assert len($result.get_all_points()) > 0\nassert np.isfinite($result.get_all_points()).all()', {kind:'method'}));
  assert.equal(behaviorEvidenceGap('Some.method', 'close(s.get_center(), [2,0,0]); assert result is s'), null);
});
test('native subprocess PATH resolves tools from the selected Python environment', () => {
  const env = nativeExecutionEnvironment('/tmp/manim/bin/python', {PATH:['/usr/bin','/bin'].join(path.delimiter), CUSTOM:'preserved'});
  assert.equal(env.PATH.split(path.delimiter)[0], '/tmp/manim/bin');
  assert.ok(env.PATH.split(path.delimiter).includes('/usr/bin'));
  assert.equal(env.CUSTOM, 'preserved');
});
