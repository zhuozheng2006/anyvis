import React, { useState, useRef, useEffect } from 'react';
import type { Action, FieldValue } from './core/types';
import { manimToStagePercent, stagePercentToManim, GIZMO_PALETTE } from './stage-direct-gizmo';
import { STAGE_POSITION_PRESETS } from './PositionPad';
import './stage-direct-gizmo.css';

export interface StageDirectGizmoProps {
  action: Action | null;
  onChange: (fields: Record<string, FieldValue>) => void;
  frameAspect?: number;
}

export const StageDirectGizmo: React.FC<StageDirectGizmoProps> = ({ action, onChange, frameAspect = 16 / 9 }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null);
  const gesture = useRef<{ pointerId: number; actionId: string; clientX: number; clientY: number; x: number; y: number; width: number; height: number; latest: { x: number; y: number } } | null>(null);
  const dragContainerRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null);
  const halfWidth = 4 * frameAspect;
  useEffect(() => {
    const parent = dragContainerRef.current?.parentElement;
    if (!parent) return;
    const fit = () => {
      const width = Math.min(parent.clientWidth, parent.clientHeight * frameAspect);
      if (width > 0) setViewport({ width, height: width / frameAspect });
    };
    fit();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', fit);
      return () => window.removeEventListener('resize', fit);
    }
    const observer = new ResizeObserver(fit);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [action?.id, frameAspect]);

  if (!action) return null;

  const rawX = action.fields.x;
  const rawY = action.fields.y;
  const hasCoords = typeof rawX === 'number' && typeof rawY === 'number';
  const hasColor = typeof action.fields.color === 'string';

  if (!hasCoords && !hasColor) return null;

  const curX = draft?.x ?? (hasCoords ? (rawX as number) : 0);
  const curY = draft?.y ?? (hasCoords ? (rawY as number) : 0);
  const curColor = hasColor ? (action.fields.color as string) : '#58C4DD';
  const name = String(action.fields.name || '对象');

  const { leftPercent, topPercent } = manimToStagePercent(curX, curY, halfWidth);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.button !== 0 || gesture.current) return;
    const rect = dragContainerRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return;
    e.preventDefault();
    gesture.current = { pointerId: e.pointerId, actionId: action.id, clientX: e.clientX, clientY: e.clientY, x: curX, y: curY, width: rect.width, height: rect.height, latest: { x: curX, y: curY } };
    setIsDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = gesture.current;
    if (!start || start.pointerId !== e.pointerId) return;
    e.stopPropagation();
    // The overlay rect includes CSS zoom. Delta mapping also preserves the
    // original grab offset and cancels pan, so pointerdown never relocates it.
    const initial = manimToStagePercent(start.x, start.y, halfWidth);
    start.latest = stagePercentToManim(initial.leftPercent + (e.clientX - start.clientX) / start.width * 100,
      initial.topPercent + (e.clientY - start.clientY) / start.height * 100, 0.1, halfWidth);
    setDraft(start.latest);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = gesture.current;
    if (start && start.pointerId === e.pointerId) {
      e.stopPropagation();
      if (e.clientX !== start.clientX || e.clientY !== start.clientY) handlePointerMove(e);
      gesture.current = null;
      setIsDragging(false);
      setDraft(null);
      if (action.id === start.actionId && (start.latest.x !== start.x || start.latest.y !== start.y)) onChange(start.latest);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
    }
  };

  const cancelDrag = () => { gesture.current = null; setIsDragging(false); setDraft(null); };

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
      style={viewport ? { width: viewport.width, height: viewport.height, inset: '50% auto auto 50%', transform: 'translate(-50%, -50%)' } : undefined}
    >
      {/* 1. On-Canvas Position Reticle (Draggable) */}
      {hasCoords && (
        <div
          className={`gizmo-reticle ${isDragging ? 'dragging' : ''}`}
          style={{ left: `${leftPercent}%`, top: `${topPercent}%` }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={cancelDrag}
          onLostPointerCapture={cancelDrag}
          onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); cancelDrag(); } }}
          tabIndex={0}
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
