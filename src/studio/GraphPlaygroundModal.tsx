import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { Project } from './core/types';
import {
  GRAPH_PRESETS,
  type GraphPresetId,
  type GraphVertex,
  type GraphEdge,
  stepForceDirected,
  findShortestPath,
  generateGraphPythonCode,
  createGraphActions,
} from './graph-network';
import './graph-playground.css';

interface GraphPlaygroundModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  onApply: (nextProject: Project, actionIds: string[]) => void;
}

export const GraphPlaygroundModal: React.FC<GraphPlaygroundModalProps> = ({
  isOpen,
  onClose,
  project,
  onApply,
}) => {
  const [selectedPresetId, setSelectedPresetId] = useState<GraphPresetId>('complete');
  const [vertices, setVertices] = useState<GraphVertex[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [isSimulatingPhysics, setIsSimulatingPhysics] = useState<boolean>(false);
  const [startNodeId, setStartNodeId] = useState<string>('');
  const [endNodeId, setEndNodeId] = useState<string>('');
  const [isCopied, setIsCopied] = useState<boolean>(false);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const draggingId = useRef<string | null>(null);

  const preset = useMemo(
    () => GRAPH_PRESETS.find((p) => p.id === selectedPresetId) || GRAPH_PRESETS[0],
    [selectedPresetId],
  );

  // Initialize graph from preset
  useEffect(() => {
    const initialVertices: GraphVertex[] = preset.vertices.map((v) => ({
      ...v,
      vx: 0,
      vy: 0,
      radius: 0.28,
    }));
    setVertices(initialVertices);
    setEdges(preset.edges);

    if (initialVertices.length >= 2) {
      setStartNodeId(initialVertices[0].id);
      setEndNodeId(initialVertices[initialVertices.length - 1].id);
    }
  }, [preset]);

  // Force-directed physics simulation loop
  useEffect(() => {
    if (!isOpen || !isSimulatingPhysics) return;

    let frameId: number;
    const loop = () => {
      setVertices((prev) => stepForceDirected(prev, edges, draggingId.current));
      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [isOpen, isSimulatingPhysics, edges]);

  // Shortest path calculation
  const { pathNodeIds, pathEdgeKeys } = useMemo(() => {
    if (!startNodeId || !endNodeId) {
      return { pathNodeIds: [], pathEdgeKeys: new Set<string>() };
    }
    return findShortestPath(vertices, edges, startNodeId, endNodeId);
  }, [vertices, edges, startNodeId, endNodeId]);

  // Coordinate mapping
  const svgWidth = 600;
  const svgHeight = 400;
  const bounds = { xMin: -3.8, xMax: 3.8, yMin: -2.8, yMax: 2.8 };

  const toSvgX = useCallback(
    (x: number) =>
      ((x - bounds.xMin) / (bounds.xMax - bounds.xMin)) * svgWidth,
    [bounds.xMin, bounds.xMax, svgWidth],
  );

  const toSvgY = useCallback(
    (y: number) =>
      svgHeight - ((y - bounds.yMin) / (bounds.yMax - bounds.yMin)) * svgHeight,
    [bounds.yMin, bounds.yMax, svgHeight],
  );

  const toMathCoords = useCallback(
    (clientX: number, clientY: number) => {
      if (!svgRef.current) return { x: 0, y: 0 };
      const rect = svgRef.current.getBoundingClientRect();
      const clickX = clientX - rect.left;
      const clickY = clientY - rect.top;

      const normX = clickX / svgWidth;
      const normY = (svgHeight - clickY) / svgHeight;

      return {
        x: bounds.xMin + normX * (bounds.xMax - bounds.xMin),
        y: bounds.yMin + normY * (bounds.yMax - bounds.yMin),
      };
    },
    [bounds, svgWidth, svgHeight],
  );

  const handlePointerDown = (id: string, e: React.PointerEvent) => {
    draggingId.current = id;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingId.current) return;
    const { x, y } = toMathCoords(e.clientX, e.clientY);
    setVertices((prev) =>
      prev.map((v) =>
        v.id === draggingId.current ? { ...v, x, y, vx: 0, vy: 0 } : v,
      ),
    );
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (draggingId.current) {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      draggingId.current = null;
    }
  };

  const handleCopyPython = async () => {
    const code = generateGraphPythonCode(preset);
    await navigator.clipboard.writeText(code);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleApplyToProject = () => {
    const result = createGraphActions(project, preset);
    onApply(result.project, result.actionIds);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="graph-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="graph-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="graph-header">
          <h2>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#58c4dd" strokeWidth="2">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            图论网络与拓扑交互台 (Graph Theory & Network Topology)
          </h2>
          <button className="graph-close-btn" onClick={onClose} title="关闭">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="graph-body">
          {/* Stage Panel */}
          <div className="graph-stage-panel">
            <div
              className="graph-canvas-container"
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              <svg ref={svgRef} viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="graph-svg">
                {/* Edges */}
                {edges.map((e, idx) => {
                  const v1 = vertices.find((v) => v.id === e.source);
                  const v2 = vertices.find((v) => v.id === e.target);
                  if (!v1 || !v2) return null;

                  const isPathEdge =
                    pathEdgeKeys.has(`${e.source}->${e.target}`) ||
                    pathEdgeKeys.has(`${e.target}->${e.source}`);

                  return (
                    <line
                      key={`edge_${idx}`}
                      x1={toSvgX(v1.x)}
                      y1={toSvgY(v1.y)}
                      x2={toSvgX(v2.x)}
                      y2={toSvgY(v2.y)}
                      stroke={isPathEdge ? '#e2b340' : '#334155'}
                      strokeWidth={isPathEdge ? 3.5 : 1.6}
                      strokeOpacity={isPathEdge ? 1.0 : 0.65}
                      strokeLinecap="round"
                    />
                  );
                })}

                {/* Vertices */}
                {vertices.map((v) => {
                  const isPathNode = pathNodeIds.includes(v.id);
                  const isStart = v.id === startNodeId;
                  const isEnd = v.id === endNodeId;

                  const fillColor = isStart
                    ? '#38bdf8'
                    : isEnd
                    ? '#fc6255'
                    : isPathNode
                    ? '#e2b340'
                    : v.color || '#58c4dd';

                  return (
                    <g
                      key={v.id}
                      onPointerDown={(e) => handlePointerDown(v.id, e)}
                      style={{ cursor: 'grab' }}
                    >
                      <circle
                        cx={toSvgX(v.x)}
                        cy={toSvgY(v.y)}
                        r={isPathNode ? 16 : 14}
                        fill={fillColor}
                        stroke="#0f172a"
                        strokeWidth="2.5"
                      />
                      <text
                        x={toSvgX(v.x)}
                        y={toSvgY(v.y) + 4}
                        fill="#0f172a"
                        fontSize="11"
                        fontWeight="bold"
                        textAnchor="middle"
                        pointerEvents="none"
                      >
                        {v.label}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {/* Dynamic HUD */}
              <div className="graph-hud">
                <div className="hud-title">图论拓扑统计</div>
                <div style={{ color: '#94a3b8' }}>
                  顶点数 |V|: <span style={{ color: '#f8fafc', fontWeight: 600 }}>{vertices.length}</span> · 边数 |E|:{' '}
                  <span style={{ color: '#f8fafc', fontWeight: 600 }}>{edges.length}</span>
                </div>
                {pathNodeIds.length > 0 && (
                  <div style={{ color: '#e2b340', marginTop: 3 }}>
                    ★ 最短路 ({pathNodeIds.length - 1} 步): {pathNodeIds.join(' → ')}
                  </div>
                )}
              </div>
            </div>

            {/* Formula Card */}
            <div className="formula-card">
              <div className="formula-desc">{preset.description}</div>
            </div>
          </div>

          {/* Control Sidebar */}
          <div className="graph-ctrl-panel">
            {/* Presets */}
            <div className="ctrl-section">
              <div className="ctrl-title">网络拓扑预设 (Graph Presets)</div>
              <div className="preset-chip-group">
                {GRAPH_PRESETS.map((p) => (
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

            {/* Path Finder */}
            <div className="ctrl-section">
              <div className="ctrl-title">最短路径寻路 (Shortest Path)</div>
              <div className="path-select-box">
                <div className="path-select-row">
                  <span>起点 (Start Node):</span>
                  <select
                    value={startNodeId}
                    onChange={(e) => setStartNodeId(e.target.value)}
                  >
                    {vertices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="path-select-row">
                  <span>终点 (End Node):</span>
                  <select
                    value={endNodeId}
                    onChange={(e) => setEndNodeId(e.target.value)}
                  >
                    {vertices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Physics simulation toggle */}
            <div className="ctrl-section">
              <button
                className={`ambient-rotate-btn ${isSimulatingPhysics ? 'active' : ''}`}
                onClick={() => setIsSimulatingPhysics((prev) => !prev)}
              >
                {isSimulatingPhysics ? '⏹ 暂停力导向物理弹簧' : '⚡ 开启力导向物理自适应布局'}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="graph-footer">
          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
            鼠标按住任意节点可直接拖拽调整网络拓扑结构
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
