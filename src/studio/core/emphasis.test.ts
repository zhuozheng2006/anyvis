import { describe, expect, it } from 'vitest';
import { createAction } from './catalog.ts';
import { compileProject } from './compiler.ts';
import { createEmptyProject } from './project.ts';

describe('temporary emphasis', () => {
  it.each(['smooth', 'linear', 'ease_in_sine', 'ease_out_sine'])('keeps Indicate reversible with %s pacing', easing => {
    const result = compileProject({ ...createEmptyProject(), actions: [
      createAction('circle', { name: '圆', appear: 'none' }),
      createAction('indicate', { target: '圆', duration: 1.5, easing }),
    ] });
    expect(result.diagnostics).toEqual([]);
    expect(result.code).toContain(`Indicate(objects["圆"], run_time=1.5, rate_func=lambda t: rate_functions.there_and_back(rate_functions.${easing}(t)))`);
    expect(result.duration).toBe(1.5);
  });

  it('uses an already round-trip rhythm directly instead of applying it twice', () => {
    const result = compileProject({ ...createEmptyProject(), actions: [
      createAction('circle', { name: '圆', appear: 'none' }),
      createAction('indicate', { target: '圆', easing: 'there_and_back' }),
    ] });
    expect(result.code).toContain('Indicate(objects["圆"], run_time=1, rate_func=rate_functions.there_and_back)');
    expect(result.code).not.toContain('lambda t: rate_functions.there_and_back');
  });
});
