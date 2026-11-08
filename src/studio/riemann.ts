import type { Project, Action } from './core/types';

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

/**
 * Generates standalone, runnable Manim CE Python code for 3B1B-style Riemann sum visualization.
 */
export function generateRiemannPythonCode(
  preset: RiemannPreset,
  a: number,
  b: number,
  n: number,
  mode: RiemannMode = 'mid'
): string {
  const modeParam = mode === 'left' ? 'input_sample_type="left"' : mode === 'right' ? 'input_sample_type="right"' : 'input_sample_type="center"';

  return `from manim import *
import numpy as np

class RiemannSumScene(Scene):
    """
    3Blue1Brown-style Riemann Sum & Definite Integral Visualization.
    Function: ${preset.latex}
    Interval: [${a.toFixed(2)}, ${b.toFixed(2)}], Partitions: n = ${n}
    """
    def construct(self):
        # 1. 建立坐标系
        axes = Axes(
            x_range=[${preset.xRange[0]}, ${preset.xRange[1]}, 1],
            y_range=[${preset.yRange[0]}, ${preset.yRange[1]}, ${(preset.yRange[1] - preset.yRange[0]) > 6 ? 2 : 1}],
            x_length=9,
            y_length=5.5,
            axis_config={"color": BLUE_B, "stroke_width": 2},
            tips=True,
        ).shift(DOWN * 0.5)
        labels = axes.get_axis_labels(x_label="x", y_label="f(x)")

        # 2. 绘制原函数曲线
        curve = axes.plot(
            lambda x: ${preset.fnStr},
            color=YELLOW,
            stroke_width=3.5,
        )
        curve_label = MathTex("${preset.latex}", color=YELLOW).to_corner(UL).shift(RIGHT * 0.5)

        # 3. 初始粗分划黎曼矩形群 (n = 6)
        dx_init = ${(b - a) / 6}
        rects_coarse = axes.get_riemann_rectangles(
            curve,
            x_range=[${a.toFixed(2)}, ${b.toFixed(2)}],
            dx=dx_init,
            ${modeParam},
            color=[BLUE, TEAL],
            stroke_width=1,
            stroke_color=WHITE,
            fill_opacity=0.6,
        )

        # 4. 目标分划黎曼矩形群 (n = ${n})
        dx_fine = ${(b - a) / n}
        rects_fine = axes.get_riemann_rectangles(
            curve,
            x_range=[${a.toFixed(2)}, ${b.toFixed(2)}],
            dx=dx_fine,
            ${modeParam},
            color=[TEAL, GREEN_C],
            stroke_width=0.5,
            stroke_color=WHITE,
            fill_opacity=0.7,
        )

        # 5. 精确光滑积分区域 (dx -> 0)
        area_exact = axes.get_area(
            curve,
            x_range=[${a.toFixed(2)}, ${b.toFixed(2)}],
            color=[GREEN, YELLOW],
            opacity=0.5,
        )

        # 6. 数学公式与定积分符号
        formula = MathTex(
            r"\\int_{${a.toFixed(1)}}^{${b.toFixed(1)}} " + r"${preset.latex.replace('f(x) = ', '')} \\, dx",
            color=GREEN_B,
        ).to_corner(UR).shift(LEFT * 0.5)

        # 7. 动画演示序列
        self.play(Create(axes), Write(labels), run_time=1.2)
        self.play(Create(curve), Write(curve_label), run_time=1.5)
        self.wait(0.5)

        # 引入粗分划矩形
        self.play(Create(rects_coarse), run_time=1.8)
        self.wait(1.0)

        # 极限细分过程 (n: 6 -> ${n})
        self.play(
            Transform(rects_coarse, rects_fine),
            run_time=2.2,
            rate_func=smooth,
        )
        self.wait(0.8)

        # 最终平滑过渡到定积分连续面积与积分表达式
        self.play(
            Transform(rects_coarse, area_exact),
            Write(formula),
            run_time=1.8,
        )
        self.wait(2.0)
`;
}

/**
 * Creates AnyVis project actions for inserting the Riemann coordinate axes, curve, and area.
 */
export function createRiemannActions(
  project: Project,
  preset: RiemannPreset,
  a: number,
  b: number,
  n: number,
  mode: RiemannMode = 'mid'
): { project: Project; actionIds: string[] } {
  const ts = Date.now().toString(36).slice(-4);
  const axesName = `坐标系_黎曼_${ts}`;
  const curveName = `原函数_${preset.id}_${ts}`;
  const areaName = `定积分面积_${preset.id}_${ts}`;

  const axesAction: Action = {
    id: `action_axes_${ts}`,
    type: 'create_axes',
    fields: {
      name: axesName,
      xMin: preset.xRange[0],
      xMax: preset.xRange[1],
      xStep: 1,
      yMin: preset.yRange[0],
      yMax: preset.yRange[1],
      yStep: 1,
    },
    children: [],
  };

  const curveAction: Action = {
    id: `action_curve_${ts}`,
    type: 'create_plot',
    fields: {
      name: curveName,
      receiver: axesName,
      fn: preset.fnStr,
      xMin: a,
      xMax: b,
      color: '#e2b340',
    },
    children: [],
  };

  const areaAction: Action = {
    id: `action_area_${ts}`,
    type: 'create_plot',
    fields: {
      name: areaName,
      receiver: axesName,
      fn: preset.fnStr,
      xMin: a,
      xMax: b,
      color: '#58c4dd',
      opacity: 0.5,
      note: `黎曼和分划: n=${n}, mode=${mode}`,
    },
    children: [],
  };

  const nextActions = [...project.actions, axesAction, curveAction, areaAction];
  return {
    project: {
      ...project,
      actions: nextActions,
    },
    actionIds: [axesAction.id, curveAction.id, areaAction.id],
  };
}
