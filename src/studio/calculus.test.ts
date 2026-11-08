import { describe, it, expect } from 'vitest';
import {
  CALCULUS_PRESETS,
  computeDerivative,
  computeSecantSlope,
  generateCalculusPythonCode,
  createCalculusActions,
} from './calculus';
import { createEmptyProject } from './core/project';

describe('calculus mathematical engine', () => {
  it('computes exact numerical derivative matching symbolic derivative', () => {
    for (const preset of CALCULUS_PRESETS) {
      const testX = preset.defaultX;
      const numDeriv = computeDerivative(preset.fn, testX);
      const symDeriv = preset.derivativeFn(testX);

      expect(numDeriv).toBeCloseTo(symDeriv, 3);
    }
  });

  it('verifies secant slope converges to tangent slope as dx -> 0', () => {
    const quad = CALCULUS_PRESETS.find(p => p.id === 'quadratic')!;
    const x0 = 1.5;
    const trueSlope = quad.derivativeFn(x0); // 2 * 1.5 = 3.0

    const slopeDx1 = computeSecantSlope(quad.fn, x0, 1.0); // (2.5^2 - 1.5^2)/1 = (6.25 - 2.25)/1 = 4.0
    expect(slopeDx1).toBeCloseTo(4.0, 4);

    const slopeDx01 = computeSecantSlope(quad.fn, x0, 0.1);
    expect(slopeDx01).toBeCloseTo(3.1, 4);

    const slopeDx001 = computeSecantSlope(quad.fn, x0, 0.001);
    expect(slopeDx001).toBeCloseTo(3.001, 3);

    const slopeDxTiny = computeSecantSlope(quad.fn, x0, 1e-6);
    expect(slopeDxTiny).toBeCloseTo(trueSlope, 4);
  });

  it('generates valid Python Manim CE code and AnyVis project actions', () => {
    const sinPreset = CALCULUS_PRESETS.find(p => p.id === 'sine')!;
    const py = generateCalculusPythonCode(sinPreset, 1.0, 0.8);

    expect(py).toContain('class CalculusTangentScene(Scene):');
    expect(py).toContain('Axes(');
    expect(py).toContain('always_redraw');
    expect(py).toContain('get_secant_slope_group');

    const p0 = createEmptyProject();
    const { project, actionIds } = createCalculusActions(p0, sinPreset, '正弦');

    expect(project.actions.length).toBe(3);
    expect(actionIds.length).toBe(3);
    expect(project.actions[0].type).toBe('axes');
    expect(project.actions[1].type).toBe('function_plot');
    expect(project.actions[2].type).toBe('function_plot');
    expect(project.actions[1].fields.name).toBe('正弦');
    expect(project.actions[2].fields.name).toBe('正弦_导函数');
  });
});
