import { createAction } from './core/catalog.ts';
import { appendPlaygroundActions, playgroundName, emptyPlayground, playgroundPython } from './playground-actions.ts';
import type { Project } from './core/types';

export type CurveKind = 'polar' | 'parametric';

export type PolarParametricPresetId =
  | 'cardioid'
  | 'rose_curve'
  | 'archimedes_spiral'
  | 'log_spiral'
  | 'lissajous'
  | 'cycloid'
  | 'astroid'
  | 'butterfly';

export interface CurveParam {
  key: string;
  name: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
}

export interface PolarParametricPreset {
  id: PolarParametricPresetId;
  name: string;
  kind: CurveKind;
  formula: string;
  description: string;
  tRange: [number, number]; // [tMin, tMax]
  params: CurveParam[];
  evalPoint: (t: number, params: Record<string, number>) => [number, number]; // returns [x, y]
}

export interface CurveSampleResult {
  fullPoints: [number, number][];
  currentPoints: [number, number][];
  currentPoint: [number, number];
  tangent: [number, number]; // normalized tangent direction
  arcLength: number;
}

export const POLAR_PARAMETRIC_PRESETS: PolarParametricPreset[] = [
  {
    id: 'cardioid',
    name: '心脏线 (Cardioid)',
    kind: 'polar',
    formula: 'r(\\theta) = a(1 - \\cos\\theta)',
    description: '圆在另一个同半径圆外部无滑动滚动时外侧一点的极坐标轨迹',
    tRange: [0, 2 * Math.PI],
    params: [
      { key: 'a', name: '半径缩放 a', min: 0.5, max: 2.5, step: 0.1, defaultValue: 1.5 },
    ],
    evalPoint: (theta, params) => {
      const a = params.a ?? 1.5;
      const r = a * (1 - Math.cos(theta));
      return [r * Math.cos(theta), r * Math.sin(theta)];
    },
  },
  {
    id: 'rose_curve',
    name: '玫瑰花瓣线 (Rose Curve)',
    kind: 'polar',
    formula: 'r(\\theta) = a \\cos(k\\theta)',
    description: '具有优美对称性的谐波极坐标花瓣曲线，当 k 为偶数时具有 2k 个花瓣',
    tRange: [0, 2 * Math.PI],
    params: [
      { key: 'a', name: '花瓣振幅 a', min: 1.0, max: 3.0, step: 0.1, defaultValue: 2.2 },
      { key: 'k', name: '花瓣频率 k', min: 1, max: 8, step: 1, defaultValue: 4 },
    ],
    evalPoint: (theta, params) => {
      const a = params.a ?? 2.2;
      const k = params.k ?? 4;
      const r = a * Math.cos(k * theta);
      return [r * Math.cos(theta), r * Math.sin(theta)];
    },
  },
  {
    id: 'archimedes_spiral',
    name: '阿基米德螺线 (Archimedean Spiral)',
    kind: 'polar',
    formula: 'r(\\theta) = a\\theta',
    description: '动点沿以恒定角速度旋转的射线作匀速直线运动所形成的等间距螺线',
    tRange: [0, 4 * Math.PI],
    params: [
      { key: 'a', name: '间距系数 a', min: 0.05, max: 0.35, step: 0.02, defaultValue: 0.18 },
    ],
    evalPoint: (theta, params) => {
      const a = params.a ?? 0.18;
      const r = a * theta;
      return [r * Math.cos(theta), r * Math.sin(theta)];
    },
  },
  {
    id: 'log_spiral',
    name: '对数螺线 / 等角螺线 (Logarithmic Spiral)',
    kind: 'polar',
    formula: 'r(\\theta) = a e^{b\\theta}',
    description: '银河系旋臂与鹦鹉螺外壳的黄金自相似曲线，切线与径向夹角恒为定值',
    tRange: [0, 3.5 * Math.PI],
    params: [
      { key: 'a', name: '初值 a', min: 0.1, max: 0.8, step: 0.05, defaultValue: 0.25 },
      { key: 'b', name: '发散系数 b', min: 0.1, max: 0.35, step: 0.02, defaultValue: 0.18 },
    ],
    evalPoint: (theta, params) => {
      const a = params.a ?? 0.25;
      const b = params.b ?? 0.18;
      const r = a * Math.exp(b * theta);
      return [r * Math.cos(theta), r * Math.sin(theta)];
    },
  },
  {
    id: 'lissajous',
    name: '李萨如振动图形 (Lissajous Figure)',
    kind: 'parametric',
    formula: 'x(t) = A\\sin(at + \\delta),\\; y(t) = B\\sin(bt)',
    description: '两个互相垂直且频率具有简单整数比的正弦简谐振动合成的驻波相图轨迹',
    tRange: [0, 2 * Math.PI],
    params: [
      { key: 'a', name: 'X 轴频率 a', min: 1, max: 7, step: 1, defaultValue: 3 },
      { key: 'b', name: 'Y 轴频率 b', min: 1, max: 7, step: 1, defaultValue: 4 },
      { key: 'delta', name: '相位差 δ/π', min: 0, max: 2, step: 0.25, defaultValue: 0.5 },
    ],
    evalPoint: (t, params) => {
      const a = params.a ?? 3;
      const b = params.b ?? 4;
      const delta = (params.delta ?? 0.5) * Math.PI;
      const x = 2.4 * Math.sin(a * t + delta);
      const y = 2.2 * Math.sin(b * t);
      return [x, y];
    },
  },
  {
    id: 'cycloid',
    name: '最速降线摆线 (Cycloid)',
    kind: 'parametric',
    formula: 'x(t) = r(t - \\sin t),\\; y(t) = r(1 - \\cos t)',
    description: '重力场中物体无摩擦从一点滑至另一点耗时最短的最速降线与圆滚动轨迹',
    tRange: [0, 2.5 * Math.PI],
    params: [
      { key: 'r', name: '滚动圆半径 r', min: 0.5, max: 1.5, step: 0.1, defaultValue: 0.8 },
    ],
    evalPoint: (t, params) => {
      const r = params.r ?? 0.8;
      const x = r * (t - Math.sin(t)) - 3.0;
      const y = r * (1 - Math.cos(t)) - 1.2;
      return [x, y];
    },
  },
  {
    id: 'astroid',
    name: '星形线 (Astroid / Hypocycloid)',
    kind: 'parametric',
    formula: 'x(t) = a\\cos^3 t,\\; y(t) = a\\sin^3 t',
    description: '半径为 a/4 的圆在半径为 a 的圆内滚动时圆周上一动点的内摆线轨迹',
    tRange: [0, 2 * Math.PI],
    params: [
      { key: 'a', name: '尺度 a', min: 1.0, max: 3.0, step: 0.2, defaultValue: 2.4 },
    ],
    evalPoint: (t, params) => {
      const a = params.a ?? 2.4;
      const cosT = Math.cos(t);
      const sinT = Math.sin(t);
      return [a * cosT * cosT * cosT, a * sinT * sinT * sinT];
    },
  },
  {
    id: 'butterfly',
    name: '蝴蝶曲线 (Butterfly Curve)',
    kind: 'polar',
    formula: 'r(t) = e^{\\cos t} - 2\\cos(4t) - \\sin^5(t/12)',
    description: 'Temple H. Fay 发现的具有蝴蝶双翼舒展生物形态的高阶极坐标参数曲线',
    tRange: [0, 12 * Math.PI],
    params: [
      { key: 'scale', name: '整体缩放', min: 0.4, max: 1.4, step: 0.1, defaultValue: 0.8 },
    ],
    evalPoint: (t, params) => {
      const s = params.scale ?? 0.8;
      const sin12 = Math.sin(t / 12);
      const r =
        s *
        (Math.exp(Math.cos(t)) -
          2 * Math.cos(4 * t) -
          Math.pow(sin12, 5));
      // Orient butterfly upright: swap or rotate by pi/2
      return [r * Math.sin(t), r * Math.cos(t)];
    },
  },
];

