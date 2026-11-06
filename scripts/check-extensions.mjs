import assert from 'node:assert/strict';
import { validateExtensionResult } from '../src/core/extension-result.ts';

const cube = { id: 'cube', name: 'Cube', kind: 'cube', color: '#b5f36c', visible: true, x: 0, y: 0, z: 0, scale: 1, rotation: 0 };
const point = { ...cube, id: 'point', name: 'Point', kind: 'point' };
let cases = 0;
const check = (label, body) => {
  body();
  cases++;
  console.log(`PASS ${label}`);
};
check('accept changes, preserve scene order and editor-owned fields', () => {
  const output = validateExtensionResult([
    { ...point, x: 2, name: 'changed', expression: 'changed' },
    { ...cube, rotation: 1, visible: false, color: 'red' },
  ], [cube, point]);
  assert.deepEqual(output.map(object => object.id), ['cube', 'point']);
  assert.equal(output[0].rotation, 1);
  assert.equal(output[0].visible, false);
  assert.equal(output[0].color, 'red');
  assert.equal(output[1].x, 2);
  assert.equal(output[1].name, 'Point');
  assert.equal(output[1].expression, undefined);
  assert.equal(cube.rotation, 0);
});
check('reject added, missing, unknown, duplicate and changed-kind objects', () => {
  for (const [output, source] of [
    [[], [cube]], [[cube, point], [cube]], [[cube, cube], [cube, point]],
    [[{ ...cube, id: 'unknown' }], [cube]], [[{ ...cube, kind: 'sphere' }], [cube]],
  ]) assert.throws(() => validateExtensionResult(output, source));
});
check('reject non-finite, excessive and non-numeric transforms', () => {
  for (const value of [NaN, Infinity, -Infinity, 10001, -10001, '1', null, undefined]) {
    assert.throws(() => validateExtensionResult([{ ...cube, x: value }], [cube]));
  }
});
check('reject invalid scale, visibility and URL-valued colors', () => {
  for (const patch of [{ scale: 0 }, { scale: -1 }, { visible: 'true' }, { color: 'url(https://example.com)' }, { color: '#12345' }]) {
    assert.throws(() => validateExtensionResult([{ ...cube, ...patch }], [cube]));
  }
});
check('reject malformed containers and enforce maximum object count', () => {
  for (const output of [null, {}, [null], [1], [[]]]) assert.throws(() => validateExtensionResult(output, [cube]));
  const objects = Array.from({ length: 501 }, (_, index) => ({ ...cube, id: `o${index}` }));
  assert.throws(() => validateExtensionResult(objects, objects));
});
check('accept an empty scene and leave inputs unchanged', () => {
  assert.deepEqual(validateExtensionResult([], []), []);
  const input = Object.freeze({ ...cube });
  assert.deepEqual(validateExtensionResult([input], [input]), [cube]);
});
console.log(`Extension return validation: ${cases} checks passed.`);
