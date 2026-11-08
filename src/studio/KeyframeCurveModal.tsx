import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Sliders, X, Check, Copy, Sparkles, Play, Pause } from 'lucide-react';
import {
  EASING_PRESETS,
  type EasingPreset,
  sampleCubicBezier,
  sampleCubicBezierDerivative,
  generateBezierRateFuncPython,
} from './easing-curve';
import './keyframe-curve.css';

export interface KeyframeCurveModalProps {
  isOpen: boolean;
  onClose(): void;
  onApplyRateFunc?(rateFuncName: string, coords: [number, number, number, number]): void;
}

const CANVAS_SIZE = 360;
const PAD = 40;
const INNER_SIZE = CANVAS_SIZE - 2 * PAD;

// Coordinate mapping: Math x in [0, 1], y in [-0.5, 1.5]
const Y_MIN = -0.5;
const Y_MAX = 1.5;

function toScreenX(x: number): number {
  return PAD + Math.max(0, Math.min(1, x)) * INNER_SIZE;
}
function toScreenY(y: number): number {
  return PAD + (1 - (y - Y_MIN) / (Y_MAX - Y_MIN)) * INNER_SIZE;
}
function toMathX(sx: number): number {
  return Math.max(0, Math.min(1, (sx - PAD) / INNER_SIZE));
}
function toMathY(sy: number): number {
  const normY = 1 - (sy - PAD) / INNER_SIZE;
  return Y_MIN + normY * (Y_MAX - Y_MIN);
}

