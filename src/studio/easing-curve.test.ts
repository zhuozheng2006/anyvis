import { describe, it, expect } from 'vitest';
import {
  EASING_PRESETS,
  sampleCubicBezier,
  sampleCubicBezierDerivative,
  generateBezierRateFuncPython,
  applyRateFuncToAction,
  type EasingPreset,
} from './easing-curve';

describe('easing curve engine', () => {
  it('has valid easing presets', () => {
    expect(EASING_PRESETS.length).toBeGreaterThanOrEqual(8);
    const linear = EASING_PRESETS.find(p => p.id === 'linear')!;
    expect(linear).toBeDefined();
    expect(linear.coords).toEqual([0, 0, 1, 1]);
  });

  it('samples linear cubic bezier with exact identity y = x', () => {
    for (let x = 0; x <= 1; x += 0.1) {
      const y = sampleCubicBezier(0, 0, 1, 1, x);
      expect(y).toBeCloseTo(x, 4);
    }
  });

  it('samples boundary conditions: f(0) = 0 and f(1) = 1', () => {
    for (const preset of EASING_PRESETS) {
      const [x1, y1, x2, y2] = preset.coords;
      expect(sampleCubicBezier(x1, y1, x2, y2, 0)).toBeCloseTo(0, 4);
      expect(sampleCubicBezier(x1, y1, x2, y2, 1)).toBeCloseTo(1, 4);
    }
  });

  it('correctly handles overshoot (y > 1) and anticipate (y < 0)', () => {
    const overshoot = EASING_PRESETS.find(p => p.id === 'overshoot')!;
    const [ox1, oy1, ox2, oy2] = overshoot.coords;
    // Samples at mid-point should exceed 1.0 due to overshoot
    const peakY = sampleCubicBezier(ox1, oy1, ox2, oy2, 0.7);
    expect(peakY).toBeGreaterThan(1.0);

    const anticipate = EASING_PRESETS.find(p => p.id === 'anticipate')!;
    const [ax1, ay1, ax2, ay2] = anticipate.coords;
    // Anticipate pulls back below 0 in early phase
    const dipY = sampleCubicBezier(ax1, ay1, ax2, ay2, 0.3);
    expect(dipY).toBeLessThan(0.0);
  });

  it('computes derivative (speed / velocity) accurately', () => {
    // For linear (0,0,1,1), derivative dy/dx should be 1.0 everywhere
    const vMid = sampleCubicBezierDerivative(0, 0, 1, 1, 0.5);
    expect(vMid).toBeCloseTo(1.0, 2);
  });

  it('generates runnable Python Manim custom bezier rate function', () => {
    const py = generateBezierRateFuncPython(0.25, 0.1, 0.25, 1.0);
    expect(py).toContain('def custom_bezier_rate_func');
    expect(py).toContain('bezier');
  });

  it('applies custom rate function to action fields safely', () => {
    const action = {
      id: 'act_1',
      type: 'move_to',
      fields: { target: 'dot1', rate_func: 'linear' },
      children: [],
    };

    const updated = applyRateFuncToAction(action, 'custom_bezier', [0.34, 1.56, 0.64, 1]);
    expect(updated.fields.rate_func).toBe('custom_bezier');
    expect(updated.fields.bezier_coords).toBe('0.34,1.56,0.64,1');
  });
});
