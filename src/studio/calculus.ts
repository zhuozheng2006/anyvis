/**
 * 3B1B-style Essence of Calculus pure mathematical calculation and code generation.
 */

import type { Project } from './core/types.ts';
import { createAction } from './core/catalog.ts';
import { appendPlaygroundActions, playgroundName, emptyPlayground, playgroundPython } from './playground-actions.ts';

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
    name: '洛伦兹钟形 f(x) = 1/(1+x²)',
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
export function generateCalculusPythonCode(preset: CalculusPreset, x0: number, initialDx = 1): string {
  return playgroundPython(createCalculusActions(emptyPlayground(), preset, '微积分曲线', x0, initialDx), 'CalculusTangentScene');
}

export function createCalculusActions(project: Project, preset: CalculusPreset, name = '微积分曲线', x0 = preset.defaultX, initialDx = 1): { project: Project; actionIds: string[] } {
  const axes = playgroundName('坐标系'), tracker = playgroundName('dx'), curve = playgroundName(name);
  const at = String(x0), next = `(${at}+${tracker})`;
  const f = (x: string) => preset.fnExpr.replace(/\bx\b/g, `(${x})`);
  const slope = `((${f(next)})-(${f(at)}))/${tracker}`;
  const actions = [
    createAction('axes', {name: axes, xMin: preset.domain[0], xMax: preset.domain[1], yMin: -3, yMax: 5}),
    createAction('function_plot', {name: curve, axes, expression: preset.fnExpr, xMin: preset.domain[0], xMax: preset.domain[1]}),
    createAction('tracker', {name: tracker, value: initialDx}),
    createAction('dynamic_dot', {name: playgroundName('切点'), axes, xExpr: at, yExpr: f(at)}),
    createAction('dynamic_dot', {name: playgroundName('割点'), axes, xExpr: next, yExpr: f(next)}),
    createAction('dynamic_line', {name: playgroundName('割线'), axes, x1Expr: `${at}-1`, y1Expr: `(${f(at)})-(${slope})`, x2Expr: `${at}+1`, y2Expr: `(${f(at)})+(${slope})`}),
    createAction('animate_value', {target: tracker, value: 0.01, duration: 3.5}),
  ];
  return appendPlaygroundActions(project, actions);
}
