import React, { useRef, useState } from 'react';
import { capturePointerSafe, releasePointerSafe } from './modal-hooks';
import './position-pad.css';

export interface PositionPreset {
  id: string;
  label: string;
  symbol: string;
  x: number;
  y: number;
}

export const STAGE_POSITION_PRESETS: ReadonlyArray<PositionPreset> = [
  { id: 'UL', label: '左上 (UL)', symbol: '↖', x: -4.5, y: 2.5 },
  { id: 'UP', label: '上方 (UP)', symbol: '↑', x: 0, y: 2.5 },
  { id: 'UR', label: '右上 (UR)', symbol: '↗', x: 4.5, y: 2.5 },
  { id: 'LEFT', label: '左侧 (LEFT)', symbol: '←', x: -4.5, y: 0 },
  { id: 'ORIGIN', label: '中心 (ORIGIN)', symbol: '·', x: 0, y: 0 },
  { id: 'RIGHT', label: '右侧 (RIGHT)', symbol: '→', x: 4.5, y: 0 },
  { id: 'DL', label: '左下 (DL)', symbol: '↙', x: -4.5, y: -2.5 },
  { id: 'DOWN', label: '下方 (DOWN)', symbol: '↓', x: 0, y: -2.5 },
  { id: 'DR', label: '右下 (DR)', symbol: '↘', x: 4.5, y: -2.5 },
];

export const SHIFT_VECTOR_PRESETS: ReadonlyArray<PositionPreset> = [
  { id: 'UL', label: '左上偏移 (-2, +1.5)', symbol: '↖', x: -2, y: 1.5 },
  { id: 'UP', label: '向上偏移 (0, +1.5)', symbol: '↑', x: 0, y: 1.5 },
  { id: 'UR', label: '右上偏移 (+2, +1.5)', symbol: '↗', x: 2, y: 1.5 },
  { id: 'LEFT', label: '向左偏移 (-2, 0)', symbol: '←', x: -2, y: 0 },
  { id: 'ORIGIN', label: '归零 (0, 0)', symbol: '·', x: 0, y: 0 },
  { id: 'RIGHT', label: '向右偏移 (+2, 0)', symbol: '→', x: 2, y: 0 },
  { id: 'DL', label: '左下偏移 (-2, -1.5)', symbol: '↙', x: -2, y: -1.5 },
  { id: 'DOWN', label: '向下偏移 (0, -1.5)', symbol: '↓', x: 0, y: -1.5 },
  { id: 'DR', label: '右下偏移 (+2, -1.5)', symbol: '↘', x: 2, y: -1.5 },
];

const DEFAULT_FRAME_ASPECT = 16 / 9;
// Keep the legacy rounded width for callers that display the default bounds.
export const MANIM_FRAME_HALF_WIDTH = 7.1;
export const MANIM_FRAME_HALF_HEIGHT = 4.0;

function safeFrameAspect(frameAspect: number): number {
  return Number.isFinite(frameAspect) && frameAspect > 0 ? frameAspect : DEFAULT_FRAME_ASPECT;
}

function formatCoordinate(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return rounded.toFixed(Number.isInteger(rounded * 10) ? 1 : 2);
}

export function stagePositionPresets(frameAspect = DEFAULT_FRAME_ASPECT): ReadonlyArray<PositionPreset> {
  const aspect = safeFrameAspect(frameAspect);
  const halfWidth = MANIM_FRAME_HALF_HEIGHT * aspect;
  return STAGE_POSITION_PRESETS.map(preset => ({
    ...preset,
    x: clampAndSnapCoord(preset.x * aspect / DEFAULT_FRAME_ASPECT, halfWidth),
  }));
}

