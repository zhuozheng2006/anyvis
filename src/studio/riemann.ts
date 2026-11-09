import type { Project, Action } from './core/types';
import { createAction } from './core/catalog';
import { compileProject } from './core/compiler';
import { createEmptyProject } from './core/project';
import { appendPlaygroundActions, playgroundApi, playgroundName } from './playground-actions';

export type RiemannMode = 'left' | 'right' | 'mid' | 'trapezoid';

export interface RiemannPreset {
  id: string;
  name: string;
  latex: string;
  fn: (x: number) => number;
  fnStr: string; // Python expression
  defaultA: number;
  defaultB: number;
  xRange: [number, number];
  yRange: [number, number];
}

export interface RiemannRectangle {
  xLeft: number;
  xRight: number;
  xSample: number;
  height: number;
  area: number;
  // For trapezoids
  heightLeft?: number;
  heightRight?: number;
}

export interface RiemannResult {
  a: number;
  b: number;
  n: number;
  dx: number;
  mode: RiemannMode;
  sum: number;
  exact: number;
  error: number;
  relErrorPercent: number;
  rectangles: RiemannRectangle[];
}

export const RIEMANN_PRESETS: RiemannPreset[] = [
  {
    id: 'parabola',
    name: '抛物线 f(x) = x²',
    latex: 'f(x) = x^2',
    fn: (x: number) => x * x,
    fnStr: 'x**2',
    defaultA: 0,
    defaultB: 3,
    xRange: [-0.5, 4],
    yRange: [-0.5, 10],
  },
  {
    id: 'inverted-parabola',
    name: '倒抛物线 f(x) = 4 - x²',
    latex: 'f(x) = 4 - x^2',
    fn: (x: number) => 4 - x * x,
    fnStr: '4 - x**2',
    defaultA: -2,
    defaultB: 2,
    xRange: [-3, 3],
    yRange: [-1, 5],
  },
  {
    id: 'sine-lifted',
    name: '平修正弦 f(x) = sin(x) + 1.2',
    latex: 'f(x) = \\sin(x) + 1.2',
    fn: (x: number) => Math.sin(x) + 1.2,
    fnStr: 'np.sin(x) + 1.2',
    defaultA: 0,
    defaultB: 2 * Math.PI,
    xRange: [-0.5, 7],
    yRange: [-0.2, 2.5],
  },
  {
    id: 'gaussian',
    name: '高斯钟形曲线 f(x) = e^(-x²)',
    latex: 'f(x) = e^{-x^2}',
    fn: (x: number) => Math.exp(-x * x),
    fnStr: 'np.exp(-x**2)',
    defaultA: -2,
    defaultB: 2,
    xRange: [-3, 3],
    yRange: [-0.2, 1.2],
  },
  {
    id: 'reciprocal',
    name: '反比例双曲 f(x) = 1/x',
    latex: 'f(x) = \\frac{1}{x}',
    fn: (x: number) => (Math.abs(x) < 1e-6 ? 100 : 1 / x),
    fnStr: '1 / x',
    defaultA: 1,
    defaultB: 4,
    xRange: [0.5, 5],
    yRange: [-0.2, 1.5],
  },
  {
    id: 'cubic-poly',
    name: '三次多项式 f(x) = 0.5x³ - 2x + 3',
    latex: 'f(x) = 0.5x^3 - 2x + 3',
    fn: (x: number) => 0.5 * Math.pow(x, 3) - 2 * x + 3,
    fnStr: '0.5 * x**3 - 2 * x + 3',
    defaultA: 0,
    defaultB: 3,
    xRange: [-0.5, 3.5],
    yRange: [-1, 12],
  },
];

/**
 * Composite Simpson's 3/8 & 1/3 high-precision numerical quadrature
 */
export function computeExactDefiniteIntegral(
  fn: (x: number) => number,
  a: number,
  b: number,
  subdivisions: number = 1000
): number {
  if (Math.abs(b - a) < 1e-9) return 0;
  // Ensure subdivisions is even for Simpson's rule
  const n = subdivisions % 2 === 0 ? subdivisions : subdivisions + 1;
  const h = (b - a) / n;
  let sum = fn(a) + fn(b);

  for (let i = 1; i < n; i++) {
    const x = a + i * h;
    sum += (i % 2 === 0 ? 2 : 4) * fn(x);
  }

  return (sum * h) / 3;
}

/**
 * Computes Riemann rectangles for Left, Right, Midpoint, or Trapezoid rules.
 */
