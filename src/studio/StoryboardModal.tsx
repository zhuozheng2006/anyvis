import React, { useState, useEffect, useMemo } from 'react';
import type { Project } from './core/types';
import {
  buildStoryboard,
  exportYouTubeChapters,
  generateManimSectionPythonCode,
  updateProjectChapters,
  formatTimestamp,
  estimateProjectDuration,
  type StoryboardChapter,
} from './storyboard';
import './storyboard.css';

interface StoryboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  onApply: (nextProject: Project) => void;
}

export const StoryboardModal: React.FC<StoryboardModalProps> = ({
  isOpen,
  onClose,
  project,
  onApply,
}) => {
  const [chapters, setChapters] = useState<StoryboardChapter[]>([]);
  const [newChapterTime, setNewChapterTime] = useState<number>(5.0);
  const [newChapterName, setNewChapterName] = useState<string>('新分段');
  const [copiedYt, setCopiedYt] = useState<boolean>(false);
  const [copiedPy, setCopiedPy] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setChapters(buildStoryboard(project));
      const total = estimateProjectDuration(project);
      setNewChapterTime(Math.min(10, Math.floor(total / 2)));
    }
  }, [isOpen, project]);

  const totalDuration = useMemo(() => estimateProjectDuration(project), [project]);

  const handleUpdateTitle = (id: string, name: string) => {
    setChapters((prev) =>
      prev.map((c) => (c.id === id ? { ...c, name } : c)),
    );
  };

  const handleToggleSkip = (id: string) => {
    setChapters((prev) =>
      prev.map((c) => (c.id === id ? { ...c, skipAnimations: !c.skipAnimations } : c)),
    );
  };

  const handleDeleteChapter = (id: string) => {
    // Cannot delete the very first section
    const target = chapters.find((c) => c.id === id);
    if (!target || target.startTime === 0) return;

    // Remove this chapter by merging into previous or filtering out its marker
    const remainingMarkers = (project.scene.markers || []).filter(
      (m) => m.id !== target.markerId && Math.abs(m.time - target.startTime) > 0.01,
    );
    const updatedProject = {
      ...project,
      scene: {
        ...project.scene,
        markers: remainingMarkers,
      },
    };
    setChapters(buildStoryboard(updatedProject));
  };

  const handleAddChapter = () => {
    if (newChapterTime <= 0 || newChapterTime >= totalDuration) return;
    const newMarker = {
      id: `m_${Date.now()}`,
      time: newChapterTime,
      label: newChapterName.trim() || `分段 ${chapters.length + 1}`,
      color: '#38bdf8',
    };
    const updatedMarkers = [...(project.scene.markers || []), newMarker].sort(
      (a, b) => a.time - b.time,
    );
    const updatedProject = {
      ...project,
      scene: {
        ...project.scene,
        markers: updatedMarkers,
      },
    };
    setChapters(buildStoryboard(updatedProject));
    setNewChapterName(`分段 ${chapters.length + 2}`);
  };

  const handleCopyYouTube = async () => {
    const text = exportYouTubeChapters(chapters);
    await navigator.clipboard.writeText(text);
    setCopiedYt(true);
    setTimeout(() => setCopiedYt(false), 2000);
  };

  const handleCopyPython = async () => {
    const code = generateManimSectionPythonCode(chapters, project);
    await navigator.clipboard.writeText(code);
    setCopiedPy(true);
    setTimeout(() => setCopiedPy(false), 2000);
  };

  const handleSaveAndSync = () => {
    const nextProject = updateProjectChapters(project, chapters);
    onApply(nextProject);
    onClose();
  };

  if (!isOpen) return null;

  const ytText = exportYouTubeChapters(chapters);
  const pyCode = generateManimSectionPythonCode(chapters, project);

  return (
    <div className="storyboard-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="storyboard-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="storyboard-header">
          <h2>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            分镜剧本与多章节大纲 (Storyboard & Chapter Management)
          </h2>
          <button className="storyboard-close-btn" onClick={onClose} title="关闭">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="storyboard-body">
          {/* Stats Bar */}
          <div className="storyboard-stats-bar">
            <div className="storyboard-stat-item">
              <span className="storyboard-stat-label">章节分段数</span>
              <span className="storyboard-stat-value">{chapters.length} 段</span>
            </div>
            <div className="storyboard-stat-item">
              <span className="storyboard-stat-label">全片总时长</span>
              <span className="storyboard-stat-value">{formatTimestamp(totalDuration)} ({totalDuration}s)</span>
            </div>
            <div className="storyboard-stat-item">
              <span className="storyboard-stat-label">总动作数</span>
              <span className="storyboard-stat-value">{project.actions.length} 个</span>
            </div>
          </div>

          {/* Chapter Cards Grid */}
          <div className="chapter-cards-grid">
            {chapters.map((c) => (
              <div key={c.id} className="chapter-card">
                <div className="chapter-card-left">
                  <div className="chapter-badge">#{c.index}</div>
                  <input
                    type="text"
                    className="chapter-title-input"
                    value={c.name}
                    onChange={(e) => handleUpdateTitle(c.id, e.target.value)}
                    placeholder="章节标题..."
                  />
                  <div className="chapter-time-pill">
                    {formatTimestamp(c.startTime)} - {formatTimestamp(c.endTime)} ({c.duration}s)
                  </div>
                </div>

                <div className="chapter-card-right">
                  <span className="chapter-action-count">{c.actionCount} 动作</span>
                  <label className="chapter-skip-label">
                    <input
                      type="checkbox"
                      checked={c.skipAnimations}
                      onChange={() => handleToggleSkip(c.id)}
                      style={{ accentColor: '#38bdf8' }}
                    />
                    跳过渲染
                  </label>
                  {c.startTime > 0 && (
                    <button
                      className="chapter-delete-btn"
                      onClick={() => handleDeleteChapter(c.id)}
                      title="删除此分段标记"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Add Chapter Row */}
          <div className="storyboard-add-row">
            <input
              type="text"
              style={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: 6,
                padding: '6px 10px',
                color: '#fff',
                fontSize: '0.8rem',
                flex: 1,
              }}
              value={newChapterName}
              onChange={(e) => setNewChapterName(e.target.value)}
              placeholder="新章节名称..."
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: '#94a3b8' }}>
              <span>时间(s):</span>
              <input
                type="number"
                step="0.5"
                min="0.5"
                max={totalDuration - 0.5}
                style={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: 6,
                  padding: '6px 8px',
                  color: '#fff',
                  width: 70,
                  fontSize: '0.8rem',
                }}
                value={newChapterTime}
                onChange={(e) => setNewChapterTime(parseFloat(e.target.value) || 0)}
              />
            </div>
            <button
              className="btn-secondary"
              onClick={handleAddChapter}
              style={{ padding: '6px 14px', whiteSpace: 'nowrap' }}
            >
              + 插入分段
            </button>
          </div>

          {/* Export Cues Section */}
          <div className="storyboard-export-tabs">
            <div className="export-tab-header">
              <span className="export-tab-title">YouTube / Bilibili 视频章节时间戳</span>
              <button className="export-copy-btn" onClick={handleCopyYouTube}>
                {copiedYt ? '✓ 已复制' : '复制时间戳'}
              </button>
            </div>
            <div className="export-code-box">{ytText}</div>
          </div>

          <div className="storyboard-export-tabs">
            <div className="export-tab-header">
              <span className="export-tab-title">Manim CE self.next_section() 脚本结构</span>
              <button className="export-copy-btn" onClick={handleCopyPython}>
                {copiedPy ? '✓ 已复制' : '复制代码'}
              </button>
            </div>
            <div className="export-code-box">{pyCode}</div>
          </div>
        </div>

        {/* Footer */}
        <div className="storyboard-footer">
          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
            章节时间点将与主编辑区顶部时间轴智能标记实时保持双向同步
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-secondary" onClick={onClose}>
              取消
            </button>
            <button className="btn-primary" onClick={handleSaveAndSync}>
              保存并同步到时间轴标记
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
