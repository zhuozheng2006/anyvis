import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { Project } from './core/types';
import {
  type LayoutMode,
  type LayoutConfig,
  getMovableObjects,
  computeLayoutPositions,
  generateAutoLayoutPythonCode,
  applyLayoutToProject,
} from './auto-layout';
import { copyTextToClipboard } from './browser-utils';
import { useTransientFlag, useDialogEscape } from './modal-hooks';
import './auto-layout.css';

interface AutoLayoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  onApply: (nextProject: Project, actionIds: string[]) => void;
}

export const AutoLayoutModal: React.FC<AutoLayoutModalProps> = ({
  isOpen,
  onClose,
  project,
  onApply,
}) => {
  const movableObjects = useMemo(() => getMovableObjects(project), [project]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() =>
    new Set(movableObjects.map((o) => o.actionId)),
  );
  const knownIdsRef = useRef<Set<string>>(new Set(movableObjects.map((o) => o.actionId)));

  useEffect(() => {
    const currentIds = new Set(movableObjects.map((o) => o.actionId));
    const prevKnown = knownIdsRef.current;
    // Prune deleted objects and auto-select objects added while the modal was closed.
    setSelectedIds((prev) => {
      const next = new Set<string>();
      for (const id of currentIds) {
        if (prev.has(id) || !prevKnown.has(id)) next.add(id);
      }
      return next.size === prev.size && [...next].every((id) => prev.has(id)) ? prev : next;
    });
    knownIdsRef.current = currentIds;
  }, [movableObjects]);

  const [mode, setMode] = useState<LayoutMode>('horizontal');
  const [gap, setGap] = useState<number>(1.2);
  const [cols, setCols] = useState<number>(2);
  const [rowGap, setRowGap] = useState<number>(1.0);
  const [colGap, setColGap] = useState<number>(1.2);
  const [radius, setRadius] = useState<number>(2.0);
  const [startAngleDeg, setStartAngleDeg] = useState<number>(90);
  const [anchorType, setAnchorType] = useState<'centroid' | 'origin'>('centroid');
  const [isCopied, triggerCopied] = useTransientFlag(2000, isOpen);
  useDialogEscape(isOpen, onClose);

  const updateNumberParam = (setter: (value: number) => void, parsed: number) => {
    if (Number.isFinite(parsed)) setter(parsed);
  };

  const selectedObjects = useMemo(
    () => movableObjects.filter((o) => selectedIds.has(o.actionId)),
    [movableObjects, selectedIds],
  );

  const config: LayoutConfig = useMemo(() => {
    return {
      mode,
      gap,
      cols,
      rowGap,
      colGap,
      radius,
      startAngleDeg,
      anchorCenter: anchorType === 'origin' ? [0, 0] : undefined,
    };
  }, [mode, gap, cols, rowGap, colGap, radius, startAngleDeg, anchorType]);

  const newPositions = useMemo(
    () => computeLayoutPositions(selectedObjects, config),
    [selectedObjects, config],
  );

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(movableObjects.map((o) => o.actionId)));
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleCopyPython = async () => {
    try {
      const code = generateAutoLayoutPythonCode(selectedObjects, config);
      if (await copyTextToClipboard(code)) {
        triggerCopied();
      }
    } catch {
      // Ignore transient clipboard/generation failures without crashing the modal.
    }
  };

  const handleApply = () => {
    if (newPositions.size === 0) return;
    const nextProject = applyLayoutToProject(project, newPositions);
    onApply(nextProject, Array.from(newPositions.keys()));
    onClose();
  };

  // SVG coordinate transformation
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

  if (!isOpen) return null;

  return (
    <div className="layout-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="智能对齐与多物体自动布局">
      <div className="layout-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="layout-modal-header">
          <h3>📐 智能对齐与多物体自动布局 (Smart Align & Auto-Layout)</h3>
          <button className="layout-close-btn" onClick={onClose} title="关闭">
            ✕
          </button>
        </div>

        <div className="layout-modal-body">
          {/* Sidebar configuration */}
          <div className="layout-sidebar">
            {/* Object Selection */}
            <div className="layout-section">
              <div className="layout-section-title">
                <span>选择待排列物体 ({selectedObjects.length}/{movableObjects.length})</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    className="layout-btn-ghost"
                    style={{ padding: '2px 6px', fontSize: '0.7rem' }}
                    onClick={handleSelectAll}
                  >
                    全选
                  </button>
                  <button
                    className="layout-btn-ghost"
                    style={{ padding: '2px 6px', fontSize: '0.7rem' }}
                    onClick={handleDeselectAll}
                  >
                    清空
                  </button>
                </div>
              </div>

              {movableObjects.length === 0 ? (
                <div style={{ fontSize: '0.75rem', color: '#64748b', padding: '8px' }}>
                  当前场景暂无可排列的几何物体
                </div>
              ) : (
                <div className="layout-obj-list">
                  {movableObjects.map((obj) => (
                    <label key={obj.actionId} className="layout-obj-item">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(obj.actionId)}
                        onChange={() => handleToggleSelect(obj.actionId)}
                      />
                      <span className="layout-obj-name">{obj.name}</span>
                      <span className="layout-obj-coord">
                        ({obj.x.toFixed(1)}, {obj.y.toFixed(1)})
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Layout Mode */}
            <div className="layout-section">
              <div className="layout-section-title">排列分布模式</div>
              <div className="layout-mode-grid">
                <button
                  className={`layout-mode-btn ${mode === 'horizontal' ? 'active' : ''}`}
                  onClick={() => setMode('horizontal')}
                >
                  ↔ 水平整齐排列
                </button>
                <button
                  className={`layout-mode-btn ${mode === 'vertical' ? 'active' : ''}`}
                  onClick={() => setMode('vertical')}
                >
                  ↕ 垂直对齐排列
                </button>
                <button
                  className={`layout-mode-btn ${mode === 'grid' ? 'active' : ''}`}
                  onClick={() => setMode('grid')}
                >
                  ▦ 网格矩阵布局
                </button>
                <button
                  className={`layout-mode-btn ${mode === 'radial' ? 'active' : ''}`}
                  onClick={() => setMode('radial')}
                >
                  ◎ 环形放射分布
                </button>
                <button
                  className={`layout-mode-btn ${mode === 'distribute_h' ? 'active' : ''}`}
                  onClick={() => setMode('distribute_h')}
                >
                  ⇥ 水平等距均分
                </button>
                <button
                  className={`layout-mode-btn ${mode === 'distribute_v' ? 'active' : ''}`}
                  onClick={() => setMode('distribute_v')}
                >
                  ⇤ 垂直等距均分
                </button>
              </div>
            </div>

            {/* Layout Parameters */}
            <div className="layout-section">
              <div className="layout-section-title">参数调整</div>

              {(mode === 'horizontal' || mode === 'vertical') && (
                <div className="layout-param-row">
                  <span>物体间距 (Buff):</span>
                  <input
                    type="range"
                    min="0.2"
                    max="3.0"
                    step="0.1"
                    value={gap}
                    onChange={(e) => updateNumberParam(setGap, parseFloat(e.target.value))}
                  />
                  <span className="layout-param-val">{gap.toFixed(1)}</span>
                </div>
              )}

              {mode === 'grid' && (
                <>
                  <div className="layout-param-row">
                    <span>矩阵列数 (Cols):</span>
                    <input
                      type="range"
                      min="1"
                      max="6"
                      step="1"
                      value={cols}
                      onChange={(e) => updateNumberParam(setCols, parseInt(e.target.value, 10))}
                    />
                    <span className="layout-param-val">{cols}</span>
                  </div>
                  <div className="layout-param-row">
                    <span>列间距 (Col Gap):</span>
                    <input
                      type="range"
                      min="0.2"
                      max="3.0"
                      step="0.1"
                      value={colGap}
                      onChange={(e) => updateNumberParam(setColGap, parseFloat(e.target.value))}
                    />
                    <span className="layout-param-val">{colGap.toFixed(1)}</span>
                  </div>
                  <div className="layout-param-row">
                    <span>行间距 (Row Gap):</span>
                    <input
                      type="range"
                      min="0.2"
                      max="3.0"
                      step="0.1"
                      value={rowGap}
                      onChange={(e) => updateNumberParam(setRowGap, parseFloat(e.target.value))}
                    />
                    <span className="layout-param-val">{rowGap.toFixed(1)}</span>
                  </div>
                </>
              )}

              {mode === 'radial' && (
                <>
                  <div className="layout-param-row">
                    <span>圆环半径 (Radius):</span>
                    <input
                      type="range"
                      min="0.5"
                      max="4.0"
                      step="0.1"
                      value={radius}
                      onChange={(e) => updateNumberParam(setRadius, parseFloat(e.target.value))}
                    />
                    <span className="layout-param-val">{radius.toFixed(1)}</span>
                  </div>
                  <div className="layout-param-row">
                    <span>起始角度 (Deg):</span>
                    <input
                      type="range"
                      min="0"
                      max="360"
                      step="15"
                      value={startAngleDeg}
                      onChange={(e) => updateNumberParam(setStartAngleDeg, parseInt(e.target.value, 10))}
                    />
                    <span className="layout-param-val">{startAngleDeg}°</span>
                  </div>
                </>
              )}

              {/* Anchor Choice */}
              <div className="layout-param-row" style={{ marginTop: '6px' }}>
                <span>锚点基准:</span>
                <select
                  value={anchorType}
                  onChange={(e) => setAnchorType(e.target.value as 'centroid' | 'origin')}
                  style={{
                    background: '#1a202c',
                    color: '#e2e8f0',
                    border: '1px solid #2d3748',
                    borderRadius: '4px',
                    padding: '4px 8px',
                    fontSize: '0.8rem',
                  }}
                >
                  <option value="centroid">所选物体质心中心</option>
                  <option value="origin">坐标系原点 (0, 0)</option>
                </select>
              </div>
            </div>
          </div>

          {/* SVG Preview Canvas */}
          <div className="layout-preview-area">
            <div className="layout-hint-banner">
              💡 预览灰色虚线为原始位置，彩色圆圈为重排后的目标位置
            </div>

            <div className="layout-svg-container">
              <svg className="layout-svg" viewBox={`0 0 ${svgWidth} ${svgHeight}`}>
                {/* Background Grid */}
                <defs>
                  <pattern id="layout-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e2433" strokeWidth="0.8" />
                  </pattern>
                </defs>
                <rect width={svgWidth} height={svgHeight} fill="url(#layout-grid)" />

                {/* Coordinate Axes */}
                <line
                  x1={0}
                  y1={toSvgY(0)}
                  x2={svgWidth}
                  y2={toSvgY(0)}
                  stroke="#334155"
                  strokeWidth="1.5"
                />
                <line
                  x1={toSvgX(0)}
                  y1={0}
                  x2={toSvgX(0)}
                  y2={svgHeight}
                  stroke="#334155"
                  strokeWidth="1.5"
                />

                {/* Selected Objects rendering */}
                {selectedObjects.map((obj) => {
                  const targetPos = newPositions.get(obj.actionId);
                  const origSvgX = toSvgX(obj.x);
                  const origSvgY = toSvgY(obj.y);
                  const targetSvgX = targetPos ? toSvgX(targetPos[0]) : origSvgX;
                  const targetSvgY = targetPos ? toSvgY(targetPos[1]) : origSvgY;

                  return (
                    <g key={obj.actionId}>
                      {/* Connecting Line */}
                      {targetPos && (
                        <line
                          x1={origSvgX}
                          y1={origSvgY}
                          x2={targetSvgX}
                          y2={targetSvgY}
                          stroke="#64748b"
                          strokeWidth="1.5"
                          strokeDasharray="4 4"
                          opacity="0.7"
                        />
                      )}

                      {/* Original Ghost Position */}
                      <circle
                        cx={origSvgX}
                        cy={origSvgY}
                        r="12"
                        fill="none"
                        stroke="#64748b"
                        strokeWidth="1.5"
                        strokeDasharray="3 3"
                        opacity="0.5"
                      />

                      {/* New Position */}
                      <circle
                        cx={targetSvgX}
                        cy={targetSvgY}
                        r="14"
                        fill="#0284c7"
                        stroke="#38bdf8"
                        strokeWidth="2"
                        opacity="0.9"
                      />
                      <text
                        x={targetSvgX}
                        y={targetSvgY + 4}
                        fill="#ffffff"
                        fontSize="10"
                        fontWeight="600"
                        textAnchor="middle"
                      >
                        {obj.name.slice(0, 3)}
                      </text>
                      <text
                        x={targetSvgX}
                        y={targetSvgY - 18}
                        fill="#94a3b8"
                        fontSize="11"
                        textAnchor="middle"
                      >
                        {obj.name}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        </div>

        <div className="layout-modal-footer">
          <div className="layout-footer-left">
            <button className="layout-btn layout-btn-ghost" onClick={handleCopyPython}>
              {isCopied ? '✓ 已复制 Manim 布局代码' : '📋 复制 Manim 布局代码'}
            </button>
          </div>
          <div className="layout-footer-right">
            <button className="layout-btn layout-btn-ghost" onClick={onClose}>
              取消
            </button>
            <button
              className="layout-btn layout-btn-primary"
              disabled={selectedObjects.length === 0}
              onClick={handleApply}
            >
              ✨ 应用自动对齐布局 ({selectedObjects.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
