import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Activity, X, Check, Copy, Play, Pause, RotateCcw, Sparkles, PenTool } from 'lucide-react';
import {
  type Point2D,
  type FourierCoefficient,
  type FourierPresetId,
  computeDft,
  computeEpicycles,
  computeFourierFidelity,
  getFourierPreset,
  generateFourierPythonCode,
  evaluateFourier,
} from './fourier';
import { clientToSvgPoint, copyTextToClipboard } from './browser-utils';
import {
  useTransientFlag,
  useDelayedAction,
  useDialogEscape,
  capturePointerSafe,
  releasePointerSafe,
} from './modal-hooks';
import './fourier-playground.css';

export interface FourierPlaygroundModalProps {
  isOpen: boolean;
  onClose(): void;
  onInsertFourier?(coeffs: FourierCoefficient[], shapeName: string): void;
}

const CANVAS_WIDTH = 520;
const CANVAS_HEIGHT = 400;
const MATH_SCALE_X = CANVAS_WIDTH / 6.0;
const MATH_SCALE_Y = CANVAS_HEIGHT / 4.8;

function toScreenX(x: number): number {
  return CANVAS_WIDTH / 2 + x * MATH_SCALE_X;
}
function toScreenY(y: number): number {
  return CANVAS_HEIGHT / 2 - y * MATH_SCALE_Y;
}
function toMathX(sx: number): number {
  return (sx - CANVAS_WIDTH / 2) / MATH_SCALE_X;
}
function toMathY(sy: number): number {
  return -(sy - CANVAS_HEIGHT / 2) / MATH_SCALE_Y;
}

