import { describe, expect, it } from 'vitest';
import { createAction } from './core/catalog';
import { compileProject } from './core/compiler';
import { RESERVED_SYMBOLS } from './core/expression';
import { createEmptyProject } from './core/project';
import { appendAction } from './authoring';
import { extractTrackers, sliderBoundsForValue, suggestNextTrackerName } from './TrackerControlBar';

describe('TrackerControlBar helpers', () => {
  it('extracts ValueTracker actions and counts their linked animate_value steps', () => {
    const tA = createAction('tracker', { name: 'a', value: 1.5 });
    const tK = createAction('tracker', { name: 'k', value: -2 });
    const anim1 = createAction('animate_value', { target: 'a', value: 4, duration: 1 });
    const anim2 = createAction('animate_value', { target: 'a', value: 8, duration: 1 });
    const circle = createAction('circle', { name: '圆' });

    const summaries = extractTrackers([tA, circle, anim1, tK, anim2]);
    expect(summaries).toHaveLength(2);
    expect(summaries[0]).toMatchObject({
      name: 'a',
      value: 1.5,
      animationCount: 2,
      latestTargetValue: 8,
    });
    expect(summaries[1]).toMatchObject({
      name: 'k',
      value: -2,
      animationCount: 0,
      latestTargetValue: null,
    });
  });

  it('suggests the next unused mathematical parameter name', () => {
    expect(suggestNextTrackerName([])).toBe('a');
    const used = [
      createAction('tracker', { name: 'a' }),
      createAction('tracker', { name: 'b' }),
    ];
    expect(suggestNextTrackerName(used)).toBe('k');
  });

  it('keeps repeated parameter creation valid after exhausting the preferred names', () => {
    let project = createEmptyProject();
    const names: string[] = [];
    for (let index = 0; index < 15; index++) {
      const name = suggestNextTrackerName(project.actions);
      project = appendAction(project, 'tracker', { name, value: index }).project;
      names.push(name);
    }
    expect(new Set(names).size).toBe(names.length);
    expect(names.every(name => /^[A-Za-z][A-Za-z_0-9]{0,30}$/.test(name) && !RESERVED_SYMBOLS.has(name))).toBe(true);
    expect(compileProject(project).diagnostics).toEqual([]);
  });

  it('skips occupied fallback suffixes across parameters and other objects', () => {
    let project = { ...createEmptyProject(), actions: [
      ...['a', 'b', 'k', 'm', 'n', 'r', 'w', 'k_1', 'k_2'].map(name => createAction('tracker', { name })),
      createAction('circle', { name: 'k_3' }),
    ] };
    const name = suggestNextTrackerName(project.actions);
    expect(name).toBe('k_4');
    project = appendAction(project, 'tracker', { name, value: 1 }).project;
    expect(suggestNextTrackerName(project.actions)).toBe('k_5');
    expect(compileProject(project).diagnostics).toEqual([]);
  });

  it('computes adaptive slider bounds for small and large tracker values', () => {
    expect(sliderBoundsForValue(0)).toEqual({ min: -10, max: 10, step: 0.1 });
    expect(sliderBoundsForValue(-7.5)).toEqual({ min: -10, max: 10, step: 0.1 });
    expect(sliderBoundsForValue(24)).toEqual({ min: -30, max: 30, step: 0.5 });
  });
});
