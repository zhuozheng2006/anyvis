import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { Project } from './core/types';
import {
  VECTOR_FIELD_PRESETS,
  type VectorFieldPresetId,
  type ColorTheme,
  sampleVectorField,
  probeVectorField,
  stepParticles,
  generateVectorFieldPythonCode,
  createVectorFieldActions,
  type Particle,
} from './vector-field';
import { clientToSvgPoint, copyTextToClipboard } from './browser-utils';
import { useTransientFlag, useDialogEscape, capturePointerSafe, releasePointerSafe } from './modal-hooks';
import './vector-field-playground.css';

interface VectorFieldPlaygroundModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  onApply: (nextProject: Project, actionIds: string[]) => void;
}

export const VectorFieldPlaygroundModal: React.FC<VectorFieldPlaygroundModalProps> = ({
  isOpen,
  onClose,
  project,
  onApply,
}) => {
  const [applyError, setApplyError] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState<VectorFieldPresetId>('vortex');
  const [mode, setMode] = useState<'arrows' | 'streamlines'>('arrows');
  const [theme, setTheme] = useState<ColorTheme>('3b1b');
  const [gridStep, setGridStep] = useState<number>(0.5);
  const [probePos, setProbePos] = useState<{ x: number; y: number }>({ x: 1.0, y: 1.0 });
  const [isAnimatingParticles, setIsAnimatingParticles] = useState<boolean>(true);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [isCopied, triggerCopied, resetCopied] = useTransientFlag(2000, isOpen);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const isDraggingProbe = useRef<boolean>(false);

  const preset = useMemo(
    () => VECTOR_FIELD_PRESETS.find((p) => p.id === selectedPresetId) || VECTOR_FIELD_PRESETS[0],
    [selectedPresetId],
  );

  const bounds = preset.defaultBounds;

  // Initial particle generator
  useEffect(() => {
    setApplyError('');
    const count = 35;
    const initial: Particle[] = [];
    for (let i = 0; i < count; i++) {
      const px = bounds.xMin + Math.random() * (bounds.xMax - bounds.xMin);
      const py = bounds.yMin + Math.random() * (bounds.yMax - bounds.yMin);
      initial.push({
        id: i,
        x: px,
        y: py,
        age: Math.floor(Math.random() * 40),
        maxAge: Math.floor(40 + Math.random() * 60),
        trail: [{ x: px, y: py }],
      });
    }
    setParticles(initial);
  }, [selectedPresetId, bounds]);

  useEffect(() => {
    setApplyError('');
    if (!isOpen) {
      isDraggingProbe.current = false;
      resetCopied();
    }
  }, [isOpen, resetCopied]);

  useDialogEscape(isOpen, onClose);

  // Particle animation loop
  useEffect(() => {
    if (!isOpen || !isAnimatingParticles) return;

    let frameId: number;
    let lastTime = performance.now();

    const loop = (currentTime: number) => {
      const dt = Math.min((currentTime - lastTime) / 1000, 0.05);
      lastTime = currentTime;

      setParticles((prev) => stepParticles(prev, preset.sample, dt, bounds));
      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [isOpen, isAnimatingParticles, preset, bounds]);

  // Grid samples
  const { samples } = useMemo(
    () => sampleVectorField(bounds, gridStep, preset.sample, theme),
    [bounds, gridStep, preset, theme],
  );

  // Probe calculations
  const probeResult = useMemo(
    () => probeVectorField(probePos.x, probePos.y, preset.sample),
    [probePos, preset],
  );

  // SVG dimensions
  const svgWidth = 600;
  const svgHeight = 380;
  const padding = 20;

  const toSvgX = useCallback(
    (x: number) =>
      padding + ((x - bounds.xMin) / (bounds.xMax - bounds.xMin)) * (svgWidth - 2 * padding),
    [bounds, svgWidth, padding],
  );

  const toSvgY = useCallback(
    (y: number) =>
      svgHeight -
      padding -
      ((y - bounds.yMin) / (bounds.yMax - bounds.yMin)) * (svgHeight - 2 * padding),
    [bounds, svgHeight, padding],
  );

  const toMathCoords = useCallback(
    (clientX: number, clientY: number) => {
      const pt = clientToSvgPoint(svgRef.current, clientX, clientY, svgWidth, svgHeight);
      if (!pt) return probePos;

      const normX = (pt.x - padding) / (svgWidth - 2 * padding);
      const normY = (svgHeight - padding - pt.y) / (svgHeight - 2 * padding);

      const mathX = bounds.xMin + normX * (bounds.xMax - bounds.xMin);
      const mathY = bounds.yMin + normY * (bounds.yMax - bounds.yMin);

      return {
        x: Math.max(bounds.xMin, Math.min(bounds.xMax, Math.round(mathX * 100) / 100)),
        y: Math.max(bounds.yMin, Math.min(bounds.yMax, Math.round(mathY * 100) / 100)),
      };
    },
    [bounds, svgWidth, svgHeight, padding, probePos],
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    setApplyError('');
    isDraggingProbe.current = true;
    capturePointerSafe(e.currentTarget as Element, e.pointerId);
    const coords = toMathCoords(e.clientX, e.clientY);
    setProbePos(coords);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingProbe.current) return;
    const coords = toMathCoords(e.clientX, e.clientY);
    setProbePos(coords);
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
      const code = generateVectorFieldPythonCode(preset, bounds, mode, gridStep, theme);
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
      const result = createVectorFieldActions(project, preset, bounds, mode, gridStep, theme);
      onApply(result.project, result.actionIds);
      onClose();
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : String(error));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="vector-field-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="2D 向量场与流线工作台">
      <div className="vector-field-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="vector-field-header">
          <h2>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#58c4dd" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
            2D 向量场与流线工作台 (Vector Field & Streamlines)
          </h2>
          {applyError && <p role="alert" style={{ color: '#fca5a5' }}>{applyError}</p>}
          <button className="vector-field-close-btn" onClick={onClose} title="关闭">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="vector-field-body">
          {/* Stage Panel */}
          <div className="vector-field-stage-panel">
            <div
              className="vector-field-canvas-container"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onLostPointerCapture={() => { isDraggingProbe.current = false; }}
            >
              <svg
                ref={svgRef}
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                className="vector-field-svg"
              >

                {/* Axes */}
                <line
                  x1={toSvgX(bounds.xMin)}
                  y1={toSvgY(0)}
                  x2={toSvgX(bounds.xMax)}
                  y2={toSvgY(0)}
                  stroke="#334155"
                  strokeWidth="1.5"
                />
                <line
                  x1={toSvgX(0)}
                  y1={toSvgY(bounds.yMin)}
                  x2={toSvgX(0)}
                  y2={toSvgY(bounds.yMax)}
                  stroke="#334155"
                  strokeWidth="1.5"
                />

                {/* Vectors / Arrows */}
                {mode === 'arrows' &&
                  samples.map((s, idx) => {
                    const startX = toSvgX(s.x);
                    const startY = toSvgY(s.y);
                    const arrowLen = 16;
                    const endX = startX + Math.cos(s.angle) * arrowLen;
                    const endY = startY - Math.sin(s.angle) * arrowLen;

                    return (
                      <g key={idx} opacity={0.88}>
                        <line
                          x1={startX}
                          y1={startY}
                          x2={endX}
                          y2={endY}
                          stroke={s.color}
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                        <circle cx={endX} cy={endY} r="2" fill={s.color} />
                      </g>
                    );
                  })}

                {/* Streamline Particles */}
                {particles.map((p) => {
                  const currentX = toSvgX(p.x);
                  const currentY = toSvgY(p.y);
                  const trailPoints = p.trail
                    .map((pt) => `${toSvgX(pt.x)},${toSvgY(pt.y)}`)
                    .join(' ');

                  return (
                    <g key={p.id}>
                      {p.trail.length > 1 && (
                        <polyline
                          points={trailPoints}
                          fill="none"
                          stroke="#58c4dd"
                          strokeWidth="1.5"
                          opacity={0.35}
                          strokeLinecap="round"
                        />
                      )}
                      <circle
                        cx={currentX}
                        cy={currentY}
                        r="3"
                        fill="#f8fafc"
                      />
                    </g>
                  );
                })}

                {/* Probe Marker */}
                <g>
                  <circle
                    cx={toSvgX(probePos.x)}
                    cy={toSvgY(probePos.y)}
                    r="7"
                    fill="none"
                    stroke="#e2b340"
                    strokeWidth="2.5"
                    strokeDasharray="3 2"
                  />
                  <line
                    x1={toSvgX(probePos.x)}
                    y1={toSvgY(probePos.y)}
                    x2={toSvgX(probePos.x) + Math.cos(probeResult.angle) * 32}
                    y2={toSvgY(probePos.y) - Math.sin(probeResult.angle) * 32}
                    stroke="#e2b340"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <circle
                    cx={toSvgX(probePos.x)}
                    cy={toSvgY(probePos.y)}
                    r="3.5"
                    fill="#e2b340"
                  />
                </g>
              </svg>

              {/* Dynamic Probe HUD */}
              <div className="vector-field-probe-hud">
                <div className="probe-title">探针物理量 (Probe HUD)</div>
                <div className="hud-metric">
                  坐标 (x, y): <span className="hud-val">({probeResult.x.toFixed(2)}, {probeResult.y.toFixed(2)})</span>
                </div>
                <div className="hud-metric">
                  向量 (u, v): <span className="hud-val">({probeResult.u.toFixed(2)}, {probeResult.v.toFixed(2)})</span>
                </div>
                <div className="hud-metric">
                  模长 ||F||: <span className="hud-val">{probeResult.magnitude.toFixed(2)}</span>
                </div>
                <div className="hud-metric">
                  散度 ∇·F: <span className="hud-val" style={{ color: probeResult.divergence > 0 ? '#fc6255' : '#58c4dd' }}>
                    {probeResult.divergence.toFixed(3)}
                    {Math.abs(probeResult.divergence) < 0.05 ? ' (无散)' : probeResult.divergence > 0 ? ' (源点)' : ' (汇点)'}
                  </span>
                </div>
                <div className="hud-metric">
                  旋度 (∇×F)z: <span className="hud-val" style={{ color: Math.abs(probeResult.curl) > 0.05 ? '#e2b340' : '#94a3b8' }}>
                    {probeResult.curl.toFixed(3)}
                    {Math.abs(probeResult.curl) < 0.05 ? ' (无旋)' : probeResult.curl > 0 ? ' (逆时针涡旋)' : ' (顺时针涡旋)'}
                  </span>
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
          <div className="vector-field-ctrl-panel">
            {/* Presets */}
            <div className="ctrl-section">
              <div className="ctrl-title">数学场预设 (Mathematical Presets)</div>
              <div className="preset-chip-group">
                {VECTOR_FIELD_PRESETS.map((p) => (
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

            {/* Render Mode */}
            <div className="ctrl-section">
              <div className="ctrl-title">展示模式 (Render Mode)</div>
              <div className="field-mode-btn-group">
                <button
                  className={`mode-btn ${mode === 'arrows' ? 'active' : ''}`}
                  onClick={() => { setApplyError(''); setMode('arrows'); }}
                >
                  箭头网格 (Arrows)
                </button>
                <button
                  className={`mode-btn ${mode === 'streamlines' ? 'active' : ''}`}
                  onClick={() => { setApplyError(''); setMode('streamlines'); }}
                >
                  流线粒子 (Streamlines)
                </button>
              </div>
            </div>

            {/* Color Theme */}
            <div className="ctrl-section">
              <div className="ctrl-title">色谱方案 (Color Theme)</div>
              <div className="theme-pill-group">
                <button
                  className={`theme-pill ${theme === '3b1b' ? 'active' : ''}`}
                  onClick={() => { setApplyError(''); setTheme('3b1b'); }}
                >
                  3B1B 金蓝
                </button>
                <button
                  className={`theme-pill ${theme === 'electric' ? 'active' : ''}`}
                  onClick={() => { setApplyError(''); setTheme('electric'); }}
                >
                  赛博电光
                </button>
                <button
                  className={`theme-pill ${theme === 'plasma' ? 'active' : ''}`}
                  onClick={() => { setApplyError(''); setTheme('plasma'); }}
                >
                  等离子
                </button>
              </div>
            </div>

            {/* Grid density */}
            <div className="ctrl-section">
              <div className="slider-row">
                <span>采样步长 (Step):</span>
                <input
                  type="range"
                  min="0.35"
                  max="0.8"
                  step="0.05"
                  value={gridStep}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!Number.isFinite(val)) return;
                    setApplyError('');
                    setGridStep(Math.max(0.35, Math.min(0.8, val)));
                  }}
                />
                <span>{gridStep.toFixed(2)}</span>
              </div>
            </div>

            {/* Particle toggle */}
            <div className="ctrl-section">
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#cbd5e1', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isAnimatingParticles}
                  onChange={(e) => setIsAnimatingParticles(e.target.checked)}
                  style={{ accentColor: '#58c4dd' }}
                />
                启用 Runge-Kutta 实时粒子流动模拟
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="vector-field-footer">
          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
            按住画布任意位置可实时拖拽探针检验局部旋度与散度
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
