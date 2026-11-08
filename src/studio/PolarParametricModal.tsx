import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { Project } from './core/types';
import {
  POLAR_PARAMETRIC_PRESETS,
  type PolarParametricPresetId,
  sampleCurve,
  generatePolarParametricPythonCode,
  createPolarParametricActions,
} from './polar-parametric';
import './polar-parametric.css';

interface PolarParametricModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  onApply: (nextProject: Project, actionIds: string[]) => void;
}

export const PolarParametricModal: React.FC<PolarParametricModalProps> = ({
  isOpen,
  onClose,
  project,
  onApply,
}) => {
  const [selectedPresetId, setSelectedPresetId] = useState<PolarParametricPresetId>('rose_curve');
  const [params, setParams] = useState<Record<string, number>>({ a: 2.2, k: 4 });
  const [progress, setProgress] = useState<number>(0.75);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);

  const preset = useMemo(
    () =>
      POLAR_PARAMETRIC_PRESETS.find((p) => p.id === selectedPresetId) ||
      POLAR_PARAMETRIC_PRESETS[0],
    [selectedPresetId],
  );

  useEffect(() => {
    const defaultParams: Record<string, number> = {};
    preset.params.forEach((p) => {
      defaultParams[p.key] = p.defaultValue;
    });
    setParams(defaultParams);
    setProgress(0.75);
    setIsPlaying(false);
  }, [preset]);

  // Tracing animation loop
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setProgress((prev) => {
        const next = prev + 0.008;
        return next > 1.0 ? 0.05 : next;
      });
    }, 24);
    return () => clearInterval(interval);
  }, [isPlaying]);

  const curveData = useMemo(() => {
    return sampleCurve(preset, params, progress, 300);
  }, [preset, params, progress]);

  // SVG Coordinate mapping ([-3.5, 3.5] -> [0, 600])
  const svgSize = 600;
  const span = 7.0;

  const toSvgX = useCallback(
    (x: number) => ((x + 3.5) / span) * svgSize,
    [svgSize, span],
  );
  const toSvgY = useCallback(
    (y: number) => ((3.5 - y) / span) * svgSize,
    [svgSize, span],
  );

  const handleCopyPython = async () => {
    const code = generatePolarParametricPythonCode(preset, params);
    await navigator.clipboard.writeText(code);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleApplyToProject = () => {
    const result = createPolarParametricActions(project, preset, params);
    onApply(result.project, result.actionIds);
    onClose();
  };

  if (!isOpen) return null;

  const currentX = curveData.currentPoint[0];
  const currentY = curveData.currentPoint[1];
  const currentR = Math.sqrt(currentX * currentX + currentY * currentY);
  const currentThetaDeg = ((Math.atan2(currentY, currentX) * 180) / Math.PI + 360) % 360;

  // Tangent arrow endpoints
  const arrowLen = 0.5;
  const tanX2 = currentX + curveData.tangent[0] * arrowLen;
  const tanY2 = currentY + curveData.tangent[1] * arrowLen;

  return (
    <div className="polar-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="polar-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="polar-modal-header">
          <h3>🌀 极坐标与参数方程曲线动画交互台 (Polar & Parametric Curves)</h3>
          <button className="polar-close-btn" onClick={onClose} title="关闭">
            ✕
          </button>
        </div>

        <div className="polar-modal-body">
          {/* Sidebar */}
          <div className="polar-sidebar">
            <div className="polar-section-title">经典曲线预设库</div>
            <div className="polar-preset-list">
              {POLAR_PARAMETRIC_PRESETS.map((p) => (
                <button
                  key={p.id}
                  className={`polar-preset-btn ${p.id === selectedPresetId ? 'active' : ''}`}
                  onClick={() => setSelectedPresetId(p.id)}
                >
                  <span className="polar-preset-name">{p.name}</span>
                  <span className="polar-preset-formula">{p.formula}</span>
                </button>
              ))}
            </div>

            {/* Parameter Adjustment */}
            <div className="polar-controls-panel">
              <div className="polar-section-title">曲线代数参量</div>
              {preset.params.map((p) => (
                <div key={p.key} className="polar-param-row">
                  <span>{p.name}:</span>
                  <input
                    type="range"
                    min={p.min}
                    max={p.max}
                    step={p.step}
                    value={params[p.key] ?? p.defaultValue}
                    onChange={(e) =>
                      setParams((prev) => ({
                        ...prev,
                        [p.key]: parseFloat(e.target.value),
                      }))
                    }
                  />
                  <span className="polar-param-val">
                    {(params[p.key] ?? p.defaultValue).toFixed(1)}
                  </span>
                </div>
              ))}

              {/* Progress and animation control */}
              <div style={{ marginTop: '6px', borderTop: '1px solid #283044', paddingTop: '10px' }}>
                <div className="polar-param-row">
                  <span>描迹进度 (Trace):</span>
                  <input
                    type="range"
                    min="0.05"
                    max="1.0"
                    step="0.01"
                    value={progress}
                    onChange={(e) => {
                      setProgress(parseFloat(e.target.value));
                      setIsPlaying(false);
                    }}
                  />
                  <span className="polar-param-val">{Math.round(progress * 100)}%</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '8px' }}>
                  <button
                    className="polar-btn polar-btn-ghost"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => setIsPlaying((p) => !p)}
                  >
                    {isPlaying ? '⏸ 暂停动画' : '▶ 动态循迹描迹动画'}
                  </button>
                </div>
              </div>
            </div>

            {/* Live Stats HUD */}
            <div className="polar-stats-panel">
              <div className="polar-section-title">微分几何实时度量</div>
              <div className="polar-stat-row">
                <span>直角坐标 (x, y):</span>
                <span className="polar-stat-val">
                  ({currentX.toFixed(2)}, {currentY.toFixed(2)})
                </span>
              </div>
              <div className="polar-stat-row">
                <span>极坐标 (r, θ):</span>
                <span className="polar-stat-val">
                  ({currentR.toFixed(2)}, {currentThetaDeg.toFixed(1)}°)
                </span>
              </div>
              <div className="polar-stat-row">
                <span>切线方向单位向量:</span>
                <span className="polar-stat-val">
                  [{curveData.tangent[0].toFixed(2)}, {curveData.tangent[1].toFixed(2)}]
                </span>
              </div>
              <div className="polar-stat-row">
                <span>累计轨迹弧长 L:</span>
                <span className="polar-stat-val">{curveData.arcLength.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* SVG Canvas Area */}
          <div className="polar-canvas-area">
            <div className="polar-hint-banner">
              💡 极坐标同心环与切线方向向量联动实时计算，支持一键生成 Manim ParametricFunction 动画
            </div>

            <div className="polar-svg-container">
              <svg className="polar-svg" viewBox={`0 0 ${svgSize} ${svgSize}`}>
                <defs>
                  <marker
                    id="tan-arrow"
                    viewBox="0 0 10 10"
                    refX="5"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#facc15" />
                  </marker>
                </defs>

                {/* Polar Coordinate Grid */}
                {preset.kind === 'polar' ? (
                  <g>
                    {/* Concentric rings */}
                    {[1.0, 2.0, 3.0].map((r) => (
                      <circle
                        key={r}
                        cx={toSvgX(0)}
                        cy={toSvgY(0)}
                        r={(r / span) * svgSize}
                        fill="none"
                        stroke="#1e293b"
                        strokeWidth="1.2"
                      />
                    ))}
                    {/* Radial spokes every 30 deg */}
                    {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => {
                      const rad = (deg * Math.PI) / 180;
                      const rx = 3.2 * Math.cos(rad);
                      const ry = 3.2 * Math.sin(rad);
                      return (
                        <line
                          key={deg}
                          x1={toSvgX(0)}
                          y1={toSvgY(0)}
                          x2={toSvgX(rx)}
                          y2={toSvgY(ry)}
                          stroke="#1e293b"
                          strokeWidth="0.8"
                        />
                      );
                    })}
                  </g>
                ) : (
                  <g>
                    {/* Cartesian axes */}
                    <line
                      x1={0}
                      y1={toSvgY(0)}
                      x2={svgSize}
                      y2={toSvgY(0)}
                      stroke="#334155"
                      strokeWidth="1.5"
                    />
                    <line
                      x1={toSvgX(0)}
                      y1={0}
                      x2={toSvgX(0)}
                      y2={svgSize}
                      stroke="#334155"
                      strokeWidth="1.5"
                    />
                  </g>
                )}

                {/* Full curve ghost outline */}
                <path
                  d={curveData.fullPoints
                    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${toSvgX(p[0])} ${toSvgY(p[1])}`)
                    .join(' ')}
                  fill="none"
                  stroke="#334155"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                  opacity="0.4"
                />

                {/* Currently traced curve */}
                <path
                  d={curveData.currentPoints
                    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${toSvgX(p[0])} ${toSvgY(p[1])}`)
                    .join(' ')}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="2.5"
                />

                {/* Radial ray to current point */}
                <line
                  x1={toSvgX(0)}
                  y1={toSvgY(0)}
                  x2={toSvgX(currentX)}
                  y2={toSvgY(currentY)}
                  stroke="#64748b"
                  strokeWidth="1.2"
                  strokeDasharray="2 2"
                />

                {/* Tangent vector arrow */}
                <line
                  x1={toSvgX(currentX)}
                  y1={toSvgY(currentY)}
                  x2={toSvgX(tanX2)}
                  y2={toSvgY(tanY2)}
                  stroke="#facc15"
                  strokeWidth="2.5"
                  markerEnd="url(#tan-arrow)"
                />

                {/* Tracing Pen / Dot */}
                <circle
                  cx={toSvgX(currentX)}
                  cy={toSvgY(currentY)}
                  r="6"
                  fill="#facc15"
                  stroke="#ffffff"
                  strokeWidth="2"
                />
              </svg>
            </div>
          </div>
        </div>

        <div className="polar-modal-footer">
          <div className="polar-footer-left">
            <button className="polar-btn polar-btn-ghost" onClick={handleCopyPython}>
              {isCopied ? '✓ 已复制 Manim 代码' : '📋 复制 Manim Python 代码'}
            </button>
          </div>
          <div className="polar-footer-right">
            <button className="polar-btn polar-btn-ghost" onClick={onClose}>
              取消
            </button>
            <button className="polar-btn polar-btn-primary" onClick={handleApplyToProject}>
              ➕ 插入到当前场景
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
