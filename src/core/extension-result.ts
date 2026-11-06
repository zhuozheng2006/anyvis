import type { SceneObject } from './types';

const MAX_OBJECTS = 500;
const NUMERIC_PROPERTIES = ['x', 'y', 'z', 'scale', 'rotation'] as const;
const COLOR_PATTERN = /^(?:#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})|[a-z]{1,24})$/i;

/** Only numeric transforms and presentation properties may cross the worker boundary. */
export function validateExtensionResult(value: unknown, source: SceneObject[]): SceneObject[] {
  if (!Array.isArray(value) || value.length !== source.length || value.length > MAX_OBJECTS) {
    throw new Error('扩展必须返回全部原有对象，不能增加或删除对象。');
  }
  const byId = new Map(source.map(object => [object.id, object]));
  const used = new Set<string>();
  const updated = new Map<string, SceneObject>();
  for (const item of value) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new Error('返回的每一项都必须是场景对象。');
    }
    const candidate = item as Record<string, unknown>;
    const id = candidate.id;
    if (typeof id !== 'string' || !byId.has(id) || used.has(id)) {
      throw new Error('扩展返回了未知或重复的对象 ID。');
    }
    used.add(id);
    const original = byId.get(id)!;
    if (candidate.kind !== original.kind) throw new Error('扩展不能改变对象类型。');
    const result = { ...original };
    for (const key of NUMERIC_PROPERTIES) {
      const number = candidate[key];
      if (typeof number !== 'number' || !Number.isFinite(number) || Math.abs(number) > 10_000) {
        throw new Error(`${original.name} 的 ${key} 必须是 -10000 到 10000 内的有限数值。`);
      }
      if (key === 'scale' && number <= 0) throw new Error('对象的 scale 必须大于 0。');
      result[key] = number;
    }
    if (typeof candidate.visible !== 'boolean') throw new Error('visible 必须是布尔值。');
    if (typeof candidate.color !== 'string' || !COLOR_PATTERN.test(candidate.color)) {
      throw new Error('color 必须是十六进制颜色或英文颜色名称。');
    }
    result.visible = candidate.visible;
    result.color = candidate.color;
    updated.set(id, result);
  }
  // Keep scene ordering and all non-extension fields under the editor's ownership.
  return source.map(object => updated.get(object.id)!);
}

