import { expect, it } from 'vitest';
import { createEmptyProject, validateProject } from './project';

const marker = { id: 'chapter-1', time: 1.25, label: '引入', color: '#38bdf8' };
it('roundtrips JSON markers without aliasing caller data and preserves old projects', () => {
  const project = createEmptyProject();
  expect(validateProject(project).scene).not.toHaveProperty('markers');
  project.scene.markers = [];
  expect(validateProject(project).scene.markers).toEqual([]);
  project.scene.markers = [marker, { id: 'no-color', time: 0, label: '' }];
  const restored = validateProject(JSON.parse(JSON.stringify(project)));
  expect(restored).toEqual(project);
  const validated = validateProject(project);
  validated.scene.markers![0].label = '修改';
  expect(project.scene.markers[0].label).toBe('引入');
});

it.each([
  null, {}, [null], [{ ...marker, id: '' }], [marker, marker],
  [{ ...marker, time: -1 }], [{ ...marker, time: NaN }],
  [{ ...marker, time: Infinity }], [{ ...marker, time: '1' }],
  [{ ...marker, label: 1 }], [{ ...marker, color: 'red' }],
])('rejects invalid marker data instead of silently discarding it: %j', markers => {
  const project = createEmptyProject();
  expect(() => validateProject({ ...project, scene: { ...project.scene, markers } })).toThrow('标记');
});
