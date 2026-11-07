import { describe, expect, it } from 'vitest';
import { createAction } from './core/catalog';
import { createEmptyProject } from './core/project';
import { compileProject } from './core/compiler';
import { getApiEntry } from './core/api-registry';
import { actionDuration, appendAction, managedObject, objectDependents, parallelWithNext, removeAction, reorderAction, timelineClips, updateAction } from './authoring';
describe('shared authoring projections', () => {
  it('keeps visual API constructors distinct from named method results', () => {
    expect(managedObject(createAction('circle'))).toBe(true);
    expect(managedObject(createAction('tracker'))).toBe(false);
    for (const [id, expected] of [['Circle', true], ['Mobject.shift', false], ['Create', false], ['ValueTracker', false]] as const)
      expect(managedObject(createAction(getApiEntry(id)!.type))).toBe(expected);
  });
  it('computes sequential, parallel, repeat and zero-duration events without inventing dynamic time', () => {
    const a = createAction('circle', { duration: 2 });
    const b = createAction('square', { duration: 3 });
    const group = createAction('parallel'); group.children = [a, b];
    const repeat = createAction('repeat', { count: 3 }); repeat.children = [group, createAction('wait', { duration: 1 })];
    expect(actionDuration(repeat)).toBe(12);
    const clips = timelineClips([repeat, createAction('circle', { appear: 'hidden' }), createAction('code'), createAction('wait')]);
    expect(clips.map(c => c.start)).toEqual([0, 12, 12, null]);
    expect(clips[1].duration).toBe(0);
    expect(clips[2].duration).toBeNull();
  });
  it('renames objects and nested references while retaining literal text, order and timing', () => {
    const a = createAction('circle', { name: '圆' });
    const move = createAction('shift', { target: '圆', duration: 2 });
    const text = createAction('text', { text: '圆' });
    const p = { ...createEmptyProject(), actions: [a, move, text] };
    const changed = updateAction(p, a.id, { name: '主角', radius: 2 });
    expect(changed.actions[0].fields).toMatchObject({ name: '主角', radius: 2 });
    expect(changed.actions[1].fields.target).toBe('主角');
    expect(changed.actions[2].fields.text).toBe('圆');
    expect(compileProject(changed).duration).toBe(compileProject(p).duration);
    expect(objectDependents(changed, a.id)).toEqual([move.id]);
    expect(() => removeAction(changed, a.id)).toThrow('仍被');
  });
  it('keeps ripple edits and parallel composition reflected in generated Python', () => {
    const a = createAction('circle', { name: 'a', duration: 2 }), b = createAction('square', { name: 'b', duration: 3 });
    const p = { ...createEmptyProject(), actions: [a, b] };
    const parallel = parallelWithNext(p, a.id);
    expect(compileProject(parallel).diagnostics).toEqual([]);
    expect(compileProject(parallel).duration).toBe(3);
    const reordered = reorderAction(p, a.id, null);
    expect(reordered.actions.map(a => a.id)).toEqual([b.id, a.id]);
    expect(compileProject(reordered).code.indexOf('Square(')).toBeLessThan(compileProject(reordered).code.indexOf('Circle('));
    expect(appendAction(p, 'circle', { name: 'a' }).action.fields.name).toBe('a 2');
  });
});
