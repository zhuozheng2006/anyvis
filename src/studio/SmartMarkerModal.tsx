import React, { useState } from 'react';
import { Sparkles, X, Check, Mic, Music, Film, Clock } from 'lucide-react';
import type { Project, TimelineMarker } from './core/types';
import { generateSmartMarkers, type SmartMarkerMode } from './smart-marker';
import { timecode } from './Timeline';
import './smart-marker-modal.css';

export interface SmartMarkerModalProps {
  project: Project;
  isOpen: boolean;
  onClose(): void;
  onApply(markers: TimelineMarker[]): void;
}

const COLOR_PRESETS = [
  { label: '琥珀金', value: '#fbbf24' },
  { label: '天蓝色', value: '#38bdf8' },
  { label: '翡翠绿', value: '#10b981' },
  { label: '幻夜紫', value: '#a855f7' },
  { label: '玫瑰红', value: '#f43f5e' },
];

export const SmartMarkerModal: React.FC<SmartMarkerModalProps> = ({
  project,
  isOpen,
  onClose,
  onApply,
}) => {
  const [mode, setMode] = useState<SmartMarkerMode>('speech');
  const [cadence, setCadence] = useState(3.0);
  const [bpm, setBpm] = useState(90);
  const [labelPrefix, setLabelPrefix] = useState('语段');
  const [color, setColor] = useState('#fbbf24');
  const [replaceExisting, setReplaceExisting] = useState(false);

  if (!isOpen) return null;

  const handleModeChange = (newMode: SmartMarkerMode) => {
    setMode(newMode);
    switch (newMode) {
      case 'speech':
        setLabelPrefix('语段');
        break;
      case 'beat':
        setLabelPrefix('拍点');
        break;
      case 'cuts':
        setLabelPrefix('镜头');
        break;
      case 'interval':
        setLabelPrefix('分段');
        break;
    }
  };

  const previewMarkers = generateSmartMarkers(project, {
    mode,
    cadenceSeconds: cadence,
    bpm,
    labelPrefix,
    color,
    replaceExisting,
  });

  const handleApply = () => {
    onApply(previewMarkers);
    onClose();
  };

  return (
    <div className="smm-overlay" role="dialog" aria-modal="true" aria-label="节奏标记助手">
      <div className="smm-modal">
        <div className="smm-header">
          <div className="smm-title">
            <Sparkles size={18} className="smm-icon" />
            <span>节奏标记助手</span>
          </div>
          <button type="button" className="smm-close-btn" onClick={onClose} aria-label="关闭窗口">
            <X size={18} />
          </button>
        </div>

        <div className="smm-body">
          <p className="smm-intro">
            按设定间隔、BPM 或实际动作起点生成标记。间隔与 BPM 由你指定，此功能不分析音频中的停顿或节拍。
          </p>

          <div className="smm-mode-grid">
            <button
              type="button"
              className={`smm-mode-card ${mode === 'speech' ? 'smm-mode-card-active' : ''}`}
              onClick={() => handleModeChange('speech')}
            >
              <Mic size={20} className="smm-mode-icon" />
              <div className="smm-mode-label">语段间隔</div>
              <div className="smm-mode-desc">按设定秒数等间隔生成标记</div>
            </button>

            <button
              type="button"
              className={`smm-mode-card ${mode === 'beat' ? 'smm-mode-card-active' : ''}`}
              onClick={() => handleModeChange('beat')}
            >
              <Music size={20} className="smm-mode-icon" />
              <div className="smm-mode-label">BPM 辅助拍点</div>
              <div className="smm-mode-desc">基于 BPM 节奏点（四分音符）精准卡点</div>
            </button>

            <button
              type="button"
              className={`smm-mode-card ${mode === 'cuts' ? 'smm-mode-card-active' : ''}`}
              onClick={() => handleModeChange('cuts')}
            >
              <Film size={20} className="smm-mode-icon" />
              <div className="smm-mode-label">画面转场对齐</div>
              <div className="smm-mode-desc">在每个动画与图形出场位置生成标记</div>
            </button>

            <button
              type="button"
              className={`smm-mode-card ${mode === 'interval' ? 'smm-mode-card-active' : ''}`}
              onClick={() => handleModeChange('interval')}
            >
              <Clock size={20} className="smm-mode-icon" />
              <div className="smm-mode-label">等距规律分段</div>
              <div className="smm-mode-desc">按固定时间步长划分讲解阶段</div>
            </button>
          </div>

          <div className="smm-settings">
            {mode === 'speech' && (
              <div className="smm-row">
                <label className="smm-label">平均语段间隔（秒）：</label>
                <div className="smm-input-group">
                  <input
                    type="range"
                    min="1.0"
                    max="8.0"
                    step="0.5"
                    value={cadence}
                    onChange={e => setCadence(Number(e.target.value))}
                    className="smm-slider"
                  />
                  <span className="smm-val">{cadence.toFixed(1)} 秒</span>
                </div>
              </div>
            )}

            {mode === 'beat' && (
              <div className="smm-row">
                <label className="smm-label">音乐速度（BPM）：</label>
                <div className="smm-input-group">
                  <input
                    type="range"
                    min="40"
                    max="180"
                    step="5"
                    value={bpm}
                    onChange={e => setBpm(Number(e.target.value))}
                    className="smm-slider"
                  />
                  <span className="smm-val">{bpm} BPM ({((60 / bpm)).toFixed(2)}s)</span>
                </div>
              </div>
            )}

            {mode === 'interval' && (
              <div className="smm-row">
                <label className="smm-label">分段步长（秒）：</label>
                <div className="smm-input-group">
                  <input
                    type="range"
                    min="0.5"
                    max="10.0"
                    step="0.5"
                    value={cadence}
                    onChange={e => setCadence(Number(e.target.value))}
                    className="smm-slider"
                  />
                  <span className="smm-val">{cadence.toFixed(1)} 秒</span>
                </div>
              </div>
            )}

            <div className="smm-row">
              <label className="smm-label">标记名称前缀：</label>
              <input
                type="text"
                className="smm-text-input"
                value={labelPrefix}
                onChange={e => setLabelPrefix(e.target.value)}
                placeholder="例如：语段、步骤、镜头"
              />
            </div>

            <div className="smm-row">
              <label className="smm-label">标记颜色：</label>
              <div className="smm-color-picks">
                {COLOR_PRESETS.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    className={`smm-color-dot ${color === c.value ? 'smm-color-dot-active' : ''}`}
                    style={{ background: c.value }}
                    onClick={() => setColor(c.value)}
                    title={c.label}
                  />
                ))}
              </div>
            </div>

            <div className="smm-row smm-row-check">
              <label className="smm-checkbox-label">
                <input
                  type="checkbox"
                  checked={replaceExisting}
                  onChange={e => setReplaceExisting(e.target.checked)}
                />
                <span>覆盖已有标记（未勾选时追加到现有标记中）</span>
              </label>
            </div>
          </div>

          <div className="smm-preview-section">
            <div className="smm-preview-head">
              <span>生成标记预览（共 {previewMarkers.length} 个点）：</span>
            </div>
            <div className="smm-preview-list">
              {previewMarkers.slice(0, 16).map((m, i) => (
                <div key={i} className="smm-preview-pill">
                  <span className="smm-preview-dot" style={{ background: m.color || color }} />
                  <span className="smm-preview-time">{timecode(m.time, project.scene.fps).slice(3)}</span>
                  <span className="smm-preview-txt">{m.label}</span>
                </div>
              ))}
              {previewMarkers.length > 16 && (
                <div className="smm-preview-more">… 以及更多 {previewMarkers.length - 16} 个标记</div>
              )}
            </div>
          </div>
        </div>

        <div className="smm-footer">
          <button type="button" className="smm-cancel-btn" onClick={onClose}>
            取消
          </button>
          <button type="button" className="smm-confirm-btn" onClick={handleApply}>
            <Check size={16} />
            <span>生成 {previewMarkers.length} 个时间标记</span>
          </button>
        </div>
      </div>
    </div>
  );
};
