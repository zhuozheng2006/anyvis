import { describe, it, expect } from 'vitest';
import {
  magnitude3D,
  add3D,
  dot3D,
  cross3D,
  angle3D,
  project3D,
  project3DTo2D,
  generateVector3DManimCode,
  createVector3DActions,
  VECTOR3D_PRESETS,
} from './vector3d';
import { createEmptyProject } from './core/project';

describe('vector3d mathematical engine', () => {
  const u = { x: 1, y: 0, z: 0 };
  const v = { x: 0, y: 1, z: 0 };

  it('computes magnitude correctly', () => {
    expect(magnitude3D({ x: 3, y: 4, z: 0 })).toBe(5);
    expect(magnitude3D({ x: 1, y: 2, z: 2 })).toBe(3);
  });

  it('computes vector addition u + v', () => {
    const sum = add3D(u, v);
    expect(sum).toEqual({ x: 1, y: 1, z: 0 });
  });

  it('computes dot product u . v and orthogonality', () => {
    expect(dot3D(u, v)).toBe(0); // Orthogonal basis
    expect(dot3D({ x: 1, y: 2, z: 3 }, { x: 4, y: -5, z: 6 })).toBe(1 * 4 + 2 * -5 + 3 * 6); // 4 - 10 + 18 = 12
  });

  it('computes cross product u x v = w (right-hand rule)', () => {
    // i x j = k
    const cross = cross3D(u, v);
    expect(cross).toEqual({ x: 0, y: 0, z: 1 });

    // j x i = -k
    const crossRev = cross3D(v, u);
    expect(crossRev).toEqual({ x: 0, y: 0, z: -1 });

    // Parallel vectors have cross product zero
    expect(cross3D({ x: 2, y: 4, z: 6 }, { x: 1, y: 2, z: 3 })).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('computes angle between vectors', () => {
    const ang = angle3D(u, v);
    expect(ang.degrees).toBeCloseTo(90, 3);
    expect(ang.radians).toBeCloseTo(Math.PI / 2, 3);

    const parallelAng = angle3D(u, { x: 2, y: 0, z: 0 });
    expect(parallelAng.degrees).toBeCloseTo(0, 3);
  });

  it('computes projection of u onto v', () => {
    const proj = project3D({ x: 3, y: 4, z: 0 }, { x: 2, y: 0, z: 0 });
    expect(proj).toEqual({ x: 3, y: 0, z: 0 });
  });

  it('projects 3D points to 2D coordinates with orbit rotation', () => {
    const pt = project3DTo2D({ x: 1, y: 1, z: 1 }, 45, 30, 20, 100, 100);
    expect(typeof pt.x).toBe('number');
    expect(typeof pt.y).toBe('number');
    expect(typeof pt.depth).toBe('number');
  });

  it('generates valid Manim Python code for add, dot, and cross', () => {
    const codeAdd = generateVector3DManimCode(u, v, 'add');
    expect(codeAdd).toContain('ThreeDScene');
    expect(codeAdd).toContain('Arrow3D');
    expect(codeAdd).toContain('结果向量');

    const codeDot = generateVector3DManimCode(u, v, 'dot');
    expect(codeDot).toContain('投影');
    expect(codeDot).toContain('u · v');

    const codeCross = generateVector3DManimCode(u, v, 'cross');
    expect(codeCross).toContain('结果向量');
    expect(codeCross).toContain('Polygon');
    expect(codeCross).toContain('u × v');
  });

  it('generates AnyVis project actions and configures 3D dimension', () => {
    const initial = createEmptyProject();
    const { project, actionCount } = createVector3DActions(initial, u, v, 'cross');
    expect(project.scene.dimension).toBe('3d');
    expect(actionCount).toBeGreaterThan(5);
    expect(project.actions.some(a => a.type === 'three_axes')).toBe(true);
    expect(project.actions.some(a => String(a.fields.name).startsWith('向量u'))).toBe(true);
  });

  it('has presets defined properly', () => {
    expect(VECTOR3D_PRESETS.length).toBeGreaterThanOrEqual(5);
    for (const p of VECTOR3D_PRESETS) {
      expect(p.name).toBeTruthy();
      expect(p.u).toBeDefined();
      expect(p.v).toBeDefined();
    }
  });
});

it('exports the selected orbit orientation instead of a fixed camera', () => {
  const p = createVector3DActions(createEmptyProject(), { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, 'cross', { azimuth: 80, elevation: 40 }).project;
  expect(p.actions[0].fields).toMatchObject({ phi: 50, theta: -170, duration: 0 });
});
