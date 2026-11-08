import { describe, expect, it } from 'vitest';
import { createEmptyProject } from './core/project';
import { createAction } from './core/catalog';
import { computePresentationSteps, findStepIndexAtTime } from './presentation';

describe('presentation mode steps', () => {
  it('computes steps for an empty project safely', () => {
    const project = createEmptyProject();
    const steps = computePresentationSteps(project);
    expect(steps.length).toBe(1);
    expect(steps[0].index).toBe(0);
    expect(steps[0].startTime).toBe(0);
    expect(steps[0].pauseTime).toBe(0);
  });

  it('computes pause checkpoints based on wait blocks', () => {
    const project = createEmptyProject();
    project.actions = [
      createAction('circle', { name: '单位圆', duration: 1.5 }),
      createAction('wait', { duration: 2.0 }),
      createAction('square', { name: '目标正方形', duration: 1.0 }),
      createAction('wait', { duration: 1.5 }),
      createAction('text', { name: '结论文字', text: '总结', duration: 0.8 }),
    ];

    const steps = computePresentationSteps(project);
    expect(steps.length).toBe(3);

    // Step 0: Circle finishes at 1.5s, wait starts at 1.5s
    expect(steps[0].index).toBe(0);
    expect(steps[0].label).toBe('单位圆');
    expect(steps[0].startTime).toBe(0);
    expect(steps[0].pauseTime).toBe(1.5);

    // Step 1: Wait was 1.5s..3.5s. Square runs 3.5s..4.5s. Second wait starts at 4.5s
    expect(steps[1].index).toBe(1);
    expect(steps[1].label).toBe('目标正方形');
    expect(steps[1].startTime).toBe(3.5);
    expect(steps[1].pauseTime).toBe(4.5);

    // Step 2: Final text action after second wait (3.5+1.0+1.5 = 6.0s start)
    expect(steps[2].index).toBe(2);
    expect(steps[2].label).toBe('结论文字');
    expect(steps[2].startTime).toBe(6.0);
    expect(steps[2].pauseTime).toBe(6.8);
  });

  it('computes steps based on sequential actions when no wait blocks exist', () => {
    const project = createEmptyProject();
    project.actions = [
      createAction('circle', { name: '圆', duration: 1.2 }),
      createAction('rotate', { target: '圆', angle: 90, duration: 1.8 }),
    ];

    const steps = computePresentationSteps(project);
    expect(steps.length).toBe(2);
    expect(steps[0].startTime).toBe(0);
    expect(steps[0].pauseTime).toBe(1.2);
    expect(steps[1].startTime).toBe(1.2);
    expect(steps[1].pauseTime).toBe(3.0);
  });

  it('finds correct step index at time', () => {
    const steps = [
      { index: 0, label: 'A', startTime: 0, pauseTime: 1.5 },
      { index: 1, label: 'B', startTime: 3.0, pauseTime: 4.5 },
      { index: 2, label: 'C', startTime: 6.0, pauseTime: 7.0 },
    ];

    expect(findStepIndexAtTime(steps, 0)).toBe(0);
    expect(findStepIndexAtTime(steps, 1.2)).toBe(0);
    expect(findStepIndexAtTime(steps, 3.2)).toBe(1);
    expect(findStepIndexAtTime(steps, 6.5)).toBe(2);
    expect(findStepIndexAtTime(steps, 10.0)).toBe(2);
  });
});
