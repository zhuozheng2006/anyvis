import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import type { Project } from './core/types';
import {
  DEFAULT_CAMERA_SHOTS,
  getViewfinderBox,
  interpolateCameraPose,
  generateCameraDirectorPythonCode,
  createCameraDirectorActions,
  type CameraShot,
} from './camera-director';
import { copyTextToClipboard, useBoundedPlayback } from './browser-utils';
import { useTransientFlag, useDialogEscape } from './modal-hooks';
import './camera-director.css';

interface CameraDirectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  onApply: (nextProject: Project, actionIds: string[]) => void;
}

export const CameraDirectorModal: React.FC<CameraDirectorModalProps> = ({
  isOpen,
  onClose,
  project,
  onApply,
}) => {
  const [generationError, setGenerationError] = useState('');
  const [shots, setShots] = useState<CameraShot[]>(DEFAULT_CAMERA_SHOTS);
  const [selectedShotId, setSelectedShotId] = useState<string>('shot_1');
  const [isCopied, triggerCopied, resetCopied] = useTransientFlag(2000, isOpen);

  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setGenerationError('');
      resetCopied();
    }
  }, [isOpen, resetCopied]);

  useDialogEscape(isOpen, onClose);

  const sortedShots = useMemo(
    () => [...shots].sort((a, b) => a.time - b.time),
    [shots],
  );

  const maxTime = useMemo(() => {
    const last = sortedShots.reduce((max, s) => Math.max(max, s.time + s.duration), 12);
    return last + 1;
  }, [sortedShots]);

  const { playbackTime, setPlaybackTime, isPlaying, setIsPlaying } = useBoundedPlayback(isOpen, maxTime);

  // Current interpolated camera pose
  const currentPose = useMemo(
    () => interpolateCameraPose(sortedShots, playbackTime),
    [sortedShots, playbackTime],
  );

  // Viewfinder box in scene units
  const currentBox = useMemo(
    () =>
      getViewfinderBox(
        currentPose.x,
        currentPose.y,
        currentPose.zoom,
        project.scene.height > 0 ? (8 * project.scene.width) / project.scene.height : 14.22,
      ),
    [currentPose, project.scene.width, project.scene.height],
  );

  // Scene coordinates to SVG coordinates
  const svgWidth = 600;
  const svgHeight = 380;
  const bounds = { xMin: -7.5, xMax: 7.5, yMin: -4.5, yMax: 4.5 };

  const toSvgX = useCallback(
    (x: number) =>
      ((x - bounds.xMin) / (bounds.xMax - bounds.xMin)) * svgWidth,
    [bounds.xMin, bounds.xMax, svgWidth],
  );

  const toSvgY = useCallback(
    (y: number) =>
      svgHeight - ((y - bounds.yMin) / (bounds.yMax - bounds.yMin)) * svgHeight,
    [bounds.yMin, bounds.yMax, svgHeight],
  );

  const handleUpdateShot = (id: string, updates: Partial<CameraShot>) => {
    setGenerationError('');
    setShots((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    );
  };

  const handleAddShot = () => {
    setGenerationError('');
    const nextTime = Math.round((playbackTime > 0 ? playbackTime : maxTime) * 10) / 10;
    const newShot: CameraShot = {
      id: `shot_${crypto.randomUUID().slice(0, 8)}`,
      name: `镜头 ${shots.length + 1}`,
      time: nextTime,
      duration: 1.5,
      x: Math.round(currentPose.x * 10) / 10,
      y: Math.round(currentPose.y * 10) / 10,
      zoom: Math.round(currentPose.zoom * 10) / 10,
      rateFunc: 'smooth',
    };
    setShots((prev) => [...prev, newShot].sort((a, b) => a.time - b.time));
    setSelectedShotId(newShot.id);
  };

  const handleDeleteShot = (id: string) => {
    if (shots.length <= 1) return;
    setGenerationError('');
    const remaining = shots.filter((s) => s.id !== id);
    setShots(remaining);
    if (selectedShotId === id && remaining.length > 0) {
      setSelectedShotId(remaining[0].id);
    }
  };

  const handleCopyPython = async () => {
    setGenerationError('');
    try {
      const code = generateCameraDirectorPythonCode(shots);
      if (await copyTextToClipboard(code)) {
        triggerCopied();
      }
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleApplyToProject = () => {
    setGenerationError('');
    try {
    const result = createCameraDirectorActions(project, shots);
    onApply(result.project, result.actionIds);
    onClose();
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : String(error));
    }
  };

  if (!isOpen) return null;

  // Viewfinder SVG box
  const boxX = toSvgX(currentBox.left);
  const boxY = toSvgY(currentBox.top);
  const boxW = toSvgX(currentBox.right) - boxX;
  const boxH = toSvgY(currentBox.bottom) - boxY;

  return (
    <div className="camera-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="camera-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="camera-header">
          <h2>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            运镜导演与动态取景器 (Camera Director & Viewfinder)
          </h2>
          <button className="camera-close-btn" onClick={onClose} title="关闭">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="camera-body">
          {/* Stage Panel */}
          <div className="camera-stage-panel">
            <div className="camera-canvas-container">
              <svg ref={svgRef} viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="camera-svg">
                {/* Axes */}
                <line
                  x1={toSvgX(bounds.xMin)}
                  y1={toSvgY(0)}
                  x2={toSvgX(bounds.xMax)}
                  y2={toSvgY(0)}
                  stroke="#1e293b"
                  strokeWidth="1.5"
                />
                <line
                  x1={toSvgX(0)}
                  y1={toSvgY(bounds.yMin)}
                  x2={toSvgX(0)}
                  y2={toSvgY(bounds.yMax)}
                  stroke="#1e293b"
                  strokeWidth="1.5"
                />

                {/* Trajectory line between shots */}
                {sortedShots.length > 1 && (
                  <polyline
                    points={sortedShots.map((s) => `${toSvgX(s.x)},${toSvgY(s.y)}`).join(' ')}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="1.5"
                    strokeDasharray="4 3"
                    opacity={0.6}
                  />
                )}

                {/* Shot Target Pins */}
                {sortedShots.map((s, idx) => (
                  <g
                    key={s.id}
                    onClick={() => {
                      setSelectedShotId(s.id);
                      setPlaybackTime(s.time);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <circle
                      cx={toSvgX(s.x)}
                      cy={toSvgY(s.y)}
                      r="9"
                      fill={s.id === selectedShotId ? '#f59e0b' : '#1e293b'}
                      stroke="#f59e0b"
                      strokeWidth="2"
                    />
                    <text
                      x={toSvgX(s.x)}
                      y={toSvgY(s.y) + 3.5}
                      fill={s.id === selectedShotId ? '#000' : '#fff'}
                      fontSize="9"
                      fontWeight="bold"
                      textAnchor="middle"
                    >
                      {idx + 1}
                    </text>
                  </g>
                ))}

                {/* Dynamic Viewfinder Frame */}
                <g>
                  <rect
                    x={boxX}
                    y={boxY}
                    width={boxW}
                    height={boxH}
                    fill="rgba(245, 158, 11, 0.04)"
                    stroke="#f59e0b"
                    strokeWidth="2.2"
                    strokeDasharray="6 3"
                  />
                  {/* Rule of thirds grid lines */}
                  <line
                    x1={boxX + boxW / 3}
                    y1={boxY}
                    x2={boxX + boxW / 3}
                    y2={boxY + boxH}
                    stroke="rgba(245, 158, 11, 0.25)"
                    strokeWidth="1"
                  />
                  <line
                    x1={boxX + (2 * boxW) / 3}
                    y1={boxY}
                    x2={boxX + (2 * boxW) / 3}
                    y2={boxY + boxH}
                    stroke="rgba(245, 158, 11, 0.25)"
                    strokeWidth="1"
                  />
                  <line
                    x1={boxX}
                    y1={boxY + boxH / 3}
                    x2={boxX + boxW}
                    y2={boxY + boxH / 3}
                    stroke="rgba(245, 158, 11, 0.25)"
                    strokeWidth="1"
                  />
                  <line
                    x1={boxX}
                    y1={boxY + (2 * boxH) / 3}
                    x2={boxX + boxW}
                    y2={boxY + (2 * boxH) / 3}
                    stroke="rgba(245, 158, 11, 0.25)"
                    strokeWidth="1"
                  />

                  {/* Center Crosshair */}
                  <circle cx={toSvgX(currentPose.x)} cy={toSvgY(currentPose.y)} r="3" fill="#f59e0b" />
                </g>
              </svg>
            </div>

            {/* Scrubber Playback Bar */}
            <div className="camera-scrubber-bar">
              <button
                className="camera-play-btn"
                onClick={() => setIsPlaying(!isPlaying)}
              >
                {isPlaying ? '⏸ 暂停' : '▶ 播放运镜'}
              </button>
              <input
                type="range"
                min="0"
                max={maxTime}
                step="0.05"
                value={playbackTime}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (Number.isFinite(val)) {
                    setIsPlaying(false);
                    setPlaybackTime(val);
                  }
                }}
                style={{ flex: 1, accentColor: '#f59e0b' }}
              />
              <span style={{ fontSize: '0.8rem', color: '#f59e0b', fontFamily: 'monospace' }}>
                {playbackTime.toFixed(1)}s / {maxTime.toFixed(1)}s
              </span>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                聚焦: ({currentPose.x.toFixed(1)}, {currentPose.y.toFixed(1)}) · {currentPose.zoom.toFixed(2)}x
              </span>
            </div>
          </div>

          {/* Control Sidebar */}
          <div className="camera-ctrl-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1' }}>
                镜头序列 ({shots.length} 个镜头)
              </span>
              <button
                className="btn-secondary"
                onClick={handleAddShot}
                style={{ padding: '4px 8px', fontSize: '0.75rem' }}
              >
                + 添加镜头
              </button>
            </div>

            {/* Shots List */}
            <div className="camera-shots-list">
              {shots.map((s, idx) => (
                <div
                  key={s.id}
                  className={`camera-shot-card ${s.id === selectedShotId ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedShotId(s.id);
                    setPlaybackTime(s.time);
                  }}
                >
                  <div className="shot-row-header">
                    <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: '0.78rem', marginRight: 6 }}>
                      #{idx + 1}
                    </span>
                    <input
                      type="text"
                      className="shot-title-input"
                      value={s.name}
                      onChange={(e) => handleUpdateShot(s.id, { name: e.target.value })}
                    />
                    {shots.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteShot(s.id);
                        }}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <div className="shot-params-grid">
                    <div className="shot-param-item">
                      <span>到达时刻:</span>
                      <input
                        type="number"
                        step="0.5"
                        value={s.time}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (Number.isFinite(val)) {
                            handleUpdateShot(s.id, { time: Math.max(0, val) });
                          }
                        }}
                      />
                      <span>s</span>
                    </div>
                    <div className="shot-param-item">
                      <span>时长:</span>
                      <input
                        type="number"
                        step="0.2"
                        min="0.2"
                        title="第一镜头为初始构图；其余时长是到达前的过渡时长" value={s.duration}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (Number.isFinite(val)) {
                            handleUpdateShot(s.id, { duration: Math.max(0.2, val) });
                          }
                        }}
                      />
                      <span>s</span>
                    </div>
                    <div className="shot-param-item">
                      <span>X:</span>
                      <input
                        type="number"
                        step="0.2"
                        value={s.x}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (Number.isFinite(val)) {
                            handleUpdateShot(s.id, { x: val });
                          }
                        }}
                      />
                    </div>
                    <div className="shot-param-item">
                      <span>Y:</span>
                      <input
                        type="number"
                        step="0.2"
                        value={s.y}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (Number.isFinite(val)) {
                            handleUpdateShot(s.id, { y: val });
                          }
                        }}
                      />
                    </div>
                    <div className="shot-param-item" style={{ gridColumn: 'span 2' }}>
                      <span>变焦倍率:</span>
                      <input
                        type="number"
                        step="0.2"
                        min="0.4"
                        max="6.0"
                        value={s.zoom}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (Number.isFinite(val)) {
                            handleUpdateShot(s.id, { zoom: Math.max(0.2, Math.min(10, val)) });
                          }
                        }}
                      />
                      <span>x (范围 0.4x - 6.0x)</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="camera-footer">
          {generationError && <div role="alert" style={{ color: '#ef4444' }}>{generationError}</div>}
          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
            运镜追加在现有动画之后；时刻表示本片段内的到达时间，第一个镜头为初始构图。
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-secondary" onClick={handleCopyPython}>
              {isCopied ? '✓ 已复制 Python 代码' : '复制代码 (Manim CE)'}
            </button>
            <button className="btn-primary" onClick={handleApplyToProject}>
              追加运镜片段
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
