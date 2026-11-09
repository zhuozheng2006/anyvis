import { compileProject } from './core/compiler.ts';
import { describe, it, expect } from 'vitest';
import {
  computeDft,
  evaluateFourier,
  computeEpicycles,
  computeFourierFidelity,
  getFourierPreset,
  generateFourierPythonCode,
  createFourierActions,
} from './fourier';
import { createEmptyProject } from './core/project';

describe('fourier epicycles mathematical engine', () => {
  it('extracts fundamental harmonic for standard circle', () => {
    const circle = [];
    const N = 120;
    for (let i = 0; i < N; i++) {
      const t = (i / N) * 2 * Math.PI;
      circle.push({ x: 2.0 * Math.cos(t), y: 2.0 * Math.sin(t) });
    }

    const coeffs = computeDft(circle, 10);
    expect(coeffs.length).toBe(21); // -10 to +10

    // Top harmonic should be freq 1 with amplitude ~ 2.0
    const top = coeffs[0];
    expect(top.freq).toBe(1);
    expect(top.amp).toBeCloseTo(2.0, 2);

    // Other harmonics should have negligible amplitude
    for (let i = 1; i < coeffs.length; i++) {
      expect(coeffs[i].amp).toBeLessThan(1e-4);
    }
  });

  it('evaluates epicycles and matches end tip to evaluateFourier', () => {
    const star = getFourierPreset('star', 100);
    const coeffs = computeDft(star, 15);

    for (const t of [0, 0.25, 0.5, 0.73]) {
      const ptEval = evaluateFourier(coeffs, t);
      const epi = computeEpicycles(coeffs, t);

      expect(epi.endTip.x).toBeCloseTo(ptEval.x, 5);
      expect(epi.endTip.y).toBeCloseTo(ptEval.y, 5);
      expect(epi.circles.length).toBe(coeffs.length);
    }
  });

  it('fidelity increases or stays high with presets', () => {
    for (const preset of ['heart', 'trefoil', 'infinity', 'pi'] as const) {
      const pts = getFourierPreset(preset, 150);
      const c10 = computeDft(pts, 10);
      const c25 = computeDft(pts, 25);

      const f10 = computeFourierFidelity(pts, c10);
      const f25 = computeFourierFidelity(pts, c25);

      expect(f10).toBeGreaterThan(70);
      expect(f25).toBeGreaterThanOrEqual(f10 - 0.5);
    }
  });

  it('generates valid Python Manim code and project actions', () => {
    const piPts = getFourierPreset('pi', 100);
    const coeffs = computeDft(piPts, 12);

    const pyCode = generateFourierPythonCode(coeffs, 'Pi');
    expect(pyCode).toContain('class FourierEpicyclesScene(MovingCameraScene):');
    expect(pyCode).toContain('set_points_as_corners');
    expect(pyCode).toContain('rate_functions.linear');

    const p0 = createEmptyProject();
    const { project, actionIds } = createFourierActions(p0, coeffs, '测试傅里叶');

    expect(compileProject(project).diagnostics).toEqual([]);
    expect(actionIds.length).toBe(3);
    expect(String(project.actions[0].type)).toMatch(/^api_/);
    expect(String(project.actions[0].fields.name)).toMatch(/^测试傅里叶_/);
    expect(JSON.parse(String(project.actions[1].fields.p_points))).toHaveLength(241);
  });
});
