import type { Action, Project } from './core/types';
import { createAction } from './core/catalog';
import { compileProject } from './core/compiler';
import { createEmptyProject } from './core/project';
import { appendPlaygroundActions, playgroundApi, playgroundName } from './playground-actions';

export interface CameraShot {
  id: string;
  name: string;
  time: number;
  duration: number;
  x: number;
  y: number;
  zoom: number; // 1.0 = normal, 2.0 = 2x zoom in, 0.5 = 0.5x zoom out
  rateFunc: 'smooth' | 'ease_in_out' | 'linear';
}

export interface ViewfinderBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

export const DEFAULT_CAMERA_SHOTS: CameraShot[] = [
  {
    id: 'shot_1',
    name: '全景概览 (Full View)',
    time: 0,
    duration: 1.5,
    x: 0,
    y: 0,
    zoom: 1.0,
    rateFunc: 'smooth',
  },
  {
    id: 'shot_2',
    name: '聚焦左侧主体 (Focus Left)',
    time: 3.0,
    duration: 2.0,
    x: -2.4,
    y: 0.8,
    zoom: 1.8,
    rateFunc: 'smooth',
  },
  {
    id: 'shot_3',
    name: '平移聚焦右侧 (Pan Right)',
    time: 7.0,
    duration: 2.0,
    x: 2.4,
    y: -0.5,
    zoom: 2.2,
    rateFunc: 'smooth',
  },
  {
    id: 'shot_4',
    name: '回退全景总结 (Return Overview)',
    time: 11.0,
    duration: 1.5,
    x: 0,
    y: 0,
    zoom: 1.0,
    rateFunc: 'smooth',
  },
];

/** Standard Manim 16:9 frame dimensions at zoom=1 */
export const BASE_FRAME_WIDTH = 8 * 16 / 9;
export const BASE_FRAME_HEIGHT = 8.0;

/** Clamps camera zoom into the supported [0.2, 10.0] range, guarding against zero/NaN. */
function clampCameraZoom(zoom: number): number {
  return Math.max(0.2, Math.min(10.0, Number.isFinite(zoom) ? zoom : 1.0));
}

/** Computes the mathematical boundary coordinates of the camera viewfinder box */
export function getViewfinderBox(x: number, y: number, zoom: number, frameWidth = BASE_FRAME_WIDTH): ViewfinderBox {
  const safeZoom = clampCameraZoom(zoom);
  const safeX = Number.isFinite(x) ? x : 0;
  const safeY = Number.isFinite(y) ? y : 0;
  const width = frameWidth / safeZoom;
  const height = BASE_FRAME_HEIGHT / safeZoom;

  return {
    left: safeX - width / 2,
    right: safeX + width / 2,
    top: safeY + height / 2,
    bottom: safeY - height / 2,
    width,
    height,
  };
}

/** Interpolates camera pose between shots at time t */
export function interpolateCameraPose(shots: CameraShot[], t: number): { x: number; y: number; zoom: number } {
  if (shots.length === 0) return { x: 0, y: 0, zoom: 1.0 };
  const sorted = [...shots].sort((a, b) => a.time - b.time);
  const safeT = Number.isFinite(t) ? t : sorted[0].time;

  if (safeT <= sorted[0].time) {
    return { x: sorted[0].x, y: sorted[0].y, zoom: clampCameraZoom(sorted[0].zoom) };
  }
  if (safeT >= sorted[sorted.length - 1].time) {
    const last = sorted[sorted.length - 1];
    return { x: last.x, y: last.y, zoom: clampCameraZoom(last.zoom) };
  }

  // Find surrounding shots
  for (let i = 0; i < sorted.length - 1; i++) {
    const curr = sorted[i];
    const next = sorted[i + 1];

    if (safeT >= curr.time && safeT <= next.time) {
      if (!Number.isFinite(next.duration) || next.duration <= 0) {
        const target = safeT >= next.time ? next : curr;
        return { x: target.x, y: target.y, zoom: clampCameraZoom(target.zoom) };
      }
      const transStart = next.time - next.duration;
      if (safeT < transStart) {
        return { x: curr.x, y: curr.y, zoom: clampCameraZoom(curr.zoom) };
      }
      // Ease progress
      const p = Math.max(0, Math.min(1, (safeT - transStart) / next.duration));
      // smoothstep easing
      const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
      const edge = sigmoid(-5);
      const eased = next.rateFunc === 'linear' ? p : next.rateFunc === 'ease_in_out' ? (1 - Math.cos(Math.PI * p)) / 2 : (sigmoid(10 * (p - 0.5)) - edge) / (1 - 2 * edge);

      const currZoom = clampCameraZoom(curr.zoom);
      const nextZoom = clampCameraZoom(next.zoom);
      return {
        x: curr.x + (next.x - curr.x) * eased,
        y: curr.y + (next.y - curr.y) * eased,
        zoom: 1 / ((1 - eased) / currZoom + eased / nextZoom),
      };
    }
  }

  const last = sorted[sorted.length - 1];
  return { x: last.x, y: last.y, zoom: clampCameraZoom(last.zoom) };
}

