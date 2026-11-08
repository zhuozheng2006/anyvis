import { describe, expect, it } from 'vitest';
import {
  evaluateScalarExpressionAt,
  EXPRESSION_PRESETS,
  sampleExpressionCurve,
} from './ExpressionPlotPreview';

describe('ExpressionPlotPreview evaluator & curve sampler', () => {
  it('evaluates elementary functions, powers, constants, and tracker variables accurately', () => {
    expect(evaluateScalarExpressionAt('sin(0) + cos(0)', { x: 0 })).toBeCloseTo(1, 6);
    expect(evaluateScalarExpressionAt('x^2 / 2 + k', { x: 4, k: 1.5 })).toBeCloseTo(9.5, 6);
    expect(evaluateScalarExpressionAt('2 ** 3 - sqrt(9)', { x: 0 })).toBeCloseTo(5, 6);
    expect(evaluateScalarExpressionAt('max(min(x, 2), -2)', { x: 5 })).toBe(2);
    expect(evaluateScalarExpressionAt('pi / 2', { x: 0 })).toBeCloseTo(Math.PI / 2, 6);
  });

  it('samples all built-in presets without error and computes valid y bounds', () => {
    for (const preset of EXPRESSION_PRESETS) {
      const res = sampleExpressionCurve(preset.expr);
      expect(res.valid).toBe(true);
      expect(res.samples.length).toBeGreaterThan(20);
      expect(res.yMax).toBeGreaterThan(res.yMin);
    }
  });

  it('reports syntax or unknown identifier errors aligned with the compiler', () => {
    const badVar = sampleExpressionCurve('sin(unknown_var)');
    expect(badVar.valid).toBe(false);
    expect(badVar.error).toContain('未定义数学变量');

    const withTracker = sampleExpressionCurve('k * sin(x)', { k: 2 });
    expect(withTracker.valid).toBe(true);
    const midSample = withTracker.samples.find(s => Math.abs(s.x - Math.PI / 2) < 0.2);
    expect(midSample?.y).toBeGreaterThan(1.5);
  });
});
