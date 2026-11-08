import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { Project } from './core/types';
import {
  GEOMETRY_PRESETS,
  type GeometryPresetId,
  type Point2D,
  computeTriangleCenters,
  getAttachedSquare,
  generateGeometryPythonCode,
  createGeometryActions,
} from './geometry-euclidean';
import './geometry-playground.css';

interface GeometryPlaygroundModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  onApply: (nextProject: Project, actionIds: string[]) => void;
}

export const GeometryPlaygroundModal: React.FC<GeometryPlaygroundModalProps> = ({
  isOpen,
  onClose,
  project,
  onApply,
}) => {
  const [selectedPresetId, setSelectedPresetId] = useState<GeometryPresetId>('euler_line');
  const [A, setA] = useState<Point2D>([-2.4, -1.2]);
  const [B, setB] = useState<Point2D>([2.6, -1.2]);
  const [C, setC] = useState<Point2D>([0.6, 2.2]);
  const [draggingVertex, setDraggingVertex] = useState<'A' | 'B' | 'C' | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  const svgRef = useRef<SVGSVGElement | null>(null);

  const preset = useMemo(
    () => GEOMETRY_PRESETS.find((p) => p.id === selectedPresetId) || GEOMETRY_PRESETS[0],
    [selectedPresetId],
  );

  useEffect(() => {
    setA(preset.initialA);
    setB(preset.initialB);
    setC(preset.initialC);
  }, [preset]);

  const centers = useMemo(() => computeTriangleCenters(A, B, C), [A, B, C]);

  // Coordinate transformation: math (-4, -3) to (4, 3) -> svg (0, 0) to (640, 480)
  const svgWidth = 640;
  const svgHeight = 480;
  const xSpan = 8;
  const ySpan = 6;

  const toSvgX = useCallback(
    (x: number) => ((x + 4) / xSpan) * svgWidth,
    [svgWidth, xSpan],
  );
  const toSvgY = useCallback(
    (y: number) => ((3 - y) / ySpan) * svgHeight,
    [svgHeight, ySpan],
  );

  const fromSvgCoords = useCallback(
    (svgX: number, svgY: number): Point2D => {
      const x = (svgX / svgWidth) * xSpan - 4;
      const y = 3 - (svgY / svgHeight) * ySpan;
      return [Number(x.toFixed(2)), Number(y.toFixed(2))];
    },
    [svgWidth, svgHeight, xSpan, ySpan],
  );

  const handleMouseDownVertex = (vertex: 'A' | 'B' | 'C') => (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraggingVertex(vertex);
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!draggingVertex || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const svgX = e.clientX - rect.left;
      const svgY = e.clientY - rect.top;
      const [mathX, mathY] = fromSvgCoords(svgX, svgY);

      // Clamp to screen bounds
      const clampedX = Math.max(-3.8, Math.min(3.8, mathX));
      const clampedY = Math.max(-2.8, Math.min(2.8, mathY));

      if (draggingVertex === 'A') setA([clampedX, clampedY]);
      else if (draggingVertex === 'B') setB([clampedX, clampedY]);
      else if (draggingVertex === 'C') setC([clampedX, clampedY]);
    },
    [draggingVertex, fromSvgCoords],
  );

  const handleMouseUp = useCallback(() => {
    setDraggingVertex(null);
  }, []);

  const handleCopyPython = async () => {
    const code = generateGeometryPythonCode(preset, A, B, C);
    await navigator.clipboard.writeText(code);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleApplyToProject = () => {
    const result = createGeometryActions(project, preset, A, B, C);
    onApply(result.project, result.actionIds);
    onClose();
  };

  if (!isOpen) return null;

  // Attached squares for pythagoras
  const squareBC = preset.id === 'pythagoras' ? getAttachedSquare(B, C) : null;
  const squareCA = preset.id === 'pythagoras' ? getAttachedSquare(C, A) : null;
  const squareAB = preset.id === 'pythagoras' ? getAttachedSquare(A, B) : null;

  return (
    <div className="geo-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="geo-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="geo-modal-header">
          <h3>📐 经典欧几里得几何与三角形四心画板 (Euclidean Geometry)</h3>
          <button className="geo-close-btn" onClick={onClose} title="关闭">
            ✕
          </button>
        </div>

        <div className="geo-modal-body">
          {/* Preset list and properties sidebar */}
          <div className="geo-sidebar">
            <div className="geo-preset-list">
              {GEOMETRY_PRESETS.map((p) => (
                <button
                  key={p.id}
                  className={`geo-preset-btn ${p.id === selectedPresetId ? 'active' : ''}`}
                  onClick={() => setSelectedPresetId(p.id)}
                >
                  <span className="geo-preset-title">{p.name}</span>
                  <span className="geo-preset-desc">{p.description}</span>
                </button>
              ))}
            </div>

            {/* Live Geometric Stats HUD */}
            <div className="geo-stats-panel">
              <h4>几何参量实时度量</h4>
              <div className="geo-stat-row">
                <span>边长 a (|BC|):</span>
                <span className="geo-stat-value">{centers.sideA.toFixed(2)}</span>
              </div>
              <div className="geo-stat-row">
                <span>边长 b (|AC|):</span>
                <span className="geo-stat-value">{centers.sideB.toFixed(2)}</span>
              </div>
              <div className="geo-stat-row">
                <span>边长 c (|AB|):</span>
                <span className="geo-stat-value">{centers.sideC.toFixed(2)}</span>
              </div>
              <div className="geo-stat-row">
                <span>面积 S:</span>
                <span className="geo-stat-value">{centers.area.toFixed(2)}</span>
              </div>
              <div className="geo-stat-row">
                <span>周长 P:</span>
                <span className="geo-stat-value">{centers.perimeter.toFixed(2)}</span>
              </div>
              <div className="geo-stat-row">
                <span>内切圆半径 r:</span>
                <span className="geo-stat-value">{centers.inradius.toFixed(2)}</span>
              </div>
              <div className="geo-stat-row">
                <span>外接圆半径 R:</span>
                <span className="geo-stat-value">{centers.circumradius.toFixed(2)}</span>
              </div>
              {preset.id === 'euler_line' && (
                <div className="geo-stat-row">
                  <span>欧拉线比值 HG/GO:</span>
                  <span className="geo-stat-value geo-stat-euler-highlight">
                    {centers.eulerRatio.toFixed(3)} (= 2.000)
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* SVG Interactive Canvas */}
          <div className="geo-canvas-area">
            <div className="geo-hint-banner">
              💡 拖拽顶点 A、B、C 实时观察几何图形变化与四心共线定理恒成立
            </div>

            <div className="geo-svg-container">
              <svg
                ref={svgRef}
                className="geo-svg"
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                {/* Coordinate Grid */}
                <defs>
                  <pattern id="geo-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1f2937" strokeWidth="0.8" />
                  </pattern>
                </defs>
                <rect width={svgWidth} height={svgHeight} fill="url(#geo-grid)" />

                {/* Pythagorean attached squares */}
                {preset.id === 'pythagoras' && squareBC && squareCA && squareAB && (
                  <g opacity="0.6">
                    <polygon
                      points={squareBC.map((p) => `${toSvgX(p[0])},${toSvgY(p[1])}`).join(' ')}
                      fill="#3b82f6"
                      stroke="#60a5fa"
                      strokeWidth="1.5"
                    />
                    <polygon
                      points={squareCA.map((p) => `${toSvgX(p[0])},${toSvgY(p[1])}`).join(' ')}
                      fill="#10b981"
                      stroke="#34d399"
                      strokeWidth="1.5"
                    />
                    <polygon
                      points={squareAB.map((p) => `${toSvgX(p[0])},${toSvgY(p[1])}`).join(' ')}
                      fill="#f59e0b"
                      stroke="#fbbf24"
                      strokeWidth="1.5"
                    />
                  </g>
                )}

                {/* Circumcircle */}
                {(preset.id === 'circumcircle' || preset.id === 'euler_line') && (
                  <circle
                    cx={toSvgX(centers.circumcenter[0])}
                    cy={toSvgY(centers.circumcenter[1])}
                    r={(centers.circumradius / xSpan) * svgWidth}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="1.5"
                    strokeDasharray={preset.id === 'euler_line' ? '5 5' : undefined}
                    opacity={preset.id === 'euler_line' ? 0.35 : 0.8}
                  />
                )}

                {/* Incircle */}
                {preset.id === 'incircle' && (
                  <circle
                    cx={toSvgX(centers.incenter[0])}
                    cy={toSvgY(centers.incenter[1])}
                    r={(centers.inradius / xSpan) * svgWidth}
                    fill="#10b981"
                    fillOpacity="0.15"
                    stroke="#34d399"
                    strokeWidth="2"
                  />
                )}

                {/* Main Triangle */}
                <polygon
                  points={`${toSvgX(A[0])},${toSvgY(A[1])} ${toSvgX(B[0])},${toSvgY(B[1])} ${toSvgX(C[0])},${toSvgY(C[1])}`}
                  fill="#0284c7"
                  fillOpacity="0.15"
                  stroke="#38bdf8"
                  strokeWidth="2.5"
                />

                {/* Euler Line */}
                {preset.id === 'euler_line' && (
                  <g>
                    <line
                      x1={toSvgX(centers.orthocenter[0])}
                      y1={toSvgY(centers.orthocenter[1])}
                      x2={toSvgX(centers.circumcenter[0])}
                      y2={toSvgY(centers.circumcenter[1])}
                      stroke="#facc15"
                      strokeWidth="3"
                      strokeDasharray="6 4"
                    />
                    {/* Circumcenter O */}
                    <circle
                      cx={toSvgX(centers.circumcenter[0])}
                      cy={toSvgY(centers.circumcenter[1])}
                      r="6"
                      fill="#38bdf8"
                    />
                    <text
                      x={toSvgX(centers.circumcenter[0]) + 10}
                      y={toSvgY(centers.circumcenter[1]) + 4}
                      fill="#38bdf8"
                      fontSize="12"
                      fontWeight="600"
                    >
                      O (外心)
                    </text>

                    {/* Centroid G */}
                    <circle
                      cx={toSvgX(centers.centroid[0])}
                      cy={toSvgY(centers.centroid[1])}
                      r="6"
                      fill="#facc15"
                    />
                    <text
                      x={toSvgX(centers.centroid[0]) + 10}
                      y={toSvgY(centers.centroid[1]) + 4}
                      fill="#facc15"
                      fontSize="12"
                      fontWeight="600"
                    >
                      G (重心)
                    </text>

                    {/* Orthocenter H */}
                    <circle
                      cx={toSvgX(centers.orthocenter[0])}
                      cy={toSvgY(centers.orthocenter[1])}
                      r="6"
                      fill="#f87171"
                    />
                    <text
                      x={toSvgX(centers.orthocenter[0]) + 10}
                      y={toSvgY(centers.orthocenter[1]) + 4}
                      fill="#f87171"
                      fontSize="12"
                      fontWeight="600"
                    >
                      H (垂心)
                    </text>
                  </g>
                )}

                {/* Draggable Triangle Vertices A, B, C */}
                <g>
                  {/* Vertex A */}
                  <circle
                    cx={toSvgX(A[0])}
                    cy={toSvgY(A[1])}
                    r="8"
                    fill="#ffffff"
                    stroke="#3b82f6"
                    strokeWidth="3"
                    className="geo-vertex-handle"
                    onMouseDown={handleMouseDownVertex('A')}
                  />
                  <text
                    x={toSvgX(A[0]) - 16}
                    y={toSvgY(A[1]) - 10}
                    fill="#ffffff"
                    fontSize="14"
                    fontWeight="700"
                  >
                    A
                  </text>

                  {/* Vertex B */}
                  <circle
                    cx={toSvgX(B[0])}
                    cy={toSvgY(B[1])}
                    r="8"
                    fill="#ffffff"
                    stroke="#3b82f6"
                    strokeWidth="3"
                    className="geo-vertex-handle"
                    onMouseDown={handleMouseDownVertex('B')}
                  />
                  <text
                    x={toSvgX(B[0]) + 12}
                    y={toSvgY(B[1]) - 10}
                    fill="#ffffff"
                    fontSize="14"
                    fontWeight="700"
                  >
                    B
                  </text>

                  {/* Vertex C */}
                  <circle
                    cx={toSvgX(C[0])}
                    cy={toSvgY(C[1])}
                    r="8"
                    fill="#ffffff"
                    stroke="#3b82f6"
                    strokeWidth="3"
                    className="geo-vertex-handle"
                    onMouseDown={handleMouseDownVertex('C')}
                  />
                  <text
                    x={toSvgX(C[0]) + 12}
                    y={toSvgY(C[1]) - 10}
                    fill="#ffffff"
                    fontSize="14"
                    fontWeight="700"
                  >
                    C
                  </text>
                </g>
              </svg>
            </div>
          </div>
        </div>

        <div className="geo-modal-footer">
          <div className="geo-footer-left">
            <button className="geo-btn geo-btn-ghost" onClick={handleCopyPython}>
              {isCopied ? '✓ 已复制 Manim 代码' : '📋 复制 Manim Python 代码'}
            </button>
          </div>
          <div className="geo-footer-right">
            <button className="geo-btn geo-btn-ghost" onClick={onClose}>
              取消
            </button>
            <button className="geo-btn geo-btn-primary" onClick={handleApplyToProject}>
              ➕ 插入到当前场景
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