export function clampAndSnapCoord(val: number, maxAbs: number, step = 0.1): number {
  if (!Number.isFinite(val) || !Number.isFinite(maxAbs) || !Number.isFinite(step) || step <= 0) {
    return 0;
  }
  const clamped = Math.max(-maxAbs, Math.min(maxAbs, val));
  const snapped = Math.round(clamped / step) * step;
  // A portrait frame can end at 2.25; rounding to 0.1 must not escape its edge.
  return Math.max(-maxAbs, Math.min(maxAbs, Number(snapped.toFixed(2))));
}

export function clientRatioToManimCoords(
  ratioX: number,
  ratioY: number,
  step = 0.1,
  frameAspect = DEFAULT_FRAME_ASPECT
): { x: number; y: number } {
  const halfWidth = MANIM_FRAME_HALF_HEIGHT * safeFrameAspect(frameAspect);
  const rawX = (ratioX * 2 - 1) * halfWidth;
  const rawY = (1 - ratioY * 2) * MANIM_FRAME_HALF_HEIGHT;
  return {
    x: clampAndSnapCoord(rawX, halfWidth, step),
    y: clampAndSnapCoord(rawY, MANIM_FRAME_HALF_HEIGHT, step),
  };
}

export interface PositionPadProps {
  mode: 'position' | 'shift';
  x: number;
  y: number;
  frameAspect?: number;
  onChange(coords: { x: number; y: number }): void;
}

