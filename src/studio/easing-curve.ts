import type { Action } from './core/types';
import { getBlockDefinition } from './core/catalog';

export interface EasingPreset {
  id: string;
  name: string;
  description: string;
  coords: [number, number, number, number]; // [x1, y1, x2, y2]
}

export const EASING_PRESETS: EasingPreset[] = [
  {
    id: 'linear',
    name: '匀速线性 (Linear)',
    description: '恒定速度移动，无加减速',
    coords: [0, 0, 1, 1],
  },
  {
    id: 'smooth-3b1b',
    name: '3B1B 平滑 (Smooth)',
    description: '3Blue1Brown 最经典的柔和缓入缓出',
    coords: [0.25, 0.1, 0.25, 1.0],
  },
  {
    id: 'ease-in-out',
    name: '标准缓入缓出 (Ease In-Out)',
    description: '两端对称缓慢，中间加速',
    coords: [0.42, 0, 0.58, 1],
  },
  {
    id: 'ease-out',
    name: '自然缓出 (Ease Out)',
    description: '快速起步，平稳减速停驻',
    coords: [0, 0, 0.58, 1],
  },
  {
    id: 'ease-in',
    name: '沉稳缓入 (Ease In)',
    description: '缓慢启动，末尾高速冲刺',
    coords: [0.42, 0, 1, 1],
  },
  {
    id: 'overshoot',
    name: '回弹超越 (Overshoot)',
    description: '冲出终点后弹回，充满活力',
    coords: [0.34, 1.56, 0.64, 1],
  },
  {
    id: 'anticipate',
    name: '蓄力起跑 (Anticipate)',
    description: '后撤蓄力，随后向前弹射',
    coords: [0.36, 0, 0.66, -0.56],
  },
  {
    id: 'anticipate-overshoot',
    name: '蓄力回弹 (Anticipate & Pop)',
    description: '前后双向超越，卡通风格质感',
    coords: [0.68, -0.6, 0.32, 1.6],
  },
  {
    id: 'spring-fluid',
    name: '流体弹簧 (iOS Fluid Spring)',
    description: '超平滑高阻尼回弹，现代操作系统级物理质感',
    coords: [0.25, 1.0, 0.5, 1.0],
  },
  {
    id: 'snappy-expo',
    name: '迅猛定格 (Snappy Decel)',
    description: '极速响应瞬移后迅速定格',
    coords: [0.16, 1.0, 0.3, 1.0],
  },
];

/**
 * Evaluates polynomial coordinate of cubic bezier at parameter t in [0, 1]
 */
function bezierCoord(p1: number, p2: number, t: number): number {
  const mt = 1 - t;
  // B(t) = 3*mt^2*t*p1 + 3*mt*t^2*p2 + t^3
  return 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t;
}

/**
 * Derivative of cubic bezier coordinate with respect to t
 */
function bezierCoordDerivative(p1: number, p2: number, t: number): number {
  const mt = 1 - t;
  return 3 * mt * mt * p1 + 6 * mt * t * (p2 - p1) + 3 * t * t * (1 - p2);
}

/**
 * Solves for parameter t given x in [0, 1] using Newton-Raphson with bisection fallback
 */
export function solveCubicBezierT(x1: number, x2: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  // Initial guess
  let t = x;

  // Newton-Raphson iterations
  for (let i = 0; i < 8; i++) {
    const currentX = bezierCoord(x1, x2, t) - x;
    if (Math.abs(currentX) < 1e-6) return t;
    const dX = bezierCoordDerivative(x1, x2, t);
    if (Math.abs(dX) < 1e-6) break;
    t -= currentX / dX;
    if (t < 0 || t > 1) break;
  }

  // Fallback to binary search / bisection
  let t0 = 0;
  let t1 = 1;
  t = x;

  for (let i = 0; i < 16; i++) {
    const currentX = bezierCoord(x1, x2, t);
    if (Math.abs(currentX - x) < 1e-6) return t;
    if (currentX < x) {
      t0 = t;
    } else {
      t1 = t;
    }
    t = (t0 + t1) / 2;
  }

  return t;
}

/**
 * Evaluates cubic-bezier(x1, y1, x2, y2) at normalized progress x in [0, 1]
 */
export function sampleCubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x: number
): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const t = solveCubicBezierT(x1, x2, x);
  return bezierCoord(y1, y2, t);
}

/**
 * Computes velocity / derivative dy/dx of the easing curve at progress x
 */
export function sampleCubicBezierDerivative(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x: number
): number {
  const safeX = Math.max(0.001, Math.min(0.999, x));
  const t = solveCubicBezierT(x1, x2, safeX);
  const dx = bezierCoordDerivative(x1, x2, t);
  const dy = bezierCoordDerivative(y1, y2, t);
  if (Math.abs(dx) < 1e-6) return 1.0;
  return dy / dx;
}

/**
 * Generates standalone Python code for Manim CE custom bezier rate function
 */
export function generateBezierRateFuncPython(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): string {
  return `from manim import *
import numpy as np

def custom_bezier_rate_func(t: float) -> float:
    """
    Custom Cubic Bezier Easing Function
    cubic-bezier(${x1.toFixed(3)}, ${y1.toFixed(3)}, ${x2.toFixed(3)}, ${y2.toFixed(3)})
    Evaluated with De Casteljau subdivision.
    """
    if t <= 0.0:
        return 0.0
    if t >= 1.0:
        return 1.0
    
    # CSS-style easing uses y at the parameter whose x equals elapsed time.
    x_curve = bezier([0.0, ${x1}, ${x2}, 1.0])
    y_curve = bezier([0.0, ${y1}, ${y2}, 1.0])
    lo, hi = 0.0, 1.0
    for _ in range(50):
        u = (lo + hi) / 2
        if x_curve(u) < t:
            lo = u
        else:
            hi = u
    return y_curve((lo + hi) / 2)

# Example Usage in Scene:
# self.play(mobject.animate.shift(RIGHT * 3), run_time=1.5, rate_func=custom_bezier_rate_func)
`;
}

/**
 * Updates an animation action to use the custom rate function and coordinates
 */
export function applyRateFuncToAction(
  action: Action,
  _rateFuncName: string,
  bezierCoords: [number, number, number, number]
): Action {
  if (!getBlockDefinition(action.type)?.fields.some(f => f.name === 'easing')) throw new Error('请选择支持节奏设置的动画片段。');
  if (!bezierCoords.every(Number.isFinite) || bezierCoords[0] !== bezierCoords[1] || bezierCoords[2] !== bezierCoords[3]) {
    throw new Error('自定义贝塞尔曲线目前支持预览和 Python 导出；工程内暂仅支持应用匀速曲线。');
  }
  return { ...action, fields: { ...action.fields, easing: 'linear' } };
}
