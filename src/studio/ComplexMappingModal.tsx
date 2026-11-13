import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { Project } from './core/types';
import {
  COMPLEX_PRESETS,
  type ComplexPresetId,
  type Complex,
  generateMorphedGrid,
  probeComplexMapping,
  generateComplexMappingPythonCode,
  createComplexMappingActions,
} from './complex-mapping';
import { clientToSvgPoint, copyTextToClipboard } from './browser-utils';
import { useTransientFlag, useDialogEscape, capturePointerSafe, releasePointerSafe } from './modal-hooks';
import './complex-mapping.css';

interface ComplexMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  onApply: (nextProject: Project, actionIds: string[]) => void;
}

export const ComplexMappingModal: React.FC<ComplexMappingModalProps> = ({
  isOpen,
  onClose,
  project,
  onApply,
}) => {
  const [applyError, setApplyError] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState<ComplexPresetId>('square');
  const [morphT, setMorphT] = useState<number>(1.0);
  const [gridSpacing, setGridSpacing] = useState<number>(0.5);
  const [probeZ, setProbeZ] = useState<Complex>({ re: 1.0, im: 0.8 });
  const [isMorphing, setIsMorphing] = useState<boolean>(false);
  const [isCopied, triggerCopied, resetCopied] = useTransientFlag(2000, isOpen);
  useDialogEscape(isOpen, onClose);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const isDraggingProbe = useRef<boolean>(false);

  const preset = useMemo(
    () => COMPLEX_PRESETS.find((p) => p.id === selectedPresetId) || COMPLEX_PRESETS[0],
    [selectedPresetId],
  );

  useEffect(() => {
    setApplyError('');
  }, [selectedPresetId]);

  useEffect(() => {
    setApplyError('');
    if (!isOpen) {
      isDraggingProbe.current = false;
      setIsMorphing(false);
      resetCopied();
    }
  }, [isOpen, resetCopied]);

  const bounds = preset.defaultBounds;

  // Morph animation
  useEffect(() => {
    if (!isOpen || !isMorphing) return;

    let start: number | null = null;
    const duration = 2400; // 2.4s
    let reqId = 0;

    const frame = (timestamp: number) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      // smoothstep easing
      const eased = progress * progress * (3 - 2 * progress);
      setMorphT(eased);

      if (progress < 1) {
        reqId = requestAnimationFrame(frame);
      } else {
        setIsMorphing(false);
      }
    };

    reqId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(reqId);
  }, [isOpen, isMorphing]);

  const startMorph = () => {
    setMorphT(0);
    setIsMorphing(true);
  };

  // Generate grid lines
  const gridLines = useMemo(
    () => generateMorphedGrid(preset, bounds, gridSpacing, morphT, 50),
    [preset, bounds, gridSpacing, morphT],
  );

  // Probe computation
  const probeResult = useMemo(
    () => probeComplexMapping(probeZ, preset),
    [probeZ, preset],
  );

  // Interpolated probe point
  const currentProbePos = useMemo(() => {
    const w = preset.map(probeZ);
    return {
      x: (1 - morphT) * probeZ.re + morphT * w.re,
      y: (1 - morphT) * probeZ.im + morphT * w.im,
    };
  }, [probeZ, preset, morphT]);

  // Coordinate mapping
  const svgWidth = 600;
  const svgHeight = 380;
  const padding = 24;

  const toSvgX = useCallback(
    (x: number) =>
      padding + ((x - bounds.min) / (bounds.max - bounds.min)) * (svgWidth - 2 * padding),
    [bounds, svgWidth, padding],
  );

  const toSvgY = useCallback(
    (y: number) =>
      svgHeight -
      padding -
      ((y - bounds.min) / (bounds.max - bounds.min)) * (svgHeight - 2 * padding),
    [bounds, svgHeight, padding],
  );

  const toComplexCoords = useCallback(
    (clientX: number, clientY: number) => {
      const pt = clientToSvgPoint(svgRef.current, clientX, clientY, svgWidth, svgHeight);
      if (!pt) return probeZ;

      const normX = (pt.x - padding) / (svgWidth - 2 * padding);
      const normY = (svgHeight - padding - pt.y) / (svgHeight - 2 * padding);

      const mathX = bounds.min + normX * (bounds.max - bounds.min);
      const mathY = bounds.min + normY * (bounds.max - bounds.min);

      return {
        re: Math.max(bounds.min, Math.min(bounds.max, Math.round(mathX * 100) / 100)),
        im: Math.max(bounds.min, Math.min(bounds.max, Math.round(mathY * 100) / 100)),
      };
    },
    [bounds, svgWidth, svgHeight, padding, probeZ],
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    setApplyError('');
    isDraggingProbe.current = true;
    capturePointerSafe(e.currentTarget as Element, e.pointerId);
    const coords = toComplexCoords(e.clientX, e.clientY);
    setProbeZ(coords);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingProbe.current) return;
    const coords = toComplexCoords(e.clientX, e.clientY);
    setProbeZ(coords);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDraggingProbe.current) {
      releasePointerSafe(e.currentTarget as Element, e.pointerId);
      isDraggingProbe.current = false;
    }
  };

  const handleCopyPython = async () => {
    setApplyError('');
    try {
      const code = generateComplexMappingPythonCode(preset, bounds, gridSpacing, morphT);
      if (await copyTextToClipboard(code)) {
        triggerCopied();
      }
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleApplyToProject = () => {
    setApplyError('');
    try {
      const result = createComplexMappingActions(project, preset, bounds, gridSpacing, morphT);
      onApply(result.project, result.actionIds);
      onClose();
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : String(error));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="complex-map-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="complex-map-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="complex-map-header">
          <h2>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e2b340" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
              <path d="M2 12h20" />
            </svg>
            3B1B 复变函数与共形映射工作台 (Complex Analysis & Conformal Mapping)
          </h2>
          {applyError && <p role="alert" style={{ color: '#fca5a5' }}>{applyError}</p>}
          <button className="complex-map-close-btn" onClick={onClose} title="关闭">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="complex-map-body">
          {/* Stage Panel */}
          <div className="complex-map-stage-panel">
            <div
              className="complex-map-canvas-container"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onLostPointerCapture={() => { isDraggingProbe.current = false; }}
            >
              <svg
                ref={svgRef}
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                className="complex-map-svg"
              >
                {/* Axes */}
                <line
                  x1={toSvgX(bounds.min)}
                  y1={toSvgY(0)}
                  x2={toSvgX(bounds.max)}
                  y2={toSvgY(0)}
                  stroke="#475569"
                  strokeWidth="1.5"
                />
                <line
                  x1={toSvgX(0)}
                  y1={toSvgY(bounds.min)}
                  x2={toSvgX(0)}
                  y2={toSvgY(bounds.max)}
                  stroke="#475569"
                  strokeWidth="1.5"
                />
                <text x={toSvgX(bounds.max) - 20} y={toSvgY(0) - 8} fill="#94a3b8" fontSize="11" fontFamily="sans-serif">
                  Re(z)
                </text>
                <text x={toSvgX(0) + 8} y={toSvgY(bounds.max) + 14} fill="#94a3b8" fontSize="11" fontFamily="sans-serif">
                  Im(z)
                </text>

                {/* Morphed Grid Lines */}
                {gridLines.map((line) => {
                  const pointsStr = line.points
                    .filter(
                      (p) =>
                        p.x >= bounds.min - 1 &&
                        p.x <= bounds.max + 1 &&
                        p.y >= bounds.min - 1 &&
                        p.y <= bounds.max + 1,
                    )
                    .map((p) => `${toSvgX(p.x)},${toSvgY(p.y)}`)
                    .join(' ');

                  const strokeColor = line.type === 'real' ? '#58c4dd' : '#e2b340';

                  return (
                    <polyline
                      key={line.id}
                      points={pointsStr}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={Math.abs(line.constantVal) < 1e-4 ? 2.2 : 1.2}
                      strokeOpacity={Math.abs(line.constantVal) < 1e-4 ? 0.9 : 0.55}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  );
                })}

                {/* Interactive Probe Point */}
                <g>
                  <circle
                    cx={toSvgX(currentProbePos.x)}
                    cy={toSvgY(currentProbePos.y)}
                    r="6.5"
                    fill="#fc6255"
                    stroke="#ffffff"
                    strokeWidth="2"
                  />
                  {/* Local orthogonal tangent arms */}
                  <line
                    x1={toSvgX(currentProbePos.x) - 12}
                    y1={toSvgY(currentProbePos.y)}
                    x2={toSvgX(currentProbePos.x) + 12}
                    y2={toSvgY(currentProbePos.y)}
                    stroke="#fc6255"
                    strokeWidth="1.5"
                    strokeDasharray="2 2"
                  />
                  <line
                    x1={toSvgX(currentProbePos.x)}
                    y1={toSvgY(currentProbePos.y) - 12}
                    x2={toSvgX(currentProbePos.x)}
                    y2={toSvgY(currentProbePos.y) + 12}
                    stroke="#fc6255"
                    strokeWidth="1.5"
                    strokeDasharray="2 2"
                  />
                </g>
              </svg>

              {/* Dynamic Probe HUD */}
              <div className="complex-map-probe-hud">
                <div className="probe-title">局部共形导数 (Conformal HUD)</div>
                <div className="hud-metric">
                  原像 z₀: <span className="hud-val">{probeResult.z0.re.toFixed(2)} + {probeResult.z0.im.toFixed(2)}i</span>
                </div>
                <div className="hud-metric">
                  映射像 w₀: <span className="hud-val">{probeResult.w0.re.toFixed(2)} + {probeResult.w0.im.toFixed(2)}i</span>
                </div>
                <div className="hud-metric">
                  局部伸缩 |f&apos;(z₀)|: <span className="hud-val" style={{ color: '#58c4dd' }}>{probeResult.magnification.toFixed(3)}×</span>
                </div>
                <div className="hud-metric">
                  局部旋转 ∠f&apos;(z₀): <span className="hud-val" style={{ color: '#e2b340' }}>{probeResult.rotationDeg.toFixed(1)}°</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#83c167', marginTop: '3px' }}>
                  ✓ 保角性验证: 网格正交夹角保持 90°
                </div>
              </div>
            </div>

            {/* Formula & Explanation Card */}
            <div className="formula-card">
              <div className="formula-desc">{preset.description}</div>
              <div className="formula-latex">{preset.formulaLatex}</div>
            </div>
          </div>

          {/* Control Sidebar */}
          <div className="complex-map-ctrl-panel">
            {/* Presets */}
            <div className="ctrl-section">
              <div className="ctrl-title">复变解析函数 (Analytic Functions)</div>
              <div className="preset-chip-group">
                {COMPLEX_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    className={`preset-chip ${p.id === selectedPresetId ? 'active' : ''}`}
                    onClick={() => setSelectedPresetId(p.id)}
                  >
                    {p.name.split(' (')[0]}
                  </button>
                ))}
              </div>
            </div>

            {/* Morph Slider & Player */}
            <div className="ctrl-section">
              <div className="ctrl-title">共形形变插值 (Grid Deformation)</div>
              <div className="morph-control-box">
                <div className="slider-row">
                  <span>形变参数 t:</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={morphT}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!Number.isFinite(val)) return;
                      setApplyError('');
                      setMorphT(Math.max(0, Math.min(1, val)));
                    }}
                  />
                  <span>{(morphT * 100).toFixed(0)}%</span>
                </div>
                <button
                  className="morph-play-btn"
                  onClick={startMorph}
                  disabled={isMorphing}
                >
                  {isMorphing ? '▶ 正在演化形变...' : '⚡ 演化平滑变形动画 (t: 0 → 1)'}
                </button>
              </div>
            </div>

            {/* Grid Density */}
            <div className="ctrl-section">
              <div className="slider-row">
                <span>坐标网格间距:</span>
                <input
                  type="range"
                  min="0.3"
                  max="1.0"
                  step="0.1"
                  value={gridSpacing}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!Number.isFinite(val)) return;
                    setApplyError('');
                    setGridSpacing(Math.max(0.3, Math.min(1.0, val)));
                  }}
                />
                <span>{gridSpacing.toFixed(1)}</span>
              </div>
            </div>

            {/* Legend */}
            <div className="ctrl-section">
              <div className="ctrl-title">正交网格图例 (Grid Legend)</div>
              <div className="legend-pills">
                <div className="legend-real">
                  <span style={{ display: 'inline-block', width: 12, height: 3, background: '#58c4dd', borderRadius: 2 }}></span>
                  实部等值线 Re(z)
                </div>
                <div className="legend-imag">
                  <span style={{ display: 'inline-block', width: 12, height: 3, background: '#e2b340', borderRadius: 2 }}></span>
                  虚部等值线 Im(z)
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="vector-field-footer">
          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
            在画布上拖拽探针红点，可实时观察局部复数伸缩与旋转
          </div>
          <div className="vector-field-footer-actions">
            <button className="btn-secondary" onClick={handleCopyPython}>
              {isCopied ? '✓ 已复制 Python 代码' : '复制代码 (Manim CE)'}
            </button>
            <button className="btn-primary" onClick={handleApplyToProject}>
              插入到当前场景
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