export const KeyframeCurveModal: React.FC<KeyframeCurveModalProps> = ({
  isOpen,
  onClose,
  onApplyRateFunc,
}) => {
  const [activePreset, setActivePreset] = useState<EasingPreset>(EASING_PRESETS[1]); // Default 3B1B smooth
  const [x1, setX1] = useState(activePreset.coords[0]);
  const [y1, setY1] = useState(activePreset.coords[1]);
  const [x2, setX2] = useState(activePreset.coords[2]);
  const [y2, setY2] = useState(activePreset.coords[3]);

  const [copied, setCopied] = useState(false);
  const [applied, setApplied] = useState(false);
  const [draggingPoint, setDraggingPoint] = useState<'p1' | 'p2' | null>(null);

  // Preview stage state
  const [previewMode, setPreviewMode] = useState<'position' | 'scale' | 'rotation' | 'opacity'>('position');
  const [previewPlaying, setPreviewPlaying] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<0.5 | 1 | 2>(1);
  const [previewProgress, setPreviewProgress] = useState(0);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const animRef = useRef<number | null>(null);

  // Switch preset
  const handleSelectPreset = (p: EasingPreset) => {
    setActivePreset(p);
    setX1(p.coords[0]);
    setY1(p.coords[1]);
    setX2(p.coords[2]);
    setY2(p.coords[3]);
  };

  // Sample Bezier curve points
  const curvePoints = useMemo(() => {
    const pts: [number, number][] = [];
    const steps = 90;
    for (let i = 0; i <= steps; i++) {
      const x = i / steps;
      const y = sampleCubicBezier(x1, y1, x2, y2, x);
      pts.push([toScreenX(x), toScreenY(y)]);
    }
    return pts;
  }, [x1, y1, x2, y2]);

  // Sample velocity / speed curve
  const speedPoints = useMemo(() => {
    const pts: [number, number][] = [];
    const steps = 60;
    for (let i = 0; i <= steps; i++) {
      const x = i / steps;
      const v = sampleCubicBezierDerivative(x1, y1, x2, y2, x);
      // Map v in [0, 4] to bottom mini-height [PAD+INNER_SIZE, PAD+INNER_SIZE - 40]
      const sy = PAD + INNER_SIZE - Math.max(0, Math.min(3.5, v)) * 12;
      pts.push([toScreenX(x), sy]);
    }
    return pts;
  }, [x1, y1, x2, y2]);

  // Pointer drag handles
  const handlePointerDown = (point: 'p1' | 'p2', e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDraggingPoint(point);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingPoint || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const mx = Math.round(toMathX(sx) * 100) / 100;
    const my = Math.round(toMathY(sy) * 100) / 100;

    if (draggingPoint === 'p1') {
      setX1(mx);
      setY1(my);
    } else {
      setX2(mx);
      setY2(my);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (draggingPoint) {
      try {
        (e.target as Element).releasePointerCapture(e.pointerId);
      } catch {
        // no-op
      }
      setDraggingPoint(null);
    }
  };

  // Preview loop
  useEffect(() => {
    if (!previewPlaying) return;
    let lastTime = performance.now();
    const loopDurationMs = 1500 / playbackSpeed;

    const frame = (now: number) => {
      const dt = now - lastTime;
      lastTime = now;
      setPreviewProgress(prev => (prev + dt / loopDurationMs) % 1.0);
      animRef.current = requestAnimationFrame(frame);
    };

    animRef.current = requestAnimationFrame(frame);
    return () => {
      if (animRef.current !== null) cancelAnimationFrame(animRef.current);
    };
  }, [previewPlaying, playbackSpeed]);

  // Evaluated preview value
  const easedVal = useMemo(() => {
    return sampleCubicBezier(x1, y1, x2, y2, previewProgress);
  }, [x1, y1, x2, y2, previewProgress]);

  // Copy Python code
  const handleCopyCode = async () => {
    const code = generateBezierRateFuncPython(x1, y1, x2, y2);
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  // Apply rate function
  const handleApply = () => {
    if (!onApplyRateFunc) return;
    onApplyRateFunc(activePreset.id, [x1, y1, x2, y2]);
    setApplied(true);
    setTimeout(() => {
      setApplied(false);
      onClose();
    }, 450);
  };

  if (!isOpen) return null;

  // Key screen points
  const p0Screen = [toScreenX(0), toScreenY(0)];
  const p3Screen = [toScreenX(1), toScreenY(1)];
  const p1Screen = [toScreenX(x1), toScreenY(y1)];
  const p2Screen = [toScreenX(x2), toScreenY(y2)];

  // Preview object transform style
  let animatedObjStyle: React.CSSProperties = {};
  if (previewMode === 'position') {
    const leftPercent = Math.max(0, Math.min(100, easedVal * 86));
    animatedObjStyle = { transform: `translateX(${leftPercent * 4}px)` };
  } else if (previewMode === 'scale') {
    const scale = Math.max(0.1, 0.4 + easedVal * 0.8);
    animatedObjStyle = { transform: `scale(${scale})` };
  } else if (previewMode === 'rotation') {
    const deg = easedVal * 360;
    animatedObjStyle = { transform: `rotate(${deg}deg)` };
  } else if (previewMode === 'opacity') {
    const op = Math.max(0, Math.min(1, easedVal));
    animatedObjStyle = { opacity: op };
  }

  return (
    <div className="keyframe-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="keyframe-modal-container" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="keyframe-header">
          <div className="keyframe-title">
            <Sliders size={18} color="#bb86fc" />
            <span>缓动曲线与关键帧检查器 (Keyframe Easing Inspector)</span>
            <span className="keyframe-badge">Motion Design</span>
          </div>
          <button className="keyframe-close-btn" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="keyframe-body">
          {/* Left: Canvas & Preview Track */}
          <div className="keyframe-canvas-pane">
            <div className="keyframe-svg-wrap">
              <svg
                ref={svgRef}
                viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`}
                className="keyframe-svg"
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              >
                <defs>
                  {/* Subtle Grid Pattern */}
                  <pattern id="keyframe-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                  </pattern>
                </defs>

                <rect width={CANVAS_SIZE} height={CANVAS_SIZE} fill="url(#keyframe-grid)" />

                {/* Base Unit Box [0,1]x[0,1] */}
                <rect
                  x={toScreenX(0)}
                  y={toScreenY(1)}
                  width={INNER_SIZE}
                  height={toScreenY(0) - toScreenY(1)}
                  fill="rgba(255,255,255,0.02)"
                  stroke="#262d42"
                  strokeWidth={1}
                />

                {/* Diagonal Reference Line (0,0) -> (1,1) */}
                <line
                  x1={p0Screen[0]}
                  y1={p0Screen[1]}
                  x2={p3Screen[0]}
                  y2={p3Screen[1]}
                  stroke="#384360"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />

                {/* Tangent Handle Line P0 -> P1 (Cyan) */}
                <line
                  x1={p0Screen[0]}
                  y1={p0Screen[1]}
                  x2={p1Screen[0]}
                  y2={p1Screen[1]}
                  stroke="#58c4dd"
                  strokeWidth={1.8}
                />

                {/* Tangent Handle Line P3 -> P2 (Magenta) */}
                <line
                  x1={p3Screen[0]}
                  y1={p3Screen[1]}
                  x2={p2Screen[0]}
                  y2={p2Screen[1]}
                  stroke="#bb86fc"
                  strokeWidth={1.8}
                />

                {/* Cubic Bezier Curve */}
                {curvePoints.length > 1 && (
                  <polyline
                    points={curvePoints.map(p => `${p[0]},${p[1]}`).join(' ')}
                    fill="none"
                    stroke="#58c4dd"
                    strokeWidth={3}
                    strokeLinecap="round"
                  />
                )}

                {/* Velocity / Speed Graph Line (Greenish) */}
                {speedPoints.length > 1 && (
                  <polyline
                    points={speedPoints.map(p => `${p[0]},${p[1]}`).join(' ')}
                    fill="none"
                    stroke="#48bb78"
                    strokeWidth={1.2}
                    opacity={0.65}
                    strokeDasharray="2 2"
                  />
                )}

                {/* P0 and P3 Anchor Dots */}
                <circle cx={p0Screen[0]} cy={p0Screen[1]} r={4} fill="#8892b0" />
                <circle cx={p3Screen[0]} cy={p3Screen[1]} r={4} fill="#8892b0" />

                {/* Draggable Control Handle P1 */}
                <circle
                  cx={p1Screen[0]}
                  cy={p1Screen[1]}
                  r={8}
                  fill="#58c4dd"
                  stroke="#ffffff"
                  strokeWidth={2}
                  style={{ cursor: 'grab' }}
                  onPointerDown={e => handlePointerDown('p1', e)}
                />
                <text x={p1Screen[0] + 10} y={p1Screen[1] - 4} fill="#58c4dd" fontSize={11} fontWeight={600}>
                  P₁({x1.toFixed(2)}, {y1.toFixed(2)})
                </text>

                {/* Draggable Control Handle P2 */}
                <circle
                  cx={p2Screen[0]}
                  cy={p2Screen[1]}
                  r={8}
                  fill="#bb86fc"
                  stroke="#ffffff"
                  strokeWidth={2}
                  style={{ cursor: 'grab' }}
                  onPointerDown={e => handlePointerDown('p2', e)}
                />
                <text x={p2Screen[0] + 10} y={p2Screen[1] - 4} fill="#bb86fc" fontSize={11} fontWeight={600}>
                  P₂({x2.toFixed(2)}, {y2.toFixed(2)})
                </text>

                {/* Current Playback Marker Dot on Curve */}
                <circle
                  cx={toScreenX(previewProgress)}
                  cy={toScreenY(easedVal)}
                  r={5}
                  fill="#ffd700"
                  stroke="#1a1f2e"
                  strokeWidth={1.5}
                />

                {/* Live cubic-bezier notation banner */}
                <text x={PAD} y={24} fill="#cbd5e1" fontSize={12} fontFamily="ui-monospace, monospace">
                  cubic-bezier({x1.toFixed(2)}, {y1.toFixed(2)}, {x2.toFixed(2)}, {y2.toFixed(2)})
                </text>
              </svg>
            </div>

            {/* Live Animation Test Track */}
            <div className="keyframe-preview-strip">
              <div className="keyframe-stage-track">
                <div className="keyframe-animated-obj" style={animatedObjStyle}>
                  π
                </div>
              </div>

              <div className="keyframe-preview-controls">
                <div className="keyframe-test-modes">
                  <button
                    className={`keyframe-mode-btn ${previewMode === 'position' ? 'active' : ''}`}
                    onClick={() => setPreviewMode('position')}
                  >
                    位移 X
                  </button>
                  <button
                    className={`keyframe-mode-btn ${previewMode === 'scale' ? 'active' : ''}`}
                    onClick={() => setPreviewMode('scale')}
                  >
                    缩放 Pop
                  </button>
                  <button
                    className={`keyframe-mode-btn ${previewMode === 'rotation' ? 'active' : ''}`}
                    onClick={() => setPreviewMode('rotation')}
                  >
                    旋转 360°
                  </button>
                  <button
                    className={`keyframe-mode-btn ${previewMode === 'opacity' ? 'active' : ''}`}
                    onClick={() => setPreviewMode('opacity')}
                  >
                    透明度 Fade
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    className="keyframe-mode-btn"
                    onClick={() => setPreviewPlaying(!previewPlaying)}
                    title={previewPlaying ? '暂停' : '播放'}
                  >
                    {previewPlaying ? <Pause size={12} /> : <Play size={12} />}
                  </button>
                  <button
                    className={`keyframe-mode-btn ${playbackSpeed === 0.5 ? 'active' : ''}`}
                    onClick={() => setPlaybackSpeed(0.5)}
                  >
                    0.5x
                  </button>
                  <button
                    className={`keyframe-mode-btn ${playbackSpeed === 1 ? 'active' : ''}`}
                    onClick={() => setPlaybackSpeed(1)}
                  >
                    1.0x
                  </button>
                  <button
                    className={`keyframe-mode-btn ${playbackSpeed === 2 ? 'active' : ''}`}
                    onClick={() => setPlaybackSpeed(2)}
                  >
                    2.0x
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Presets & Parameters */}
          <div className="keyframe-controls-pane">
            {/* Presets List */}
            <div>
              <div className="keyframe-section-title">缓动曲线预设</div>
              <div className="keyframe-preset-list">
                {EASING_PRESETS.map(p => (
                  <button
                    key={p.id}
                    className={`keyframe-preset-card ${p.id === activePreset.id ? 'active' : ''}`}
                    onClick={() => handleSelectPreset(p)}
                  >
                    <span style={{ fontWeight: 600 }}>{p.name}</span>
                    <span style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>{p.description}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Manual Numeric Inputs */}
            <div>
              <div className="keyframe-section-title">控制点坐标数值</div>
              <div className="keyframe-handle-inputs">
                <div className="keyframe-handle-box">
                  <span className="keyframe-handle-title" style={{ color: '#58c4dd' }}>
                    起点手柄 P₁
                  </span>
                  <div className="keyframe-coord-row">
                    <span>X₁:</span>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      max="1"
                      value={x1}
                      onChange={e => setX1(parseFloat(e.target.value) || 0)}
                      className="keyframe-coord-input"
                    />
                  </div>
                  <div className="keyframe-coord-row">
                    <span>Y₁:</span>
                    <input
                      type="number"
                      step="0.05"
                      min="-1.5"
                      max="2.5"
                      value={y1}
                      onChange={e => setY1(parseFloat(e.target.value) || 0)}
                      className="keyframe-coord-input"
                    />
                  </div>
                </div>

                <div className="keyframe-handle-box">
                  <span className="keyframe-handle-title" style={{ color: '#bb86fc' }}>
                    终点手柄 P₂
                  </span>
                  <div className="keyframe-coord-row">
                    <span>X₂:</span>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      max="1"
                      value={x2}
                      onChange={e => setX2(parseFloat(e.target.value) || 0)}
                      className="keyframe-coord-input"
                    />
                  </div>
                  <div className="keyframe-coord-row">
                    <span>Y₂:</span>
                    <input
                      type="number"
                      step="0.05"
                      min="-1.5"
                      max="2.5"
                      value={y2}
                      onChange={e => setY2(parseFloat(e.target.value) || 0)}
                      className="keyframe-coord-input"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="keyframe-footer">
          <div style={{ fontSize: 11, color: '#8892b0' }}>
            提示：支持拖动青色 (P₁) 与粉紫色 (P₂) 手柄自由塑造运动质感
          </div>
          <div className="keyframe-action-btn-row">
            <button className="keyframe-btn-secondary" onClick={handleCopyCode}>
              {copied ? <Check size={14} color="#48bb78" /> : <Copy size={14} />}
              <span>{copied ? '已复制 Manim 代码' : '复制 Python 代码'}</span>
            </button>
            <button className="keyframe-btn-primary" onClick={handleApply}>
              {applied ? <Check size={14} /> : <Sparkles size={14} />}
              <span>应用缓动曲线</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