/** Samples curve points and calculates progress, tangent vector and arc length */
export function sampleCurve(
  preset: PolarParametricPreset,
  params: Record<string, number>,
  progressFraction: number = 1.0, // 0.0 to 1.0
  sampleSteps: number = 360,
): CurveSampleResult {
  const [tMin, tMax] = preset.tRange;
  const safeProgress = Number.isFinite(progressFraction) ? Math.max(0.001, Math.min(1.0, progressFraction)) : 1.0;
  const safeSteps = Number.isFinite(sampleSteps) ? Math.max(2, Math.round(sampleSteps)) : 360;
  const safeParams = Object.fromEntries(
    preset.params.map((p) => [p.key, Number.isFinite(params[p.key]) ? params[p.key] : p.defaultValue]),
  );
  const currentTMax = tMin + (tMax - tMin) * safeProgress;

  const fullPoints: [number, number][] = [];
  const currentPoints: [number, number][] = [];
  let arcLength = 0;

  for (let i = 0; i <= safeSteps; i++) {
    const t = tMin + ((tMax - tMin) * i) / safeSteps;
    const pt = preset.evalPoint(t, safeParams);
    fullPoints.push(pt);
  }

  const currentSteps = Math.max(2, Math.round(safeSteps * safeProgress));
  for (let i = 0; i <= currentSteps; i++) {
    const t = tMin + ((currentTMax - tMin) * i) / currentSteps;
    const pt = preset.evalPoint(t, safeParams);
    currentPoints.push(pt);
    if (i > 0) {
      const prev = currentPoints[i - 1];
      const dx = pt[0] - prev[0];
      const dy = pt[1] - prev[1];
      arcLength += Math.sqrt(dx * dx + dy * dy);
    }
  }

  const currentPoint = currentPoints[currentPoints.length - 1];

  // Compute tangent vector using central difference
  const dt = 1e-4;
  const pForward = preset.evalPoint(currentTMax + dt, safeParams);
  const pBackward = preset.evalPoint(currentTMax - dt, safeParams);
  const tx = (pForward[0] - pBackward[0]) / (2 * dt);
  const ty = (pForward[1] - pBackward[1]) / (2 * dt);
  const mag = Math.sqrt(tx * tx + ty * ty);
  const tangent: [number, number] = mag > 1e-6 ? [tx / mag, ty / mag] : [1, 0];

  return {
    fullPoints,
    currentPoints,
    currentPoint,
    tangent,
    arcLength,
  };
}

