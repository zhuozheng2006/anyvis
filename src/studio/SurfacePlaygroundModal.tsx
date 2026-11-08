import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { Project } from './core/types';
import {
  SURFACE_PRESETS,
  type SurfacePresetId,
  type CameraOrientation,
  generateProjectedMesh,
  generateSurfacePythonCode,
  createSurfaceActions,
  project3DToScreen,
} from './surface3d';
import './surface-playground.css';

interface SurfacePlaygroundModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  onApply: (nextProject: Project, actionIds: string[]) => void;
}

export const SurfacePlaygroundModal: React.FC<SurfacePlaygroundModalProps> = ({
  isOpen,
  onClose,
  project,
  onApply,
}) => {
  const [selectedPresetId, setSelectedPresetId] = useState<SurfacePresetId>('saddle');
  const [camera, setCamera] = useState<CameraOrientation>({
    phi: 70,
    theta: -35,
    distance: 4.8,
    scale: 1.0,
  });
  const [ambientRotating, setAmbientRotating] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);

  const isDragging = useRef<boolean>(false);
  const lastPointer = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const preset = useMemo(
    () => SURFACE_PRESETS.find((p) => p.id === selectedPresetId) || SURFACE_PRESETS[0],
    [selectedPresetId],
  );

  // Ambient 3D camera rotation
  useEffect(() => {
    if (!isOpen || !ambientRotating) return;

    let frameId: number;
    const rotate = () => {
      setCamera((prev) => ({
        ...prev,
        theta: (prev.theta + 0.4) > 180 ? -180 : prev.theta + 0.4,
      }));
      frameId = requestAnimationFrame(rotate);
    };

    frameId = requestAnimationFrame(rotate);
    return () => cancelAnimationFrame(frameId);
  }, [isOpen, ambientRotating]);

  // Mesh generation
  const viewportWidth = 600;
  const viewportHeight = 400;

  const faces = useMemo(
    () => generateProjectedMesh(preset, camera, viewportWidth, viewportHeight),
    [preset, camera, viewportWidth, viewportHeight],
  );

  // 3D Axes projections
  const originProj = useMemo(
    () => project3DToScreen([0, 0, 0], camera, viewportWidth, viewportHeight).screenPoint,
    [camera, viewportWidth, viewportHeight],
  );
  const xAxisProj = useMemo(
    () => project3DToScreen([2.5, 0, 0], camera, viewportWidth, viewportHeight).screenPoint,
    [camera, viewportWidth, viewportHeight],
  );
  const yAxisProj = useMemo(
    () => project3DToScreen([0, 2.5, 0], camera, viewportWidth, viewportHeight).screenPoint,
    [camera, viewportWidth, viewportHeight],
  );
  const zAxisProj = useMemo(
    () => project3DToScreen([0, 0, 2.0], camera, viewportWidth, viewportHeight).screenPoint,
    [camera, viewportWidth, viewportHeight],
  );

  // Pointer drag to orbit camera
  const handlePointerDown = (e: React.PointerEvent) => {
    isDragging.current = true;
    lastPointer.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastPointer.current.x;
    const dy = e.clientY - lastPointer.current.y;
    lastPointer.current = { x: e.clientX, y: e.clientY };

    setCamera((prev) => {
      let nextTheta = prev.theta + dx * 0.6;
      if (nextTheta > 180) nextTheta -= 360;
      if (nextTheta < -180) nextTheta += 360;

      const nextPhi = Math.max(10, Math.min(85, prev.phi + dy * 0.4));
      return {
        ...prev,
        theta: nextTheta,
        phi: nextPhi,
      };
    });
  };

  const handlePointerUp = () => {
    isDragging.current = false;
  };

  const handleCopyPython = async () => {
    const code = generateSurfacePythonCode(preset, camera, ambientRotating);
    await navigator.clipboard.writeText(code);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleApplyToProject = () => {
    const result = createSurfaceActions(project, preset);
    onApply(result.project, result.actionIds);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="surface-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="surface-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="surface-header">
          <h2>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
            3B1B 三维参数曲面与视角工作台 (3D Parametric Surfaces & Camera Orbit)
          </h2>
          <button className="surface-close-btn" onClick={onClose} title="关闭">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="surface-body">
          {/* Stage Panel */}
          <div className="surface-stage-panel">
            <div
              className="surface-canvas-container"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              <svg viewBox={`0 0 ${viewportWidth} ${viewportHeight}`} className="surface-svg">
                {/* 3D Coordinate Axes */}
                <g opacity={0.65}>
                  {/* X axis (Red) */}
                  <line
                    x1={originProj[0]}
                    y1={originProj[1]}
                    x2={xAxisProj[0]}
                    y2={xAxisProj[1]}
                    stroke="#ef4444"
                    strokeWidth="1.8"
                  />
                  <text x={xAxisProj[0] + 4} y={xAxisProj[1]} fill="#ef4444" fontSize="11" fontFamily="sans-serif">
                    +X
                  </text>

                  {/* Y axis (Green) */}
                  <line
                    x1={originProj[0]}
                    y1={originProj[1]}
                    x2={yAxisProj[0]}
                    y2={yAxisProj[1]}
                    stroke="#22c55e"
                    strokeWidth="1.8"
                  />
                  <text x={yAxisProj[0] + 4} y={yAxisProj[1]} fill="#22c55e" fontSize="11" fontFamily="sans-serif">
                    +Y
                  </text>

                  {/* Z axis (Gold) */}
                  <line
                    x1={originProj[0]}
                    y1={originProj[1]}
                    x2={zAxisProj[0]}
                    y2={zAxisProj[1]}
                    stroke="#e2b340"
                    strokeWidth="1.8"
                  />
                  <text x={zAxisProj[0]} y={zAxisProj[1] - 6} fill="#e2b340" fontSize="11" fontFamily="sans-serif">
                    +Z
                  </text>
                </g>

                {/* 3D Surface Mesh Faces */}
                {faces.map((f) => {
                  const pointsStr = f.screenPoints.map((p) => `${p[0]},${p[1]}`).join(' ');
                  return (
                    <polygon
                      key={f.id}
                      points={pointsStr}
                      fill={f.fillColor}
                      fillOpacity={0.78}
                      stroke={f.strokeColor}
                      strokeWidth={0.6}
                      strokeOpacity={0.8}
                      strokeLinejoin="round"
                    />
                  );
                })}
              </svg>

              {/* Dynamic Camera HUD */}
              <div className="surface-camera-hud">
                <div className="hud-title">三维视角参数 (Camera HUD)</div>
                <div className="hud-row">
                  俯仰角 (Pitch φ): <span className="hud-val">{camera.phi.toFixed(1)}°</span>
                </div>
                <div className="hud-row">
                  偏航角 (Yaw θ): <span className="hud-val">{camera.theta.toFixed(1)}°</span>
                </div>
                <div className="hud-row">
                  视距 (Distance): <span className="hud-val">{camera.distance.toFixed(1)}</span>
                </div>
              </div>
            </div>

            {/* Formula Card */}
            <div className="formula-card">
              <div className="formula-desc">{preset.description}</div>
              <div className="formula-latex">{preset.formulaLatex}</div>
            </div>
          </div>

          {/* Control Sidebar */}
          <div className="surface-ctrl-panel">
            {/* Presets */}
            <div className="ctrl-section">
              <div className="ctrl-title">三维曲面几何预设 (Surface Presets)</div>
              <div className="preset-chip-group">
                {SURFACE_PRESETS.map((p) => (
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

            {/* Camera Controls */}
            <div className="ctrl-section">
              <div className="ctrl-title">相机姿态调节 (Camera Pose)</div>
              <div className="slider-row">
                <span>俯仰角 (Pitch φ):</span>
                <input
                  type="range"
                  min="15"
                  max="85"
                  step="1"
                  value={camera.phi}
                  onChange={(e) =>
                    setCamera((prev) => ({ ...prev, phi: parseFloat(e.target.value) }))
                  }
                />
                <span>{camera.phi.toFixed(0)}°</span>
              </div>
              <div className="slider-row">
                <span>方位角 (Yaw θ):</span>
                <input
                  type="range"
                  min="-180"
                  max="180"
                  step="2"
                  value={camera.theta}
                  onChange={(e) =>
                    setCamera((prev) => ({ ...prev, theta: parseFloat(e.target.value) }))
                  }
                />
                <span>{camera.theta.toFixed(0)}°</span>
              </div>
              <div className="slider-row">
                <span>视距 (Distance):</span>
                <input
                  type="range"
                  min="3.0"
                  max="8.0"
                  step="0.2"
                  value={camera.distance}
                  onChange={(e) =>
                    setCamera((prev) => ({ ...prev, distance: parseFloat(e.target.value) }))
                  }
                />
                <span>{camera.distance.toFixed(1)}</span>
              </div>
            </div>

            {/* Ambient Rotation Toggle */}
            <div className="ctrl-section">
              <button
                className={`ambient-rotate-btn ${ambientRotating ? 'active' : ''}`}
                onClick={() => setAmbientRotating((prev) => !prev)}
              >
                {ambientRotating ? '⏹ 停止环境环绕旋转' : '🔄 开启 3B1B 环境环绕旋转'}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="surface-footer">
          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
            鼠标按住画布左右/上下拖拽可任意旋转三维观察视角
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-secondary" onClick={handleCopyPython}>
              {isCopied ? '✓ 已复制 Python 代码' : '复制代码 (Manim CE)'}
            </button>
            <button className="btn-primary" onClick={handleApplyToProject}>
              切换为 3D 场景并插入
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
