import type { Action, Project } from './core/types';
import { createAction } from './core/catalog';
import { compileProject } from './core/compiler';
import { createEmptyProject } from './core/project';
import { appendPlaygroundActions, playgroundApi, playgroundName } from './playground-actions';

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export type Vector3DOperation = 'add' | 'dot' | 'cross';
export interface Vector3DView { azimuth: number; elevation: number; }
const DEFAULT_VECTOR_VIEW: Vector3DView = { azimuth: 35, elevation: 25 };

export interface Vector3DPreset {
  id: string;
  name: string;
  description: string;
  u: Vector3D;
  v: Vector3D;
  operation: Vector3DOperation;
  category: string;
}

export const VECTOR3D_PRESETS: Vector3DPreset[] = [
  {
    id: 'ortho-basis',
    name: '标准正交基与叉乘',
    description: '展示经典标准正交基向量 i × j = k，以及右手法则垂直性质',
    u: { x: 2, y: 0, z: 0 },
    v: { x: 0, y: 2, z: 0 },
    operation: 'cross',
    category: '3B1B 线性代数',
  },
  {
    id: 'parallelogram-area',
    name: '对角向量与张成面积',
    description: '三维空间中两向量张成的平行四边形，面积恰好等于叉乘向量模长',
    u: { x: 2, y: 1, z: 0.5 },
    v: { x: 0.5, y: 2, z: 1 },
    operation: 'cross',
    category: '3B1B 线性代数',
  },
  {
    id: 'vector-addition',
    name: '三维平行四边形法则',
    description: '三维空间中的向量平移相加 u + v，合成对角线合向量',
    u: { x: 2, y: 1, z: 1.5 },
    v: { x: 1, y: 2, z: -0.5 },
    operation: 'add',
    category: '几何与力学',
  },
  {
    id: 'dot-projection',
    name: '三维空间正交投影',
    description: '内积与正交投影：u 在 v 方向上的影子长度与投影分向量',
    u: { x: 2, y: 2, z: 1 },
    v: { x: 3, y: 0, z: 0 },
    operation: 'dot',
    category: '3B1B 线性代数',
  },
  {
    id: 'torque-physics',
    name: '力矩与角动量 (τ = r × F)',
    description: '刚体转动力学中的力矩叉乘计算，力臂向量与作用力产生的力矩',
    u: { x: 1.5, y: 0, z: 0 },
    v: { x: 0, y: 2.5, z: 1 },
    operation: 'cross',
    category: '物理学模型',
  },
];

export function magnitude3D(v: Vector3D): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

export function add3D(u: Vector3D, v: Vector3D): Vector3D {
  return {
    x: u.x + v.x,
    y: u.y + v.y,
    z: u.z + v.z,
  };
}

export function dot3D(u: Vector3D, v: Vector3D): number {
  return u.x * v.x + u.y * v.y + u.z * v.z;
}

export function cross3D(u: Vector3D, v: Vector3D): Vector3D {
  return {
    x: u.y * v.z - u.z * v.y,
    y: u.z * v.x - u.x * v.z,
    z: u.x * v.y - u.y * v.x,
  };
}

export function angle3D(u: Vector3D, v: Vector3D): { radians: number; degrees: number } {
  const magU = magnitude3D(u);
  const magV = magnitude3D(v);
  if (magU === 0 || magV === 0) {
    return { radians: 0, degrees: 0 };
  }
  const cosTheta = Math.max(-1, Math.min(1, dot3D(u, v) / (magU * magV)));
  const radians = Math.acos(cosTheta);
  return {
    radians,
    degrees: (radians * 180) / Math.PI,
  };
}

export function project3D(u: Vector3D, v: Vector3D): Vector3D {
  const magSqV = v.x * v.x + v.y * v.y + v.z * v.z;
  if (magSqV === 0) {
    return { x: 0, y: 0, z: 0 };
  }
  const scalar = dot3D(u, v) / magSqV;
  return {
    x: v.x * scalar,
    y: v.y * scalar,
    z: v.z * scalar,
  };
}

/**
 * 3D Isometric / Orbit projection to 2D screen coordinates
 */
