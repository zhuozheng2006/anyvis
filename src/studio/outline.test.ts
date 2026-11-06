import { describe, expect, it } from 'vitest';
import { createAction } from './core/catalog';
import { outlineRows, stepTiming } from './outline';

describe('readable scene outline', () => {
  it('keeps nested and parallel branch actions individually reachable', () => {
    const group = createAction('sequence');
    const parallel = createAction('parallel');
    const left = createAction('move'); const right = createAction('rotate');
    parallel.branches = [[left], [right]];
    group.children = [parallel];
    const rows = outlineRows([group]);
    expect(rows.map(row => row.action.id)).toEqual([group.id, parallel.id, left.id, right.id]);
    expect(rows.map(row => row.depth)).toEqual([0, 1, 2, 2]);
    expect(new Set(rows.map(row => row.number)).size).toBe(4);
    expect(rows[3].context).toBe('分支 2');
  });
  it('does not pretend hidden or instant objects consume their duration field', () => {
    expect(stepTiming(createAction('square', { appear: 'hidden', duration: 5 }))).toBe('暂不显示');
    expect(stepTiming(createAction('circle', { appear: 'none', duration: 5 }))).toBe('直接显示');
    expect(stepTiming(createAction('wait', { duration: 0 }))).toBe('立即');
    expect(stepTiming(createAction('wait', { duration: 2.5 }))).toBe('2.5 秒');
  });
});
