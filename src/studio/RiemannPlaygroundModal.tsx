import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { BarChart3, X, Check, Copy, Sparkles, Play } from 'lucide-react';
import {
  RIEMANN_PRESETS,
  type RiemannPreset,
  type RiemannMode,
  computeRiemannSum,
  generateRiemannPythonCode,
} from './riemann';
import { clientToSvgPoint, copyTextToClipboard } from './browser-utils';
import {
  useTransientFlag,
  useDelayedAction,
  useDialogEscape,
  capturePointerSafe,
  releasePointerSafe,
} from './modal-hooks';
import './riemann-playground.css';

export interface RiemannPlaygroundModalProps {
  isOpen: boolean;
  onClose(): void;
  onInsertRiemann?(preset: RiemannPreset, a: number, b: number, n: number, mode: RiemannMode): void;
}

const CANVAS_WIDTH = 540;
const CANVAS_HEIGHT = 380;

export const RiemannPlaygroundModal: React.FC<RiemannPlaygroundModalProps> = ({
  isOpen,
  onClose,
  onInsertRiemann,
}) => {
  const [activePreset, setActivePreset] = useState<RiemannPreset>(RIEMANN_PRESETS[0]);
  const [a, setA] = useState(activePreset.defaultA);
  const [b, setB] = useState(activePreset.defaultB);
  const [n, setN] = useState(16);
  const [mode, setMode] = useState<RiemannMode>('mid');
  const [copied, triggerCopied, resetCopied] = useTransientFlag(2000, isOpen);
  const [inserted, scheduleInsertClose, resetInserted] = useDelayedAction(450, isOpen);
  const [actionError, setActionError] = useState('');
  useDialogEscape(isOpen, onClose);
  const [isLimiting, setIsLimiting] = useState(false);
  const [draggingHandle, setDraggingHandle] = useState<'a' | 'b' | null>(null);

  const animRef = useRef<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setDraggingHandle(null);
      resetCopied();
      resetInserted();
    }
    setActionError('');
  }, [isOpen, resetCopied, resetInserted]);

  // Switch preset
  const handleSelectPreset = (p: RiemannPreset) => {
    if (animRef.current) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
    setIsLimiting(false);
    setActionError('');
    setActivePreset(p);
    setA(p.defaultA);
    setB(p.defaultB);
  };

  // Coordinate transforms
  const [xMin, xMax] = activePreset.xRange;
  const [yMin, yMax] = activePreset.yRange;

  const toScreenX = useCallback((x: number) => {
    return ((x - xMin) / (xMax - xMin)) * CANVAS_WIDTH;
  }, [xMin, xMax]);

  const toScreenY = useCallback((y: number) => {
    return CANVAS_HEIGHT - ((y - yMin) / (yMax - yMin)) * CANVAS_HEIGHT;
  }, [yMin, yMax]);

  const toMathX = useCallback((sx: number) => {
    return xMin + (sx / CANVAS_WIDTH) * (xMax - xMin);
  }, [xMin, xMax]);

  // Compute Riemann sum and exact integral
  const result = useMemo(() => {
    return computeRiemannSum(activePreset.fn, a, b, n, mode);
  }, [activePreset, a, b, n, mode]);

  // Sample function curve points
  const curvePoints = useMemo(() => {
    const pts: [number, number][] = [];
    const steps = 140;
    for (let i = 0; i <= steps; i++) {
      const x = xMin + (i / steps) * (xMax - xMin);
      const y = activePreset.fn(x);
      if (Number.isFinite(y) && y >= yMin - 1 && y <= yMax + 2) {
        pts.push([toScreenX(x), toScreenY(y)]);
      }
    }
    return pts;
  }, [activePreset, xMin, xMax, yMin, yMax, toScreenX, toScreenY]);

  // Continuous exact area path between a and b
  const exactAreaPath = useMemo(() => {
    if (a >= b) return '';
    const steps = 60;
    let d = `M ${toScreenX(a)} ${toScreenY(0)}`;
    for (let i = 0; i <= steps; i++) {
      const x = a + (i / steps) * (b - a);
      const y = activePreset.fn(x);
      d += ` L ${toScreenX(x)} ${toScreenY(y)}`;
    }
    d += ` L ${toScreenX(b)} ${toScreenY(0)} Z`;
    return d;
  }, [activePreset, a, b, toScreenX, toScreenY]);

  // Dragging limit handles
  const handlePointerDown = (handle: 'a' | 'b', e: React.PointerEvent) => {
    e.stopPropagation();
    setActionError('');
    capturePointerSafe(svgRef.current || (e.currentTarget as Element), e.pointerId);
    setDraggingHandle(handle);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingHandle) return;
    const pt = clientToSvgPoint(svgRef.current, e.clientX, e.clientY, CANVAS_WIDTH, CANVAS_HEIGHT);
    if (!pt) return;
    const sx = Math.max(0, Math.min(CANVAS_WIDTH, pt.x));
    const mx = Math.round(toMathX(sx) * 10) / 10;

    if (draggingHandle === 'a') {
      if (mx < b) setA(mx);
    } else if (draggingHandle === 'b') {
      if (mx > a) setB(mx);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (draggingHandle) {
      releasePointerSafe(svgRef.current || (e.currentTarget as Element), e.pointerId);
      setDraggingHandle(null);
    }
  };

  // Limit animation: n: 4 -> 80
  const triggerLimitAnimation = () => {
    if (isLimiting) return;
    setIsLimiting(true);
    const startN = 4;
    const endN = 70;
    const durationMs = 2400;
    const startTime = performance.now();

    const frame = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      // smooth cubic ease-in-out
      const ease = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      const currentN = Math.round(startN + (endN - startN) * ease);
      setN(currentN);

      if (progress < 1) {
        animRef.current = requestAnimationFrame(frame);
      } else {
        setIsLimiting(false);
      }
    };

    animRef.current = requestAnimationFrame(frame);
  };

  useEffect(() => {
    if (!isOpen && animRef.current !== null) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
      setIsLimiting(false);
    }
    return () => {
      if (animRef.current !== null) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
    };
  }, [isOpen]);

  const handleCopyCode = async () => {
    setActionError('');
    try {
      const code = generateRiemannPythonCode(activePreset, a, b, n, mode);
      if (await copyTextToClipboard(code)) {
        triggerCopied();
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleInsert = () => {
    if (!onInsertRiemann || inserted) return;
    setActionError('');
    try {
      scheduleInsertClose(onClose, () => onInsertRiemann(activePreset, a, b, n, mode));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  };

  if (!isOpen) return null;

  const xAxisY = toScreenY(0);
  const yAxisX = toScreenX(0);

  return (
    <div className="riemann-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="riemann-modal-container" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="riemann-header">
          <div className="riemann-title">
            <BarChart3 size={18} color="#58c4dd" />
            <span>3B1B 黎曼和与定积分交互台</span>
            <span className="riemann-badge">Essence of Calculus</span>
          </div>
          <button className="riemann-close-btn" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="riemann-body">
          {/* Left: Canvas & Visual Stats */}
          <div className="riemann-canvas-pane">
            <div className="riemann-svg-wrap">
              <svg
                ref={svgRef}
                viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
                className="riemann-svg"
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onLostPointerCapture={() => setDraggingHandle(null)}
              >
                <defs>
                  {/* Subtle Grid Pattern */}
                  <pattern id="riemann-grid" width="30" height="30" patternUnits="userSpaceOnUse">
                    <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                  </pattern>
                  {/* Rectangles Gradient */}
                  <linearGradient id="rectGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#58c4dd" stopOpacity="0.75" />
                    <stop offset="100%" stopColor="#2b6cb0" stopOpacity="0.45" />
                  </linearGradient>
                </defs>

                <rect width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="url(#riemann-grid)" />

                {/* X and Y Axes */}
                {yMin <= 0 && yMax >= 0 && (
                  <line x1={0} y1={xAxisY} x2={CANVAS_WIDTH} y2={xAxisY} stroke="#3b4259" strokeWidth={1.5} />
                )}
                {xMin <= 0 && xMax >= 0 && (
                  <line x1={yAxisX} y1={0} x2={yAxisX} y2={CANVAS_HEIGHT} stroke="#3b4259" strokeWidth={1.5} />
                )}

                {/* Exact Definite Integral Area Background */}
                {exactAreaPath && (
                  <path d={exactAreaPath} fill="rgba(88, 196, 221, 0.15)" stroke="none" />
                )}

                {/* Riemann Rectangles or Trapezoids */}
                {result.rectangles.map((rect, idx) => {
                  const sxL = toScreenX(rect.xLeft);
                  const sxR = toScreenX(rect.xRight);
                  const w = Math.max(1, sxR - sxL);

                  if (mode === 'trapezoid' && rect.heightLeft !== undefined && rect.heightRight !== undefined) {
                    const syL = toScreenY(rect.heightLeft);
                    const syR = toScreenY(rect.heightRight);
                    const polyPoints = `${sxL},${xAxisY} ${sxL},${syL} ${sxR},${syR} ${sxR},${xAxisY}`;
                    return (
                      <polygon
                        key={idx}
                        points={polyPoints}
                        fill="url(#rectGrad)"
                        stroke="#7bd5ea"
                        strokeWidth={0.8}
                      />
                    );
                  }

                  const syH = toScreenY(rect.height);
                  const top = Math.min(syH, xAxisY);
                  const h = Math.abs(xAxisY - syH);

                  return (
                    <rect
                      key={idx}
                      x={sxL}
                      y={top}
                      width={w}
                      height={Math.max(1, h)}
                      fill="url(#rectGrad)"
                      stroke="#7bd5ea"
                      strokeWidth={0.7}
                    />
                  );
                })}

                {/* Continuous Curve f(x) */}
                {curvePoints.length > 1 && (
                  <polyline
                    points={curvePoints.map(p => `${p[0]},${p[1]}`).join(' ')}
                    fill="none"
                    stroke="#e2b340"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                  />
                )}

                {/* Limit a Vertical Line & Draggable Handle */}
                <line
                  x1={toScreenX(a)}
                  y1={0}
                  x2={toScreenX(a)}
                  y2={CANVAS_HEIGHT}
                  stroke="#48bb78"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                />
                <circle
                  cx={toScreenX(a)}
                  cy={xAxisY}
                  r={8}
                  fill="#48bb78"
                  stroke="#ffffff"
                  strokeWidth={2}
                  style={{ cursor: 'ew-resize' }}
                  onPointerDown={e => handlePointerDown('a', e)}
                />
                <text x={toScreenX(a) - 4} y={xAxisY + 22} fill="#48bb78" fontSize={11} fontWeight={600}>
                  a={a.toFixed(1)}
                </text>

                {/* Limit b Vertical Line & Draggable Handle */}
                <line
                  x1={toScreenX(b)}
                  y1={0}
                  x2={toScreenX(b)}
                  y2={CANVAS_HEIGHT}
                  stroke="#ed8936"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                />
                <circle
                  cx={toScreenX(b)}
                  cy={xAxisY}
                  r={8}
                  fill="#ed8936"
                  stroke="#ffffff"
                  strokeWidth={2}
                  style={{ cursor: 'ew-resize' }}
                  onPointerDown={e => handlePointerDown('b', e)}
                />
                <text x={toScreenX(b) - 4} y={xAxisY + 22} fill="#ed8936" fontSize={11} fontWeight={600}>
                  b={b.toFixed(1)}
                </text>

                {/* Curve Formula HUD */}
                <text x={16} y={26} fill="#e2b340" fontSize={13} fontWeight={600} fontFamily="ui-monospace, monospace">
                  {activePreset.name}
                </text>
              </svg>
            </div>

            {/* Stats Strip */}
            <div className="riemann-stats-strip">
              <div className="riemann-stat-card highlight">
                <span className="riemann-stat-label">黎曼和 ∑f(x)Δx</span>
                <span className="riemann-stat-val primary">{result.sum.toFixed(4)}</span>
              </div>
              <div className="riemann-stat-card">
                <span className="riemann-stat-label">精确积分 ∫f(x)dx</span>
                <span className="riemann-stat-val gold">{result.exact.toFixed(4)}</span>
              </div>
              <div className="riemann-stat-card">
                <span className="riemann-stat-label">矩形步长 Δx</span>
                <span className="riemann-stat-val">{result.dx.toFixed(4)}</span>
              </div>
              <div className="riemann-stat-card">
                <span className="riemann-stat-label">逼近相对误差</span>
                <span className="riemann-stat-val">{result.relErrorPercent.toFixed(2)}%</span>
              </div>
            </div>
          </div>

          {/* Right: Controls & Parameters */}
          <div className="riemann-controls-pane">
            {/* Presets */}
            <div>
              <div className="riemann-section-title">经典函数预设</div>
              <div className="riemann-preset-grid">
                {RIEMANN_PRESETS.map(p => (
                  <button
                    key={p.id}
                    className={`riemann-preset-btn ${p.id === activePreset.id ? 'active' : ''}`}
                    onClick={() => handleSelectPreset(p)}
                  >
                    <span>{p.name.split(' ')[0]}</span>
                    <span style={{ fontSize: 10, opacity: 0.7 }}>{p.latex}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Mode Pills */}
            <div>
              <div className="riemann-section-title">求和法则 (Riemann Rule)</div>
              <div className="riemann-mode-pill-row">
                <button
                  className={`riemann-mode-pill ${mode === 'left' ? 'active' : ''}`}
                  onClick={() => { setActionError(''); setMode('left'); }}
                >
                  左黎曼和
                </button>
                <button
                  className={`riemann-mode-pill ${mode === 'mid' ? 'active' : ''}`}
                  onClick={() => { setActionError(''); setMode('mid'); }}
                >
                  中点和
                </button>
                <button
                  className={`riemann-mode-pill ${mode === 'right' ? 'active' : ''}`}
                  onClick={() => { setActionError(''); setMode('right'); }}
                >
                  右黎曼和
                </button>
                <button
                  className={`riemann-mode-pill ${mode === 'trapezoid' ? 'active' : ''}`}
                  onClick={() => { setActionError(''); setMode('trapezoid'); }}
                >
                  梯形法则
                </button>
              </div>
            </div>

            {/* Sliders */}
            <div className="riemann-slider-group">
              <div className="riemann-slider-row">
                <div className="riemann-slider-label-row">
                  <span>分划矩形数 n</span>
                  <span style={{ color: '#58c4dd', fontWeight: 600 }}>{n}</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="100"
                  step="1"
                  value={n}
                  onChange={e => {
                    const val = parseInt(e.target.value, 10);
                    if (Number.isFinite(val)) {
                      setActionError('');
                      setN(Math.max(2, Math.min(100, val)));
                    }
                  }}
                  className="riemann-slider"
                />
              </div>

              <div className="riemann-slider-row">
                <div className="riemann-slider-label-row">
                  <span>积分下限 a</span>
                  <span>{a.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min={xMin}
                  max={b - 0.2}
                  step="0.1"
                  value={a}
                  onChange={e => {
                    const val = parseFloat(e.target.value);
                    if (Number.isFinite(val)) {
                      setActionError('');
                      setA(Math.max(xMin, Math.min(b - 0.2, val)));
                    }
                  }}
                  className="riemann-slider"
                />
              </div>

              <div className="riemann-slider-row">
                <div className="riemann-slider-label-row">
                  <span>积分上限 b</span>
                  <span>{b.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min={a + 0.2}
                  max={xMax}
                  step="0.1"
                  value={b}
                  onChange={e => {
                    const val = parseFloat(e.target.value);
                    if (Number.isFinite(val)) {
                      setActionError('');
                      setB(Math.max(a + 0.2, Math.min(xMax, val)));
                    }
                  }}
                  className="riemann-slider"
                />
              </div>
            </div>

            {/* Animate Limit Button */}
            <button
              className="riemann-limit-anim-btn"
              onClick={triggerLimitAnimation}
              disabled={isLimiting}
            >
              <Play size={14} />
              <span>{isLimiting ? '正在细分逼近中…' : '一键演示极限逼近 (n: 4 → 70)'}</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="riemann-footer">
          {actionError && (
            <div role="alert" style={{ color: '#f87171', fontSize: 12 }}>
              {actionError}
            </div>
          )}
          <div style={{ fontSize: 11, color: '#8892b0' }}>
            提示：支持拖动绿色与橙色圆点调整积分上下限 [a, b]
          </div>
          <div className="riemann-action-btn-row">
            <button className="riemann-btn-secondary" onClick={handleCopyCode}>
              {copied ? <Check size={14} color="#48bb78" /> : <Copy size={14} />}
              <span>{copied ? '已复制 Manim 代码' : '复制 Python 代码'}</span>
            </button>
            <button className="riemann-btn-primary" onClick={handleInsert} disabled={inserted}>
              {inserted ? <Check size={14} /> : <Sparkles size={14} />}
              <span>插入到动画编排</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
