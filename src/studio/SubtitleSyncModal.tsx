import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { Project } from './core/types';
import {
  DEFAULT_SUBTITLE_PRESET,
  exportToSrt,
  parseSrt,
  generateSubtitlesPythonCode,
  createSubtitleActions,
  type SubtitleItem,
} from './subtitles';
import './subtitles.css';

interface SubtitleSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  onApply: (nextProject: Project, actionIds: string[]) => void;
}

export const SubtitleSyncModal: React.FC<SubtitleSyncModalProps> = ({
  isOpen,
  onClose,
  project,
  onApply,
}) => {
  const [generationError, setGenerationError] = useState('');
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>(DEFAULT_SUBTITLE_PRESET);
  const [playbackTime, setPlaybackTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isCopiedPy, setIsCopiedPy] = useState<boolean>(false);
  const [isCopiedSrt, setIsCopiedSrt] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const maxTime = useMemo(() => {
    const last = subtitles.reduce((max, s) => Math.max(max, s.endTime), 18);
    return Math.ceil(last + 1);
  }, [subtitles]);

  // Playback timer loop
  useEffect(() => {
    if (!isOpen || !isPlaying) return;

    let frameId: number;
    let lastStamp = performance.now();

    const loop = (stamp: number) => {
      const dt = (stamp - lastStamp) / 1000;
      lastStamp = stamp;

      setPlaybackTime((prev) => {
        const next = prev + dt;
        if (next >= maxTime) {
          setIsPlaying(false);
          return 0;
        }
        return next;
      });

      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [isOpen, isPlaying, maxTime]);

  // Currently active subtitle
  const activeSubtitles = useMemo(() => {
    return subtitles.filter(
      (s) => playbackTime >= s.startTime && playbackTime < s.endTime,
    );
  }, [subtitles, playbackTime]);

  const handleUpdateSub = (id: string, updates: Partial<SubtitleItem>) => {
    setSubtitles((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    );
  };

  const handleAddSub = () => {
    const nextStart = Math.round(playbackTime * 10) / 10;
    const newSub: SubtitleItem = {
      id: `sub_${Date.now()}`,
      startTime: nextStart,
      endTime: nextStart + 3.0,
      text: '新字幕文本...',
      color: '#ffffff',
      fontSize: 24,
      position: 'bottom',
    };
    setSubtitles((prev) => [...prev, newSub].sort((a, b) => a.startTime - b.startTime));
  };

  const handleDeleteSub = (id: string) => {
    if (subtitles.length <= 1) return;
    setSubtitles((prev) => prev.filter((s) => s.id !== id));
  };

  const handleImportSrt = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (text) {
        const parsed = parseSrt(text);
        if (parsed.length > 0) {
          setSubtitles(parsed);
        }
      }
    };
    reader.readAsText(file);
  };

  const handleCopySrt = async () => {
    const srt = exportToSrt(subtitles);
    await navigator.clipboard.writeText(srt);
    setIsCopiedSrt(true);
    setTimeout(() => setIsCopiedSrt(false), 2000);
  };

  const handleCopyPython = async () => {
    setGenerationError('');
    try {
    const code = generateSubtitlesPythonCode(subtitles);
    await navigator.clipboard.writeText(code);
    setIsCopiedPy(true);
    setTimeout(() => setIsCopiedPy(false), 2000);
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleApplyToProject = () => {
    setGenerationError('');
    try {
    const result = createSubtitleActions(project, subtitles);
    onApply(result.project, result.actionIds);
    onClose();
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : String(error));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="subtitles-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="subtitles-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="subtitles-header">
          <h2>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#83c167" strokeWidth="2">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M7 15h4M15 15h2M7 11h2M13 11h4" />
            </svg>
            字幕配音同步工作台 (Subtitles & Voiceover Sync)
          </h2>
          <button className="subtitles-close-btn" onClick={onClose} title="关闭">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="subtitles-body">
          {/* Stage Panel */}
          <div className="subtitles-stage-panel">
            <div className="subtitles-canvas-container">
              <div style={{ color: '#475569', fontSize: '0.85rem' }}>
                画面预览区域 (Subtitle Overlay View)
              </div>

              {/* Active Subtitle Overlay */}
              {activeSubtitles.length ? activeSubtitles.map(activeSubtitle => (
                <div
                  key={activeSubtitle.id}
                  className="subtitles-preview-box"
                  style={{
                    bottom: activeSubtitle.position === 'top' || activeSubtitle.position === 'center' ? 'auto' : 24,
                    top: activeSubtitle.position === 'top' ? 24 : activeSubtitle.position === 'center' ? '45%' : 'auto',
                  }}
                >
                  <div
                    className="subtitles-preview-pill"
                    style={{ color: activeSubtitle.color || '#ffffff', whiteSpace: 'pre-wrap' }}
                  >
                    {activeSubtitle.text}
                  </div>
                </div>
              )) : (
                <div className="subtitles-preview-box" style={{ opacity: 0.35 }}>
                  <span style={{ fontSize: '0.8rem', color: '#64748b' }}>[暂无当前时刻字幕]</span>
                </div>
              )}
            </div>

            {/* Scrubber Playback Bar */}
            <div className="camera-scrubber-bar">
              <button
                className="camera-play-btn"
                onClick={() => setIsPlaying(!isPlaying)}
              >
                {isPlaying ? '⏸ 暂停' : '▶ 播放预览'}
              </button>
              <input
                type="range"
                min="0"
                max={maxTime}
                step="0.1"
                value={playbackTime}
                onChange={(e) => {
                  setIsPlaying(false);
                  setPlaybackTime(parseFloat(e.target.value));
                }}
                style={{ flex: 1, accentColor: '#83c167' }}
              />
              <span style={{ fontSize: '0.8rem', color: '#83c167', fontFamily: 'monospace' }}>
                {playbackTime.toFixed(1)}s / {maxTime.toFixed(1)}s
              </span>
            </div>
          </div>

          {/* Control Sidebar */}
          <div className="subtitles-ctrl-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1' }}>
                字幕条目 ({subtitles.length} 条)
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="file"
                  accept=".srt"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={handleImportSrt}
                />
                <button
                  className="btn-secondary"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ padding: '3px 6px', fontSize: '0.72rem' }}
                >
                  导入 .srt
                </button>
                <button
                  className="btn-secondary"
                  onClick={handleAddSub}
                  style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                >
                  + 新增
                </button>
              </div>
            </div>

            {/* Subtitles List */}
            <div className="subtitles-list">
              {subtitles.map((sub, idx) => {
                const isSelected = activeSubtitles.some(active => active.id === sub.id);
                return (
                  <div
                    key={sub.id}
                    className={`subtitles-item-card ${isSelected ? 'active' : ''}`}
                    onClick={() => setPlaybackTime(sub.startTime)}
                  >
                    <div className="sub-header-row">
                      <span style={{ color: '#83c167', fontWeight: 700, fontSize: '0.75rem' }}>
                        #{idx + 1}
                      </span>
                      <div className="sub-time-input-group">
                        <span>起:</span>
                        <input
                          type="number"
                          step="0.2"
                          value={sub.startTime}
                          onChange={(e) =>
                            handleUpdateSub(sub.id, { startTime: parseFloat(e.target.value) || 0 })
                          }
                        />
                        <span>止:</span>
                        <input
                          type="number"
                          step="0.2"
                          value={sub.endTime}
                          onChange={(e) =>
                            handleUpdateSub(sub.id, { endTime: parseFloat(e.target.value) || 0 })
                          }
                        />
                        <span>s</span>
                      </div>
                      {subtitles.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSub(sub.id);
                          }}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    <input
                      type="text"
                      className="sub-text-input"
                      value={sub.text}
                      onChange={(e) => handleUpdateSub(sub.id, { text: e.target.value })}
                      placeholder="输入字幕或口播解说词..."
                    />

                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: '0.72rem', color: '#94a3b8' }}>
                      <span>颜色:</span>
                      <input
                        type="color"
                        value={sub.color || '#ffffff'}
                        onChange={(e) => handleUpdateSub(sub.id, { color: e.target.value })}
                        style={{ width: 24, height: 18, border: 'none', padding: 0, background: 'none', cursor: 'pointer' }}
                      />
                      <span>位置:</span>
                      <select
                        value={sub.position || 'bottom'}
                        onChange={(e) =>
                          handleUpdateSub(sub.id, { position: e.target.value as 'bottom' | 'top' | 'center' })
                        }
                        style={{ background: '#1e293b', border: '1px solid #334155', color: '#fff', fontSize: '0.72rem', borderRadius: 4 }}
                      >
                        <option value="bottom">底部</option>
                        <option value="top">顶部</option>
                        <option value="center">居中</option>
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="subtitles-footer">
          {generationError && <div role="alert" style={{ color: '#ef4444' }}>{generationError}</div>}
          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
            字幕追加在现有动画之后；起止时间从追加片段开头计，支持重叠字幕。
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-secondary" onClick={handleCopySrt}>
              {isCopiedSrt ? '✓ 已复制 SRT' : '导出 .srt 文件文本'}
            </button>
            <button className="btn-secondary" onClick={handleCopyPython}>
              {isCopiedPy ? '✓ 已复制 Python 代码' : '复制代码 (Manim CE)'}
            </button>
            <button className="btn-primary" onClick={handleApplyToProject}>
              追加字幕片段
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
