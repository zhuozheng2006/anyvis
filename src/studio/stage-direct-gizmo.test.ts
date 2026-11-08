import { describe, it, expect } from 'vitest';
import { manimToStagePercent, stagePercentToManim, GIZMO_PALETTE } from './stage-direct-gizmo';

describe('stage-direct-gizmo coordinates', () => {
  it('converts Manim origin (0, 0) to stage center (50%, 50%)', () => {
    const { leftPercent, topPercent } = manimToStagePercent(0, 0);
    expect(leftPercent).toBeCloseTo(50, 1);
    expect(topPercent).toBeCloseTo(50, 1);
  });

  it('converts stage center (50%, 50%) back to Manim origin (0, 0)', () => {
    const { x, y } = stagePercentToManim(50, 50);
    expect(x).toBe(0);
    expect(y).toBe(0);
  });

  it('converts upper-left and lower-right coordinates correctly', () => {
    // Upper-left (-7.1, 4.0) -> (0%, 0%)
    const ul = manimToStagePercent(-7.1, 4.0);
    expect(ul.leftPercent).toBeCloseTo(0, 1);
    expect(ul.topPercent).toBeCloseTo(0, 1);

    // Lower-right (7.1, -4.0) -> (100%, 100%)
    const dr = manimToStagePercent(7.1, -4.0);
    expect(dr.leftPercent).toBeCloseTo(100, 1);
    expect(dr.topPercent).toBeCloseTo(100, 1);
  });

  it('snaps near-zero coordinates to exact 0', () => {
    const nearZero = stagePercentToManim(50.1, 49.9);
    expect(nearZero.x).toBe(0);
    expect(nearZero.y).toBe(0);
  });

  it('has standard palette colors', () => {
    expect(GIZMO_PALETTE.length).toBe(8);
    expect(GIZMO_PALETTE[0].color).toBe('#58C4DD');
  });
});
