import { describe, it, expect } from 'vitest';
import {
  RIEMANN_PRESETS,
  computeRiemannSum,
  computeExactDefiniteIntegral,
  generateRiemannPythonCode,
  createRiemannActions,
  type RiemannPreset,
} from './riemann';
import { createEmptyProject } from './core/project';

describe('riemann calculus engine', () => {
  it('has valid mathematical presets', () => {
    expect(RIEMANN_PRESETS.length).toBeGreaterThanOrEqual(5);
    const parabola = RIEMANN_PRESETS.find(p => p.id === 'parabola');
    expect(parabola).toBeDefined();
    expect(parabola?.fn(0)).toBe(0);
    expect(parabola?.fn(2)).toBe(4);
  });

  it('computes exact analytical/numerical definite integral with high precision', () => {
    // \int_0^3 x^2 dx = [x^3/3]_0^3 = 27/3 = 9.0
    const parabola = RIEMANN_PRESETS.find(p => p.id === 'parabola')!;
    const exact = computeExactDefiniteIntegral(parabola.fn, 0, 3);
    expect(Math.abs(exact - 9.0)).toBeLessThan(1e-4);

    // \int_{-2}^2 (4 - x^2) dx = [4x - x^3/3]_{-2}^2 = (8 - 8/3) - (-8 + 8/3) = 16 - 16/3 = 32/3 = 10.6667
    const inverted = RIEMANN_PRESETS.find(p => p.id === 'inverted-parabola')!;
    const exactInv = computeExactDefiniteIntegral(inverted.fn, -2, 2);
    expect(Math.abs(exactInv - 32 / 3)).toBeLessThan(1e-4);
  });

  it('computes Riemann sums for left, right, midpoint and trapezoid modes', () => {
    const parabola = RIEMANN_PRESETS.find(p => p.id === 'parabola')!;
    const a = 0;
    const b = 3;
    const n = 30; // Delta x = 0.1

    const left = computeRiemannSum(parabola.fn, a, b, n, 'left');
    const right = computeRiemannSum(parabola.fn, a, b, n, 'right');
    const mid = computeRiemannSum(parabola.fn, a, b, n, 'mid');
    const trap = computeRiemannSum(parabola.fn, a, b, n, 'trapezoid');

    expect(left.rectangles.length).toBe(30);
    expect(left.dx).toBeCloseTo(0.1, 4);

    // For increasing function on [0, 3], left sum < mid sum < exact (9) < right sum
    expect(left.sum).toBeLessThan(9.0);
    expect(right.sum).toBeGreaterThan(9.0);
    expect(Math.abs(mid.sum - 9.0)).toBeLessThan(Math.abs(left.sum - 9.0));
    expect(Math.abs(trap.sum - 9.0)).toBeLessThan(Math.abs(left.sum - 9.0));

    // Midpoint approximation error is small for n=30
    expect(mid.error).toBeLessThan(0.01);
  });

  it('generates valid standalone Manim CE Python code for Riemann rectangles', () => {
    const parabola = RIEMANN_PRESETS.find(p => p.id === 'parabola')!;
    const code = generateRiemannPythonCode(parabola, 0, 3, 20, 'mid');
    expect(code).toContain('class AnyVisScene(MovingCameraScene):');
    expect(code).toContain('Axes(');
    expect(code).toContain('Polygon');
    expect(code).toContain('coords_to_point');
    expect(code).toContain('Create(');
  });

  it('creates AnyVis project actions for axes, curve and riemann area', () => {
    const project = createEmptyProject();
    const parabola = RIEMANN_PRESETS.find(p => p.id === 'parabola')!;
    const { project: nextProject, actionIds } = createRiemannActions(project, parabola, 0, 3, 20, 'mid');

    expect(actionIds.length).toBeGreaterThanOrEqual(3);
    const flattened = nextProject.actions;
    expect(flattened.some(a => String(a.fields.name || '').includes('坐标系'))).toBe(true);
    expect(flattened.some(a => String(a.fields.name || '').includes('原函数'))).toBe(true);
  });
});
