import { describe, expect, it } from 'vitest';
import { createAction } from './core/catalog';
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

  it('computes adaptive slider bounds for small and large tracker values', () => {
    expect(sliderBoundsForValue(0)).toEqual({ min: -10, max: 10, step: 0.1 });
    expect(sliderBoundsForValue(-7.5)).toEqual({ min: -10, max: 10, step: 0.1 });
    expect(sliderBoundsForValue(24)).toEqual({ min: -30, max: 30, step: 0.5 });
  });
});
