/**
 * 3B1B-style Essence of Calculus pure mathematical calculation and code generation.
 */

import type { Project } from './core/types.ts';
import { createAction } from './core/catalog.ts';

export interface CalculusPreset {
  id: string;
  name: string;
  fnExpr: string;
  derivativeExpr: string;
  fn: (x: number) => number;
  derivativeFn: (x: number) => number;
  domain: [number, number];
  defaultX: number;
}

export const CALCULUS_PRESETS: CalculusPreset[] = [
  {
    id: 'quadratic',
    name: '抛物线 f(x) = x²',
    fnExpr: 'x^2',
    derivativeExpr: '2*x',
    fn: (x: number) => x * x,
    derivativeFn: (x: number) => 2 * x,
    domain: [-3, 3],
    defaultX: 1.0,
  },
  {
    id: 'cubic',
    name: '三次多项式 f(x) = x³ - 3x',
    fnExpr: 'x^3 - 3*x',
    derivativeExpr: '3*x^2 - 3',
    fn: (x: number) => x * x * x - 3 * x,
    derivativeFn: (x: number) => 3 * x * x - 3,
    domain: [-2.5, 2.5],
    defaultX: 0.5,
  },
  {
    id: 'sine',
    name: '正弦函数 f(x) = sin(x)',
    fnExpr: 'sin(x)',
    derivativeExpr: 'cos(x)',
    fn: (x: number) => Math.sin(x),
    derivativeFn: (x: number) => Math.cos(x),
    domain: [-Math.PI, Math.PI],
    defaultX: Math.PI / 4,
  },
  {
    id: 'cosine',
    name: '余弦函数 f(x) = cos(x)',
    fnExpr: 'cos(x)',
    derivativeExpr: '-sin(x)',
    fn: (x: number) => Math.cos(x),
    derivativeFn: (x: number) => -Math.sin(x),
    domain: [-Math.PI, Math.PI],
    defaultX: Math.PI / 3,
  },
  {
    id: 'exponential',
    name: '指数函数 f(x) = e^x',
    fnExpr: 'exp(x)',
    derivativeExpr: 'exp(x)',
    fn: (x: number) => Math.exp(x),
    derivativeFn: (x: number) => Math.exp(x),
    domain: [-2.5, 2.0],
    defaultX: 0.0,
  },
  {
    id: 'bell',
    name: '高斯钟形 f(x) = 1/(1+x²)',
    fnExpr: '1 / (1 + x^2)',
    derivativeExpr: '-2*x / (1 + x^2)^2',
    fn: (x: number) => 1 / (1 + x * x),
    derivativeFn: (x: number) => (-2 * x) / (1 + x * x) ** 2,
    domain: [-3.5, 3.5],
    defaultX: 1.0,
  },
];

/**
 * Computes numerical secant slope between x0 and x0 + dx.
 */
export function computeSecantSlope(fn: (x: number) => number, x0: number, dx: number): number {
  if (Math.abs(dx) < 1e-9) {
    // If dx is tiny, fallback to central difference derivative
    return computeDerivative(fn, x0);
  }
  return (fn(x0 + dx) - fn(x0)) / dx;
}

/**
 * Computes numerical derivative f'(x0) using high-precision central difference.
 */
export function computeDerivative(fn: (x: number) => number, x0: number, h = 1e-5): number {
  return (fn(x0 + h) - fn(x0 - h)) / (2 * h);
}

/**
 * Generates standalone clean Python Manim CE code for Essence of Calculus secant-to-tangent animation.
 */
export function generateCalculusPythonCode(
  preset: CalculusPreset,
  x0: number,
  initialDx = 1.0
): string {
  return `from manim import *

class CalculusTangentScene(Scene):
    def construct(self):
        # 1. 创建坐标系
        axes = Axes(
            x_range=[${preset.domain[0]}, ${preset.domain[1]}, 1],
            y_range=[-3, 5, 1],
            x_length=8,
            y_length=5,
            axis_config={"include_numbers": True, "tip_shape": StealthTip},
        ).to_edge(LEFT, buff=0.8)

        # 2. 原函数曲线 y = f(x)
        graph = axes.plot(lambda x: ${preset.fnExpr.replace('^', '**').replace('exp', 'np.exp').replace('sin', 'np.sin').replace('cos', 'np.cos')}, color=BLUE, stroke_width=3.5)
        graph_label = axes.get_graph_label(graph, label="f(x) = ${preset.fnExpr}", x_val=${preset.domain[1] * 0.75})

        # 3. 动态切线与割线 ValueTracker
        dx_tracker = ValueTracker(${initialDx.toFixed(2)})
        x0 = ${x0.toFixed(2)}

        # 点 P(x0, f(x0)) 与点 Q(x0 + dx, f(x0 + dx))
        dot_p = always_redraw(lambda: Dot(axes.c2p(x0, graph.underlying_function(x0)), color=YELLOW))
        dot_q = always_redraw(lambda: Dot(axes.c2p(x0 + dx_tracker.get_value(), graph.underlying_function(x0 + dx_tracker.get_value())), color=ORANGE))

        # 割线连接 P 与 Q
        secant_line = always_redraw(lambda: axes.get_secant_slope_group(
            x=x0,
            graph=graph,
            dx=dx_tracker.get_value(),
            dx_line_color=YELLOW,
            df_line_color=GREEN,
            secant_line_color=RED,
            secant_line_length=4,
        ))

        # 标题与导数定义公式
        title = Text("3B1B 微积分本质：割线逼近切线", font_size=28).to_edge(UP)
        formula = MathTex(
            r"f'(x_0) = \\lim_{\\Delta x \\to 0} \\frac{f(x_0 + \\Delta x) - f(x_0)}{\\Delta x}",
            font_size=26,
            color=YELLOW
        ).next_to(title, DOWN)

        # 4. 播放动画：先绘制函数与初始割线，再让 dx -> 0 演化为切线
        self.play(Write(title), FadeIn(formula))
        self.play(Create(axes), Create(graph), FadeIn(graph_label))
        self.play(FadeIn(dot_p), FadeIn(dot_q), Create(secant_line))
        self.wait(1)

        # 极限演化：让 dx 连续逼近 0 (0.01)
        self.play(dx_tracker.animate.set_value(0.01), run_time=3.5, rate_func=smooth)
        self.wait(2)
`;
}

/**
 * Inserts actions for coordinate axes, curve and tangent line into AnyVis project.
 */
export function createCalculusActions(
  project: Project,
  preset: CalculusPreset,
  name = '微积分曲线'
): { project: Project; actionIds: string[] } {
  const axesAction = createAction('axes', {
    name: '坐标系',
    xMin: preset.domain[0],
    xMax: preset.domain[1],
    xStep: 1,
    yMin: -3,
    yMax: 5,
    yStep: 1,
    appear: 'create',
    duration: 1.5,
  });

  const curveAction = createAction('function_plot', {
    name,
    axes: '坐标系',
    expression: preset.fnExpr,
    xMin: preset.domain[0],
    xMax: preset.domain[1],
    color: '#38BDF8',
    appear: 'create',
    duration: 2.0,
  });

  const derivAction = createAction('function_plot', {
    name: `${name}_导函数`,
    axes: '坐标系',
    expression: preset.derivativeExpr,
    xMin: preset.domain[0],
    xMax: preset.domain[1],
    color: '#FBBF24',
    appear: 'create',
    duration: 1.5,
  });

  const nextProject: Project = {
    ...project,
    actions: [...project.actions, axesAction, curveAction, derivAction],
  };

  return {
    project: nextProject,
    actionIds: [axesAction.id, curveAction.id, derivAction.id],
  };
}
