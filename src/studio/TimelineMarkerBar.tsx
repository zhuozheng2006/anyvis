import React, { useState } from 'react';
import { Bookmark, Edit2, Sparkles, Trash2 } from 'lucide-react';
import type { Project, TimelineMarker } from './core/types';
import { timecode } from './Timeline';
import './timeline-marker-bar.css';

export function addMarker(project: Project, time: number, label?: string): { project: Project; marker: TimelineMarker } {
  const rawFps = Number(project.scene.fps);
  const fps = Number.isFinite(rawFps) && rawFps >= 1 ? rawFps : 30;
  const safeTime = Number.isFinite(time) ? Math.max(0, time) : 0;
  const snappedTime = Number((Math.round(safeTime * fps) / fps).toFixed(4));
  const existing = project.scene.markers || [];
  const nextNum = existing.length + 1;
  const marker: TimelineMarker = {
    id: `m_${crypto.randomUUID().slice(0, 8)}`,
    time: snappedTime,
    label: label || `标记 ${nextNum}`,
    color: '#fbbf24',
  };
  const updatedMarkers = [...existing, marker].sort((a, b) => a.time - b.time);
  return {
    project: {
      ...project,
      scene: {
        ...project.scene,
        markers: updatedMarkers,
      },
    },
    marker,
  };
}

export function updateMarker(project: Project, markerId: string, updates: Partial<TimelineMarker>): Project {
  const rawFps = Number(project.scene.fps);
  const fps = Number.isFinite(rawFps) && rawFps >= 1 ? rawFps : 30;
  const existing = project.scene.markers || [];
  const updatedMarkers = existing.map(m => {
    if (m.id !== markerId) return m;
    const nextTime = updates.time !== undefined && Number.isFinite(updates.time)
      ? Number((Math.round(Math.max(0, updates.time) * fps) / fps).toFixed(4))
      : m.time;
    return {
      ...m,
      ...updates,
      time: nextTime,
    };
  }).sort((a, b) => a.time - b.time);
  return {
    ...project,
    scene: {
      ...project.scene,
      markers: updatedMarkers,
    },
  };
}

export function removeMarker(project: Project, markerId: string): Project {
  const existing = project.scene.markers || [];
  return {
    ...project,
    scene: {
      ...project.scene,
      markers: existing.filter(m => m.id !== markerId),
    },
  };
}

export function clearMarkers(project: Project): Project {
  return {
    ...project,
    scene: {
      ...project.scene,
      markers: [],
    },
  };
}

export function findNearestMarker(markers: TimelineMarker[] = [], time: number, threshold = 0.1): TimelineMarker | null {
  let nearest: TimelineMarker | null = null;
  let minDiff = Infinity;
  for (const m of markers) {
    const diff = Math.abs(m.time - time);
    if (diff <= threshold && diff < minDiff) {
      minDiff = diff;
      nearest = m;
    }
  }
  return nearest;
}

export function snapTimeToMarkers(markers: TimelineMarker[] = [], targetTime: number, threshold = 0.08): number {
  const nearest = findNearestMarker(markers, targetTime, threshold);
  return nearest ? nearest.time : targetTime;
}

export interface TimelineMarkerBarProps {
  markers?: TimelineMarker[];
  currentTime: number;
  fps: number;
  onSeek(time: number): void;
  onAddMarker(): void;
  onOpenSmartMarker?(): void;
  onClearAllMarkers?(): void;
  onUpdateMarker(markerId: string, updates: Partial<TimelineMarker>): void;
  onRemoveMarker(markerId: string): void;
}

export const TimelineMarkerBar: React.FC<TimelineMarkerBarProps> = ({
  markers = [],
  currentTime,
  fps,
  onSeek,
  onAddMarker,
  onOpenSmartMarker,
  onClearAllMarkers,
  onUpdateMarker,
  onRemoveMarker,
}) => {
  const safeFps = Number.isFinite(fps) && fps >= 1 ? fps : 30;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');

  const handleStartEdit = (e: React.MouseEvent, marker: TimelineMarker) => {
    e.stopPropagation();
    setEditingId(marker.id);
    setEditLabel(marker.label);
  };

  const handleSaveEdit = (markerId: string) => {
    if (editingId !== markerId) return;
    const trimmed = editLabel.trim();
    if (trimmed) {
      onUpdateMarker(markerId, { label: trimmed });
    }
    setEditingId(null);
  };

  if (markers.length === 0) {
    return null;
  }

  return (
    <div className="tmb-bar" role="toolbar" aria-label="时间轴标记栏">
      <div className="tmb-heading" title="在关键时刻添加标记，按 M 键快速打点">
        <Bookmark size={12} className="tmb-head-icon" />
        <span>标记 ({markers.length})</span>
      </div>
      <div className="tmb-list">
        {markers.map(m => {
          const isNearPlayhead = Math.abs(m.time - currentTime) < 1 / safeFps + 1e-4;
          const isEditing = editingId === m.id;

          return (
            <div
              key={m.id}
              className={`tmb-pill ${isNearPlayhead ? 'tmb-pill-active' : ''}`}
              style={{ '--marker-color': m.color || '#fbbf24' } as React.CSSProperties}
              onClick={() => onSeek(m.time)}
              title={`点击跳转至 ${timecode(m.time, safeFps)} · 双击重命名`}
            >
              <span className="tmb-diamond" />
              <span className="tmb-timecode">{timecode(m.time, safeFps).slice(3)}</span>
              {isEditing ? (
                <input
                  type="text"
                  className="tmb-input"
                  value={editLabel}
                  autoFocus
                  onClick={e => e.stopPropagation()}
                  onChange={e => setEditLabel(e.target.value)}
                  onBlur={() => handleSaveEdit(m.id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.stopPropagation();
                      handleSaveEdit(m.id);
                    } else if (e.key === 'Escape') {
                      e.stopPropagation();
                      setEditingId(null);
                    }
                  }}
                />
              ) : (
                <span
                  className="tmb-label"
                  onDoubleClick={e => handleStartEdit(e, m)}
                >
                  {m.label}
                </span>
              )}
              <div className="tmb-actions">
                <button
                  type="button"
                  className="tmb-action-btn"
                  onClick={e => handleStartEdit(e, m)}
                  title="重命名标记"
                  aria-label={`编辑标记 ${m.label}`}
                >
                  <Edit2 size={10} />
                </button>
                <button
                  type="button"
                  className="tmb-action-btn tmb-action-del"
                  onClick={e => {
                    e.stopPropagation();
                    onRemoveMarker(m.id);
                  }}
                  title="删除标记"
                  aria-label={`删除标记 ${m.label}`}
                >
                  <Trash2 size={10} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="tmb-toolbar-actions">
        <button
          type="button"
          className="tmb-add-btn"
          onClick={onAddMarker}
          title="在当前播放头位置打点（快捷键 M）"
          aria-label="在播放头位置添加标记"
        >
          + 打点
        </button>
        {onOpenSmartMarker && (
          <button
            type="button"
            className="tmb-smart-btn"
            onClick={onOpenSmartMarker}
            title="按设定间隔、BPM 或动作边界生成标记，不分析音频"
            aria-label="打开智能打点助手"
          >
            <Sparkles size={11} /> 智能打点
          </button>
        )}
        {onClearAllMarkers && (
          <button
            type="button"
            className="tmb-clear-btn"
            onClick={onClearAllMarkers}
            title="清空全部标记"
            aria-label="清空全部时间轴标记"
          >
            清空
          </button>
        )}
      </div>
    </div>
  );
};
