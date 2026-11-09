import { compileProject } from './core/compiler.ts';
import { describe, it, expect } from 'vitest';
import {
  POLAR_PARAMETRIC_PRESETS,
  sampleCurve,
  generatePolarParametricPythonCode,
  createPolarParametricActions,
} from './polar-parametric';
import type { Project } from './core/types';

describe('polar-parametric', () => {
  it('samples cardioid curve and verifies points and continuity', () => {
    const cardioidPreset = POLAR_PARAMETRIC_PRESETS.find((p) => p.id === 'cardioid')!;
    expect(cardioidPreset).toBeDefined();

    const sample = sampleCurve(cardioidPreset, { a: 1.5 }, 1.0, 100);
    expect(sample.fullPoints.length).toBe(101);
    expect(sample.currentPoints.length).toBe(101);
    expect(sample.arcLength).toBeGreaterThan(0);
    // At theta = 0, r = 1.5 * (1 - 1) = 0 -> (0, 0)
    expect(sample.fullPoints[0][0]).toBeCloseTo(0, 4);
    expect(sample.fullPoints[0][1]).toBeCloseTo(0, 4);

    // Tangent vector should be normalized unit vector
    const [tx, ty] = sample.tangent;
    const mag = Math.sqrt(tx * tx + ty * ty);
    expect(mag).toBeCloseTo(1.0, 3);
  });

  it('samples partial trace with progressFraction < 1.0', () => {
    const rosePreset = POLAR_PARAMETRIC_PRESETS.find((p) => p.id === 'rose_curve')!;
    const halfSample = sampleCurve(rosePreset, { a: 2.0, k: 4 }, 0.5, 100);

    expect(halfSample.fullPoints.length).toBe(101);
    expect(halfSample.currentPoints.length).toBeLessThan(100);
    expect(halfSample.arcLength).toBeGreaterThan(0);
  });

  it('samples lissajous harmonic motion correctly', () => {
    const lissajousPreset = POLAR_PARAMETRIC_PRESETS.find((p) => p.id === 'lissajous')!;
    const sample = sampleCurve(lissajousPreset, { a: 3, b: 4, delta: 0.5 }, 1.0, 100);

    expect(sample.fullPoints.length).toBe(101);
    // Bounds should not explode
    sample.fullPoints.forEach(([x, y]) => {
      expect(Math.abs(x)).toBeLessThanOrEqual(2.5);
      expect(Math.abs(y)).toBeLessThanOrEqual(2.5);
    });
  });

  it('generates runnable Manim CE Python code for presets', () => {
    const cardioidPreset = POLAR_PARAMETRIC_PRESETS.find((p) => p.id === 'cardioid')!;
    const cardCode = generatePolarParametricPythonCode(cardioidPreset, { a: 1.5 });
    expect(cardCode).toContain('class ParametricCurveScene(MovingCameraScene):');
    expect(cardCode).toContain('from manim import *');
    expect(cardCode).toContain('np.cos');
    expect(cardCode).toContain('ParametricFunction');

    const lissPreset = POLAR_PARAMETRIC_PRESETS.find((p) => p.id === 'lissajous')!;
    const lissCode = generatePolarParametricPythonCode(lissPreset, { a: 3, b: 4, delta: 0.5 });
    expect(lissCode).toContain('class ParametricCurveScene(MovingCameraScene):');
    expect(lissCode).toContain('np.sin');
  });

  it('creates project actions for polar/parametric curves', () => {
    const initialProject: Project = {
      schemaVersion: 2,
      id: 'proj_polar_test',
      name: 'Polar Test',
      scene: { dimension: '2d', background: '#000000', width: 1920, height: 1080, fps: 60 },
      actions: [],
    };

    const preset = POLAR_PARAMETRIC_PRESETS[0];
    const result = createPolarParametricActions(initialProject, preset, {});

    expect(result.actionIds.length).toBe(1);
    expect(compileProject(result.project).diagnostics).toEqual([]);
    expect(result.project.actions[0].type).toBe('parametric_curve');
    expect(result.project.actions[0].fields.tMax).toBe(preset.tRange[1]);
  });
});
