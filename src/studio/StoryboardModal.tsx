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
import { copyTextToClipboard } from './browser-utils';
import { useTransientFlag, useDialogEscape } from './modal-hooks';
import type { TimelineMarker } from './core/types';
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
  const [chapterError, setChapterError] = useState<string>('');
  const [copiedYt, triggerCopiedYt, resetCopiedYt] = useTransientFlag(2000, isOpen);
  const [copiedPy, triggerCopiedPy, resetCopiedPy] = useTransientFlag(2000, isOpen);
  useDialogEscape(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      setChapters(buildStoryboard(project));
      const total = estimateProjectDuration(project);
      setNewChapterTime(total > 0 ? Math.min(10, Math.round((total / 2) * 10) / 10) : 0);
      setChapterError('');
      resetCopiedYt();
      resetCopiedPy();
    }
  }, [isOpen, project, resetCopiedYt, resetCopiedPy]);

  const totalDuration = useMemo(() => estimateProjectDuration(project), [project]);

  const rebuildChaptersWithEdits = (
    currentChapters: StoryboardChapter[],
    nextMarkers: TimelineMarker[],
  ): StoryboardChapter[] => {
    const nextProject: Project = {
      ...project,
      scene: {
        ...project.scene,
        markers: nextMarkers,
      },
    };
    const rebuilt = buildStoryboard(nextProject);
    const introDefaults = new Set(['全片场景 (Full Scene)', '序幕引言 (Introduction)']);

    return rebuilt.map((chapter) => {
      const prev =
        (chapter.markerId
          ? currentChapters.find((c) => c.markerId === chapter.markerId)
          : undefined) ||
        currentChapters.find((c) => Math.abs(c.startTime - chapter.startTime) < 0.01);
      if (!prev) return chapter;

      const preserveName =
        chapter.startTime === 0 ? !introDefaults.has(prev.name) : true;
      return {
        ...chapter,
        name: preserveName ? prev.name : chapter.name,
        skipAnimations: prev.skipAnimations,
      };
    });
  };

  const toDraftMarkers = (sourceChapters: StoryboardChapter[]): TimelineMarker[] =>
    updateProjectChapters(project, sourceChapters).scene.markers || [];

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

    const remainingChapters = chapters.filter(
      (c) => c.id !== id && Math.abs(c.startTime - target.startTime) > 0.01,
    );
    setChapterError('');
    setChapters(rebuildChaptersWithEdits(chapters, toDraftMarkers(remainingChapters)));
  };

  const handleAddChapter = () => {
    if (!Number.isFinite(newChapterTime) || newChapterTime <= 0 || newChapterTime >= totalDuration) {
      setChapterError(
        totalDuration > 0
          ? `插入时间必须在 0s 到 ${totalDuration.toFixed(1)}s 之间`
          : '当前工程总时长为 0s，请先在时间轴中添加动作或音频片段',
      );
      return;
    }
    if (chapters.some((c) => Math.abs(c.startTime - newChapterTime) < 0.01)) {
      setChapterError(`时间点 ${newChapterTime}s 已存在分段边界`);
      return;
    }

    const newMarker: TimelineMarker = {
      id: `m_${crypto.randomUUID().slice(0, 8)}`,
      time: newChapterTime,
      label: newChapterName.trim() || `分段 ${chapters.length + 1}`,
      color: '#38bdf8',
    };
    const updatedMarkers = [...toDraftMarkers(chapters), newMarker].sort(
      (a, b) => a.time - b.time,
    );
    setChapterError('');
    setChapters(rebuildChaptersWithEdits(chapters, updatedMarkers));
    setNewChapterName(`分段 ${chapters.length + 2}`);
  };

  const handleCopyYouTube = async () => {
    try {
      setChapterError('');
      const text = exportYouTubeChapters(chapters);
      if (await copyTextToClipboard(text)) {
        triggerCopiedYt();
      } else {
        setChapterError('复制章节失败，请检查剪贴板权限');
      }
    } catch (err) {
      setChapterError((err as Error).message || '生成章节文本失败');
    }
  };

  const handleCopyPython = async () => {
    try {
      setChapterError('');
      const code = generateManimSectionPythonCode(chapters, project);
      if (await copyTextToClipboard(code)) {
        triggerCopiedPy();
      } else {
        setChapterError('复制 Python 代码失败，请检查剪贴板权限');
      }
    } catch (err) {
      setChapterError((err as Error).message || '生成 Python 代码失败');
    }
  };

  const handleSaveAndSync = () => {
    try {
      setChapterError('');
      const nextProject = updateProjectChapters(project, chapters);
      onApply(nextProject);
      onClose();
    } catch (err) {
      setChapterError((err as Error).message || '同步时间轴标记失败');
    }
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
                    骨架中跳过动画
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
              onChange={(e) => {
                setNewChapterName(e.target.value);
                if (chapterError) setChapterError('');
              }}
              placeholder="新章节名称..."
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: '#94a3b8' }}>
              <span>时间(s):</span>
              <input
                type="number"
                step="0.5"
                min="0.1"
                max={totalDuration > 0.2 ? totalDuration - 0.1 : undefined}
                style={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: 6,
                  padding: '6px 8px',
                  color: '#fff',
                  width: 70,
                  fontSize: '0.8rem',
                }}
                value={Number.isFinite(newChapterTime) ? newChapterTime : ''}
                onChange={(e) => {
                  const parsed = parseFloat(e.target.value);
                  setNewChapterTime(Number.isFinite(parsed) ? parsed : NaN);
                  if (chapterError) setChapterError('');
                }}
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
          {chapterError && (
            <div role="alert" style={{ color: '#f87171', fontSize: '0.8rem', marginTop: -8 }}>
              {chapterError}
            </div>
          )}

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
              <span className="export-tab-title">Manim 章节骨架（不含工程对象与动画）</span>
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
            保存后将更新工程时间轴标记；章节骨架导出不包含工程动画。
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
