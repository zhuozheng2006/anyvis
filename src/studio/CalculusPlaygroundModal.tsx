import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { TrendingUp, X, Check, Copy, Sparkles, Play } from 'lucide-react';
import {
  CALCULUS_PRESETS,
  type CalculusPreset,
  computeDerivative,
  computeSecantSlope,
  generateCalculusPythonCode,
} from './calculus';
import './calculus-playground.css';

export interface CalculusPlaygroundModalProps {
  isOpen: boolean;
  onClose(): void;
  onInsertCalculus?(preset: CalculusPreset, x0: number): void;
}

const CANVAS_WIDTH = 520;
const CANVAS_HEIGHT = 400;
const X_MIN = -3.5;
const X_MAX = 3.5;
const Y_MIN = -3.0;
const Y_MAX = 4.5;

function toScreenX(x: number): number {
  return ((x - X_MIN) / (X_MAX - X_MIN)) * CANVAS_WIDTH;
}
function toScreenY(y: number): number {
  return CANVAS_HEIGHT - ((y - Y_MIN) / (Y_MAX - Y_MIN)) * CANVAS_HEIGHT;
}
function toMathX(sx: number): number {
  return X_MIN + (sx / CANVAS_WIDTH) * (X_MAX - X_MIN);
}

export const CalculusPlaygroundModal: React.FC<CalculusPlaygroundModalProps> = ({
  isOpen,
  onClose,
  onInsertCalculus,
}) => {
  const [activePreset, setActivePreset] = useState<CalculusPreset>(CALCULUS_PRESETS[0]);
  const [x0, setX0] = useState(1.0);
  const [dx, setDx] = useState(1.2);
  const [copied, setCopied] = useState(false);
  const [inserted, setInserted] = useState(false);
  const [isDraggingP, setIsDraggingP] = useState(false);
  const [isLimiting, setIsLimiting] = useState(false);

  const animRef = useRef<number | null>(null);

  // 1. Calculations
  const y0 = useMemo(() => activePreset.fn(x0), [activePreset, x0]);
  const yQ = useMemo(() => activePreset.fn(x0 + dx), [activePreset, x0, dx]);
  const secantSlope = useMemo(() => computeSecantSlope(activePreset.fn, x0, dx), [activePreset, x0, dx]);
  const tangentSlope = useMemo(() => computeDerivative(activePreset.fn, x0), [activePreset, x0]);
  const slopeDiff = useMemo(() => Math.abs(secantSlope - tangentSlope), [secantSlope, tangentSlope]);

  // 2. Sample function curve points
  const curvePoints = useMemo(() => {
    const pts: [number, number][] = [];
    const steps = 140;
    for (let i = 0; i <= steps; i++) {
      const x = X_MIN + (i / steps) * (X_MAX - X_MIN);
      const y = activePreset.fn(x);
      if (Number.isFinite(y) && y >= Y_MIN - 1 && y <= Y_MAX + 1) {
        pts.push([toScreenX(x), toScreenY(y)]);
      }
    }
    return pts;
  }, [activePreset]);

  // 3. Sample derivative curve points
  const derivPoints = useMemo(() => {
    const pts: [number, number][] = [];
    const steps = 140;
    for (let i = 0; i <= steps; i++) {
      const x = X_MIN + (i / steps) * (X_MAX - X_MIN);
      const y = activePreset.derivativeFn(x);
      if (Number.isFinite(y) && y >= Y_MIN - 1 && y <= Y_MAX + 1) {
        pts.push([toScreenX(x), toScreenY(y)]);
      }
    }
    return pts;
  }, [activePreset]);

  // 4. Line endpoints for secant line (extended)
  const secantLine = useMemo(() => {
    const xLeft = x0 - 2.5;
    const xRight = x0 + 2.5;
    const yLeft = y0 + secantSlope * (xLeft - x0);
    const yRight = y0 + secantSlope * (xRight - x0);
    return {
      x1: toScreenX(xLeft),
      y1: toScreenY(yLeft),
      x2: toScreenX(xRight),
      y2: toScreenY(yRight),
    };
  }, [x0, y0, secantSlope]);

  // 5. Line endpoints for tangent line (extended)
  const tangentLine = useMemo(() => {
    const xLeft = x0 - 2.2;
    const xRight = x0 + 2.2;
    const yLeft = y0 + tangentSlope * (xLeft - x0);
    const yRight = y0 + tangentSlope * (xRight - x0);
    return {
      x1: toScreenX(xLeft),
      y1: toScreenY(yLeft),
      x2: toScreenX(xRight),
      y2: toScreenY(yRight),
    };
  }, [x0, y0, tangentSlope]);

  // 6. Handle preset change
  const selectPreset = (p: CalculusPreset) => {
    setActivePreset(p);
    setX0(p.defaultX);
    setDx(1.0);
    if (animRef.current) cancelAnimationFrame(animRef.current);
    setIsLimiting(false);
  };

  // 7. Animate limit dx -> 0
  const triggerLimitAnimation = () => {
    if (isLimiting) return;
    setIsLimiting(true);
    const startDx = dx > 0.05 ? dx : 1.5;
    const targetDx = 0.005;
    const startTime = performance.now();
    const duration = 2200;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      // smooth step ease-in-out
      const ease = progress * progress * (3 - 2 * progress);
      const curDx = startDx + (targetDx - startDx) * ease;
      setDx(curDx);

      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        setIsLimiting(false);
      }
    };

    animRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  // 8. Pointer drag for point P
  const handlePointerDownP = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setIsDraggingP(true);
  };

  const handlePointerMoveP = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDraggingP) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const mathX = Math.max(activePreset.domain[0], Math.min(activePreset.domain[1], toMathX(sx)));
    setX0(mathX);
  };

  const handlePointerUpP = () => {
    setIsDraggingP(false);
  };

  // 9. Actions
  const handleCopyCode = useCallback(async () => {
    const py = generateCalculusPythonCode(activePreset, x0, dx);
    try {
      await navigator.clipboard.writeText(py);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }, [activePreset, x0, dx]);

  const handleInsert = useCallback(() => {
    if (onInsertCalculus) {
      onInsertCalculus(activePreset, x0);
      setInserted(true);
      setTimeout(() => {
        setInserted(false);
        onClose();
      }, 600);
    }
  }, [activePreset, x0, onInsertCalculus, onClose]);

  if (!isOpen) return null;

  return (
    <div className="calculus-modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="calculus-modal" role="dialog" aria-modal="true">
        {/* Header */}
        <div className="calculus-modal-header">
          <div className="calculus-modal-title">
            <TrendingUp size={18} color="#38BDF8" />
            <span>3B1B 微积分导数与切线交互台 (Essence of Calculus)</span>
            <span className="calculus-title-badge">割线极限 → 切线</span>
          </div>
          <button className="calculus-close-btn" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="calculus-modal-body">
          {/* Left Canvas */}
          <div className="calculus-canvas-container">
            <div className="calculus-canvas-wrap">
              <svg
                className="calculus-svg"
                viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
                onPointerMove={handlePointerMoveP}
                onPointerUp={handlePointerUpP}
              >
                {/* Grid Lines */}
                {[-3, -2, -1, 1, 2, 3].map(gx => (
                  <line
                    key={`gx-${gx}`}
                    x1={toScreenX(gx)}
                    y1={0}
                    x2={toScreenX(gx)}
                    y2={CANVAS_HEIGHT}
                    stroke="#1e293b"
                    strokeWidth={1}
                  />
                ))}
                {[-2, -1, 1, 2, 3, 4].map(gy => (
                  <line
                    key={`gy-${gy}`}
                    x1={0}
                    y1={toScreenY(gy)}
                    x2={CANVAS_WIDTH}
                    y2={toScreenY(gy)}
                    stroke="#1e293b"
                    strokeWidth={1}
                  />
                ))}

                {/* Axes */}
                <line x1={0} y1={toScreenY(0)} x2={CANVAS_WIDTH} y2={toScreenY(0)} stroke="#475569" strokeWidth={1.5} />
                <line x1={toScreenX(0)} y1={0} x2={toScreenX(0)} y2={CANVAS_HEIGHT} stroke="#475569" strokeWidth={1.5} />

                {/* 1. Derivative curve y = f'(x) */}
                {derivPoints.length > 1 && (
                  <polyline
                    points={derivPoints.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')}
                    stroke="#A855F7"
                    strokeWidth={1.8}
                    strokeDasharray="4 3"
                    fill="none"
                  />
                )}

                {/* 2. Main function curve y = f(x) */}
                {curvePoints.length > 1 && (
                  <polyline
                    points={curvePoints.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')}
                    stroke="#38BDF8"
                    strokeWidth={3}
                    fill="none"
                  />
                )}

                {/* 3. dx horizontal leg and dy vertical leg (3B1B right triangle) */}
                <line
                  x1={toScreenX(x0)}
                  y1={toScreenY(y0)}
                  x2={toScreenX(x0 + dx)}
                  y2={toScreenY(y0)}
                  stroke="#EAB308"
                  strokeWidth={2}
                  strokeDasharray="3 3"
                />
                <line
                  x1={toScreenX(x0 + dx)}
                  y1={toScreenY(y0)}
                  x2={toScreenX(x0 + dx)}
                  y2={toScreenY(yQ)}
                  stroke="#22C55E"
                  strokeWidth={2}
                  strokeDasharray="3 3"
                />

                {/* 4. Secant line */}
                <line
                  x1={secantLine.x1}
                  y1={secantLine.y1}
                  x2={secantLine.x2}
                  y2={secantLine.y2}
                  stroke="#EF4444"
                  strokeWidth={1.8}
                  strokeDasharray="4 4"
                />

                {/* 5. Tangent line (purple glowing) */}
                <line
                  x1={tangentLine.x1}
                  y1={tangentLine.y1}
                  x2={tangentLine.x2}
                  y2={tangentLine.y2}
                  stroke="#C084FC"
                  strokeWidth={2.4}
                />

                {/* 6. Point Q (x0 + dx) */}
                <circle
                  cx={toScreenX(x0 + dx)}
                  cy={toScreenY(yQ)}
                  r={5}
                  fill="#FB923C"
                  stroke="#FFFFFF"
                  strokeWidth={1.5}
                />

                {/* 7. Point P (x0, f(x0)) draggable handle */}
                <circle
                  cx={toScreenX(x0)}
                  cy={toScreenY(y0)}
                  r={7.5}
                  fill="#FBBF24"
                  stroke="#FFFFFF"
                  strokeWidth={2}
                  style={{ cursor: 'ew-resize' }}
                  onPointerDown={handlePointerDownP}
                />
              </svg>
            </div>

            {/* Legend bar */}
            <div className="calculus-legend-row">
              <div className="calculus-legend-item">
                <span className="calculus-legend-dot" style={{ background: '#38BDF8' }} />
                <span>原函数 f(x)</span>
              </div>
              <div className="calculus-legend-item">
                <span className="calculus-legend-dot" style={{ background: '#C084FC' }} />
                <span>切线 (导数 f')</span>
              </div>
              <div className="calculus-legend-item">
                <span className="calculus-legend-dot" style={{ background: '#EF4444' }} />
                <span>割线 (差商)</span>
              </div>
              <div className="calculus-legend-item">
                <span className="calculus-legend-dot" style={{ background: '#A855F7' }} />
                <span>导函数 f'(x)</span>
              </div>
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="calculus-sidebar">
            {/* Presets */}
            <div className="calculus-panel-section">
              <div className="calculus-section-title">
                <span>函数预设</span>
              </div>
              <div className="calculus-preset-grid">
                {CALCULUS_PRESETS.map(p => (
                  <button
                    key={p.id}
                    className={`calculus-preset-btn ${activePreset.id === p.id ? 'active' : ''}`}
                    onClick={() => selectPreset(p)}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Parameter Sliders */}
            <div className="calculus-panel-section">
              <div className="calculus-section-title">
                <span>切点与步长控制</span>
              </div>

              {/* x0 Slider */}
              <div className="calculus-slider-row">
                <span>切点横坐标 x₀:</span>
                <span style={{ fontFamily: 'monospace', color: '#fbbf24', fontWeight: 600 }}>
                  {x0.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                className="calculus-slider"
                min={activePreset.domain[0]}
                max={activePreset.domain[1]}
                step={0.05}
                value={x0}
                onChange={e => setX0(parseFloat(e.target.value))}
              />

              {/* dx Slider */}
              <div className="calculus-slider-row" style={{ marginTop: 6 }}>
                <span>割线步长 Δx:</span>
                <span style={{ fontFamily: 'monospace', color: '#38bdf8', fontWeight: 600 }}>
                  {dx.toFixed(3)}
                </span>
              </div>
              <input
                type="range"
                className="calculus-slider"
                min={0.005}
                max={2.0}
                step={0.005}
                value={dx}
                onChange={e => setDx(parseFloat(e.target.value))}
              />

              {/* 1-Click Limit Animation */}
              <button
                className="calculus-animate-limit-btn"
                style={{ marginTop: 8 }}
                onClick={triggerLimitAnimation}
                disabled={isLimiting}
              >
                <Play size={13} />
                <span>{isLimiting ? '极限逼近中 Δx → 0…' : '一键演示极限过程 Δx → 0'}</span>
              </button>
            </div>

            {/* Metrics Readouts */}
            <div className="calculus-panel-section">
              <div className="calculus-section-title">
                <span>导数与差商指标</span>
              </div>
              <div className="calculus-metrics-grid">
                <div className="calculus-metric-card">
                  <div className="calculus-metric-label">切线斜率 f'(x₀)</div>
                  <div className="calculus-metric-value" style={{ color: '#c084fc' }}>
                    {tangentSlope.toFixed(3)}
                  </div>
                </div>
                <div className="calculus-metric-card">
                  <div className="calculus-metric-label">割线差商 Δy/Δx</div>
                  <div className="calculus-metric-value" style={{ color: '#ef4444' }}>
                    {secantSlope.toFixed(3)}
                  </div>
                </div>
              </div>
              <div className="calculus-slider-row" style={{ marginTop: 4, fontSize: 11 }}>
                <span style={{ color: '#64748b' }}>逼近误差 |m - f'|:</span>
                <span style={{ fontFamily: 'monospace', color: slopeDiff < 0.05 ? '#34d399' : '#fbbf24' }}>
                  {slopeDiff.toFixed(4)}
                </span>
              </div>
            </div>

            {/* Formula box */}
            <div className="calculus-formula-box">
              f'(x) = {activePreset.derivativeExpr}
              <br />
              f'(x₀) = lim Δy/Δx (Δx→0)
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="calculus-modal-footer">
          <div className="calculus-footer-left">
            <span>支持导出 ValueTracker 割线逼近动画与函数积木</span>
          </div>
          <div className="calculus-footer-right">
            <button className="calculus-btn-secondary" onClick={handleCopyCode}>
              {copied ? <Check size={14} color="#34D399" /> : <Copy size={14} />}
              <span>{copied ? '已复制 Python 代码' : '复制代码'}</span>
            </button>
            <button className="calculus-btn-primary" onClick={handleInsert}>
              {inserted ? <Check size={14} /> : <Sparkles size={14} />}
              <span>{inserted ? '已插入工程' : '插入微积分积木'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
