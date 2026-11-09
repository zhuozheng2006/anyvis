import { expect, it } from 'vitest';
import { createAction } from './core/catalog';
import { createEmptyProject, validateProject } from './core/project';
import { compileProject } from './core/compiler';
import { createMatrixActions } from './matrix-project';
it('creates a real plane when inserting a matrix into an empty or tracker-only scene', () => {
  for (const actions of [[], [createAction('tracker', { name: 'speed' })]]) {
    const result = createMatrixActions({ ...createEmptyProject(), actions }, '[[1,2],[0,1]]');
    expect(result.project.actions.slice(-2).map(a => a.type)).toEqual(['plane', 'apply_matrix']);
    expect(compileProject(validateProject(result.project)).diagnostics).toEqual([]);
  }
});
it('targets an existing visual object and rejects invalid matrix shapes', () => {
  const p = { ...createEmptyProject(), actions: [createAction('circle', { name: 'c' })] };
  expect(createMatrixActions(p, '[[1,0],[0,2]]').action.fields.target).toBe('c');
  expect(() => createMatrixActions(p, '[[1,2,3]]')).toThrow();
});
