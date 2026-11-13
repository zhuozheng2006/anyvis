import React from 'react';
import { Maximize2, Minimize2, ZoomIn, ZoomOut } from 'lucide-react';
import './stage-zoom.css';

export interface StageZoomControlsProps {
  zoom: number;
  onZoomChange(zoom: number): void;
  onResetZoom(): void;
  isFullscreen: boolean;
  onToggleFullscreen(): void;
}

export const ZOOM_STEPS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

export function getNextZoomIn(zoom: number): number {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return ZOOM_STEPS.find(step => step > safeZoom + 0.01) ?? Math.min(3, Math.round((safeZoom + 0.25) * 100) / 100);
}

export function getNextZoomOut(zoom: number): number {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const reversed = [...ZOOM_STEPS].reverse();
  return reversed.find(step => step < safeZoom - 0.01) ?? Math.max(0.25, Math.round((safeZoom - 0.25) * 100) / 100);
}

export const StageZoomControls: React.FC<StageZoomControlsProps> = ({
  zoom,
  onZoomChange,
  onResetZoom,
  isFullscreen,
  onToggleFullscreen,
}) => {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const handleZoomIn = () => {
    onZoomChange(getNextZoomIn(safeZoom));
  };

  const handleZoomOut = () => {
    onZoomChange(getNextZoomOut(safeZoom));
  };

  const percentText = `${Math.round(safeZoom * 100)}%`;

  return (
    <div className="stage-zoom-controls" role="group" aria-label="舞台画布缩放与全屏控制">
      <button
        type="button"
        className="stage-zoom-btn"
        title="缩小画面 (-)"
        aria-label="缩小画面"
        onClick={handleZoomOut}
        disabled={safeZoom <= 0.25}
      >
        <ZoomOut size={12} />
      </button>
      <button
        type="button"
        className={`stage-zoom-pill ${Math.abs(safeZoom - 1) < 0.01 ? 'is-default' : 'is-modified'}`}
        title="点击重置缩放比例至 100% (快捷键: 0)"
        aria-label={`当前缩放比例 ${percentText}，点击重置为 100%`}
        onClick={onResetZoom}
      >
        {percentText}
      </button>
      <button
        type="button"
        className="stage-zoom-btn"
        title="放大画面 (+)"
        aria-label="放大画面"
        onClick={handleZoomIn}
        disabled={safeZoom >= 3}
      >
        <ZoomIn size={12} />
      </button>
      <button
        type="button"
        className={`stage-zoom-btn ${isFullscreen ? 'active' : ''}`}
        title={isFullscreen ? '退出全屏 (F / Esc)' : '舞台全屏预览 (F)'}
        aria-label={isFullscreen ? '退出全屏' : '舞台全屏预览'}
        onClick={onToggleFullscreen}
      >
        {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
      </button>
    </div>
  );
};