export const FourierPlaygroundModal: React.FC<FourierPlaygroundModalProps> = ({
  isOpen,
  onClose,
  onInsertFourier,
}) => {
  const [activePreset, setActivePreset] = useState<FourierPresetId | 'custom'>('pi');
  const [points, setPoints] = useState<Point2D[]>(() => getFourierPreset('pi', 180));
  const [harmonicLimit, setHarmonicLimit] = useState(15);
  const [isPlaying, setIsPlaying] = useState(true);
  useDialogEscape(isOpen, onClose);
  const [time, setTime] = useState(0);
  const [speed, setSpeed] = useState<0.5 | 1 | 2>(1);
  const [copied, triggerCopied, resetCopied] = useTransientFlag(2000, isOpen);
  const [inserted, scheduleInsertClose, resetInserted] = useDelayedAction(600, isOpen);
  const [actionError, setActionError] = useState('');
  const [isDrawing, setIsDrawing] = useState(false);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const drawPointsRef = useRef<Point2D[]>([]);
  const animFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(performance.now());

  useEffect(() => {
    setActionError('');
    if (!isOpen) {
      setIsDrawing(false);
      resetCopied();
      resetInserted();
    }
  }, [isOpen, resetCopied, resetInserted]);

  // 1. Compute Fourier coefficients
  const coeffs = useMemo(() => {
    return computeDft(points, harmonicLimit);
  }, [points, harmonicLimit]);

  // 2. Fidelity
  const fidelity = useMemo(() => {
    return computeFourierFidelity(points, coeffs);
  }, [points, coeffs]);

  // 3. Current Epicycles state at time t
  const currentEpicycles = useMemo(() => {
    return computeEpicycles(coeffs, time);
  }, [coeffs, time]);

  // 4. Sampled historical trail points up to time t
  const trailPoints = useMemo(() => {
    const steps = Math.max(2, Math.floor(time * 180));
    const pts: Point2D[] = [];
    for (let i = 0; i <= steps; i++) {
      const curT = i / 180;
      pts.push(evaluateFourier(coeffs, curT));
    }
    return pts;
  }, [coeffs, time]);

  // 5. Preset selection
  const selectPreset = (preset: FourierPresetId) => {
    setActionError('');
    setActivePreset(preset);
    setIsDrawing(false);
    setTime(0);
    setPoints(getFourierPreset(preset, 180));
  };

  // 6. Animation loop
  useEffect(() => {
    if (!isOpen || !isPlaying) return;

    const loop = (now: number) => {
      const dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      setTime(prev => {
        const next = prev + (dt / 5.0) * speed;
        return next >= 1 ? next % 1 : next;
      });

      animFrameRef.current = requestAnimationFrame(loop);
    };

    lastTimeRef.current = performance.now();
    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isOpen, isPlaying, speed]);

  // 7. Freehand drawing handlers
  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const pt = clientToSvgPoint(svgRef.current || e.currentTarget, e.clientX, e.clientY, CANVAS_WIDTH, CANVAS_HEIGHT);
    if (!pt) return;
    capturePointerSafe(svgRef.current || e.currentTarget, e.pointerId);
    const mathPt = { x: toMathX(pt.x), y: toMathY(pt.y) };

    setIsDrawing(true);
    setActivePreset('custom');
    setIsPlaying(false);
    drawPointsRef.current = [mathPt];
    setPoints([mathPt]);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDrawing) return;
    const pt = clientToSvgPoint(svgRef.current || e.currentTarget, e.clientX, e.clientY, CANVAS_WIDTH, CANVAS_HEIGHT);
    if (!pt) return;
    const mathPt = { x: toMathX(pt.x), y: toMathY(pt.y) };

    const last = drawPointsRef.current[drawPointsRef.current.length - 1];
    if (last && Math.hypot(last.x - mathPt.x, last.y - mathPt.y) > 0.05) {
      drawPointsRef.current.push(mathPt);
      setPoints([...drawPointsRef.current]);
    }
  };

  const finalizeStroke = (target: Element | null, pointerId?: number) => {
    if (!isDrawing) return;
    if (pointerId !== undefined) {
      releasePointerSafe(target, pointerId);
    }
    setIsDrawing(false);
    const pts = drawPointsRef.current;
    if (pts.length > 5) {
      // Close the loop
      pts.push({ ...pts[0] });
      setPoints([...pts]);
      setTime(0);
      setIsPlaying(true);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    finalizeStroke(svgRef.current || e.currentTarget, e.pointerId);
  };

  // 8. Copy Python code
  const handleCopyCode = useCallback(async () => {
    setActionError('');
    try {
      const py = generateFourierPythonCode(coeffs, activePreset === 'custom' ? 'CustomDrawing' : activePreset);
      if (await copyTextToClipboard(py)) {
        triggerCopied();
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  }, [coeffs, activePreset, triggerCopied]);

  // 9. Insert Action into Project
  const handleInsert = useCallback(() => {
    if (!onInsertFourier || inserted) return;
    setActionError('');
    try {
      scheduleInsertClose(onClose, () =>
        onInsertFourier(coeffs, activePreset === 'custom' ? '手绘傅里叶' : `傅里叶_${activePreset}`),
      );
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  }, [coeffs, activePreset, inserted, onInsertFourier, scheduleInsertClose, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fourier-modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="fourier-modal" role="dialog" aria-modal="true">
        {/* Header */}
        <div className="fourier-modal-header">
          <div className="fourier-modal-title">
            <Activity size={18} color="#A855F7" />
            <span>3B1B 傅里叶环绕圆交互台 (Fourier Epicycles)</span>
            <span className="fourier-title-badge">DFT 离散复傅里叶</span>
          </div>
          <button className="fourier-close-btn" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="fourier-modal-body">
          {/* Left Canvas & Time Scrubber */}
          <div className="fourier-canvas-container">
            <div className="fourier-canvas-wrap">
              <span className="fourier-canvas-hint">
                {isDrawing ? '松开指针完成闭合曲线' : '点击画布可直接自由手绘'}
              </span>
              <svg
                ref={svgRef}
                className="fourier-svg"
                viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onLostPointerCapture={() => finalizeStroke(svgRef.current)}
              >
                {/* Coordinate Grid axes */}
                <line x1={0} y1={CANVAS_HEIGHT / 2} x2={CANVAS_WIDTH} y2={CANVAS_HEIGHT / 2} stroke="#1e293b" strokeWidth={1} />
                <line x1={CANVAS_WIDTH / 2} y1={0} x2={CANVAS_WIDTH / 2} y2={CANVAS_HEIGHT} stroke="#1e293b" strokeWidth={1} />

                {/* 1. Original target outline */}
                {points.length > 1 && (
                  <polyline
                    points={points.map(p => `${toScreenX(p.x).toFixed(1)},${toScreenY(p.y).toFixed(1)}`).join(' ')}
                    stroke="rgba(56, 189, 248, 0.28)"
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                    fill="none"
                  />
                )}

                {/* 2. Epicycle circles and vectors */}
                {currentEpicycles.circles.map((c, i) => {
                  const cx = toScreenX(c.centerX);
                  const cy = toScreenY(c.centerY);
                  const tx = toScreenX(c.tipX);
                  const ty = toScreenY(c.tipY);
                  const r = c.radius * MATH_SCALE_X;

                  if (r < 1.0) return null;

                  return (
                    <g key={i}>
                      <circle
                        cx={cx}
                        cy={cy}
                        r={r}
                        stroke="rgba(168, 85, 247, 0.22)"
                        strokeWidth={1}
                        fill="rgba(168, 85, 247, 0.015)"
                      />
                      <line
                        x1={cx}
                        y1={cy}
                        x2={tx}
                        y2={ty}
                        stroke="rgba(192, 132, 252, 0.65)"
                        strokeWidth={1.2}
                      />
                    </g>
                  );
                })}

                {/* 3. Reconstructed historical trail */}
                {trailPoints.length > 1 && (
                  <polyline
                    points={trailPoints.map(p => `${toScreenX(p.x).toFixed(1)},${toScreenY(p.y).toFixed(1)}`).join(' ')}
                    stroke="#FBBF24"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                )}

                {/* 4. Active tip pen */}
                <circle
                  cx={toScreenX(currentEpicycles.endTip.x)}
                  cy={toScreenY(currentEpicycles.endTip.y)}
                  r={4.5}
                  fill="#FBBF24"
                  stroke="#FFFFFF"
                  strokeWidth={1.5}
                />
              </svg>
            </div>

            {/* Playback Controls */}
            <div className="fourier-playback-bar">
              <button
                className="fourier-btn-icon"
                onClick={() => setIsPlaying(!isPlaying)}
                title={isPlaying ? '暂停' : '播放'}
              >
                {isPlaying ? <Pause size={15} /> : <Play size={15} />}
              </button>
              <button
                className="fourier-btn-icon"
                style={{ background: '#334155' }}
                onClick={() => setTime(0)}
                title="回到起点"
              >
                <RotateCcw size={14} />
              </button>
              <input
                type="range"
                className="fourier-time-slider"
                min={0}
                max={1}
                step={0.005}
                value={time}
                onChange={e => {
                  const val = parseFloat(e.target.value);
                  if (!Number.isFinite(val)) return;
                  setActionError('');
                  setTime(Math.max(0, Math.min(1, val)));
                  setIsPlaying(false);
                }}
              />
              <span className="fourier-time-label">t: {time.toFixed(2)}</span>
              <div className="fourier-speed-group">
                {([0.5, 1, 2] as const).map(s => (
                  <button
                    key={s}
                    className={`fourier-speed-btn ${speed === s ? 'active' : ''}`}
                    onClick={() => setSpeed(s)}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="fourier-sidebar">
            {/* Shape Presets */}
            <div className="fourier-panel-section">
              <div className="fourier-section-title">
                <span>经典几何预设</span>
                {activePreset === 'custom' && (
                  <span style={{ color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <PenTool size={11} /> 自由手绘
                  </span>
                )}
              </div>
              <div className="fourier-preset-grid">
                <button
                  className={`fourier-preset-btn ${activePreset === 'pi' ? 'active' : ''}`}
                  onClick={() => selectPreset('pi')}
                >
                  π 符号
                </button>
                <button
                  className={`fourier-preset-btn ${activePreset === 'heart' ? 'active' : ''}`}
                  onClick={() => selectPreset('heart')}
                >
                  爱心曲线
                </button>
                <button
                  className={`fourier-preset-btn ${activePreset === 'trefoil' ? 'active' : ''}`}
                  onClick={() => selectPreset('trefoil')}
                >
                  三叶结
                </button>
                <button
                  className={`fourier-preset-btn ${activePreset === 'star' ? 'active' : ''}`}
                  onClick={() => selectPreset('star')}
                >
                  五角星
                </button>
                <button
                  className={`fourier-preset-btn ${activePreset === 'infinity' ? 'active' : ''}`}
                  onClick={() => selectPreset('infinity')}
                >
                  双纽线 ∞
                </button>
                <button
                  className={`fourier-preset-btn ${activePreset === 'cardioid' ? 'active' : ''}`}
                  onClick={() => selectPreset('cardioid')}
                >
                  心形线
                </button>
                <button
                  className={`fourier-preset-btn ${activePreset === 'square' ? 'active' : ''}`}
                  onClick={() => selectPreset('square')}
                >
                  方波矩形
                </button>
              </div>
            </div>

            {/* Harmonics / Epicycle Count Slider */}
            <div className="fourier-panel-section">
              <div className="fourier-section-title">
                <span>级数项数 / 环绕圆</span>
                <span style={{ color: '#a855f7', fontWeight: 600 }}>N = {harmonicLimit}</span>
              </div>
              <input
                type="range"
                className="fourier-num-slider"
                min={1}
                max={40}
                step={1}
                value={harmonicLimit}
                onChange={e => {
                  const val = parseInt(e.target.value, 10);
                  if (!Number.isFinite(val)) return;
                  setActionError('');
                  setHarmonicLimit(Math.max(1, Math.min(40, val)));
                }}
              />
              <div className="fourier-slider-row">
                <span style={{ color: '#64748b' }}>基频 (N=1)</span>
                <span style={{ color: '#64748b' }}>精细复现 (N=40)</span>
              </div>
            </div>

            {/* Mathematical Metrics */}
            <div className="fourier-panel-section">
              <div className="fourier-section-title">
                <span>实时拟合指标</span>
              </div>
              <div className="fourier-metrics-grid">
                <div className="fourier-metric-card">
                  <div className="fourier-metric-label">曲线拟合度</div>
                  <div className="fourier-metric-value" style={{ color: fidelity > 90 ? '#34d399' : '#fbbf24' }}>
                    {fidelity.toFixed(1)}%
                  </div>
                </div>
                <div className="fourier-metric-card">
                  <div className="fourier-metric-label">主导基频振幅</div>
                  <div className="fourier-metric-value">
                    {coeffs[0]?.amp.toFixed(2) || '0.00'}
                  </div>
                </div>
              </div>

              {/* Spectrum Bars */}
              <div className="fourier-metric-label" style={{ marginTop: 4 }}>
                谐波能谱分布 |cₙ|
              </div>
              <div className="fourier-spectrum-chart">
                {coeffs.slice(0, 24).map((c, i) => {
                  const maxAmp = coeffs[0]?.amp || 1.0;
                  const h = Math.max(3, Math.min(46, (c.amp / maxAmp) * 46));
                  return (
                    <div
                      key={i}
                      className="fourier-spectrum-bar"
                      style={{ height: `${h}px` }}
                      title={`频次 ${c.freq}: 振幅 ${c.amp.toFixed(3)}`}
                    />
                  );
                })}
              </div>
            </div>

            {/* Formula */}
            <div className="fourier-formula-box">
              z(t) = ∑ cₙ · e^(i · 2π n t)
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="fourier-modal-footer">
          <div className="fourier-footer-left">
            {actionError ? (
              <span role="alert" style={{ color: '#f87171', fontSize: 12 }}>
                {actionError}
              </span>
            ) : (
              <span>支持导出参数曲线积木与独立 Manim CE 场景</span>
            )}
          </div>
          <div className="fourier-footer-right">
            <button className="fourier-btn-secondary" onClick={handleCopyCode}>
              {copied ? <Check size={14} color="#34D399" /> : <Copy size={14} />}
              <span>{copied ? '已复制 Python 代码' : '复制代码'}</span>
            </button>
            <button className="fourier-btn-primary" onClick={handleInsert} disabled={inserted}>
              {inserted ? <Check size={14} /> : <Sparkles size={14} />}
              <span>{inserted ? '已插入工程' : '插入参数曲线积木'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
