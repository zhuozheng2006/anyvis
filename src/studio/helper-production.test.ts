import { describe, expect, it } from 'vitest';
import { createEmptyProject, validateProject } from './core/project';
import { compileProject } from './core/compiler';
import { createAction } from './core/catalog';
import { getApiEntry } from './core/api-registry';
import { timelineClips } from './authoring';
import { createVector3DActions, VECTOR3D_PRESETS } from './vector3d';
import { createRiemannActions, RIEMANN_PRESETS, type RiemannMode } from './riemann';
import { createColoredMathTexActions, TEX_STYLING_PRESETS } from './tex-color';
import { createCameraDirectorActions, DEFAULT_CAMERA_SHOTS, interpolateCameraPose } from './camera-director';
import { createSubtitleActions } from './subtitles';
import type { Project } from './core/types';

function valid(project: Project, requiresTrust = false) {
  expect(() => validateProject(project)).not.toThrow();
  const compiled = compileProject(validateProject(project));
  expect(compiled.diagnostics).toEqual([]);
  expect(compiled.requiresTrust).toBe(requiresTrust);
  expect(project.workspace).toBeUndefined();
  return compiled;
}

describe('workbench builders use the production catalog and compiler', () => {
  it('validates every vector, Riemann method and colored formula preset, including repeated insertion', () => {
    const original = { ...createEmptyProject(), workspace: { stale: true } };
    for (const preset of VECTOR3D_PRESETS) {
      const result = createVector3DActions(original, preset.u, preset.v, preset.operation).project;
      valid(result);
      valid(createVector3DActions(result, preset.u, preset.v, preset.operation).project);
    }
    for (const preset of RIEMANN_PRESETS) for (const mode of ['left', 'right', 'mid', 'trapezoid'] as RiemannMode[]) {
      const result = createRiemannActions(original, preset, preset.defaultA, preset.defaultB, 10, mode).project;
      valid(result);
      expect(result.actions.filter(a => getApiEntry(a.type)?.path === 'Polygon')).toHaveLength(10);
    }
    for (const preset of TEX_STYLING_PRESETS) {
      const result = createColoredMathTexActions(original, preset.rawTex, preset.defaultColors).project;
      valid(result, true);
      valid(createColoredMathTexActions(result, preset.rawTex, preset.defaultColors).project, true);
    }
    expect(original.actions).toEqual([]);
    expect(original.workspace).toEqual({ stale: true });
  });

  it('retains selected rectangle heights and trapezoid endpoints rather than exporting a second curve', () => {
    const preset = RIEMANN_PRESETS[0];
    for (const [mode, heights] of [['left', [0, 0]], ['right', [1, 1]], ['mid', [0.25, 0.25]], ['trapezoid', [1, 0]]] as const) {
      const result = createRiemannActions(createEmptyProject(), preset, 0, 2, 2, mode).project;
      const polygon = result.actions.find(a => getApiEntry(a.type)?.path === 'Polygon')!;
      const vertices = JSON.parse(String(polygon.fields.p_vertices));
      expect(vertices.slice(2).map((v: { $call: { args: number[] } }) => v.$call.args[1])).toEqual(heights);
      valid(result);
    }
    for (const n of [0, 1.2, 201, NaN]) expect(() => createRiemannActions(createEmptyProject(), preset, 0, 2, n)).toThrow();
    expect(() => createRiemannActions(createEmptyProject(), RIEMANN_PRESETS.find(p => p.id === 'reciprocal')!, -1, 1, 10)).toThrow('奇点');
  });

  it('preserves subtitle gaps, overlaps, millisecond times, exact colors and existing action order', () => {
    const original = { ...createEmptyProject(), actions: [createAction('wait', { duration: 7 })], workspace: { stale: true } };
    const result = createSubtitleActions(original, [
      { id: 'a', startTime: 0.123, endTime: 2.345, text: 'first "caption"\nline 2', color: '#123456', position: 'top' },
      { id: 'b', startTime: 1.111, endTime: 3.456, text: 'overlap', position: 'center' },
    ]).project;
    expect(result.actions[0]).toEqual(original.actions[0]);
    const events = timelineClips(result.actions).filter(c => c.action.type === 'text' || c.action.type === 'remove');
    expect(events.map(c => c.start)).toEqual([7.123, 8.111, 9.345, 10.456]);
    expect(events[0].action.fields).toMatchObject({ color: '#123456', y: 3, text: 'first "caption"\nline 2', appear: 'none' });
    expect(valid(result).duration).toBeCloseTo(10.456, 12);
    expect(() => createSubtitleActions(original, [{ id: 'bad', text: 'bad', startTime: 4, endTime: 2 }])).toThrow();
  });

  it('uses shot arrival times, real easing functions and width-based zoom interpolation', () => {
    const original = { ...createEmptyProject(), actions: [createAction('wait', { duration: 7 })], workspace: { stale: true } };
    const result = createCameraDirectorActions(original, DEFAULT_CAMERA_SHOTS).project;
    expect(result.actions[0]).toEqual(original.actions[0]);
    expect(valid(result).duration).toBe(18);
    const transforms = timelineClips(result.actions).filter(c => getApiEntry(c.action.type)?.path === 'Transform');
    expect(transforms.map(c => [c.start, c.duration])).toEqual([[8, 2], [12, 2], [16.5, 1.5]]);
    const linear = [DEFAULT_CAMERA_SHOTS[0], { ...DEFAULT_CAMERA_SHOTS[1], time: 4, duration: 2, x: 4, y: 0, zoom: 2, rateFunc: 'linear' as const }];
    expect(interpolateCameraPose(linear, 2.5)).toEqual({ x: 1, y: 0, zoom: 1 / 0.875 });
    const square = createEmptyProject(); square.scene.width = square.scene.height;
    const squareActions = createCameraDirectorActions(square, linear).project.actions;
    expect(squareActions.find(a => getApiEntry(a.type)?.path === 'Mobject.scale_to_fit_width')?.fields.p_width).toBe('8');
    expect(() => createCameraDirectorActions({ ...original, scene: { ...original.scene, dimension: '3d' } }, linear)).toThrow('二维');
    expect(() => createCameraDirectorActions(original, [linear[0], { ...linear[1], time: 1 }])).toThrow('重叠');
  });
});
