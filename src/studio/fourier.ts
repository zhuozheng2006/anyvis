/**
 * 3B1B-style Fourier Epicycles pure mathematical calculation and code generation.
 */

import type { Project } from './core/types.ts';
import { createAction } from './core/catalog.ts';
import { appendPlaygroundActions, playgroundName, playgroundPolyline, emptyPlayground, playgroundPython } from './playground-actions.ts';

export interface Point2D {
  x: number;
  y: number;
}

export interface FourierCoefficient {
  freq: number;
  re: number;
  im: number;
  amp: number;
  phase: number;
}

export interface EpicycleCircle {
  centerX: number;
  centerY: number;
  radius: number;
  tipX: number;
  tipY: number;
  angle: number;
  freq: number;
}

/**
 * Computes Discrete Fourier Transform (DFT) for a closed 2D loop.
 * Points are parameterized on t in [0, 1].
 */
export function computeDft(points: Point2D[], maxHarmonics = 20): FourierCoefficient[] {
  const M = points.length;
  if (M === 0) return [];

  const coeffs: FourierCoefficient[] = [];
  const limit = Number.isFinite(maxHarmonics) ? Math.max(1, Math.min(60, Math.round(maxHarmonics))) : 20;

  for (let n = -limit; n <= limit; n++) {
    let re = 0;
    let im = 0;

    for (let k = 0; k < M; k++) {
      const phi = (2 * Math.PI * n * k) / M;
      const cosPhi = Math.cos(phi);
      const sinPhi = Math.sin(phi);
      // z_k * e^(-i * phi) = (x + iy)(cos - i sin) = (x cos + y sin) + i(y cos - x sin)
      re += points[k].x * cosPhi + points[k].y * sinPhi;
      im += points[k].y * cosPhi - points[k].x * sinPhi;
    }

    re /= M;
    im /= M;

    const amp = Math.hypot(re, im);
    const phase = Math.atan2(im, re);
    coeffs.push({ freq: n, re, im, amp, phase });
  }

  // Sort by descending amplitude for optimal epicycle circle ordering (like 3Blue1Brown)
  coeffs.sort((a, b) => b.amp - a.amp);
  return coeffs;
}

/**
 * Evaluates sum of Fourier series at time t in [0, 1].
 */
export function evaluateFourier(coeffs: FourierCoefficient[], t: number): Point2D {
  let x = 0;
  let y = 0;
  for (const c of coeffs) {
    const angle = 2 * Math.PI * c.freq * t + c.phase;
    x += c.amp * Math.cos(angle);
    y += c.amp * Math.sin(angle);
  }
  return { x, y };
}

/**
 * Calculates all individual rotating circles and vector tips at time t in [0, 1].
 */
export function computeEpicycles(coeffs: FourierCoefficient[], t: number): {
  circles: EpicycleCircle[];
  endTip: Point2D;
} {
  const circles: EpicycleCircle[] = [];
  let currentX = 0;
  let currentY = 0;

  for (const c of coeffs) {
    const angle = 2 * Math.PI * c.freq * t + c.phase;
    const nextX = currentX + c.amp * Math.cos(angle);
    const nextY = currentY + c.amp * Math.sin(angle);

    circles.push({
      centerX: currentX,
      centerY: currentY,
      radius: c.amp,
      tipX: nextX,
      tipY: nextY,
      angle,
      freq: c.freq,
    });

    currentX = nextX;
    currentY = nextY;
  }

  return {
    circles,
    endTip: { x: currentX, y: currentY },
  };
}

/**
 * Computes approximation fidelity R^2 between original points and reconstructed points.
 */
export function computeFourierFidelity(original: Point2D[], coeffs: FourierCoefficient[]): number {
  if (original.length < 2 || coeffs.length === 0) return 100;
  let totalDistSq = 0;
  let meanX = 0;
  let meanY = 0;

  for (const p of original) {
    meanX += p.x;
    meanY += p.y;
  }
  meanX /= original.length;
  meanY /= original.length;

  let totalVariance = 0;
  for (let i = 0; i < original.length; i++) {
    const orig = original[i];
    const t = i / original.length;
    const recon = evaluateFourier(coeffs, t);
    const errX = orig.x - recon.x;
    const errY = orig.y - recon.y;
    totalDistSq += errX * errX + errY * errY;
    totalVariance += (orig.x - meanX) ** 2 + (orig.y - meanY) ** 2;
  }

  if (totalVariance <= 1e-9) return 100;
  const r2 = Math.max(0, 1 - totalDistSq / totalVariance);
  return Math.min(100, Math.round(r2 * 1000) / 10);
}

/**
 * Generates closed point samples for mathematical shape presets.
 */
export type FourierPresetId = 'pi' | 'heart' | 'trefoil' | 'star' | 'square' | 'infinity' | 'cardioid';

