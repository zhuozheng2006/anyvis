import { describe, expect, it } from 'vitest';
import { createAction } from './catalog.ts';
import { compileProject } from './compiler.ts';
import { createEmptyProject } from './project.ts';

describe('removing object families', () => {
  it('removes the actual family of a nested group without expanding the project blocks', () => {
    const remove = createAction('remove', { target: '外层' });
    const project = { ...createEmptyProject(), actions: [
      createAction('circle', { name: '圆', appear: 'none' }),
      createAction('square', { name: '方', appear: 'none' }),
      createAction('group', { name: '内层', members: '圆,方' }),
      createAction('group', { name: '外层', members: '内层,圆' }),
      remove,
    ] };
    const compiled = compileProject(project);
    expect(compiled.diagnostics).toEqual([]);
    expect(project.actions).toHaveLength(5);
    expect(compiled.code).toContain('self.remove(*objects["外层"].get_family())');
    const line = compiled.code.split('\n').findIndex(value => value.includes('self.remove(')) + 1;
    expect(compiled.sourceMap[line]).toBe(remove.id);
    expect(compiled.requiresTrust).toBe(false);
  });

  it('keeps remove and re-add valid for fixed subtitles in three dimensions', () => {
    const project = createEmptyProject();
    project.scene.dimension = '3d';
    project.actions = [
      createAction('text', { name: '字幕', text: '切换字幕', appear: 'none' }),
      createAction('fixed_in_frame', { target: '字幕' }),
      createAction('remove', { target: '字幕' }),
      createAction('camera', { phi: 70, theta: 20, duration: 0 }),
      createAction('add', { target: '字幕' }),
    ];
    const compiled = compileProject(project);
    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.code).toContain('self.remove(*objects["字幕"].get_family())');
    expect(compiled.code).toContain('self.add(objects["字幕"])');
    expect(compiled.code).not.toContain('remove_fixed_in_frame_mobjects');
  });
});