/** Generates runnable Manim CE Python code for the polar/parametric curve */
export function generatePolarParametricPythonCode(preset: PolarParametricPreset, params: Record<string, number>): string {
  return playgroundPython(createPolarParametricActions(emptyPlayground(), preset, params), 'ParametricCurveScene');
}

/** Injects parametric curve actions into AnyVis project */
export function createPolarParametricActions(project: Project, preset: PolarParametricPreset, params: Record<string, number>): { project: Project; actionIds: string[] } {
  const values = Object.fromEntries(preset.params.map(p => [p.key, Number.isFinite(params[p.key]) ? params[p.key] : p.defaultValue]));
  const a = values.a, b = values.b;
  let xExpr: string, yExpr: string;
  let radius = '';
  switch (preset.id) {
    case 'cardioid': radius = `${a}*(1-cos(t))`; break;
    case 'rose_curve': radius = `${a}*cos(${values.k}*t)`; break;
    case 'archimedes_spiral': radius = `${a}*t`; break;
    case 'log_spiral': radius = `${a}*exp(${b}*t)`; break;
    case 'butterfly': radius = `${values.scale}*(exp(cos(t))-2*cos(4*t)-sin(t/12)^5)`; break;
  }
  if (radius) {
    xExpr = `(${radius})*${preset.id === 'butterfly' ? 'sin' : 'cos'}(t)`;
    yExpr = `(${radius})*${preset.id === 'butterfly' ? 'cos' : 'sin'}(t)`;
  } else if (preset.id === 'lissajous') {
    xExpr = `2.4*sin(${a}*t+${values.delta}*pi)`; yExpr = `2.2*sin(${b}*t)`;
  } else if (preset.id === 'cycloid') {
    xExpr = `${values.r}*(t-sin(t))-3`; yExpr = `${values.r}*(1-cos(t))-1.2`;
  } else {
    xExpr = `${a}*cos(t)^3`; yExpr = `${a}*sin(t)^3`;
  }
  return appendPlaygroundActions(project, [createAction('parametric_curve', { name: playgroundName(preset.id), xExpr, yExpr, zExpr: '0', tMin: preset.tRange[0], tMax: preset.tRange[1], duration: 3.5 })]);
}
