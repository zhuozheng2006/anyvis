import { compileProject } from './core/compiler.ts';
import { describe, it, expect } from 'vitest';
import {
  cAdd,
  cMul,
  cDiv,
  cExp,
  cInv,
  cAbs,
  COMPLEX_PRESETS,
  generateMorphedGrid,
  probeComplexMapping,
  generateComplexMappingPythonCode,
  createComplexMappingActions,
} from './complex-mapping';
import type { Project } from './core/types';

describe('complex-mapping core math and conformal transformations', () => {
  it('correctly calculates complex arithmetic operations', () => {
    const a = { re: 1, im: 2 };
    const b = { re: 3, im: 4 };

    // a + b = (4, 6)
    expect(cAdd(a, b)).toEqual({ re: 4, im: 6 });

    // a * b = (1*3 - 2*4, 1*4 + 2*3) = (-5, 10)
    expect(cMul(a, b)).toEqual({ re: -5, im: 10 });

    // a / b
    const div = cDiv(a, b);
    expect(div.re).toBeCloseTo(11 / 25, 4);
    expect(div.im).toBeCloseTo(2 / 25, 4);

    // cInv(1 + 0i) = 1, cInv(0 + 1i) = -i
    expect(cInv({ re: 0, im: 1 })).toEqual({ re: 0, im: -1 });

    // cExp(0 + i * pi) = -1 + 0i (Euler's identity)
    const euler = cExp({ re: 0, im: Math.PI });
    expect(euler.re).toBeCloseTo(-1, 4);
    expect(euler.im).toBeCloseTo(0, 4);
  });

  it('provides all 6 mathematical presets with valid conformal mapping', () => {
    expect(COMPLEX_PRESETS).toHaveLength(6);
    for (const preset of COMPLEX_PRESETS) {
      const z = { re: 1, im: 0.5 };
      const w = preset.map(z);
      expect(Number.isFinite(w.re)).toBe(true);
      expect(Number.isFinite(w.im)).toBe(true);
    }
  });

  it('correctly computes local derivative, magnification, and rotation for f(z) = z²', () => {
    const squarePreset = COMPLEX_PRESETS.find((p) => p.id === 'square')!;
    const z0 = { re: 1, im: 1 }; // 1 + i
    const result = probeComplexMapping(z0, squarePreset);

    // w0 = (1+i)^2 = 2i -> re = 0, im = 2
    expect(result.w0.re).toBeCloseTo(0, 4);
    expect(result.w0.im).toBeCloseTo(2, 4);

    // f'(z) = 2z = 2 + 2i
    expect(result.fPrime.re).toBeCloseTo(2, 2);
    expect(result.fPrime.im).toBeCloseTo(2, 2);

    // Magnification |f'(z)| = sqrt(8) ≈ 2.828
    expect(result.magnification).toBeCloseTo(Math.sqrt(8), 2);

    // Rotation arg(2+2i) = 45 degrees
    expect(result.rotationDeg).toBeCloseTo(45, 1);
  });

  it('generates morphed grid lines interpolating from t=0 (Cartesian) to t=1 (Transformed)', () => {
    const expPreset = COMPLEX_PRESETS.find((p) => p.id === 'exp')!;
    const bounds = { min: -1, max: 1 };

    // At t = 0 (identity)
    const grid0 = generateMorphedGrid(expPreset, bounds, 1.0, 0.0, 10);
    expect(grid0.length).toBeGreaterThan(0);
    // Line x = 0 should have x = 0 for all points
    const lineX0 = grid0.find((l) => l.type === 'real' && Math.abs(l.constantVal) < 1e-4);
    expect(lineX0).toBeDefined();
    for (const pt of lineX0!.points) {
      expect(pt.x).toBeCloseTo(0, 3);
    }

    // At t = 1 (fully warped)
    const grid1 = generateMorphedGrid(expPreset, bounds, 1.0, 1.0, 10);
    const warpedLineX0 = grid1.find((l) => l.type === 'real' && Math.abs(l.constantVal) < 1e-4);
    expect(warpedLineX0).toBeDefined();
    // For x = 0, e^z = e^{iy} has magnitude 1 (a unit circle), so x^2 + y^2 = 1
    for (const pt of warpedLineX0!.points) {
      expect(Math.sqrt(pt.x * pt.x + pt.y * pt.y)).toBeCloseTo(1, 3);
    }
  });

  it('generates runnable Manim CE Python code for complex plane and apply_complex_function', () => {
    const squarePreset = COMPLEX_PRESETS.find((p) => p.id === 'square')!;
    const code = generateComplexMappingPythonCode(squarePreset, { min: -2, max: 2 });

    expect(code).toContain('from manim import *');
    expect(code).toContain('set_points_as_corners');
    expect(code).toContain('Transform(');
  });

  it('injects complex mapping actions into project without mutating original project', () => {
    const dummyProject: Project = {
      schemaVersion: 2,
      id: 'proj_cp_test',
      name: 'Test CP',
      scene: { dimension: '2d', background: '#000000', width: 1920, height: 1080, fps: 60 },
      actions: [],
    };
    const squarePreset = COMPLEX_PRESETS.find((p) => p.id === 'square')!;
    const { project: nextProject, actionIds } = createComplexMappingActions(
      dummyProject,
      squarePreset,
      squarePreset.defaultBounds,
    );

    expect(dummyProject.actions).toHaveLength(0);
    expect(compileProject(nextProject).diagnostics).toEqual([]);
    expect(actionIds).toHaveLength(nextProject.actions.length);
  });
});
