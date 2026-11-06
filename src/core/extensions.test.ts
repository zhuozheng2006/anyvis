import { describe, expect, it } from 'vitest';
import { validateExtensionResult } from './extension-result';
import type { SceneObject } from './types';
const cube: SceneObject = { id: 'cube', name: 'Cube', kind: 'cube', color: '#b5f36c', visible: true, x: 0, y: 0, z: 0, scale: 1, rotation: 0 };
const point: SceneObject = { ...cube, id: 'point', kind: 'point', name: 'Point' };

describe('extension result boundary', () => {
  it('accepts presentation changes while preserving ownership of type, labels, expressions and order', () => {
    const output = validateExtensionResult([{ ...point, x: 2, name: 'bad', expression: 'bad' }, { ...cube, rotation: 1, visible: false, color: 'red' }], [cube, point]);
    expect(output.map(item => item.id)).toEqual(['cube', 'point']);
    expect(output[0]).toMatchObject({ rotation: 1, visible: false, color: 'red' });
    expect(output[1]).toMatchObject({ x: 2, name: 'Point' });
    expect(output[1].expression).toBeUndefined();
    expect(cube.rotation).toBe(0);
  });
  it('rejects additions, deletion, duplicate IDs, foreign IDs and type changes', () => {
    expect(() => validateExtensionResult([], [cube])).toThrow();
    expect(() => validateExtensionResult([cube, cube], [cube, point])).toThrow();
    expect(() => validateExtensionResult([{ ...cube, id: 'other' }], [cube])).toThrow();
    expect(() => validateExtensionResult([{ ...cube, kind: 'sphere' }], [cube])).toThrow();
  });
  it.each([NaN, Infinity, -Infinity, 10_001, '1', null])('rejects invalid numeric properties: %s', value => {
    expect(() => validateExtensionResult([{ ...cube, x: value }], [cube])).toThrow();
  });
  it('rejects unsafe or invalid display values', () => {
    expect(() => validateExtensionResult([{ ...cube, scale: 0 }], [cube])).toThrow();
    expect(() => validateExtensionResult([{ ...cube, color: 'url(https://example.com)' }], [cube])).toThrow();
    expect(() => validateExtensionResult([{ ...cube, visible: 'true' }], [cube])).toThrow();
  });
});
