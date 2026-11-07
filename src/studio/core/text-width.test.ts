import { describe, expect, it } from 'vitest';
import { createAction } from './catalog.ts';
import { compileProject } from './compiler.ts';
import { createEmptyProject, validateProject } from './project.ts';

describe('optional text width limit', () => {
  it('normalizes older text blocks to an unlimited width without changing generated Python', () => {
    const text = createAction('text', { name: '标题', text: '保留已有作品的字号与宽度' });
    const current = { ...createEmptyProject(), actions: [text] };
    const legacy = structuredClone(current);
    delete legacy.actions[0].fields.maxWidth;
    const normalized = validateProject(legacy);
    expect(normalized.actions[0].fields.maxWidth).toBe(0);
    expect(compileProject(legacy).code).toBe(compileProject(current).code);
    expect(compileProject(current).code).not.toContain('scale_to_fit_width');
  });

  it('shrinks only over-wide text before placement and preserves explicit line breaks', () => {
    const text = createAction('text', { name: '字幕', text: '第一行中文\n第二行中文', maxWidth: 8, x: 1, y: -2 });
    const compiled = compileProject({ ...createEmptyProject(), actions: [text] });
    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.code).toContain('Text("第一行中文\\n第二行中文",');
    expect(compiled.code).toContain('if objects["字幕"].width > 8:\n            objects["字幕"].scale_to_fit_width(8)');
    expect(compiled.code.indexOf('scale_to_fit_width(8)')).toBeLessThan(compiled.code.indexOf('.move_to([1, -2, 0])'));
    const scaleLine = compiled.code.split('\n').findIndex(line => line.includes('scale_to_fit_width(8)')) + 1;
    expect(compiled.sourceMap[scaleLine]).toBe(text.id);
  });

  it('rejects negative and nonfinite width limits', () => {
    for (const maxWidth of [-1, Infinity, NaN]) {
      const project = { ...createEmptyProject(), actions: [createAction('text', { maxWidth })] };
      expect(() => validateProject(project)).toThrow(/最大宽度/);
    }
  });
});
