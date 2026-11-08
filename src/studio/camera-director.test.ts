import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CAMERA_SHOTS,
  getViewfinderBox,
  interpolateCameraPose,
  generateCameraDirectorPythonCode,
  createCameraDirectorActions,
  BASE_FRAME_WIDTH,
  BASE_FRAME_HEIGHT,
  type CameraShot,
} from './camera-director';
import type { Project } from './core/types';

describe('camera-director framing, interpolation, and script generation', () => {
  it('correctly calculates viewfinder boundary box from x, y, and zoom', () => {
    // Normal zoom 1.0 at origin
    const box1 = getViewfinderBox(0, 0, 1.0);
    expect(box1.width).toBeCloseTo(BASE_FRAME_WIDTH, 4);
    expect(box1.height).toBeCloseTo(BASE_FRAME_HEIGHT, 4);
    expect(box1.left).toBeCloseTo(-BASE_FRAME_WIDTH / 2, 4);
    expect(box1.right).toBeCloseTo(BASE_FRAME_WIDTH / 2, 4);

    // Zoom 2.0 at (2, -1) -> box should be halved in size and shifted
    const box2 = getViewfinderBox(2.0, -1.0, 2.0);
    expect(box2.width).toBeCloseTo(BASE_FRAME_WIDTH / 2, 4);
    expect(box2.height).toBeCloseTo(BASE_FRAME_HEIGHT / 2, 4);
    expect(box2.left).toBeCloseTo(2.0 - BASE_FRAME_WIDTH / 4, 4);
    expect(box2.right).toBeCloseTo(2.0 + BASE_FRAME_WIDTH / 4, 4);
  });

  it('interpolates camera pose between shots accurately', () => {
    const shots: CameraShot[] = [
      { id: '1', name: 'S1', time: 0, duration: 1, x: 0, y: 0, zoom: 1.0, rateFunc: 'smooth' },
      { id: '2', name: 'S2', time: 4, duration: 2, x: 10, y: 5, zoom: 2.0, rateFunc: 'smooth' },
    ];

    // At t = 0 -> S1
    const pose0 = interpolateCameraPose(shots, 0);
    expect(pose0.x).toBe(0);
    expect(pose0.zoom).toBe(1.0);

    // Transition runs from t = (4 - 2) = 2 to t = 4
    // At t = 1 (before transition starts) -> S1
    const pose1 = interpolateCameraPose(shots, 1.0);
    expect(pose1.x).toBe(0);

    // At t = 3 (midpoint of transition 2 -> 4) -> smoothstep(0.5) = 0.5
    const poseMid = interpolateCameraPose(shots, 3.0);
    expect(poseMid.x).toBeCloseTo(5.0, 2);
    expect(poseMid.zoom).toBeCloseTo(1.5, 2);

    // At t = 4 -> S2
    const poseEnd = interpolateCameraPose(shots, 4.0);
    expect(poseEnd.x).toBe(10);
    expect(poseEnd.zoom).toBe(2.0);
  });

  it('generates runnable Manim CE Python code for MovingCameraScene', () => {
    const code = generateCameraDirectorPythonCode(DEFAULT_CAMERA_SHOTS);

    expect(code).toContain('class CinematicCameraScene(MovingCameraScene):');
    expect(code).toContain('self.camera.frame.animate.move_to(');
    expect(code).toContain('rate_func=smooth');
  });

  it('creates camera movement actions in project', () => {
    const dummyProject: Project = {
      schemaVersion: 2,
      id: 'p_cam',
      name: 'Cam Test',
      scene: { dimension: '2d', background: '#000', width: 1920, height: 1080, fps: 60 },
      actions: [],
    };

    const { project: nextProject, actionIds } = createCameraDirectorActions(dummyProject, DEFAULT_CAMERA_SHOTS);

    expect(nextProject.actions).toHaveLength(DEFAULT_CAMERA_SHOTS.length);
    expect(actionIds).toHaveLength(DEFAULT_CAMERA_SHOTS.length);
    expect(nextProject.actions[0].type).toBe('camera_move');
  });
});
