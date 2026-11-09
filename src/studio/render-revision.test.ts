import { expect, it } from 'vitest';
import { createEmptyProject } from './core/project';
import { createAction } from './core/catalog';
import { revisionOf } from './render-revision';
import { projectHistory } from './project-history';

it('keeps rendered video current while marker edits remain undoable', () => {
  const project = createEmptyProject();
  project.actions = [createAction('circle')];
  const revision = revisionOf(project);
  const marked = { ...project, scene: { ...project.scene, markers: [{ id: 'm', time: 0.5, label: '章节' }] } };
  const history = projectHistory({ past: [], present: project, future: [] }, { type: 'edit', value: marked });
  expect(history.past).toHaveLength(1);
  expect(revisionOf(history.present)).toBe(revision);
  expect(revisionOf(projectHistory(history, { type: 'undo' }).present)).toBe(revision);
  marked.scene.markers[0].label = '新章节名';
  marked.scene.markers[0].time = 0.7;
  expect(revisionOf(marked)).toBe(revision);
});

it('invalidates video for changed frames, audio or project identity', () => {
  const project = createEmptyProject();
  project.actions = [createAction('circle')];
  const revision = revisionOf(project);
  for (const scene of [{ fps: 24 }, { width: 1080 }, { backgroundMusic: 'piano' as const }, { musicGainDb: -30 }]) {
    expect(revisionOf({ ...project, scene: { ...project.scene, ...scene } })).not.toBe(revision);
  }
  const changed = structuredClone(project);
  changed.actions[0].fields.radius = 2;
  expect(revisionOf(changed)).not.toBe(revision);
  expect(revisionOf({ ...project, id: 'another-project' })).not.toBe(revision);
});