export function getFourierPreset(id: FourierPresetId, sampleCount = 200): Point2D[] {
  const points: Point2D[] = [];
  const N = Number.isFinite(sampleCount) ? Math.max(4, Math.round(sampleCount)) : 200;

  switch (id) {
    case 'pi': {
      // 3B1B iconic Pi character polygonal outline
      const rawPi: [number, number][] = [
        [-2.0, 1.4], [2.0, 1.4], [2.1, 1.1], [1.7, 1.1],
        [1.1, 1.1], [1.15, -1.2], [1.4, -1.4], [1.7, -1.4],
        [1.7, -1.6], [0.7, -1.6], [0.7, -1.4], [0.85, -1.4],
        [0.85, 1.1], [-0.85, 1.1], [-0.95, -1.0], [-1.2, -1.5],
        [-1.6, -1.6], [-1.8, -1.4], [-1.6, -1.2], [-1.4, -1.2],
        [-1.2, -0.8], [-1.1, 1.1], [-1.8, 1.1], [-2.0, 1.4],
      ];
      // Interpolate perimeter linearly
      return samplePolyline(rawPi.map(([x, y]) => ({ x, y })), N);
    }

    case 'heart': {
      for (let i = 0; i < N; i++) {
        const t = (i / N) * 2 * Math.PI;
        const x = 1.6 * Math.sin(t) ** 3;
        const y = (1.3 * Math.cos(t) - 0.5 * Math.cos(2 * t) - 0.2 * Math.cos(3 * t) - 0.1 * Math.cos(4 * t));
        points.push({ x, y });
      }
      return points;
    }

    case 'trefoil': {
      for (let i = 0; i < N; i++) {
        const t = (i / N) * 2 * Math.PI;
        const x = 0.8 * (Math.sin(t) + 2 * Math.sin(2 * t));
        const y = 0.8 * (Math.cos(t) - 2 * Math.cos(2 * t));
        points.push({ x, y });
      }
      return points;
    }

    case 'star': {
      const vertices = 5;
      const pts: Point2D[] = [];
      for (let i = 0; i < vertices * 2; i++) {
        const angle = (i / (vertices * 2)) * 2 * Math.PI - Math.PI / 2;
        const r = i % 2 === 0 ? 1.8 : 0.75;
        pts.push({ x: r * Math.cos(angle), y: r * Math.sin(angle) });
      }
      pts.push(pts[0]);
      return samplePolyline(pts, N);
    }

    case 'square': {
      const s = 1.5;
      const poly: Point2D[] = [
        { x: -s, y: -s }, { x: s, y: -s }, { x: s, y: s }, { x: -s, y: s }, { x: -s, y: -s },
      ];
      return samplePolyline(poly, N);
    }

    case 'infinity': {
      for (let i = 0; i < N; i++) {
        const t = (i / N) * 2 * Math.PI;
        const denom = 1 + Math.sin(t) ** 2;
        const x = (2.2 * Math.cos(t)) / denom;
        const y = (2.2 * Math.sin(t) * Math.cos(t)) / denom;
        points.push({ x, y });
      }
      return points;
    }

    case 'cardioid': {
      for (let i = 0; i < N; i++) {
        const t = (i / N) * 2 * Math.PI;
        const r = 1.0 * (1 - Math.sin(t));
        const x = r * Math.cos(t);
        const y = r * Math.sin(t) + 0.5;
        points.push({ x, y });
      }
      return points;
    }
  }
}

function samplePolyline(pts: Point2D[], targetCount: number): Point2D[] {
  let totalLen = 0;
  const segLens: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    segLens.push(len);
    totalLen += len;
  }

  const out: Point2D[] = [];
  for (let j = 0; j < targetCount; j++) {
    const targetDist = (j / targetCount) * totalLen;
    let accumulated = 0;
    let placed = false;

    for (let i = 0; i < segLens.length; i++) {
      if (accumulated + segLens[i] >= targetDist || i === segLens.length - 1) {
        const segRemain = targetDist - accumulated;
        const alpha = segLens[i] > 0 ? Math.min(1, Math.max(0, segRemain / segLens[i])) : 0;
        out.push({
          x: pts[i].x + alpha * (pts[i + 1].x - pts[i].x),
          y: pts[i].y + alpha * (pts[i + 1].y - pts[i].y),
        });
        placed = true;
        break;
      }
      accumulated += segLens[i];
    }

    if (!placed) out.push(pts[pts.length - 1]);
  }
  return out;
}

/**
 * Generates standalone clean Python Manim CE code for Fourier series epicycles animation.
 */
export function generateFourierPythonCode(coeffs: FourierCoefficient[], presetName = 'FourierCurve', duration = 5): string {
  return playgroundPython(createFourierActions(emptyPlayground(), coeffs, presetName, duration), 'FourierEpicyclesScene');
}

export function createFourierActions(project: Project, coeffs: FourierCoefficient[], name = '傅里叶曲线', duration = 4): { project: Project; actionIds: string[] } {
  if (!coeffs.length) throw new Error('请先绘制一条曲线。');
  // Retain every selected harmonic. Sample at >= 12 points per highest-frequency period.
  const steps = Math.max(240, 12 * Math.max(...coeffs.map(c => Math.abs(c.freq))));
  const points = Array.from({length: steps + 1}, (_,i) => {
    const p = evaluateFourier(coeffs, i/steps);
    return [Number(p.x.toFixed(6)), Number(p.y.toFixed(6)), 0];
  });
  const curveName = playgroundName(name);
  const actions = playgroundPolyline(curveName, points, '#FBBF24', false);
  actions.push(createAction('create', { target: curveName, duration, easing: 'linear' }));
  return appendPlaygroundActions(project, actions);
}
