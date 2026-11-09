import { compileProject } from './core/compiler.ts';
import { describe, it, expect } from 'vitest';
import {
  dist2D,
  computeTriangleCenters,
  getAttachedSquare,
  generateGeometryPythonCode,
  createGeometryActions,
  GEOMETRY_PRESETS,
} from './geometry-euclidean';
import type { Project } from './core/types';

describe('geometry-euclidean', () => {
  it('calculates Euclidean 2D distance correctly', () => {
    expect(dist2D([0, 0], [3, 4])).toBeCloseTo(5.0, 5);
    expect(dist2D([-1, -1], [2, 3])).toBeCloseTo(5.0, 5);
    expect(dist2D([1, 1], [1, 1])).toBe(0);
  });

  it('computes triangle centers and verifies Euler line relation on 3-4-5 right triangle', () => {
    // Vertices of right triangle: C=(0,3), A=(0,0), B=(4,0)
    // sideA = dist(B, C) = 5
    // sideB = dist(A, C) = 3
    // sideC = dist(A, B) = 4
    const A: [number, number] = [0, 0];
    const B: [number, number] = [4, 0];
    const C: [number, number] = [0, 3];

    const centers = computeTriangleCenters(A, B, C);

    expect(centers.sideA).toBeCloseTo(5.0, 4);
    expect(centers.sideB).toBeCloseTo(3.0, 4);
    expect(centers.sideC).toBeCloseTo(4.0, 4);
    expect(centers.area).toBeCloseTo(6.0, 4);
    expect(centers.perimeter).toBeCloseTo(12.0, 4);

    // Incircle: r = S / s = 6 / 6 = 1.0, Incenter = (1, 1)
    expect(centers.inradius).toBeCloseTo(1.0, 4);
    expect(centers.incenter[0]).toBeCloseTo(1.0, 4);
    expect(centers.incenter[1]).toBeCloseTo(1.0, 4);

    // Centroid G = (A + B + C) / 3 = (4/3, 1)
    expect(centers.centroid[0]).toBeCloseTo(4 / 3, 4);
    expect(centers.centroid[1]).toBeCloseTo(1.0, 4);

    // Circumcenter O = midpoint of hypotenuse BC = (2, 1.5), radius R = 2.5
    expect(centers.circumcenter[0]).toBeCloseTo(2.0, 4);
    expect(centers.circumcenter[1]).toBeCloseTo(1.5, 4);
    expect(centers.circumradius).toBeCloseTo(2.5, 4);

    // Orthocenter H = right angle vertex = (0, 0)
    expect(centers.orthocenter[0]).toBeCloseTo(0.0, 4);
    expect(centers.orthocenter[1]).toBeCloseTo(0.0, 4);

    // Euler Line Ratio: |HG| / |GO| = 2.0
    expect(centers.eulerRatio).toBeCloseTo(2.0, 2);
  });

  it('handles degenerate or collinear triangle gracefully', () => {
    const A: [number, number] = [0, 0];
    const B: [number, number] = [1, 1];
    const C: [number, number] = [2, 2];

    const centers = computeTriangleCenters(A, B, C);
    expect(centers.area).toBeCloseTo(0, 4);
    expect(Number.isFinite(centers.centroid[0])).toBe(true);
    expect(Number.isFinite(centers.incenter[0])).toBe(true);
    expect(Number.isFinite(centers.circumcenter[0])).toBe(true);
    expect(Number.isFinite(centers.orthocenter[0])).toBe(true);
  });

  it('computes attached square vertices on an edge', () => {
    const p1: [number, number] = [0, 0];
    const p2: [number, number] = [2, 0];
    const square = getAttachedSquare(p1, p2);

    expect(square).toHaveLength(4);
    expect(square[0]).toEqual([0, 0]);
    expect(square[1]).toEqual([2, 0]);
    // dx = 2, dy = 0, nx = 0, ny = -2
    expect(square[2]).toEqual([2, -2]);
    expect(square[3]).toEqual([0, -2]);
  });

  it('generates runnable Manim CE Python code for presets', () => {
    const eulerPreset = GEOMETRY_PRESETS.find((p) => p.id === 'euler_line')!;
    const eulerCode = generateGeometryPythonCode(eulerPreset, [-2, -1], [2, -1], [0, 2]);
    expect(eulerCode).toContain('class GeometryScene(MovingCameraScene):');
    expect(eulerCode).toContain('from manim import *');
    expect(eulerCode).toContain('外接圆');
    expect(eulerCode).toContain('Text("G"');
    expect(eulerCode).toContain('Text("H"');

    const pythPreset = GEOMETRY_PRESETS.find((p) => p.id === 'pythagoras')!;
    const pythCode = generateGeometryPythonCode(pythPreset, [-2, -1], [2, -1], [0, 2]);
    expect(pythCode).toContain('class GeometryScene(MovingCameraScene):');
    expect(pythCode).toContain('边上正方形');

    const circPreset = GEOMETRY_PRESETS.find((p) => p.id === 'circumcircle')!;
    const circCode = generateGeometryPythonCode(circPreset, [-2, -1], [2, -1], [0, 2]);
    expect(circCode).toContain('class GeometryScene(MovingCameraScene):');
  });

  it('creates geometry actions and appends to project', () => {
    const initialProject: Project = {
      schemaVersion: 2,
      id: 'proj_geo_test',
      name: 'Geo Test',
      scene: { dimension: '2d', background: '#000000', width: 1920, height: 1080, fps: 60 },
      actions: [],
    };

    const preset = GEOMETRY_PRESETS[0];
    const result = createGeometryActions(initialProject, preset, preset.initialA, preset.initialB, preset.initialC);

    expect(result.actionIds.length).toBeGreaterThan(0);
    expect(compileProject(result.project).diagnostics).toEqual([]);
    const titleAction = result.project.actions[0];
    expect(titleAction.type).toMatch(/^api_/);
    expect(result.project.actions.some(a => a.type === 'circle')).toBe(true);
  });
});
