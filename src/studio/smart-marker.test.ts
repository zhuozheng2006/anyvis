import { describe, it, expect } from 'vitest';
import { generateSmartMarkers } from './smart-marker';
import type { Project } from './core/types';
import { createAction } from './core/catalog';
import { createEmptyProject } from './core/project';

describe('smart-marker', () => {
  const baseProject: Project = {
    ...createEmptyProject(),
    name: '测试工程',
    scene: {
      ...createEmptyProject().scene,
      width: 1920,
      height: 1080,
      fps: 30,
      background: '#000000',
      markers: [
        { id: 'm1', time: 1.0, label: '旧标记 1', color: '#fbbf24' }
      ]
    },
    actions: [
      createAction('circle', { name: '圆', duration: 2.0 }),
      createAction('wait', { duration: 1.5 }),
      createAction('square', { name: '方', duration: 2.5 })
    ]
  };

  it('generates speech phrase cadence markers', () => {
    const markers = generateSmartMarkers(baseProject, {
      mode: 'speech',
      cadenceSeconds: 2.0,
      labelPrefix: '句',
      replaceExisting: true,
      color: '#38bdf8'
    });

    expect(markers.length).toBeGreaterThanOrEqual(3);
    expect(markers[0].time).toBe(2.0);
    expect(markers[0].label).toBe('句 1');
    expect(markers[0].color).toBe('#38bdf8');
  });

  it('generates musical beat markers aligned to BPM', () => {
    const markers = generateSmartMarkers(baseProject, {
      mode: 'beat',
      bpm: 60, // 1.0s interval
      labelPrefix: '拍',
      replaceExisting: true
    });

    expect(markers.length).toBeGreaterThanOrEqual(6);
    expect(markers[0].time).toBe(1.0);
    expect(markers[1].time).toBe(2.0);
    expect(markers[0].label).toBe('拍 1');
  });

  it('generates visual scene cut markers from project actions', () => {
    const markers = generateSmartMarkers(baseProject, {
      mode: 'cuts',
      labelPrefix: '镜头',
      replaceExisting: true
    });

    expect(markers.length).toBe(3);
    expect(markers[0].time).toBe(0);
    expect(markers[0].label).toContain('圆');
    expect(markers[1].time).toBe(2.0);
    expect(markers[2].time).toBe(3.5);
  });

  it('preserves existing markers when replaceExisting is false', () => {
    const markers = generateSmartMarkers(baseProject, {
      mode: 'interval',
      cadenceSeconds: 3.0,
      replaceExisting: false
    });

    const hasOriginal = markers.some(m => m.id === 'm1');
    expect(hasOriginal).toBe(true);
  });
});

 it('uses parallel and repeat timing, ignores unused source audio, and stops at unknown time', () => {
  const group = createAction('parallel'); group.children = [createAction('wait', { duration: 2 }), createAction('wait', { duration: 4 })];
  const repeat = createAction('repeat', { count: 3 }); repeat.children = [createAction('wait', { duration: 2 })];
  const p = { ...createEmptyProject(), actions: [createAction('circle', { appear: 'none' }), group, repeat, createAction('code'), createAction('wait')] };
  expect(generateSmartMarkers(p, { mode: 'cuts', replaceExisting: true }).map(m => m.time)).toEqual([0, 4, 10]);
  expect(generateSmartMarkers(p, { mode: 'interval', cadenceSeconds: 2, replaceExisting: true }).map(m => m.time)).toEqual([2, 4, 6, 8, 10]);
});
