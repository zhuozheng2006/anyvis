import { compileProject } from './core/compiler.ts';
import { describe, it, expect } from 'vitest';
import {
  VECTOR_FIELD_PRESETS,
  sampleVectorField,
  probeVectorField,
  stepParticles,
  generateVectorFieldPythonCode,
  createVectorFieldActions,
  getMagnitudeColor,
} from './vector-field';
import type { Project } from './core/types';

describe('vector-field core math and generators', () => {
  it('provides all 6 mathematical presets with valid sampling functions', () => {
    expect(VECTOR_FIELD_PRESETS).toHaveLength(6);
    for (const preset of VECTOR_FIELD_PRESETS) {
      const [u, v] = preset.sample(1, 1);
      expect(Number.isFinite(u)).toBe(true);
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('samples vector field over 2D grid and scales colors', () => {
    const preset = VECTOR_FIELD_PRESETS.find((p) => p.id === 'vortex')!;
    const bounds = { xMin: -2, xMax: 2, yMin: -2, yMax: 2 };
    const { samples, maxMagnitude } = sampleVectorField(bounds, 1, preset.sample, '3b1b');

    // Grid: x in {-2, -1, 0, 1, 2} (5) * y in {-2, -1, 0, 1, 2} (5) = 25 samples
    expect(samples.length).toBe(25);
    expect(maxMagnitude).toBeGreaterThan(0);
    expect(samples[0].color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('correctly calculates divergence and curl for rotational vortex (div=0, curl=2)', () => {
    const vortex = VECTOR_FIELD_PRESETS.find((p) => p.id === 'vortex')!;
    const probe = probeVectorField(1.0, 1.5, vortex.sample);

    expect(probe.u).toBeCloseTo(-1.5, 4);
    expect(probe.v).toBeCloseTo(1.0, 4);
    expect(probe.divergence).toBeCloseTo(0, 3);
    expect(probe.curl).toBeCloseTo(2, 3);
  });

  it('correctly calculates divergence and curl for saddle field (div=0, curl=0)', () => {
    const saddle = VECTOR_FIELD_PRESETS.find((p) => p.id === 'saddle')!;
    const probe = probeVectorField(2.0, -1.0, saddle.sample);

    expect(probe.u).toBeCloseTo(2.0, 4);
    expect(probe.v).toBeCloseTo(1.0, 4);
    expect(probe.divergence).toBeCloseTo(0, 3);
    expect(probe.curl).toBeCloseTo(0, 3);
  });

  it('integrates particles with RK4 and respawns out-of-bounds or expired particles', () => {
    const vortex = VECTOR_FIELD_PRESETS.find((p) => p.id === 'vortex')!;
    const bounds = { xMin: -2, xMax: 2, yMin: -2, yMax: 2 };
    const initialParticles = [
      { id: 1, x: 1, y: 0, age: 0, maxAge: 50, trail: [{ x: 1, y: 0 }] },
      { id: 2, x: 999, y: 999, age: 60, maxAge: 50, trail: [] }, // out of bounds / expired
    ];

    const nextParticles = stepParticles(initialParticles, vortex.sample, 0.05, bounds);
    expect(nextParticles).toHaveLength(2);

    // Particle 1 moved counter-clockwise (y should increase, x should slightly decrease or remain ~1)
    expect(nextParticles[0].age).toBe(1);
    expect(nextParticles[0].y).toBeGreaterThan(0);
    expect(nextParticles[0].trail.length).toBe(2);

    // Particle 2 respawned inside bounds
    expect(nextParticles[1].age).toBe(0);
    expect(nextParticles[1].x).toBeGreaterThanOrEqual(bounds.xMin);
    expect(nextParticles[1].x).toBeLessThanOrEqual(bounds.xMax);
  });

  it('generates standalone Python Manim CE code for ArrowVectorField and StreamLines', () => {
    const dipole = VECTOR_FIELD_PRESETS.find((p) => p.id === 'dipole')!;
    const bounds = { xMin: -3, xMax: 3, yMin: -2, yMax: 2 };

    const arrowCode = generateVectorFieldPythonCode(dipole, bounds, 'arrows');
    expect(arrowCode).toContain('from manim import *');
    expect(arrowCode).toContain('Arrow(');
    expect(arrowCode).toContain('class VectorFieldScene(MovingCameraScene):');

    const streamCode = generateVectorFieldPythonCode(dipole, bounds, 'streamlines');
    expect(streamCode).toContain('set_points_as_corners');
    expect(streamCode).toContain('MoveAlongPath(');
  });

  it('injects vector field actions into project without mutating original project', () => {
    const dummyProject: Project = {
      schemaVersion: 2,
      id: 'proj_test',
      name: 'Test',
      scene: { dimension: '2d', background: '#000000', width: 1920, height: 1080, fps: 60 },
      actions: [],
    };
    const vortex = VECTOR_FIELD_PRESETS.find((p) => p.id === 'vortex')!;
    const { project: nextProject, actionIds } = createVectorFieldActions(dummyProject, vortex, vortex.defaultBounds);

    expect(dummyProject.actions).toHaveLength(0);
    expect(compileProject(nextProject).diagnostics).toEqual([]);
    expect(actionIds).toHaveLength(nextProject.actions.length);
  });
});
