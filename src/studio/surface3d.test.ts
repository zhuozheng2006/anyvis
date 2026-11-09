import { compileProject } from './core/compiler.ts';
import { describe, it, expect } from 'vitest';
import {
  SURFACE_PRESETS,
  project3DToScreen,
  generateProjectedMesh,
  generateSurfacePythonCode,
  createSurfaceActions,
  getSurfaceColor,
} from './surface3d';
import type { Project } from './core/types';

describe('surface3d math, projection, and Manim code generator', () => {
  it('provides all 7 mathematical presets with finite 3D coordinates', () => {
    expect(SURFACE_PRESETS).toHaveLength(7);
    for (const preset of SURFACE_PRESETS) {
      const [uMid, vMid] = [
        (preset.uRange[0] + preset.uRange[1]) / 2,
        (preset.vRange[0] + preset.vRange[1]) / 2,
      ];
      const [x, y, z] = preset.func(uMid, vMid);
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
      expect(Number.isFinite(z)).toBe(true);
    }
  });

  it('projects 3D origin to center of viewport regardless of camera orientation', () => {
    const camera = { phi: 65, theta: -40, distance: 5.0, scale: 1.0 };
    const { screenPoint, cameraZ } = project3DToScreen([0, 0, 0], camera, 600, 400);

    expect(screenPoint[0]).toBeCloseTo(300, 1);
    expect(screenPoint[1]).toBeCloseTo(200, 1);
    expect(cameraZ).toBeCloseTo(5.0, 1);
  });

  it('generates projected mesh sorted by depthZ for Painter algorithm', () => {
    const saddle = SURFACE_PRESETS.find((p) => p.id === 'saddle')!;
    const camera = { phi: 70, theta: 45, distance: 4.5, scale: 1.0 };
    const faces = generateProjectedMesh(saddle, camera, 600, 400);

    expect(faces.length).toBe(saddle.uResolution * saddle.vResolution);
    // Verify descending order of depthZ
    for (let i = 0; i < faces.length - 1; i++) {
      expect(faces[i].depthZ).toBeGreaterThanOrEqual(faces[i + 1].depthZ);
    }
    // Verify valid SVG polygon coordinates
    expect(faces[0].screenPoints).toHaveLength(4);
    expect(faces[0].fillColor).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('computes color gradient based on normalized z height', () => {
    const low = getSurfaceColor(0.0);
    const mid = getSurfaceColor(0.5);
    const high = getSurfaceColor(1.0);

    expect(low.fill).toBe('#38bdf8');
    expect(mid.fill).toBe('#9dbc8f');
    expect(high.fill).toBe('#fc6255');
  });

  it('generates runnable Manim CE Python code for ThreeDScene', () => {
    const torus = SURFACE_PRESETS.find((p) => p.id === 'torus')!;
    const camera = { phi: 75, theta: -30, distance: 5.0, scale: 1.0 };
    const code = generateSurfacePythonCode(torus, camera, true);

    expect(code).toContain('class ParametricSurfaceScene(ThreeDScene):');
    expect(code).toContain('self.set_camera_orientation(phi=75*DEGREES, theta=-30*DEGREES');
    expect(code).toContain(' = Surface(');
    expect(code).toContain('self.begin_ambient_camera_rotation(rate=0.25)');
  });

  it('creates surface actions and sets scene dimension to 3d', () => {
    const dummyProject: Project = {
      schemaVersion: 2,
      id: 'proj_3d_test',
      name: '3D Test',
      scene: { dimension: '2d', background: '#000000', width: 1920, height: 1080, fps: 60 },
      actions: [],
    };
    const saddle = SURFACE_PRESETS.find((p) => p.id === 'saddle')!;
    const { project: nextProject, actionIds } = createSurfaceActions(dummyProject, saddle);

    expect(dummyProject.scene.dimension).toBe('2d');
    expect(nextProject.scene.dimension).toBe('3d');
    expect(compileProject(nextProject).diagnostics).toEqual([]);
    expect(actionIds).toHaveLength(nextProject.actions.length);
  });
});
