import React, { useState, useRef } from 'react';
import type { Action, FieldValue } from './core/types';
import { manimToStagePercent, stagePercentToManim, GIZMO_PALETTE } from './stage-direct-gizmo';
import { STAGE_POSITION_PRESETS } from './PositionPad';
import './stage-direct-gizmo.css';

export interface StageDirectGizmoProps {
  action: Action | null;
  onChange: (fields: Record<string, FieldValue>) => void;
}

export const StageDirectGizmo: React.FC<StageDirectGizmoProps> = ({ action, onChange }) => {
  const [isDragging, setIsDragging] = useState(false);
  const dragContainerRef = useRef<HTMLDivElement | null>(null);

  if (!action) return null;

  const rawX = action.fields.x;
  const rawY = action.fields.y;
  const hasCoords = typeof rawX === 'number' && typeof rawY === 'number';
  const hasColor = typeof action.fields.color === 'string';

  if (!hasCoords && !hasColor) return null;

  const curX = hasCoords ? (rawX as number) : 0;
  const curY = hasCoords ? (rawY as number) : 0;
  const curColor = hasColor ? (action.fields.color as string) : '#58C4DD';
  const name = String(action.fields.name || '对象');

  const { leftPercent, topPercent } = manimToStagePercent(curX, curY);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    setIsDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const stageShell = (e.currentTarget as HTMLElement).closest('.stage-shell');
    if (!stageShell) return;

    const rect = stageShell.getBoundingClientRect();
    const clientX = e.clientX;
    const clientY = e.clientY;

    const leftPct = ((clientX - rect.left) / rect.width) * 100;
    const topPct = ((clientY - rect.top) / rect.height) * 100;

    const { x, y } = stagePercentToManim(leftPct, topPct);
    onChange({ x, y });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      setIsDragging(false);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
    }
  };

  const handleApplyPreset = (presetX: number, presetY: number) => {
    onChange({ x: presetX, y: presetY });
  };

  const handleApplyColor = (color: string) => {
    onChange({ color });
  };

  return (
    <div
      className="stage-direct-gizmo-container"
      ref={dragContainerRef}
      data-testid="stage-direct-gizmo"
    >
      {/* 1. On-Canvas Position Reticle (Draggable) */}
      {hasCoords && (
        <div
          className={`gizmo-reticle ${isDragging ? 'dragging' : ''}`}
          style={{ left: `${leftPercent}%`, top: `${topPercent}%` }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          role="slider"
          aria-label={`直接拖动调整 ${name} 舞台坐标`}
          aria-valuenow={curX}
          title={`按住拖动调整 ${name} 舞台坐标: (${curX.toFixed(1)}, ${curY.toFixed(1)})`}
          data-testid="gizmo-reticle"
        >
          <div className="reticle-ring" style={{ borderColor: curColor }} />
          <div className="reticle-crosshair-h" />
          <div className="reticle-crosshair-v" />
          <div className="reticle-center-dot" style={{ background: curColor }} />
          <div className="reticle-tag">
            <span className="reticle-tag-name">{name}</span>
            <span className="reticle-tag-coord">
              ({curX.toFixed(1)}, {curY.toFixed(1)})
            </span>
          </div>
        </div>
      )}

      {/* 2. Floating Quick Strip (Alignment & Color) */}
      <div className="gizmo-quick-strip" data-testid="gizmo-quick-strip">
        <div className="gizmo-strip-title">
          <span className="gizmo-object-dot" style={{ background: curColor }} />
          <strong className="gizmo-object-name">{name}</strong>
        </div>

        {/* 9-Grid Alignment Buttons */}
        {hasCoords && (
          <div className="gizmo-align-group" title="九宫格快速对齐">
            {STAGE_POSITION_PRESETS.map(preset => (
              <button
                key={preset.id}
                type="button"
                className={`gizmo-align-btn ${
                  Math.abs(curX - preset.x) < 0.2 && Math.abs(curY - preset.y) < 0.2
                    ? 'active'
                    : ''
                }`}
                title={preset.label}
                onClick={() => handleApplyPreset(preset.x, preset.y)}
              >
                {preset.symbol}
              </button>
            ))}
          </div>
        )}

        {/* Quick Color Swatches */}
        {hasColor && (
          <div className="gizmo-color-group" title="快速换色">
            {GIZMO_PALETTE.map(item => (
              <button
                key={item.color}
                type="button"
                className={`gizmo-color-dot ${
                  curColor.toLowerCase() === item.color.toLowerCase() ? 'active' : ''
                }`}
                style={{ background: item.color }}
                title={`${item.label} (${item.color})`}
                onClick={() => handleApplyColor(item.color)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