export function computeRiemannSum(
  fn: (x: number) => number,
  a: number,
  b: number,
  n: number,
  mode: RiemannMode = 'mid'
): RiemannResult {
  const safeN = Math.max(1, Math.min(200, Math.round(n)));
  const dx = (b - a) / safeN;
  const rectangles: RiemannRectangle[] = [];
  let totalSum = 0;

  for (let i = 0; i < safeN; i++) {
    const xLeft = a + i * dx;
    const xRight = a + (i + 1) * dx;
    let xSample = xLeft;
    let height = fn(xLeft);
    let area = 0;

    if (mode === 'left') {
      xSample = xLeft;
      height = fn(xLeft);
      area = height * dx;
    } else if (mode === 'right') {
      xSample = xRight;
      height = fn(xRight);
      area = height * dx;
    } else if (mode === 'mid') {
      xSample = (xLeft + xRight) / 2;
      height = fn(xSample);
      area = height * dx;
    } else if (mode === 'trapezoid') {
      const hL = fn(xLeft);
      const hR = fn(xRight);
      xSample = (xLeft + xRight) / 2;
      height = (hL + hR) / 2;
      area = ((hL + hR) / 2) * dx;
      rectangles.push({
        xLeft,
        xRight,
        xSample,
        height,
        area,
        heightLeft: hL,
        heightRight: hR,
      });
      totalSum += area;
      continue;
    }

    rectangles.push({
      xLeft,
      xRight,
      xSample,
      height,
      area,
    });
    totalSum += area;
  }

  const exact = computeExactDefiniteIntegral(fn, a, b);
  const error = Math.abs(totalSum - exact);
  const relErrorPercent = Math.abs(exact) > 1e-6 ? (error / Math.abs(exact)) * 100 : 0;

  return {
    a,
    b,
    n: safeN,
    dx,
    mode,
    sum: totalSum,
    exact,
    error,
    relErrorPercent,
    rectangles,
  };
}

/** Export exactly the same geometry and selected quadrature rule as insertion. */
export function generateRiemannPythonCode(preset: RiemannPreset, a: number, b: number, n: number, mode: RiemannMode = 'mid'): string {
  return compileProject(createRiemannActions(createEmptyProject(), preset, a, b, n, mode).project).code;
}

export function createRiemannActions(project: Project, preset: RiemannPreset, a: number, b: number, n: number, mode: RiemannMode = 'mid'): { project: Project; actionIds: string[] } {
  if (![a, b, n].every(Number.isFinite) || a >= b || n < 1 || n > 200 || !Number.isInteger(n)) throw Error('积分区间需要左端小于右端，分划数须为 1–200 的整数。');
  if (!['left', 'right', 'mid', 'trapezoid'].includes(mode)) throw Error('未知积分近似方法。');
  if (preset.id === 'reciprocal' && a <= 0 && b >= 0) throw Error('积分区间不能跨越 1/x 在 0 处的奇点。');
  const result = computeRiemannSum(preset.fn, a, b, n, mode);
  if (!Number.isFinite(result.sum) || result.rectangles.some(r => !Number.isFinite(r.height))) throw Error('积分采样包含非有限值。');
  const axes = playgroundName('坐标系_黎曼'), curve = playgroundName('原函数');
  const actions: Action[] = [createAction('axes', { name: axes, xMin: preset.xRange[0], xMax: preset.xRange[1], yMin: preset.yRange[0], yMax: preset.yRange[1], xLength: 9, yLength: 5.5 }), createAction('function_plot', { name: curve, axes, expression: preset.fnStr.replace(/np\./g, '').replace(/\*\*/g, '^'), xMin: a, xMax: b, color: '#e2b340' })];
  const c2p = (x: number, y: number) => ({ $call: { api: 'CoordinateSystem.coords_to_point', receiver: { $ref: axes }, args: [x, y] } });
  for (const rectangle of result.rectangles) {
    const hLeft = mode === 'trapezoid' ? rectangle.heightLeft! : rectangle.height;
    const hRight = mode === 'trapezoid' ? rectangle.heightRight! : rectangle.height;
    actions.push(playgroundApi('Polygon', playgroundName(mode === 'trapezoid' ? '梯形' : '黎曼矩形'), { vertices: [c2p(rectangle.xLeft, 0), c2p(rectangle.xRight, 0), c2p(rectangle.xRight, hRight), c2p(rectangle.xLeft, hLeft)], color: '#58c4dd', fill_opacity: 0.55, stroke_width: 0.5 }, { mode: 'show' }));
  }
  actions.push(createAction('text', { name: playgroundName('积分近似值'), text: `${mode} · n=${n} · S=${result.sum.toFixed(6)}`, fontSize: 26, y: 3.4, maxWidth: 12, appear: 'none' }), createAction('wait', { duration: 2 }));
  return appendPlaygroundActions(project, actions);
}
