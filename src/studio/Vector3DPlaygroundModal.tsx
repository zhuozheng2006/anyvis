import React, { useState, useMemo, useCallback } from 'react';
import type { Project } from './core/types';
import {
  type Vector3D,
  type Vector3DOperation,
  VECTOR3D_PRESETS,
  magnitude3D,
  add3D,
  dot3D,
  cross3D,
  angle3D,
  project3D,
  project3DTo2D,
  generateVector3DManimCode,
  createVector3DActions,
} from './vector3d';
import './vector3d-playground.css';

interface Vector3DPlaygroundModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  onApply: (nextProject: Project, actionIds: string[]) => void;
}

export const Vector3DPlaygroundModal: React.FC<Vector3DPlaygroundModalProps> = ({
  isOpen,
  onClose,
  project,
  onApply,
}) => {
  const [generationError, setGenerationError] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState<string>('ortho-basis');
  const [u, setU] = useState<Vector3D>({ x: 2, y: 0, z: 0 });
  const [v, setV] = useState<Vector3D>({ x: 0, y: 2, z: 0 });
  const [operation, setOperation] = useState<Vector3DOperation>('cross');
  const [azimuth, setAzimuth] = useState<number>(35);
  const [elevation, setElevation] = useState<number>(25);
  const [activeTab, setActiveTab] = useState<'visual' | 'code'>('visual');
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; az: number; el: number }>({
    x: 0,
    y: 0,
    az: 35,
    el: 25,
  });

  const selectPreset = useCallback((presetId: string) => {
    const p = VECTOR3D_PRESETS.find(item => item.id === presetId);
    if (!p) return;
    setSelectedPresetId(p.id);
    setU(p.u);
    setV(p.v);
    setOperation(p.operation);
  }, []);

  // Mathematical outputs
  const magU = useMemo(() => magnitude3D(u), [u]);
  const magV = useMemo(() => magnitude3D(v), [v]);
  const angleInfo = useMemo(() => angle3D(u, v), [u, v]);
  const sumVec = useMemo(() => add3D(u, v), [u, v]);
  const dotVal = useMemo(() => dot3D(u, v), [u, v]);
  const projVec = useMemo(() => project3D(u, v), [u, v]);
  const crossVec = useMemo(() => cross3D(u, v), [u, v]);
  const crossArea = useMemo(() => magnitude3D(crossVec), [crossVec]);

  // Manim Python Code
  const manimCode = useMemo(() => {
    return generateVector3DManimCode(u, v, operation, { azimuth, elevation });
  }, [u, v, operation, azimuth, elevation]);

  // 3D Canvas Geometry Projection
  const canvasWidth = 440;
  const canvasHeight = 360;
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;
  const scale = 40;

  const origin2D = useMemo(
    () => project3DTo2D({ x: 0, y: 0, z: 0 }, azimuth, elevation, scale, cx, cy),
    [azimuth, elevation, scale, cx, cy]
  );
  const u2D = useMemo(
    () => project3DTo2D(u, azimuth, elevation, scale, cx, cy),
    [u, azimuth, elevation, scale, cx, cy]
  );
  const v2D = useMemo(
    () => project3DTo2D(v, azimuth, elevation, scale, cx, cy),
    [v, azimuth, elevation, scale, cx, cy]
  );

  // Axes in 3D
  const xAxisEnd = useMemo(
    () => project3DTo2D({ x: 3.5, y: 0, z: 0 }, azimuth, elevation, scale, cx, cy),
    [azimuth, elevation, scale, cx, cy]
  );
  const yAxisEnd = useMemo(
    () => project3DTo2D({ x: 0, y: 3.5, z: 0 }, azimuth, elevation, scale, cx, cy),
    [azimuth, elevation, scale, cx, cy]
  );
  const zAxisEnd = useMemo(
    () => project3DTo2D({ x: 0, y: 0, z: 3.5 }, azimuth, elevation, scale, cx, cy),
    [azimuth, elevation, scale, cx, cy]
  );

  // Operation-specific 2D projections
  const sum2D = useMemo(
    () => project3DTo2D(sumVec, azimuth, elevation, scale, cx, cy),
    [sumVec, azimuth, elevation, scale, cx, cy]
  );
  const proj2D = useMemo(
    () => project3DTo2D(projVec, azimuth, elevation, scale, cx, cy),
    [projVec, azimuth, elevation, scale, cx, cy]
  );
  const cross2D = useMemo(
    () => project3DTo2D(crossVec, azimuth, elevation, scale, cx, cy),
    [crossVec, azimuth, elevation, scale, cx, cy]
  );

  // Mouse orbit controls
  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    setIsDragging(true);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      az: azimuth,
      el: elevation,
    });
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    setAzimuth((dragStart.az + dx * 0.75 + 360) % 360);
    setElevation(Math.max(-85, Math.min(85, dragStart.el - dy * 0.75)));
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    setIsDragging(false);
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
  };

  const handleApply = () => {
    setGenerationError('');
    try {
    const { project: nextProject, actionCount } = createVector3DActions(project, u, v, operation, { azimuth, elevation });
    const addedIds = nextProject.actions.slice(-actionCount).map(a => a.id);
    onApply(nextProject, addedIds);
    onClose();
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(manimCode);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Ignore
    }
  };

  if (!isOpen) return null;

  return (
    <div className="vector3d-modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="vector3d-modal-window" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="vector3d-header">
          <div className="vector3d-title-group">
            <span className="vector3d-badge">3B1B 空间线性代数</span>
            <h2>三维向量运算与叉乘工作台</h2>
          </div>
          <div className="vector3d-header-tabs">
            <button
              className={`tab-btn ${activeTab === 'visual' ? 'active' : ''}`}
              onClick={() => setActiveTab('visual')}
            >
              空间三维视网膜
            </button>
            <button
              className={`tab-btn ${activeTab === 'code' ? 'active' : ''}`}
              onClick={() => setActiveTab('code')}
            >
              Manim CE 源码
            </button>
            <button className="vector3d-close-btn" onClick={onClose} aria-label="关闭">
              ✕
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="vector3d-content">
          {activeTab === 'visual' ? (
            <div className="vector3d-visual-layout">
              {/* Left Interactive 3D Orbit Canvas */}
              <div className="vector3d-canvas-column">
                <div className="canvas-header-info">
                  <span className="orbit-hint">按住鼠标左键在画板上拖拽可任意 360° 旋转视角</span>
                  <div className="orbit-sliders">
                    <label>
                      水平方位角: {Math.round(azimuth)}°
                      <input
                        type="range"
                        min="0"
                        max="360"
                        value={azimuth}
                        onChange={e => setAzimuth(Number(e.target.value))}
                      />
                    </label>
                    <label>
                      仰角: {Math.round(elevation)}°
                      <input
                        type="range"
                        min="-85"
                        max="85"
                        value={elevation}
                        onChange={e => setElevation(Number(e.target.value))}
                      />
                    </label>
                  </div>
                </div>

                <div className="vector3d-canvas-wrapper">
                  <svg
                    className="vector3d-svg"
                    viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                  >
                    <defs>
                      <marker
                        id="arrowhead-u"
                        markerWidth="7"
                        markerHeight="5"
                        refX="6"
                        refY="2.5"
                        orient="auto"
                      >
                        <polygon points="0 0, 7 2.5, 0 5" fill="#38bdf8" />
                      </marker>
                      <marker
                        id="arrowhead-v"
                        markerWidth="7"
                        markerHeight="5"
                        refX="6"
                        refY="2.5"
                        orient="auto"
                      >
                        <polygon points="0 0, 7 2.5, 0 5" fill="#f43f5e" />
                      </marker>
                      <marker
                        id="arrowhead-sum"
                        markerWidth="7"
                        markerHeight="5"
                        refX="6"
                        refY="2.5"
                        orient="auto"
                      >
                        <polygon points="0 0, 7 2.5, 0 5" fill="#facc15" />
                      </marker>
                      <marker
                        id="arrowhead-cross"
                        markerWidth="7"
                        markerHeight="5"
                        refX="6"
                        refY="2.5"
                        orient="auto"
                      >
                        <polygon points="0 0, 7 2.5, 0 5" fill="#c084fc" />
                      </marker>
                      <marker
                        id="arrowhead-proj"
                        markerWidth="7"
                        markerHeight="5"
                        refX="6"
                        refY="2.5"
                        orient="auto"
                      >
                        <polygon points="0 0, 7 2.5, 0 5" fill="#4ade80" />
                      </marker>
                    </defs>

                    {/* Ground grid (XY plane faint lines) */}
                    <g className="ground-grid">
                      {[-2, -1, 0, 1, 2].map(gx => {
                        const pStart = project3DTo2D({ x: gx, y: -2.5, z: 0 }, azimuth, elevation, scale, cx, cy);
                        const pEnd = project3DTo2D({ x: gx, y: 2.5, z: 0 }, azimuth, elevation, scale, cx, cy);
                        return <line key={`gx-${gx}`} x1={pStart.x} y1={pStart.y} x2={pEnd.x} y2={pEnd.y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />;
                      })}
                      {[-2, -1, 0, 1, 2].map(gy => {
                        const pStart = project3DTo2D({ x: -2.5, y: gy, z: 0 }, azimuth, elevation, scale, cx, cy);
                        const pEnd = project3DTo2D({ x: 2.5, y: gy, z: 0 }, azimuth, elevation, scale, cx, cy);
                        return <line key={`gy-${gy}`} x1={pStart.x} y1={pStart.y} x2={pEnd.x} y2={pEnd.y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />;
                      })}
                    </g>

                    {/* 3D Axes */}
                    <line x1={origin2D.x} y1={origin2D.y} x2={xAxisEnd.x} y2={xAxisEnd.y} stroke="#ef4444" strokeWidth="1.5" strokeDasharray="3 2" />
                    <text x={xAxisEnd.x + 6} y={xAxisEnd.y} fill="#ef4444" fontSize="11" fontFamily="monospace">X</text>

                    <line x1={origin2D.x} y1={origin2D.y} x2={yAxisEnd.x} y2={yAxisEnd.y} stroke="#10b981" strokeWidth="1.5" strokeDasharray="3 2" />
                    <text x={yAxisEnd.x + 6} y={yAxisEnd.y} fill="#10b981" fontSize="11" fontFamily="monospace">Y</text>

                    <line x1={origin2D.x} y1={origin2D.y} x2={zAxisEnd.x} y2={zAxisEnd.y} stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="3 2" />
                    <text x={zAxisEnd.x + 6} y={zAxisEnd.y} fill="#3b82f6" fontSize="11" fontFamily="monospace">Z</text>

                    {/* Spanned parallelogram for cross product */}
                    {operation === 'cross' && (
                      <polygon
                        points={`${origin2D.x},${origin2D.y} ${u2D.x},${u2D.y} ${sum2D.x},${sum2D.y} ${v2D.x},${v2D.y}`}
                        fill="rgba(192, 132, 252, 0.22)"
                        stroke="#c084fc"
                        strokeWidth="1.2"
                        strokeDasharray="4 2"
                      />
                    )}

                    {/* Helper dashed lines for vector addition */}
                    {operation === 'add' && (
                      <>
                        <line x1={u2D.x} y1={u2D.y} x2={sum2D.x} y2={sum2D.y} stroke="rgba(255,255,255,0.4)" strokeWidth="1" strokeDasharray="3 3" />
                        <line x1={v2D.x} y1={v2D.y} x2={sum2D.x} y2={sum2D.y} stroke="rgba(255,255,255,0.4)" strokeWidth="1" strokeDasharray="3 3" />
                      </>
                    )}

                    {/* Helper dashed lines for dot projection */}
                    {operation === 'dot' && (
                      <line x1={u2D.x} y1={u2D.y} x2={proj2D.x} y2={proj2D.y} stroke="rgba(74, 222, 128, 0.7)" strokeWidth="1.2" strokeDasharray="3 3" />
                    )}

                    {/* Vector u */}
                    <line x1={origin2D.x} y1={origin2D.y} x2={u2D.x} y2={u2D.y} stroke="#38bdf8" strokeWidth="2.8" markerEnd="url(#arrowhead-u)" />
                    <text x={u2D.x + 8} y={u2D.y - 4} fill="#38bdf8" fontSize="12" fontWeight="bold">u ({u.x}, {u.y}, {u.z})</text>

                    {/* Vector v */}
                    <line x1={origin2D.x} y1={origin2D.y} x2={v2D.x} y2={v2D.y} stroke="#f43f5e" strokeWidth="2.8" markerEnd="url(#arrowhead-v)" />
                    <text x={v2D.x + 8} y={v2D.y - 4} fill="#f43f5e" fontSize="12" fontWeight="bold">v ({v.x}, {v.y}, {v.z})</text>

                    {/* Result vector */}
                    {operation === 'add' && (
                      <>
                        <line x1={origin2D.x} y1={origin2D.y} x2={sum2D.x} y2={sum2D.y} stroke="#facc15" strokeWidth="3" markerEnd="url(#arrowhead-sum)" />
                        <text x={sum2D.x + 8} y={sum2D.y - 4} fill="#facc15" fontSize="12" fontWeight="bold">u + v</text>
                      </>
                    )}

                    {operation === 'dot' && (
                      <>
                        <line x1={origin2D.x} y1={origin2D.y} x2={proj2D.x} y2={proj2D.y} stroke="#4ade80" strokeWidth="3" markerEnd="url(#arrowhead-proj)" />
                        <text x={proj2D.x + 8} y={proj2D.y + 12} fill="#4ade80" fontSize="12" fontWeight="bold">proj_v(u)</text>
                      </>
                    )}

                    {operation === 'cross' && (
                      <>
                        <line x1={origin2D.x} y1={origin2D.y} x2={cross2D.x} y2={cross2D.y} stroke="#c084fc" strokeWidth="3.2" markerEnd="url(#arrowhead-cross)" />
                        <text x={cross2D.x + 8} y={cross2D.y - 4} fill="#c084fc" fontSize="12" fontWeight="bold">w = u × v</text>
                      </>
                    )}

                    {/* Origin point */}
                    <circle cx={origin2D.x} cy={origin2D.y} r="3" fill="#ffffff" />
                  </svg>

                  {/* Math HUD Overlay */}
                  <div className="canvas-hud">
                    <div className="hud-metric">
                      <span className="hud-label">夹角 θ:</span>
                      <span className="hud-val">{angleInfo.degrees.toFixed(1)}° ({angleInfo.radians.toFixed(2)} rad)</span>
                    </div>
                    {operation === 'cross' && (
                      <div className="hud-metric">
                        <span className="hud-label">叉乘向量 |w| = 张成面积:</span>
                        <span className="hud-val highlight-purple">{crossArea.toFixed(2)}</span>
                      </div>
                    )}
                    {operation === 'dot' && (
                      <div className="hud-metric">
                        <span className="hud-label">内积 u · v:</span>
                        <span className="hud-val highlight-green">{dotVal.toFixed(2)}</span>
                      </div>
                    )}
                    {operation === 'add' && (
                      <div className="hud-metric">
                        <span className="hud-label">合向量模长 |u + v|:</span>
                        <span className="hud-val highlight-yellow">{magnitude3D(sumVec).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Operation & Parameter Controls */}
              <div className="vector3d-controls-column">
                <div className="control-section">
                  <span className="section-title">经典几何与物理预设</span>
                  <div className="presets-pill-list">
                    {VECTOR3D_PRESETS.map(p => (
                      <button
                        key={p.id}
                        className={`preset-pill ${selectedPresetId === p.id ? 'active' : ''}`}
                        onClick={() => selectPreset(p.id)}
                      >
                        <strong>{p.name}</strong>
                        <small>{p.description}</small>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="control-section">
                  <span className="section-title">运算类型</span>
                  <div className="operation-toggle-group">
                    <button
                      className={`op-btn ${operation === 'cross' ? 'active' : ''}`}
                      onClick={() => setOperation('cross')}
                    >
                      叉乘 u × v (张成平行四边形)
                    </button>
                    <button
                      className={`op-btn ${operation === 'dot' ? 'active' : ''}`}
                      onClick={() => setOperation('dot')}
                    >
                      点乘 u · v (投影分量)
                    </button>
                    <button
                      className={`op-btn ${operation === 'add' ? 'active' : ''}`}
                      onClick={() => setOperation('add')}
                    >
                      相加 u + v (空间平行四边形)
                    </button>
                  </div>
                </div>

                {/* Vectors Parameter Sliders */}
                <div className="control-section">
                  <span className="section-title">向量 u (天蓝色) 坐标</span>
                  <div className="coord-grid">
                    <label>
                      X: {u.x.toFixed(1)}
                      <input
                        type="range"
                        min="-3"
                        max="3"
                        step="0.1"
                        value={u.x}
                        onChange={e => setU({ ...u, x: Number(e.target.value) })}
                      />
                    </label>
                    <label>
                      Y: {u.y.toFixed(1)}
                      <input
                        type="range"
                        min="-3"
                        max="3"
                        step="0.1"
                        value={u.y}
                        onChange={e => setU({ ...u, y: Number(e.target.value) })}
                      />
                    </label>
                    <label>
                      Z: {u.z.toFixed(1)}
                      <input
                        type="range"
                        min="-3"
                        max="3"
                        step="0.1"
                        value={u.z}
                        onChange={e => setU({ ...u, z: Number(e.target.value) })}
                      />
                    </label>
                  </div>
                  <small className="coord-mag">模长 |u| = {magU.toFixed(2)}</small>
                </div>

                <div className="control-section">
                  <span className="section-title">向量 v (玫瑰红) 坐标</span>
                  <div className="coord-grid">
                    <label>
                      X: {v.x.toFixed(1)}
                      <input
                        type="range"
                        min="-3"
                        max="3"
                        step="0.1"
                        value={v.x}
                        onChange={e => setV({ ...v, x: Number(e.target.value) })}
                      />
                    </label>
                    <label>
                      Y: {v.y.toFixed(1)}
                      <input
                        type="range"
                        min="-3"
                        max="3"
                        step="0.1"
                        value={v.y}
                        onChange={e => setV({ ...v, y: Number(e.target.value) })}
                      />
                    </label>
                    <label>
                      Z: {v.z.toFixed(1)}
                      <input
                        type="range"
                        min="-3"
                        max="3"
                        step="0.1"
                        value={v.z}
                        onChange={e => setV({ ...v, z: Number(e.target.value) })}
                      />
                    </label>
                  </div>
                  <small className="coord-mag">模长 |v| = {magV.toFixed(2)}</small>
                </div>
              </div>
            </div>
          ) : (
            <div className="vector3d-code-layout">
              <div className="code-header">
                <span>Manim CE ThreeDScene 独立运行代码</span>
                <button className="copy-code-btn" onClick={handleCopyCode}>
                  {isCopied ? '已复制！' : '复制代码'}
                </button>
              </div>
              <pre className="code-block">
                <code>{manimCode}</code>
              </pre>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="vector3d-footer">
          {generationError && <div role="alert" style={{ color: '#ef4444' }}>{generationError}</div>}
          <span className="footer-summary">
            三维模式 · 包含 ThreeDAxes、Arrow3D 及数学公式注释
          </span>
          <div className="footer-buttons">
            <button className="cancel-button" onClick={onClose}>
              取消
            </button>
            <button className="apply-button" onClick={handleApply}>
              插入到当前动画项目
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
