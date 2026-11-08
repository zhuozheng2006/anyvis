import { describe, expect, it } from 'vitest';
import {
  clampAndSnapCoord,
  clientRatioToManimCoords,
  MANIM_FRAME_HALF_HEIGHT,
  MANIM_FRAME_HALF_WIDTH,
  SHIFT_VECTOR_PRESETS,
  STAGE_POSITION_PRESETS,
} from './PositionPad';

describe('PositionPad coordinate mapping and alignment presets', () => {
  it('maps normalized pointer ratios to Manim frame coordinates accurately', () => {
    expect(clientRatioToManimCoords(0.5, 0.5)).toEqual({ x: 0, y: 0 });
    expect(clientRatioToManimCoords(0, 0)).toEqual({
      x: -MANIM_FRAME_HALF_WIDTH,
      y: MANIM_FRAME_HALF_HEIGHT,
    });
    expect(clientRatioToManimCoords(1, 1)).toEqual({
      x: MANIM_FRAME_HALF_WIDTH,
      y: -MANIM_FRAME_HALF_HEIGHT,
    });
  });

  it('clamps out-of-bounds coordinates and snaps to step granularity', () => {
    expect(clampAndSnapCoord(99, 7.1, 0.1)).toBe(7.1);
    expect(clampAndSnapCoord(-99, 4.0, 0.1)).toBe(-4.0);
    expect(clampAndSnapCoord(1.26, 7.1, 0.5)).toBe(1.5);
  });

  it('provides 9 canonical stage alignment and shift vector presets', () => {
    expect(STAGE_POSITION_PRESETS).toHaveLength(9);
    expect(SHIFT_VECTOR_PRESETS).toHaveLength(9);
    expect(STAGE_POSITION_PRESETS.find(p => p.id === 'ORIGIN')).toMatchObject({ x: 0, y: 0 });
  });
});
