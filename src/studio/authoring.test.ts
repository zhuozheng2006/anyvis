import { describe, expect, it } from 'vitest';
import { createAction } from './core/catalog';
import { createEmptyProject } from './core/project';
import { compileProject } from './core/compiler';
import { getApiEntry } from './core/api-registry';
import { actionDuration, appendAction, duplicateAction, managedObject, objectDependents, parallelWithNext, removeAction, removeActions, reorderAction, timelineClips, updateAction } from './authoring';
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
  it('protects references outside a deleted compound clip, including API receivers', () => {
    const circle = createAction('circle', { name: '主角', appear: 'none' });
    const inner = createAction('sequence'); inner.children = [circle];
    const outer = createAction('sequence'); outer.children = [inner];
    const shift = createAction('shift', { target: '主角' });
    const api = createAction(getApiEntry('Mobject.get_center')!.type, { receiver: '主角' });
    for (const dependent of [shift, api]) {
      const p = { ...createEmptyProject(), actions: [outer, dependent] };
      expect(compileProject(p).diagnostics).toEqual([]);
      expect(() => removeAction(p, outer.id)).toThrow('仍被');
      expect(p.actions).toEqual([outer, dependent]);
    }
  });
  it('allows deleting a compound clip together with its internal references', () => {
    const circle = createAction('circle', { name: '主角', appear: 'none' });
    const shift = createAction('shift', { target: '主角' });
    const sequence = createAction('sequence'); sequence.children = [circle, shift];
    const wait = createAction('wait', { duration: 2 });
    const p = { ...createEmptyProject(), actions: [sequence, wait] };
    expect(compileProject(p).diagnostics).toEqual([]);
    const next = removeAction(p, sequence.id);
    expect(next.actions).toEqual([wait]);
    expect(compileProject(next).diagnostics).toEqual([]);
    expect(p.actions[0].children).toEqual([circle, shift]);
  });
  it('supports atomic batch removal of multiple actions while validating external dependencies', () => {
    const c1 = createAction('circle', { name: 'c1' });
    const s1 = createAction('shift', { target: 'c1', duration: 1 });
    const c2 = createAction('square', { name: 'c2' });
    const s2 = createAction('shift', { target: 'c2', duration: 1 });
    const wait = createAction('wait', { duration: 1 });
    const p = { ...createEmptyProject(), actions: [c1, s1, c2, s2, wait] };

    // Empty list returns project unchanged
    expect(removeActions(p, [])).toBe(p);

    // Deleting c1 without s1 throws because s1 depends on c1
    expect(() => removeActions(p, [c1.id, c2.id])).toThrow('仍被');

    // Deleting c1 along with its dependent s1 succeeds atomically
    const cleaned = removeActions(p, [c1.id, s1.id]);
    expect(cleaned.actions.map(a => a.id)).toEqual([c2.id, s2.id, wait.id]);
    expect(compileProject(cleaned).diagnostics).toEqual([]);

    // Deleting multiple unrelated actions and co-dependent actions in a batch
    const allRemoved = removeActions(p, [c1.id, s1.id, c2.id, s2.id]);
    expect(allRemoved.actions.map(a => a.id)).toEqual([wait.id]);
    expect(compileProject(allRemoved).diagnostics).toEqual([]);
  });
  it('duplicates objects and actions immediately after the original with unique names and valid code', () => {
    const c1 = createAction('circle', { name: '圆', radius: 1.5, color: '#FF862F' });
    const s1 = createAction('shift', { target: '圆', dx: 2, duration: 1 });
    const p = { ...createEmptyProject(), actions: [c1, s1] };

    const dupObj = duplicateAction(p, c1.id);
    expect(dupObj.action.id).not.toBe(c1.id);
    expect(dupObj.action.fields.name).toBe('圆 2');
    expect(dupObj.action.fields.radius).toBe(1.5);
    expect(dupObj.project.actions.map(a => a.id)).toEqual([c1.id, dupObj.action.id, s1.id]);
    expect(compileProject(dupObj.project).diagnostics).toEqual([]);

    const dupObj2 = duplicateAction(dupObj.project, dupObj.action.id);
    expect(dupObj2.action.fields.name).toBe('圆 3');
    expect(compileProject(dupObj2.project).diagnostics).toEqual([]);

    const dupShift = duplicateAction(dupObj2.project, s1.id);
    expect(dupShift.action.fields.target).toBe('圆');
    expect(dupShift.action.fields.dx).toBe(2);
    expect(compileProject(dupShift.project).diagnostics).toEqual([]);
  });
});
