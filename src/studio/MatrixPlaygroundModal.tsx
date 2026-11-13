import React, { useState, useRef, useId, useEffect } from 'react';
import { Grid, X, Check, Copy, Sparkles } from 'lucide-react';
import { clientToSvgPoint, copyTextToClipboard } from './browser-utils';
import {
  useTransientFlag,
  useDialogEscape,
  capturePointerSafe,
  releasePointerSafe,
} from './modal-hooks';
import './matrix-playground.css';

export interface MatrixPlaygroundModalProps {
  isOpen: boolean;
  onClose(): void;
  onInsertMatrix?(matrixStr: string): void;
}

interface Preset {
  name: string;
  desc: string;
  a: number;
  b: number;
  c: number;
  d: number;
}

const PRESETS: Preset[] = [
  { name: '恒等变换', desc: '空间保持原样', a: 1, b: 0, c: 0, d: 1 },
  { name: '旋转 90°', desc: '逆时针纯旋转', a: 0, b: -1, c: 1, d: 0 },
  { name: '旋转 45°', desc: '逆时针 45 度', a: 0.71, b: -0.71, c: 0.71, d: 0.71 },
  { name: '水平剪切', desc: 'y 坐标不变，x 随 y 偏移', a: 1, b: 1, c: 0, d: 1 },
  { name: '垂直剪切', desc: 'x 坐标不变，y 随 x 偏移', a: 1, b: 0, c: 1, d: 1 },
  { name: 'X轴反射', desc: '上下颠倒翻转', a: 1, b: 0, c: 0, d: -1 },
  { name: 'Y轴反射', desc: '左右镜像翻转', a: -1, b: 0, c: 0, d: 1 },
  { name: '对角翻转 y=x', desc: '交换 x 与 y 坐标', a: 0, b: 1, c: 1, d: 0 },
  { name: '等比缩放 1.5x', desc: '面积扩大 2.25 倍', a: 1.5, b: 0, c: 0, d: 1.5 },
  { name: '降维投影', desc: '压扁至 X 轴，det = 0', a: 1, b: 0, c: 0, d: 0 },
];

