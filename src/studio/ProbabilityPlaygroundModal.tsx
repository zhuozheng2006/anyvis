import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { Project } from './core/types';
import {
  DISTRIBUTION_PRESETS,
  type DistributionKind,
  sampleDistribution,
  normalCdf,
  normalPdf,
  generateProbabilityPythonCode,
  createProbabilityActions,
} from './probability';
import './probability-playground.css';

interface ProbabilityPlaygroundModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  onApply: (nextProject: Project, actionIds: string[]) => void;
}

export const ProbabilityPlaygroundModal: React.FC<ProbabilityPlaygroundModalProps> = ({
  isOpen,
  onClose,
  project,
  onApply,
}) => {
  const [selectedPresetId, setSelectedPresetId] = useState<DistributionKind>('normal');
  const [params, setParams] = useState<Record<string, number>>({ mu: 0, sigma: 1.0 });
  const [intervalA, setIntervalA] = useState<number>(-1.0);
  const [intervalB, setIntervalB] = useState<number>(1.0);
  const [isCopied, setIsCopied] = useState<boolean>(false);

  const preset = useMemo(
    () => DISTRIBUTION_PRESETS.find((p) => p.id === selectedPresetId) || DISTRIBUTION_PRESETS[0],
    [selectedPresetId],
  );

  useEffect(() => {
    setParams(preset.defaultParams);
    if (preset.id === 'normal') {
      setIntervalA(-1.0);
      setIntervalB(1.0);
    } else if (preset.id === 'binomial') {
      setIntervalA(6);
      setIntervalB(14);
    } else {
      setIntervalA(1);
      setIntervalB(5);
    }
  }, [preset]);

  const { points, mean, variance, maxY } = useMemo(
    () => sampleDistribution(preset, params),
    [preset, params],
  );

  const sigma = Math.sqrt(variance);

  // Interval probability calculation
  const intervalProb = useMemo(() => {
    if (preset.id === 'normal') {
      const mu = params.mu ?? 0;
      const s = params.sigma ?? 1.0;
      const prob = normalCdf(intervalB, mu, s) - normalCdf(intervalA, mu, s);
      return Math.max(0, Math.min(1, prob));
    }
    return 0.68;
  }, [preset, params, intervalA, intervalB]);

  // Coordinate mapping
  const svgWidth = 600;
  const svgHeight = 400;
  const padding = 30;

  const xMin = preset.xRange[0];
  const xMax = preset.xRange[1];
  const safeMaxY = maxY * 1.25;

  const toSvgX = useCallback(
    (x: number) =>
      padding + ((x - xMin) / (xMax - xMin)) * (svgWidth - 2 * padding),
    [xMin, xMax, svgWidth, padding],
  );

  const toSvgY = useCallback(
    (y: number) =>
      svgHeight - padding - (y / safeMaxY) * (svgHeight - 2 * padding),
    [safeMaxY, svgHeight, padding],
  );

  const handleCopyPython = async () => {
    const code = generateProbabilityPythonCode(preset, params);
    await navigator.clipboard.writeText(code);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleApplyToProject = () => {
    const result = createProbabilityActions(project, preset, params);
    onApply(result.project, result.actionIds);
    onClose();
  };

  if (!isOpen) return null;

  // Build shaded polygon points for normal curve
  const shadedPointsStr = useMemo(() => {
    if (preset.id !== 'normal') return '';
    const mu = params.mu ?? 0;
    const s = params.sigma ?? 1.0;

    const subStep = (intervalB - intervalA) / 40;
    const pts: string[] = [`${toSvgX(intervalA)},${toSvgY(0)}`];

    for (let x = intervalA; x <= intervalB + 1e-5; x += subStep) {
      pts.push(`${toSvgX(x)},${toSvgY(normalPdf(x, mu, s))}`);
    }
    pts.push(`${toSvgX(intervalB)},${toSvgY(0)}`);
    return pts.join(' ');
  }, [preset, params, intervalA, intervalB, toSvgX, toSvgY]);

  // Continuous curve points
  const curvePointsStr = points.map((p) => `${toSvgX(p.x)},${toSvgY(p.y)}`).join(' ');

  return (
    <div className="prob-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="prob-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="prob-header">
          <h2>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e2b340" strokeWidth="2">
              <path d="M3 3v18h18" />
              <path d="M18 17V9" />
              <path d="M13 17V5" />
              <path d="M8 17v-3" />
            </svg>
            概率分布与中心极限定理交互台 (Probability & CLT Playground)
          </h2>
          <button className="prob-close-btn" onClick={onClose} title="关闭">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="prob-body">
          {/* Stage Panel */}
          <div className="prob-stage-panel">
            <div className="prob-canvas-container">
              <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="prob-svg">
                {/* Axes */}
                <line
                  x1={toSvgX(xMin)}
                  y1={toSvgY(0)}
                  x2={toSvgX(xMax)}
                  y2={toSvgY(0)}
                  stroke="#334155"
                  strokeWidth="1.5"
                />
                <line
                  x1={toSvgX(0)}
                  y1={toSvgY(0)}
                  x2={toSvgX(0)}
                  y2={toSvgY(safeMaxY)}
                  stroke="#334155"
                  strokeWidth="1.5"
                />

                {/* Shaded Interval Area (Normal) */}
                {shadedPointsStr && (
                  <polygon
                    points={shadedPointsStr}
                    fill="#e2b340"
                    fillOpacity={0.35}
                    stroke="#e2b340"
                    strokeWidth="1"
                    strokeDasharray="3 2"
                  />
                )}

                {/* Bars for discrete distribution */}
                {points.some((p) => p.isBar) &&
                  points.map((p, idx) => {
                    const barW = Math.max(4, (svgWidth / (xMax - xMin)) * 0.65);
                    const bx = toSvgX(p.x) - barW / 2;
                    const by = toSvgY(p.y);
                    const bh = toSvgY(0) - by;
                    return (
                      <rect
                        key={idx}
                        x={bx}
                        y={by}
                        width={barW}
                        height={bh}
                        fill="#58c4dd"
                        fillOpacity={0.7}
                        stroke="#38bdf8"
                        strokeWidth="1"
                        rx="2"
                      />
                    );
                  })}

                {/* Continuous Curve */}
                {!points.some((p) => p.isBar) && (
                  <polyline
                    points={curvePointsStr}
                    fill="none"
                    stroke="#58c4dd"
                    strokeWidth="2.8"
                    strokeLinecap="round"
                  />
                )}

                {/* CLT Normal Approximation Overlay in Binomial Mode */}
                {preset.id === 'binomial' && (
                  <polyline
                    points={Array.from({ length: 60 }, (_, i) => {
                      const x = xMin + (i / 59) * (xMax - xMin);
                      const y = normalPdf(x, mean, sigma);
                      return `${toSvgX(x)},${toSvgY(y)}`;
                    }).join(' ')}
                    fill="none"
                    stroke="#e2b340"
                    strokeWidth="2.2"
                    strokeDasharray="4 3"
                  />
                )}

                {/* Interval Handles Lines */}
                {preset.id === 'normal' && (
                  <g>
                    <line
                      x1={toSvgX(intervalA)}
                      y1={toSvgY(0)}
                      x2={toSvgX(intervalA)}
                      y2={toSvgY(normalPdf(intervalA, params.mu ?? 0, params.sigma ?? 1))}
                      stroke="#e2b340"
                      strokeWidth="2"
                    />
                    <line
                      x1={toSvgX(intervalB)}
                      y1={toSvgY(0)}
                      x2={toSvgX(intervalB)}
                      y2={toSvgY(normalPdf(intervalB, params.mu ?? 0, params.sigma ?? 1))}
                      stroke="#e2b340"
                      strokeWidth="2"
                    />
                  </g>
                )}
              </svg>

              {/* Dynamic HUD */}
              <div className="prob-hud">
                <div className="hud-title">统计量与概率密度 (Statistics HUD)</div>
                <div className="hud-row">
                  数学期望 E[X]: <span className="hud-val">{mean.toFixed(2)}</span>
                </div>
                <div className="hud-row">
                  方差 Var(X): <span className="hud-val">{variance.toFixed(2)}</span>
                </div>
                <div className="hud-row">
                  标准差 σ: <span className="hud-val">{sigma.toFixed(2)}</span>
                </div>
                {preset.id === 'normal' && (
                  <div className="hud-row" style={{ color: '#e2b340', fontWeight: 600 }}>
                    区间概率 P({intervalA.toFixed(1)} ≤ X ≤ {intervalB.toFixed(1)}):{' '}
                    <span className="hud-val">{(intervalProb * 100).toFixed(1)}%</span>
                  </div>
                )}
                {preset.id === 'binomial' && (
                  <div style={{ color: '#83c167', fontSize: '0.72rem', marginTop: 2 }}>
                    ✓ 棣莫弗-拉普拉斯中心极限定理: 黄色虚线为正态近似曲线
                  </div>
                )}
              </div>
            </div>

            {/* Formula Card */}
            <div className="formula-card">
              <div className="formula-desc">{preset.description}</div>
              <div className="formula-latex">{preset.formulaLatex}</div>
            </div>
          </div>

          {/* Control Sidebar */}
          <div className="prob-ctrl-panel">
            {/* Presets */}
            <div className="ctrl-section">
              <div className="ctrl-title">概率分布族 (Distributions)</div>
              <div className="preset-chip-group">
                {DISTRIBUTION_PRESETS.map((p) => (
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

            {/* Parameter Sliders */}
            <div className="ctrl-section">
              <div className="ctrl-title">分布参数调节 (Parameters)</div>

              {preset.id === 'normal' && (
                <>
                  <div className="slider-row">
                    <span>均值 μ:</span>
                    <input
                      type="range"
                      min="-2.0"
                      max="2.0"
                      step="0.1"
                      value={params.mu ?? 0}
                      onChange={(e) =>
                        setParams((prev) => ({ ...prev, mu: parseFloat(e.target.value) }))
                      }
                    />
                    <span>{(params.mu ?? 0).toFixed(1)}</span>
                  </div>
                  <div className="slider-row">
                    <span>标准差 σ:</span>
                    <input
                      type="range"
                      min="0.4"
                      max="2.5"
                      step="0.1"
                      value={params.sigma ?? 1.0}
                      onChange={(e) =>
                        setParams((prev) => ({ ...prev, sigma: parseFloat(e.target.value) }))
                      }
                    />
                    <span>{(params.sigma ?? 1.0).toFixed(1)}</span>
                  </div>

                  {/* Interval range */}
                  <div className="slider-row">
                    <span>区间下限 a:</span>
                    <input
                      type="range"
                      min="-3.5"
                      max="1.0"
                      step="0.1"
                      value={intervalA}
                      onChange={(e) => setIntervalA(parseFloat(e.target.value))}
                    />
                    <span>{intervalA.toFixed(1)}</span>
                  </div>
                  <div className="slider-row">
                    <span>区间上限 b:</span>
                    <input
                      type="range"
                      min="-1.0"
                      max="3.5"
                      step="0.1"
                      value={intervalB}
                      onChange={(e) => setIntervalB(parseFloat(e.target.value))}
                    />
                    <span>{intervalB.toFixed(1)}</span>
                  </div>
                </>
              )}

              {preset.id === 'binomial' && (
                <>
                  <div className="slider-row">
                    <span>试验次数 n (CLT):</span>
                    <input
                      type="range"
                      min="5"
                      max="50"
                      step="1"
                      value={params.n ?? 20}
                      onChange={(e) =>
                        setParams((prev) => ({ ...prev, n: parseInt(e.target.value, 10) }))
                      }
                    />
                    <span>{params.n ?? 20}</span>
                  </div>
                  <div className="slider-row">
                    <span>成功概率 p:</span>
                    <input
                      type="range"
                      min="0.1"
                      max="0.9"
                      step="0.05"
                      value={params.p ?? 0.5}
                      onChange={(e) =>
                        setParams((prev) => ({ ...prev, p: parseFloat(e.target.value) }))
                      }
                    />
                    <span>{(params.p ?? 0.5).toFixed(2)}</span>
                  </div>
                </>
              )}

              {preset.id === 'poisson' && (
                <div className="slider-row">
                  <span>发生率 λ:</span>
                  <input
                    type="range"
                    min="0.5"
                    max="10.0"
                    step="0.5"
                    value={params.lambda ?? 4.0}
                    onChange={(e) =>
                      setParams((prev) => ({ ...prev, lambda: parseFloat(e.target.value) }))
                    }
                  />
                  <span>{(params.lambda ?? 4.0).toFixed(1)}</span>
                </div>
              )}

              {preset.id === 'exponential' && (
                <div className="slider-row">
                  <span>率参数 λ:</span>
                  <input
                    type="range"
                    min="0.2"
                    max="3.0"
                    step="0.1"
                    value={params.lambda ?? 1.2}
                    onChange={(e) =>
                      setParams((prev) => ({ ...prev, lambda: parseFloat(e.target.value) }))
                    }
                  />
                  <span>{(params.lambda ?? 1.2).toFixed(1)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="prob-footer">
          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
            支持连续/离散分布切换、68-95-99.7% 经验法则与 CLT 正态拟合展示
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
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
