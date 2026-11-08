import React, { useRef } from 'react';
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

export const MANIM_FRAME_HALF_WIDTH = 7.1;
export const MANIM_FRAME_HALF_HEIGHT = 4.0;

export function clampAndSnapCoord(val: number, maxAbs: number, step = 0.1): number {
  const clamped = Math.max(-maxAbs, Math.min(maxAbs, val));
  const snapped = Math.round(clamped / step) * step;
  return Number(snapped.toFixed(2));
}

export function clientRatioToManimCoords(
  ratioX: number,
  ratioY: number,
  step = 0.1
): { x: number; y: number } {
  const rawX = (ratioX * 2 - 1) * MANIM_FRAME_HALF_WIDTH;
  const rawY = (1 - ratioY * 2) * MANIM_FRAME_HALF_HEIGHT;
  return {
    x: clampAndSnapCoord(rawX, MANIM_FRAME_HALF_WIDTH, step),
    y: clampAndSnapCoord(rawY, MANIM_FRAME_HALF_HEIGHT, step),
  };
}

export interface PositionPadProps {
  mode: 'position' | 'shift';
  x: number;
  y: number;
  onChange(coords: { x: number; y: number }): void;
}

export const PositionPad: React.FC<PositionPadProps> = ({ mode, x, y, onChange }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const draggingRef = useRef(false);

  const presets = mode === 'shift' ? SHIFT_VECTOR_PRESETS : STAGE_POSITION_PRESETS;
  const width = 160;
  const height = 90;

  const toSvgX = (valX: number) =>
    ((Math.max(-MANIM_FRAME_HALF_WIDTH, Math.min(MANIM_FRAME_HALF_WIDTH, valX)) + MANIM_FRAME_HALF_WIDTH) /
      (2 * MANIM_FRAME_HALF_WIDTH)) *
    width;

  const toSvgY = (valY: number) =>
    ((MANIM_FRAME_HALF_HEIGHT - Math.max(-MANIM_FRAME_HALF_HEIGHT, Math.min(MANIM_FRAME_HALF_HEIGHT, valY))) /
      (2 * MANIM_FRAME_HALF_HEIGHT)) *
    height;

  const updateFromPointer = (clientX: number, clientY: number, shiftKey: boolean) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const ratioX = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    const ratioY = Math.max(0, Math.min(1, (clientY - rect.top) / Math.max(1, rect.height)));
    const coords = clientRatioToManimCoords(ratioX, ratioY, shiftKey ? 0.5 : 0.1);
    onChange(coords);
  };

  const dotX = toSvgX(x);
  const dotY = toSvgY(y);
  const centerX = width / 2;
  const centerY = height / 2;

  return (
    <div className="pos-pad-container" aria-label={mode === 'shift' ? '二维位移快捷触控板' : '舞台坐标与九宫格对齐面板'}>
      <div className="pos-pad-header">
        <span className="pos-pad-title">
          {mode === 'shift' ? '位移方向与距离 (dx, dy)' : '舞台位置与九宫格对齐 (x, y)'}
        </span>
        <span className="pos-pad-coords">
          ({x.toFixed(1)}, {y.toFixed(1)})
        </span>
      </div>
      <div className="pos-pad-body">
        <svg
          ref={svgRef}
          className="pos-pad-stage"
          viewBox={`0 0 ${width} ${height}`}
          onPointerDown={e => {
            draggingRef.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            updateFromPointer(e.clientX, e.clientY, e.shiftKey);
          }}
          onPointerMove={e => {
            if (!draggingRef.current) return;
            updateFromPointer(e.clientX, e.clientY, e.shiftKey);
          }}
          onPointerUp={e => {
            if (draggingRef.current) {
              draggingRef.current = false;
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
          }}
        >
          {/* Rule-of-thirds safe frame */}
          <rect
            x={toSvgX(-4.5)}
            y={toSvgY(2.5)}
            width={toSvgX(4.5) - toSvgX(-4.5)}
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
          {mode === 'shift' && (Math.abs(x) > 0.05 || Math.abs(y) > 0.05) && (
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

        <div className="pos-pad-grid-9" role="group" aria-label="九宫格快捷对齐">
          {presets.map(p => {
            const isActive = Math.abs(x - p.x) < 0.05 && Math.abs(y - p.y) < 0.05;
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
