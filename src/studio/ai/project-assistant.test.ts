import { describe, expect, it } from 'vitest';
import { createAction } from '../core/catalog.ts';
import { createEmptyProject } from '../core/project.ts';
import { buildPrompt, parseAIProject } from './project-assistant.ts';

function example() {
  const project = createEmptyProject();
  project.actions = [createAction('circle', { name: '圆 A' }), createAction('wait', { duration: 0.5 })];
  return project;
}

describe('AI editable project boundary', () => {
  it('imports fenced JSON while preserving project identity and discarding stale layout', () => {
    const current = example();
    const generated = { ...current, id: 'model-changed-id', name: '圆的故事', workspace: { stale: true } };
    const result = parseAIProject('```json\n' + JSON.stringify(generated) + '\n```', current);
    expect(result.id).toBe(current.id);
    expect(result.name).toBe('圆的故事');
    expect(result.actions).toEqual(current.actions);
    expect(result.workspace).toBeUndefined();
  });
  it('rejects nested executable model output before it reaches the renderer', () => {
    const project = example();
    const sequence = createAction('sequence');
    sequence.children = [createAction('code', { code: 'import os' })];
    project.actions.push(sequence);
    expect(() => parseAIProject(JSON.stringify(project))).toThrow('Python');
  });
  it('rejects unresolved references instead of applying a broken generated project', () => {
    const project = example();
    project.actions.push(createAction('move', { target: '不存在的对象' }));
    expect(() => parseAIProject(JSON.stringify(project))).toThrow('未通过检查');
  });
  it('uses the real catalogue and excludes executable blocks and Blockly metadata', () => {
    const project = { ...example(), workspace: { privateLayoutMarker: 123 } };
    const prompt = buildPrompt(project, '保持其他步骤不变，把圆改成绿色');
    expect(prompt).toContain('保持其他步骤不变，把圆改成绿色');
    expect(prompt).toContain('"type":"circle"');
    expect(prompt).not.toContain('"type":"code"');
    expect(prompt).not.toContain('privateLayoutMarker');
    expect(prompt).toContain(project.id);
  });
  it('rejects prose and malformed JSON without attempting evaluation', () => {
    expect(() => parseAIProject('Here is JavaScript: alert(1)')).toThrow('JSON');
    expect(() => buildPrompt(example(), '   ')).toThrow('先描述');
  });
});
