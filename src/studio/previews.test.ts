import { describe, expect, it } from 'vitest';
import { getTemplate } from './templates';
import { builtinPreview } from './previews';
describe('native reference preview validity', () => {
  it('accepts only unchanged scene and animation semantics', () => {
    const project = getTemplate('first-animation');
    expect(builtinPreview(project, 'a')?.format).toBe('webm');
    project.name = 'My copy'; project.workspace = { selection: 'test' };
    expect(builtinPreview(project, 'b')?.revision).toBe('b');
    project.scene.markers = [{ id: 'chapter', time: 0, label: '开场' }];
    expect(builtinPreview(project, 'markers')?.revision).toBe('markers');
    project.actions[0].fields.text = 'New content';
    expect(builtinPreview(project, 'c')).toBeNull();
  });
  it('invalidates a reference after frame rate or camera profile changes', () => {
    const project = getTemplate('surface'); project.scene.fps = 60;
    expect(builtinPreview(project, 'x')).toBeNull();
  });
});
