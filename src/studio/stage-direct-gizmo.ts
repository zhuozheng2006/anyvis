import { MANIM_FRAME_HALF_WIDTH, MANIM_FRAME_HALF_HEIGHT, clampAndSnapCoord } from './PositionPad';

export function manimToStagePercent(
  x: number,
  y: number,
  halfWidth = MANIM_FRAME_HALF_WIDTH,
): { leftPercent: number; topPercent: number } {
  const safeHalfWidth = Number.isFinite(halfWidth) && halfWidth > 0 ? halfWidth : MANIM_FRAME_HALF_WIDTH;
  const safeX = Number.isFinite(x) ? x : 0;
  const safeY = Number.isFinite(y) ? y : 0;
  const clampedX = Math.max(-safeHalfWidth, Math.min(safeHalfWidth, safeX));
  const clampedY = Math.max(-MANIM_FRAME_HALF_HEIGHT, Math.min(MANIM_FRAME_HALF_HEIGHT, safeY));

  const leftPercent = ((clampedX + safeHalfWidth) / (2 * safeHalfWidth)) * 100;
  const topPercent = ((MANIM_FRAME_HALF_HEIGHT - clampedY) / (2 * MANIM_FRAME_HALF_HEIGHT)) * 100;

  return { leftPercent, topPercent };
}

export function stagePercentToManim(
  leftPercent: number,
  topPercent: number,
  step = 0.1,
  halfWidth = MANIM_FRAME_HALF_WIDTH,
): { x: number; y: number } {
  const safeHalfWidth = Number.isFinite(halfWidth) && halfWidth > 0 ? halfWidth : MANIM_FRAME_HALF_WIDTH;
  const safeStep = Number.isFinite(step) && step > 0 ? step : 0.1;
  const safeLeft = Number.isFinite(leftPercent) ? leftPercent : 50;
  const safeTop = Number.isFinite(topPercent) ? topPercent : 50;
  const ratioX = Math.max(0, Math.min(100, safeLeft)) / 100;
  const ratioY = Math.max(0, Math.min(100, safeTop)) / 100;

  const rawX = (ratioX * 2 - 1) * safeHalfWidth;
  const rawY = (1 - ratioY * 2) * MANIM_FRAME_HALF_HEIGHT;

  // Snap close to 0 if within snap threshold
  let x = clampAndSnapCoord(rawX, safeHalfWidth, safeStep);
  let y = clampAndSnapCoord(rawY, MANIM_FRAME_HALF_HEIGHT, safeStep);

  if (Math.abs(x) < safeStep * 0.75) x = 0;
  if (Math.abs(y) < safeStep * 0.75) y = 0;

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