export const MatrixPlaygroundModal: React.FC<MatrixPlaygroundModalProps> = ({
  isOpen,
  onClose,
  onInsertMatrix,
}) => {
  const [a, setA] = useState(1);
  const [b, setB] = useState(1);
  const [c, setC] = useState(0);
  const [d, setD] = useState(1);
  const [copied, triggerCopied, resetCopied] = useTransientFlag(2000, isOpen);
  const [dragging, setDragging] = useState<'i' | 'j' | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const idPrefix = useId();

  useEffect(() => {
    if (!isOpen) {
      setDragging(null);
      resetCopied();
    }
  }, [isOpen, resetCopied]);

  useDialogEscape(isOpen, onClose);

  if (!isOpen) return null;

  // Math properties
  const det = Number((a * d - b * c).toFixed(3));
  const trace = Number((a + d).toFixed(3));
  const disc = trace * trace - 4 * det;

  let eigenText = '';
  if (disc >= 0) {
    const l1 = ((trace + Math.sqrt(disc)) / 2).toFixed(2);
    const l2 = ((trace - Math.sqrt(disc)) / 2).toFixed(2);
    eigenText = l1 === l2 ? `λ = ${l1} (二重重根)` : `λ₁ = ${l1}, λ₂ = ${l2}`;
  } else {
    const realPart = (trace / 2).toFixed(2);
    const imagPart = (Math.sqrt(-disc) / 2).toFixed(2);
    eigenText = `λ = ${realPart} ± ${imagPart}i (复特征值/旋转)`;
  }

  // Coordinate mapping for SVG: range [-3, 3] in world coords -> [30, 330] in SVG px
  const svgSize = 360;
  const padding = 30;
  const plotWidth = svgSize - padding * 2;
  const toSvgX = (x: number) => padding + ((x + 3) / 6) * plotWidth;
  const toSvgY = (y: number) => padding + ((3 - y) / 6) * plotWidth;

  const fromSvgCoords = (svgX: number, svgY: number): [number, number] => {
    const worldX = ((svgX - padding) / plotWidth) * 6 - 3;
    const worldY = 3 - ((svgY - padding) / plotWidth) * 6;
    return [
      Number((Math.round(worldX * 2) / 2).toFixed(2)),
      Number((Math.round(worldY * 2) / 2).toFixed(2)),
    ];
  };

  const handlePointerDown = (which: 'i' | 'j') => (e: React.PointerEvent) => {
    e.stopPropagation();
    capturePointerSafe(svgRef.current || e.currentTarget, e.pointerId);
    setDragging(which);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const pt = clientToSvgPoint(svgRef.current, e.clientX, e.clientY, svgSize, svgSize);
    if (!pt) return;
    const [wx, wy] = fromSvgCoords(pt.x, pt.y);

    if (dragging === 'i') {
      setA(wx);
      setC(wy);
    } else {
      setB(wx);
      setD(wy);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragging) {
      releasePointerSafe(svgRef.current || e.currentTarget, e.pointerId);
      setDragging(null);
    }
  };

  const matrixString = `[[${a}, ${b}], [${c}, ${d}]]`;
  const manimCode = `self.play(ApplyMatrix([[${a}, ${b}], [${c}, ${d}]], target))`;

  const handleCopy = async () => {
    if (await copyTextToClipboard(manimCode)) {
      triggerCopied();
    }
  };

  const applyPreset = (p: Preset) => {
    setA(p.a);
    setB(p.b);
    setC(p.c);
    setD(p.d);
  };

  return (
    <div className="mpm-overlay" role="dialog" aria-modal="true" aria-label="3B1B 矩阵线性变换交互台" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mpm-modal">
        <div className="mpm-header">
          <div className="mpm-title">
            <Grid size={18} className="mpm-title-icon" />
            <span>3B1B 矩阵线性变换交互台</span>
          </div>
          <button type="button" className="mpm-close-btn" onClick={onClose} aria-label="关闭窗口">
            <X size={18} />
          </button>
        </div>

        <div className="mpm-content">
          <div className="mpm-left-pane">
            <div className="mpm-canvas-wrap">
              <svg
                ref={svgRef}
                viewBox={`0 0 ${svgSize} ${svgSize}`}
                className="mpm-svg"
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onLostPointerCapture={() => setDragging(null)}
              >
                <defs>
                  <marker
                    id={`${idPrefix}-arrow-i`}
                    viewBox="0 0 10 10"
                    refX="6"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="#10b981" />
                  </marker>
                  <marker
                    id={`${idPrefix}-arrow-j`}
                    viewBox="0 0 10 10"
                    refX="6"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="#ef4444" />
                  </marker>
                </defs>

                {/* Background grid */}
                {[-3, -2, -1, 1, 2, 3].map(k => (
                  <React.Fragment key={`bg-${k}`}>
                    <line
                      x1={toSvgX(k)}
                      y1={toSvgY(-3)}
                      x2={toSvgX(k)}
                      y2={toSvgY(3)}
                      stroke="#27272a"
                      strokeWidth="1"
                    />
                    <line
                      x1={toSvgX(-3)}
                      y1={toSvgY(k)}
                      x2={toSvgX(3)}
                      y2={toSvgY(k)}
                      stroke="#27272a"
                      strokeWidth="1"
                    />
                  </React.Fragment>
                ))}

                {/* Transformed grid lines */}
                {[-2, -1, 1, 2].map(k => (
                  <React.Fragment key={`trans-${k}`}>
                    {/* line x = k */}
                    <line
                      x1={toSvgX(k * a - 3 * b)}
                      y1={toSvgY(k * c - 3 * d)}
                      x2={toSvgX(k * a + 3 * b)}
                      y2={toSvgY(k * c + 3 * d)}
                      stroke="#3f3f46"
                      strokeWidth="1"
                      strokeDasharray="2,3"
                    />
                    {/* line y = k */}
                    <line
                      x1={toSvgX(-3 * a + k * b)}
                      y1={toSvgY(-3 * c + k * d)}
                      x2={toSvgX(3 * a + k * b)}
                      y2={toSvgY(3 * c + k * d)}
                      stroke="#3f3f46"
                      strokeWidth="1"
                      strokeDasharray="2,3"
                    />
                  </React.Fragment>
                ))}

                {/* Coordinate axes */}
                <line
                  x1={toSvgX(-3)}
                  y1={toSvgY(0)}
                  x2={toSvgX(3)}
                  y2={toSvgY(0)}
                  stroke="#52525b"
                  strokeWidth="1.5"
                />
                <line
                  x1={toSvgX(0)}
                  y1={toSvgY(-3)}
                  x2={toSvgX(0)}
                  y2={toSvgY(3)}
                  stroke="#52525b"
                  strokeWidth="1.5"
                />

                {/* Original unit square */}
                <polygon
                  points={`${toSvgX(0)},${toSvgY(0)} ${toSvgX(1)},${toSvgY(0)} ${toSvgX(1)},${toSvgY(1)} ${toSvgX(0)},${toSvgY(1)}`}
                  fill="rgba(255, 255, 255, 0.04)"
                  stroke="#71717a"
                  strokeWidth="1"
                  strokeDasharray="3,3"
                />

                {/* Transformed determinant parallelogram */}
                <polygon
                  points={`${toSvgX(0)},${toSvgY(0)} ${toSvgX(a)},${toSvgY(c)} ${toSvgX(a + b)},${toSvgY(c + d)} ${toSvgX(b)},${toSvgY(d)}`}
                  fill={det >= 0 ? 'rgba(251, 191, 36, 0.22)' : 'rgba(244, 63, 94, 0.22)'}
                  stroke={det >= 0 ? '#fbbf24' : '#f43f5e'}
                  strokeWidth="1.5"
                />

                {/* Vector i-hat' (a, c) */}
                <line
                  x1={toSvgX(0)}
                  y1={toSvgY(0)}
                  x2={toSvgX(a)}
                  y2={toSvgY(c)}
                  stroke="#10b981"
                  strokeWidth="2.5"
                  markerEnd={`url(#${idPrefix}-arrow-i)`}
                />
                {/* Vector j-hat' (b, d) */}
                <line
                  x1={toSvgX(0)}
                  y1={toSvgY(0)}
                  x2={toSvgX(b)}
                  y2={toSvgY(d)}
                  stroke="#ef4444"
                  strokeWidth="2.5"
                  markerEnd={`url(#${idPrefix}-arrow-j)`}
                />

                {/* Draggable handles on tip */}
                <circle
                  cx={toSvgX(a)}
                  cy={toSvgY(c)}
                  r="7"
                  className="mpm-handle mpm-handle-i"
                  onPointerDown={handlePointerDown('i')}
                />
                <circle
                  cx={toSvgX(b)}
                  cy={toSvgY(d)}
                  r="7"
                  className="mpm-handle mpm-handle-j"
                  onPointerDown={handlePointerDown('j')}
                />

                {/* Labels */}
                <text x={toSvgX(a) + 8} y={toSvgY(c) - 8} fill="#10b981" fontSize="11" fontWeight="bold">
                  î' ({a}, {c})
                </text>
                <text x={toSvgX(b) + 8} y={toSvgY(d) - 8} fill="#ef4444" fontSize="11" fontWeight="bold">
                  ĵ' ({b}, {d})
                </text>
              </svg>
            </div>
            <div className="mpm-canvas-hint">
              <span>💡 拖动绿色圆点修改 î'，拖动红色圆点修改 ĵ'</span>
            </div>
          </div>

          <div className="mpm-right-pane">
            <div className="mpm-matrix-box">
              <div className="mpm-matrix-label">二维变换矩阵 A：</div>
              <div className="mpm-bracket-wrapper">
                <span className="mpm-bracket">[</span>
                <div className="mpm-matrix-grid">
                  <div className="mpm-cell">
                    <label>î_x (a)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={a}
                      onChange={e => {
                        const val = Number(e.target.value);
                        if (Number.isFinite(val)) setA(val);
                      }}
                    />
                  </div>
                  <div className="mpm-cell">
                    <label>ĵ_x (b)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={b}
                      onChange={e => {
                        const val = Number(e.target.value);
                        if (Number.isFinite(val)) setB(val);
                      }}
                    />
                  </div>
                  <div className="mpm-cell">
                    <label>î_y (c)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={c}
                      onChange={e => {
                        const val = Number(e.target.value);
                        if (Number.isFinite(val)) setC(val);
                      }}
                    />
                  </div>
                  <div className="mpm-cell">
                    <label>ĵ_y (d)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={d}
                      onChange={e => {
                        const val = Number(e.target.value);
                        if (Number.isFinite(val)) setD(val);
                      }}
                    />
                  </div>
                </div>
                <span className="mpm-bracket">]</span>
              </div>
            </div>

            <div className="mpm-math-stats">
              <div className="mpm-stat-row">
                <span className="mpm-stat-key">行列式 det(A)：</span>
                <strong className={`mpm-stat-val ${det < 0 ? 'mpm-val-invert' : det === 0 ? 'mpm-val-zero' : ''}`}>
                  {det}
                </strong>
                <span className="mpm-stat-desc">
                  {det > 0 ? '面积缩放保持逆时针' : det < 0 ? '镜像翻折（顺时针）' : '奇异降维（压缩为直线）'}
                </span>
              </div>

              <div className="mpm-stat-row">
                <span className="mpm-stat-key">矩阵迹 Tr(A)：</span>
                <span className="mpm-stat-val">{trace}</span>
              </div>

              <div className="mpm-stat-row">
                <span className="mpm-stat-key">特征值：</span>
                <span className="mpm-stat-val mpm-stat-eigen">{eigenText}</span>
              </div>
            </div>

            <div className="mpm-presets">
              <div className="mpm-presets-head">经典变换预设：</div>
              <div className="mpm-presets-grid">
                {PRESETS.map(p => (
                  <button
                    key={p.name}
                    type="button"
                    className="mpm-preset-btn"
                    onClick={() => applyPreset(p)}
                    title={p.desc}
                  >
                    <span>{p.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mpm-code-preview">
              <div className="mpm-code-head">
                <span>Manim CE 代码：</span>
                <button type="button" className="mpm-copy-btn" onClick={handleCopy}>
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copied ? '已复制' : '复制'}</span>
                </button>
              </div>
              <code className="mpm-code">{manimCode}</code>
            </div>
          </div>
        </div>

        <div className="mpm-footer">
          <button type="button" className="mpm-cancel-btn" onClick={onClose}>
            关闭
          </button>
          {onInsertMatrix && (
            <button
              type="button"
              className="mpm-insert-btn"
              onClick={() => {
                onInsertMatrix(matrixString);
                onClose();
              }}
            >
              <Sparkles size={14} />
              <span>插入 ApplyMatrix 变换动画</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
