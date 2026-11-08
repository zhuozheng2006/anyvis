import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Radio, X, Check, Copy, Sparkles, Play, Pause } from 'lucide-react';
import {
  AUDIO_VISUALIZER_PRESETS,
  type AudioVisualizerPreset,
  simulateAudioFrequencies,
  generateAudioVisualizerPythonCode,
} from './audio-visualizer';
import './audio-visualizer.css';

export interface AudioVisualizerModalProps {
  isOpen: boolean;
  onClose(): void;
  onInsertAudioVisualizer?(preset: AudioVisualizerPreset): void;
}

const CANVAS_WIDTH = 540;
const CANVAS_HEIGHT = 360;

export const AudioVisualizerModal: React.FC<AudioVisualizerModalProps> = ({
  isOpen,
  onClose,
  onInsertAudioVisualizer,
}) => {
  const [activePreset, setActivePreset] = useState<AudioVisualizerPreset>(AUDIO_VISUALIZER_PRESETS[0]);
  const [barCount, setBarCount] = useState(activePreset.barCount);
  const [position, setPosition] = useState<'bottom' | 'center' | 'top'>(activePreset.position);
  const [copied, setCopied] = useState(false);
  const [inserted, setInserted] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [simTime, setSimTime] = useState(0);

  const animRef = useRef<number | null>(null);

  // Switch preset
  const handleSelectPreset = (p: AudioVisualizerPreset) => {
    setActivePreset(p);
    setBarCount(p.barCount);
    setPosition(p.position);
  };

  // 60fps simulation loop
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();

    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setSimTime(prev => prev + dt);
      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => {
      if (animRef.current !== null) cancelAnimationFrame(animRef.current);
    };
  }, [playing]);

  // Current audio amplitudes
  const amplitudes = useMemo(() => {
    return simulateAudioFrequencies(simTime, barCount, activePreset.type);
  }, [simTime, barCount, activePreset.type]);

  // Python code copy
  const handleCopyCode = async () => {
    const code = generateAudioVisualizerPythonCode({
      ...activePreset,
      barCount,
      position,
    });
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  // Insert into project
  const handleInsert = () => {
    if (!onInsertAudioVisualizer) return;
    onInsertAudioVisualizer({
      ...activePreset,
      barCount,
      position,
    });
    setInserted(true);
    setTimeout(() => {
      setInserted(false);
      onClose();
    }, 450);
  };

  if (!isOpen) return null;

  // Render SVG visualizer
  const renderVisualizer = () => {
    const isRadial = activePreset.type === 'radial';
    const isOscilloscope = activePreset.type === 'oscilloscope';
    const isMirrored = activePreset.mirrored;

    if (isRadial) {
      const cx = CANVAS_WIDTH / 2;
      const cy = CANVAS_HEIGHT / 2;
      const baseRadius = 60;
      const maxExt = 70;

      return (
        <g>
          {/* Inner Glowing Core */}
          <circle cx={cx} cy={cy} r={baseRadius - 8} fill="none" stroke={activePreset.secondaryColor} strokeWidth={2} opacity={0.5} />
          <circle cx={cx} cy={cy} r={baseRadius - 20} fill="none" stroke={activePreset.primaryColor} strokeWidth={1} opacity={0.3} />

          {/* Radial Rays */}
          {amplitudes.map((amp, idx) => {
            const angle = (idx / barCount) * 2 * Math.PI - Math.PI / 2;
            const rStart = baseRadius;
            const rEnd = baseRadius + amp * maxExt;
            const x1 = cx + Math.cos(angle) * rStart;
            const y1 = cy + Math.sin(angle) * rStart;
            const x2 = cx + Math.cos(angle) * rEnd;
            const y2 = cy + Math.sin(angle) * rEnd;

            return (
              <line
                key={idx}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={idx % 2 === 0 ? activePreset.primaryColor : activePreset.secondaryColor}
                strokeWidth={3.5}
                strokeLinecap="round"
                opacity={0.85}
              />
            );
          })}
        </g>
      );
    }

    if (isOscilloscope) {
      const cy = CANVAS_HEIGHT / 2;
      const totalWidth = CANVAS_WIDTH - 60;
      const startX = 30;
      const step = totalWidth / (barCount - 1);

      const d = amplitudes.map((amp, idx) => {
        const x = startX + idx * step;
        const y = cy + (amp - 0.5) * 160;
        return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
      }).join(' ');

      return (
        <g>
          <line x1={startX} y1={cy} x2={startX + totalWidth} y2={cy} stroke="rgba(255,255,255,0.1)" strokeDasharray="3 3" />
          <path d={d} fill="none" stroke={activePreset.primaryColor} strokeWidth={3} strokeLinecap="round" filter="drop-shadow(0 0 6px #48bb78)" />
        </g>
      );
    }

    // Standard or Mirrored Bars
    const totalWidth = CANVAS_WIDTH - 60;
    const startX = 30;
    const barWidth = Math.max(3, (totalWidth / barCount) * 0.72);
    const spacing = (totalWidth / barCount) * 0.28;
    const maxBarH = 120;

    let baseY = CANVAS_HEIGHT - 40;
    if (position === 'center') baseY = CANVAS_HEIGHT / 2;
    if (position === 'top') baseY = 60;

    return (
      <g>
        {amplitudes.map((amp, idx) => {
          const x = startX + idx * (barWidth + spacing);
          const h = Math.max(4, amp * maxBarH);

          if (isMirrored) {
            return (
              <g key={idx}>
                <rect
                  x={x}
                  y={baseY - h / 2}
                  width={barWidth}
                  height={h}
                  rx={barWidth / 2}
                  fill="url(#visGrad)"
                />
              </g>
            );
          }

          const y = position === 'top' ? baseY : baseY - h;
          return (
            <rect
              key={idx}
              x={x}
              y={y}
              width={barWidth}
              height={h}
              rx={barWidth / 2}
              fill="url(#visGrad)"
            />
          );
        })}
      </g>
    );
  };

  return (
    <div className="audio-vis-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="audio-vis-modal-container" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="audio-vis-header">
          <div className="audio-vis-title">
            <Radio size={18} color="#e2b340" />
            <span>音频响应式频谱与波形助手 (Audio Visualizer)</span>
            <span className="audio-vis-badge">Audio Reactive</span>
          </div>
          <button className="audio-vis-close-btn" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="audio-vis-body">
          {/* Left: Stage Preview */}
          <div className="audio-vis-stage-pane">
            <div className="audio-vis-canvas-wrap">
              <svg viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`} className="audio-vis-svg">
                <defs>
                  <linearGradient id="visGrad" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor={activePreset.primaryColor} stopOpacity="0.9" />
                    <stop offset="100%" stopColor={activePreset.secondaryColor} stopOpacity="0.9" />
                  </linearGradient>
                </defs>

                {renderVisualizer()}
              </svg>
            </div>

            {/* Playback simulation bar */}
            <div className="audio-vis-playback-bar">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  className="audio-vis-pos-pill"
                  onClick={() => setPlaying(!playing)}
                  style={{ width: 34, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  {playing ? <Pause size={13} /> : <Play size={13} />}
                </button>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>
                  {playing ? '正在实时模拟声波能量…' : '已暂停'}
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#cbd5e1', fontFamily: 'ui-monospace, monospace' }}>
                t = {simTime.toFixed(1)}s
              </div>
            </div>
          </div>

          {/* Right: Presets & Parameters */}
          <div className="audio-vis-controls-pane">
            {/* Presets List */}
            <div>
              <div className="audio-vis-section-title">频谱与波形预设</div>
              <div className="audio-vis-preset-list">
                {AUDIO_VISUALIZER_PRESETS.map(p => (
                  <button
                    key={p.id}
                    className={`audio-vis-preset-card ${p.id === activePreset.id ? 'active' : ''}`}
                    onClick={() => handleSelectPreset(p)}
                  >
                    <span style={{ fontWeight: 600 }}>{p.name}</span>
                    <span style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>{p.description}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Bar Count Slider */}
            <div className="audio-vis-slider-box">
              <div className="audio-vis-slider-row">
                <div className="audio-vis-slider-label">
                  <span>频段柱数量 (Bar Count)</span>
                  <span style={{ color: '#e2b340', fontWeight: 600 }}>{barCount}</span>
                </div>
                <input
                  type="range"
                  min="8"
                  max="64"
                  step="4"
                  value={barCount}
                  onChange={e => setBarCount(parseInt(e.target.value, 10))}
                  className="audio-vis-slider"
                />
              </div>

              {/* Position Selector */}
              {activePreset.type === 'bars' && (
                <div style={{ marginTop: 6 }}>
                  <div className="audio-vis-slider-label" style={{ marginBottom: 4 }}>
                    <span>画面对齐位置</span>
                  </div>
                  <div className="audio-vis-pos-pills">
                    <button
                      className={`audio-vis-pos-pill ${position === 'bottom' ? 'active' : ''}`}
                      onClick={() => setPosition('bottom')}
                    >
                      底部 (Bottom)
                    </button>
                    <button
                      className={`audio-vis-pos-pill ${position === 'center' ? 'active' : ''}`}
                      onClick={() => setPosition('center')}
                    >
                      居中 (Center)
                    </button>
                    <button
                      className={`audio-vis-pos-pill ${position === 'top' ? 'active' : ''}`}
                      onClick={() => setPosition('top')}
                    >
                      顶部 (Top)
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="audio-vis-footer">
          <div style={{ fontSize: 11, color: '#8892b0' }}>
            提示：可为教师讲解配音或钢琴背景音乐增添生动的音频动态波形
          </div>
          <div className="audio-vis-action-btn-row">
            <button className="audio-vis-btn-secondary" onClick={handleCopyCode}>
              {copied ? <Check size={14} color="#48bb78" /> : <Copy size={14} />}
              <span>{copied ? '已复制 Manim 代码' : '复制 Python 代码'}</span>
            </button>
            <button className="audio-vis-btn-primary" onClick={handleInsert}>
              {inserted ? <Check size={14} /> : <Sparkles size={14} />}
              <span>插入到动画编排</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