export const PositionPad: React.FC<PositionPadProps> = ({ mode, x, y, frameAspect = DEFAULT_FRAME_ASPECT, onChange }) => {
  const safeX = Number.isFinite(x) ? x : 0;
  const safeY = Number.isFinite(y) ? y : 0;
  const activePointer = useRef<number | null>(null);
  const [draftCoords, setDraftCoords] = useState<{ x: number; y: number } | null>(null);

  const aspect = safeFrameAspect(frameAspect);
  const halfWidth = MANIM_FRAME_HALF_HEIGHT * aspect;
  const positionPresets = stagePositionPresets(aspect);
  // Shift shortcuts describe explicit world-unit distances, so their values
  // stay fixed even when the canvas aspect ratio changes.
  const presets = mode === 'shift' ? SHIFT_VECTOR_PRESETS : positionPresets;
  const height = 90;
  const width = height * aspect;
  const safeInsetX = positionPresets.find(preset => preset.id === 'RIGHT')!.x;

  const toSvgX = (valX: number) =>
    ((Math.max(-halfWidth, Math.min(halfWidth, valX)) + halfWidth) /
      (2 * halfWidth)) *
    width;

  const toSvgY = (valY: number) =>
    ((MANIM_FRAME_HALF_HEIGHT - Math.max(-MANIM_FRAME_HALF_HEIGHT, Math.min(MANIM_FRAME_HALF_HEIGHT, valY))) /
      (2 * MANIM_FRAME_HALF_HEIGHT)) *
    height;

  const readCoordsFromPointer = ({ currentTarget, clientX, clientY, shiftKey }: React.PointerEvent<SVGSVGElement>) => {
    const rect = currentTarget.getBoundingClientRect();
    const ratioX = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    const ratioY = Math.max(0, Math.min(1, (clientY - rect.top) / Math.max(1, rect.height)));
    return clientRatioToManimCoords(ratioX, ratioY, shiftKey ? 0.5 : 0.1, aspect);
  };

  const cancelDrag = (target: SVGSVGElement, pointerId?: number) => {
    const owner = activePointer.current;
    if (owner === null || (pointerId !== undefined && owner !== pointerId)) return;
    activePointer.current = null;
    setDraftCoords(null);
    releasePointerSafe(target, owner);
  };

  const displayX = draftCoords?.x ?? safeX;
  const displayY = draftCoords?.y ?? safeY;
  const dotX = toSvgX(displayX);
  const dotY = toSvgY(displayY);
  const centerX = width / 2;
  const centerY = height / 2;

  return (
    <div className="pos-pad-container" aria-label={mode === 'shift' ? '二维位移快捷触控板' : '舞台坐标与九宫格对齐面板'}>
      <div className="pos-pad-header">
        <span className="pos-pad-title">
          {mode === 'shift' ? '位移方向与距离 (dx, dy)' : '舞台位置与九宫格对齐 (x, y)'}
        </span>
        <span className="pos-pad-coords">
          ({formatCoordinate(displayX)}, {formatCoordinate(displayY)})
        </span>
      </div>
      <div className="pos-pad-body">
        <div className="pos-pad-stage-area">
        <svg
          className="pos-pad-stage"
          viewBox={`0 0 ${width} ${height}`}
          style={{ aspectRatio: String(aspect), maxWidth: `${78 * aspect}px` }}
          onPointerDown={e => {
            if (e.button !== 0 || e.isPrimary === false || activePointer.current !== null) return;
            if (e.ctrlKey && e.pointerType === 'mouse' && /Mac/.test(navigator.platform)) return;
            activePointer.current = e.pointerId;
            capturePointerSafe(e.currentTarget, e.pointerId);
            setDraftCoords(readCoordsFromPointer(e));
          }}
          onPointerMove={e => {
            if (activePointer.current !== e.pointerId) return;
            setDraftCoords(readCoordsFromPointer(e));
          }}
          onPointerUp={e => {
            if (activePointer.current !== e.pointerId) return;
            activePointer.current = null;
            releasePointerSafe(e.currentTarget, e.pointerId);
            const finalCoords = readCoordsFromPointer(e);
            setDraftCoords(null);
            if (finalCoords.x !== safeX || finalCoords.y !== safeY) {
              onChange(finalCoords);
            }
          }}
          onPointerCancel={e => cancelDrag(e.currentTarget, e.pointerId)}
          onLostPointerCapture={e => cancelDrag(e.currentTarget, e.pointerId)}
          onContextMenu={e => {
            // Browsers can report a touch long-press as a plain MouseEvent.
            cancelDrag(e.currentTarget, (e.nativeEvent as Partial<PointerEvent>).pointerId);
          }}
        >
          {/* Rule-of-thirds safe frame */}
          <rect
            x={toSvgX(-safeInsetX)}
            y={toSvgY(2.5)}
            width={toSvgX(safeInsetX) - toSvgX(-safeInsetX)}
            height={toSvgY(-2.5) - toSvgY(2.5)}
            fill="none"
            stroke="rgba(148, 163, 184, 0.16)"
            strokeWidth="1"
            strokeDasharray="2,2"
          />
          {/* Axes crosshairs */}
          <line
            x1={0}
            y1={centerY}
            x2={width}
            y2={centerY}
            stroke="rgba(148, 163, 184, 0.35)"
            strokeWidth="1"
          />
          <line
            x1={centerX}
            y1={0}
            x2={centerX}
            y2={height}
            stroke="rgba(148, 163, 184, 0.35)"
            strokeWidth="1"
          />
          {/* Vector arrow when in shift mode */}
          {mode === 'shift' && (Math.abs(displayX) > 0.05 || Math.abs(displayY) > 0.05) && (
            <line
              x1={centerX}
              y1={centerY}
              x2={dotX}
              y2={dotY}
              stroke="#38bdf8"
              strokeWidth="1.75"
              strokeDasharray="3,2"
            />
          )}
          {/* Active coordinate marker */}
          <circle
            cx={dotX}
            cy={dotY}
            r="5"
            fill="#38bdf8"
            stroke="#0f172a"
            strokeWidth="1.5"
          />
        </svg>
        </div>

        <div className="pos-pad-grid-9" role="group" aria-label="九宫格快捷对齐">
          {presets.map(p => {
            const isActive = Math.abs(displayX - p.x) < 0.05 && Math.abs(displayY - p.y) < 0.05;
            return (
              <button
                key={p.id}
                type="button"
                className={`pos-pad-snap-btn ${isActive ? 'active' : ''}`}
                onClick={() => onChange({ x: p.x, y: p.y })}
                title={p.label}
                aria-label={p.label}
              >
                {p.symbol}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
