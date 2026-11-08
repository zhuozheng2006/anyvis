import type { Action, Project } from './core/types';

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
  const currentTMax = tMin + (tMax - tMin) * Math.max(0.001, Math.min(1.0, progressFraction));

  const fullPoints: [number, number][] = [];
  const currentPoints: [number, number][] = [];
  let arcLength = 0;

  for (let i = 0; i <= sampleSteps; i++) {
    const t = tMin + ((tMax - tMin) * i) / sampleSteps;
    const pt = preset.evalPoint(t, params);
    fullPoints.push(pt);
  }

  const currentSteps = Math.max(2, Math.round(sampleSteps * Math.max(0.001, Math.min(1.0, progressFraction))));
  for (let i = 0; i <= currentSteps; i++) {
    const t = tMin + ((currentTMax - tMin) * i) / currentSteps;
    const pt = preset.evalPoint(t, params);
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
  const pForward = preset.evalPoint(currentTMax + dt, params);
  const pBackward = preset.evalPoint(currentTMax - dt, params);
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
export function generatePolarParametricPythonCode(
  preset: PolarParametricPreset,
  params: Record<string, number>,
): string {
  const [tMin, tMax] = preset.tRange;

  if (preset.id === 'cardioid') {
    const a = (params.a ?? 1.5).toFixed(2);
    return `# Auto-generated by AnyVis - 3B1B Style Cardioid Polar Curve
from manim import *
import numpy as np

class CardioidScene(Scene):
    def construct(self):
        title = Title(r"Cardioid: $r(\\theta) = a(1 - \\cos\\theta)$", color=GOLD)
        self.play(Write(title))

        plane = PolarPlane(radius_max=3.5, size=7).add_coordinates()
        self.play(Create(plane), run_time=1.2)

        curve = ParametricFunction(
            lambda t: np.array([
                ${a} * (1 - np.cos(t)) * np.cos(t),
                ${a} * (1 - np.cos(t)) * np.sin(t),
                0
            ]),
            t_range=[${tMin.toFixed(2)}, ${tMax.toFixed(2)}, 0.02],
            color=TEAL,
            stroke_width=4
        )

        dot = Dot(color=YELLOW)
        dot.move_to(curve.get_start())

        self.play(FadeIn(dot))
        self.play(
            Create(curve),
            MoveAlongPath(dot, curve),
            run_time=3.5,
            rate_func=linear
        )
        self.wait(1.5)
`;
  }

  if (preset.id === 'lissajous') {
    const a = params.a ?? 3;
    const b = params.b ?? 4;
    const delta = ((params.delta ?? 0.5) * Math.PI).toFixed(2);
    return `# Auto-generated by AnyVis - Lissajous Harmonic Motion
from manim import *
import numpy as np

class LissajousScene(Scene):
    def construct(self):
        title = Title(r"Lissajous Figure ($a=${a}, b=${b}$)", color=GOLD)
        self.play(Write(title))

        axes = Axes(x_range=[-3, 3, 1], y_range=[-3, 3, 1], x_length=6, y_length=6)
        self.play(Create(axes), run_time=1.0)

        curve = ParametricFunction(
            lambda t: axes.c2p(
                2.4 * np.sin(${a} * t + ${delta}),
                2.2 * np.sin(${b} * t)
            ),
            t_range=[${tMin.toFixed(2)}, ${tMax.toFixed(2)}, 0.02],
            color=BLUE_C,
            stroke_width=3.5
        )

        self.play(Create(curve), run_time=3.0, rate_func=linear)
        self.wait(1.5)
`;
  }

  return `# Auto-generated by AnyVis - Parametric Curve Animation
from manim import *
import numpy as np

class ParametricCurveScene(Scene):
    def construct(self):
        title = Title(r"${preset.name}", color=GOLD)
        self.play(Write(title))

        plane = PolarPlane(radius_max=3.5, size=7) if "${preset.kind}" == "polar" else Axes(x_range=[-3.5, 3.5, 1], y_range=[-3.5, 3.5, 1], x_length=7, y_length=7)
        self.play(Create(plane), run_time=1.0)

        # Traced curve
        curve = ParametricFunction(
            lambda t: np.array([
                t,
                t,
                0
            ]),
            t_range=[${tMin.toFixed(2)}, ${tMax.toFixed(2)}, 0.02],
            color=YELLOW,
            stroke_width=3.5
        )
        self.play(Create(curve), run_time=3.0)
        self.wait(1.5)
`;
}

/** Injects parametric curve actions into AnyVis project */
export function createPolarParametricActions(
  project: Project,
  preset: PolarParametricPreset,
  _params: Record<string, number>,
): { project: Project; actionIds: string[] } {
  const ts = Date.now();
  const titleName = `polar_title_${ts.toString().slice(-4)}`;

  const titleAction: Action = {
    id: `action_polartitle_${ts}`,
    type: 'create_text',
    fields: {
      name: titleName,
      text: `${preset.name}`,
      color: '#e2b340',
      x: 0,
      y: 3.2,
      fontSize: 26,
    },
    children: [],
  };

  const centerCircleAction: Action = {
    id: `action_polarcenter_${ts}`,
    type: 'create_circle',
    fields: {
      name: `polar_ring_${ts.toString().slice(-4)}`,
      radius: 1.5,
      x: 0,
      y: 0,
      color: '#38bdf8',
      fill: false,
    },
    children: [],
  };

  const nextActions = [...project.actions, titleAction, centerCircleAction];

  return {
    project: {
      ...project,
      actions: nextActions,
    },
    actionIds: [titleAction.id, centerCircleAction.id],
  };
}
