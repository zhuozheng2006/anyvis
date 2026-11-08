import { MANIM_FRAME_HALF_WIDTH, MANIM_FRAME_HALF_HEIGHT, clampAndSnapCoord } from './PositionPad';

export function manimToStagePercent(
  x: number,
  y: number
): { leftPercent: number; topPercent: number } {
  const clampedX = Math.max(-MANIM_FRAME_HALF_WIDTH, Math.min(MANIM_FRAME_HALF_WIDTH, x));
  const clampedY = Math.max(-MANIM_FRAME_HALF_HEIGHT, Math.min(MANIM_FRAME_HALF_HEIGHT, y));

  const leftPercent = ((clampedX + MANIM_FRAME_HALF_WIDTH) / (2 * MANIM_FRAME_HALF_WIDTH)) * 100;
  const topPercent = ((MANIM_FRAME_HALF_HEIGHT - clampedY) / (2 * MANIM_FRAME_HALF_HEIGHT)) * 100;

  return { leftPercent, topPercent };
}

export function stagePercentToManim(
  leftPercent: number,
  topPercent: number,
  step = 0.1
): { x: number; y: number } {
  const ratioX = Math.max(0, Math.min(100, leftPercent)) / 100;
  const ratioY = Math.max(0, Math.min(100, topPercent)) / 100;

  const rawX = (ratioX * 2 - 1) * MANIM_FRAME_HALF_WIDTH;
  const rawY = (1 - ratioY * 2) * MANIM_FRAME_HALF_HEIGHT;

  // Snap close to 0 if within snap threshold
  let x = clampAndSnapCoord(rawX, MANIM_FRAME_HALF_WIDTH, step);
  let y = clampAndSnapCoord(rawY, MANIM_FRAME_HALF_HEIGHT, step);

  if (Math.abs(x) < step * 0.75) x = 0;
  if (Math.abs(y) < step * 0.75) y = 0;

  return { x, y };
}

export const GIZMO_PALETTE = [
  { label: '天蓝', color: '#58C4DD' },
  { label: '翠绿', color: '#83C167' },
  { label: '金黄', color: '#FFFF00' },
  { label: '赤红', color: '#FC6255' },
  { label: '淡紫', color: '#9A72AC' },
  { label: '橙黄', color: '#FF862F' },
  { label: '纯白', color: '#FFFFFF' },
  { label: '墨黑', color: '#222222' },
];