export function project3DTo2D(
  pt: Vector3D,
  azimuthDeg: number,
  elevationDeg: number,
  scale = 32,
  centerX = 200,
  centerY = 180
): { x: number; y: number; depth: number } {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;

  // Yaw rotation around Z axis
  const x1 = pt.x * Math.cos(az) - pt.y * Math.sin(az);
  const y1 = pt.x * Math.sin(az) + pt.y * Math.cos(az);
  const z1 = pt.z;

  // Pitch rotation around X axis
  const x2 = x1;
  const y2 = y1 * Math.cos(el) - z1 * Math.sin(el);
  const z2 = y1 * Math.sin(el) + z1 * Math.cos(el);

  // Screen mapping: standard Manim coordinate system (X right, Z up)
  const screenX = centerX + x2 * scale;
  const screenY = centerY - z2 * scale;

  return { x: screenX, y: screenY, depth: y2 };
}

export function generateVector3DManimCode(u: Vector3D, v: Vector3D, operation: Vector3DOperation, view: Vector3DView = DEFAULT_VECTOR_VIEW): string {
  return compileProject(createVector3DActions(createEmptyProject(), u, v, operation, view).project).code;
}

export function createVector3DActions(project: Project, u: Vector3D, v: Vector3D, operation: Vector3DOperation, view: Vector3DView = DEFAULT_VECTOR_VIEW): { project: Project; actionCount: number } {
  if (![u.x, u.y, u.z, v.x, v.y, v.z].every(Number.isFinite)) throw Error('向量分量必须为有限数值。');
  if (!['add', 'dot', 'cross'].includes(operation)) throw Error('未知向量运算。');
  if (![view.azimuth, view.elevation].every(Number.isFinite) || Math.abs(view.elevation) > 90) throw Error('预览视角无效。');
  // Match the SVG yaw/pitch orientation: camera theta = -90 - yaw,
  // phi = 90 - elevation. Manim retains its native perspective projection.
  const theta = -90 - ((view.azimuth % 360) + 360) % 360;
  const actions: Action[] = [createAction('camera', { phi: 90 - view.elevation, theta, zoom: 0.9, duration: 0 }), createAction('three_axes', { name: playgroundName('三维坐标系'), range: 3, length: 6 })];
  const point = (v: Vector3D) => [v.x, v.y, v.z];
  const arrow = (label: string, v: Vector3D, color: string) => {
    const name = playgroundName(label);
    // Arrow3D cannot represent a zero-length vector. A colored point at the
    // origin is its honest degenerate representation, with value in the label.
    actions.push(magnitude3D(v) < 1e-12
      ? playgroundApi('Dot3D', name, { point: [0, 0, 0], radius: 0.04, color }, { mode: 'show' })
      : playgroundApi('Arrow3D', name, { start: [0, 0, 0], end: point(v), color }, { mode: 'store' }));
    if (magnitude3D(v) >= 1e-12) actions.push(createAction('create', { target: name, duration: 0.8 }));
  };
  arrow('向量u', u, '#38bdf8'); arrow('向量v', v, '#f43f5e');
  const result = operation === 'add' ? add3D(u, v) : operation === 'dot' ? project3D(u, v) : cross3D(u, v);
  const color = operation === 'add' ? '#facc15' : operation === 'dot' ? '#4ade80' : '#c084fc';
  if (operation === 'cross' && magnitude3D(result) > 1e-12) {
    actions.push(playgroundApi('Polygon', playgroundName('张成面积'), { vertices: [[0, 0, 0], point(u), point(add3D(u, v)), point(v)], color, fill_opacity: 0.3, stroke_width: 1 }, { mode: 'show' }));
  }
  arrow(operation === 'dot' ? '投影' : '结果向量', result, color);
  const text = operation === 'dot' ? `u · v = ${dot3D(u, v).toFixed(2)}` : `${operation === 'add' ? 'u + v' : 'u × v'} = (${result.x.toFixed(2)}, ${result.y.toFixed(2)}, ${result.z.toFixed(2)})`;
  const label = playgroundName('向量运算结果');
  actions.push(createAction('text', { name: label, text, color, fontSize: 28, y: 3.2, maxWidth: 12, appear: 'hidden' }), createAction('fixed_in_frame', { target: label }), createAction('wait', { duration: 2 }));
  const next = appendPlaygroundActions(project, actions, '3d');
  return { project: next.project, actionCount: actions.length };
}