/** Shot times are arrival times relative to this appended camera section. */
export function generateCameraDirectorPythonCode(shots: CameraShot[]): string {
  return compileProject(createCameraDirectorActions(createEmptyProject(), shots).project).code;
}

export function createCameraDirectorActions(project: Project, shots: CameraShot[]): { project: Project; actionIds: string[] } {
  if (project.scene.dimension !== '2d' || project.scene.renderer === 'opengl') throw Error('运镜导演目前仅支持二维 Cairo 场景。');
  const sorted = [...shots].sort((a, b) => a.time - b.time);
  if (!sorted.length) return appendPlaygroundActions(project, []);
  if (sorted[0].time !== 0) throw Error('第一个镜头是初始构图，到达时刻必须为 0。');
  for (const [index, shot] of sorted.entries()) {
    if (![shot.time, shot.duration, shot.x, shot.y, shot.zoom].every(Number.isFinite) || shot.zoom < 0.2 || shot.zoom > 10 || shot.time < 0 || shot.time > 600 || shot.duration <= 0 || shot.duration > 120) throw Error('镜头时间、位置与缩放超出允许范围。');
    if (!['linear', 'smooth', 'ease_in_out'].includes(shot.rateFunc)) throw Error('未知镜头缓动。');
    if (index && shot.time - shot.duration < sorted[index - 1].time - 1e-9) throw Error('镜头过渡时间重叠，请缩短时长或推迟到达时刻。');
  }
  const actions: Action[] = [];
  const width = 8 * project.scene.width / project.scene.height;
  const setPose = (receiver: string, shot: CameraShot) => {
    actions.push(playgroundApi('Mobject.move_to', playgroundName('镜头位置'), { point_or_mobject: [shot.x, shot.y, 0] }, { receiver, mode: 'store' }), playgroundApi('Mobject.scale_to_fit_width', playgroundName('镜头视野'), { width: width / shot.zoom }, { receiver, mode: 'store' }));
  };
  setPose('@frame', sorted[0]);
  let time = 0;
  for (const shot of sorted.slice(1)) {
    let gap = shot.time - shot.duration - time;
    while (gap > 1e-9) { const duration = Math.min(120, gap); actions.push(createAction('wait', { duration })); gap -= duration; }
    const target = playgroundName('镜头目标');
    actions.push(playgroundApi('Mobject.copy', target, {}, { receiver: '@frame', mode: 'store' }));
    setPose(target, shot);
    actions.push(playgroundApi('Transform', playgroundName('运镜'), { mobject: { $ref: '@frame' }, target_mobject: { $ref: target }, kwargs: { rate_func: { $api: shot.rateFunc === 'ease_in_out' ? 'ease_in_out_sine' : shot.rateFunc } } }, { mode: 'play', duration: shot.duration }));
    time = shot.time;
  }
  return appendPlaygroundActions(project, actions);
}
