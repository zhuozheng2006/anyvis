import React, { useEffect, useMemo, useState } from 'react';
import { Palette, X, Check, Copy, Sparkles } from 'lucide-react';
import { copyTextToClipboard } from './browser-utils';
import { useDelayedAction, useDialogEscape, useTransientFlag } from './modal-hooks';
import {
  TEX_STYLING_PRESETS,
  PALETTE_3B1B,
  type TexStylingPreset,
  tokenizeTexFormula,
  applyColorsToTex,
  generateColoredMathTexPython,
} from './tex-color';
import './tex-color-styler.css';

export interface TexColorStylerModalProps {
  isOpen: boolean;
  onClose(): void;
  onInsertColoredTex?(rawTex: string, colorMap: Record<string, string>, name: string): void;
}

export const TexColorStylerModal: React.FC<TexColorStylerModalProps> = ({
  isOpen,
  onClose,
  onInsertColoredTex,
}) => {
  const [activePreset, setActivePreset] = useState<TexStylingPreset>(TEX_STYLING_PRESETS[0]);
  const [rawTex, setRawTex] = useState(activePreset.rawTex);
  const [colorMap, setColorMap] = useState<Record<string, string>>({ ...activePreset.defaultColors });
  const [selectedTokenKey, setSelectedTokenKey] = useState<string>('e');
  const [copied, triggerCopied] = useTransientFlag(2000, isOpen);
  const [inserted, scheduleInsert] = useDelayedAction(450, isOpen);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!isOpen) setErrorMsg('');
  }, [isOpen]);

  useDialogEscape(isOpen, onClose);

  // Switch preset
  const handleSelectPreset = (p: TexStylingPreset) => {
    setErrorMsg('');
    setActivePreset(p);
    setRawTex(p.rawTex);
    setColorMap({ ...p.defaultColors });
    const firstKey = Object.keys(p.defaultColors)[0] || '';
    setSelectedTokenKey(firstKey);
  };

  // Tokenize the formula
  const tokens = useMemo(() => tokenizeTexFormula(rawTex), [rawTex]);

  // Extract distinct math symbol tokens for the color chips
  const distinctMathTokens = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const t of tokens) {
      if (t.isMathSymbol && !seen.has(t.text)) {
        seen.add(t.text);
        list.push(t.text);
      }
    }
    return list;
  }, [tokens]);

  // Auto-select token if active one is removed
  const currentToken = distinctMathTokens.includes(selectedTokenKey)
    ? selectedTokenKey
    : distinctMathTokens[0] || '';

  // Apply colors
  const { coloredTex } = useMemo(() => {
    try {
      return applyColorsToTex(rawTex, colorMap);
    } catch {
      return { coloredTex: rawTex };
    }
  }, [rawTex, colorMap]);

  // Handle color change for active token
  const handleSelectColor = (hex: string) => {
    if (!currentToken) return;
    setErrorMsg('');
    setColorMap(prev => ({
      ...prev,
      [currentToken]: hex,
    }));
  };

  // Copy Python code
  const handleCopyCode = async () => {
    setErrorMsg('');
    try {
      const code = generateColoredMathTexPython(rawTex, colorMap);
      if (await copyTextToClipboard(code)) {
        triggerCopied();
      }
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : '生成 Python 代码失败。');
    }
  };

  // Insert into project
  const handleInsert = () => {
    if (!onInsertColoredTex || inserted) return;
    setErrorMsg('');
    try {
      scheduleInsert(onClose, () => {
        onInsertColoredTex(rawTex, colorMap, activePreset.name.split(' ')[0]);
      });
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : '插入配色公式失败。');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="tex-styler-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="LaTeX 配色编辑器">
      <div className="tex-styler-modal-container" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="tex-styler-header">
          <div className="tex-styler-title">
            <Palette size={18} color="#e2b340" />
            <span>3B1B 公式专属配色器 (LaTeX Equation Styler)</span>
            <span className="tex-styler-badge">Math Aesthetic</span>
          </div>
          <button className="tex-styler-close-btn" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="tex-styler-body">
          {/* Left: Preview & Coloring Panel */}
          <div className="tex-styler-preview-pane">
            {/* Visual Formula Display */}
            <div className="tex-styler-stage">
              <div style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: '3px' }}>
                {tokens.map((tok, idx) => {
                  const assignedColor = colorMap[tok.text] || '#ffffff';
                  return (
                    <span
                      key={idx}
                      style={{
                        color: assignedColor,
                        padding: tok.isMathSymbol ? '2px 3px' : '0',
                        borderRadius: 4,
                        borderBottom: tok.text === currentToken ? `2px solid ${assignedColor}` : 'none',
                        cursor: tok.isMathSymbol ? 'pointer' : 'default',
                      }}
                      onClick={() => {
                        if (tok.isMathSymbol) setSelectedTokenKey(tok.text);
                      }}
                      title={tok.isMathSymbol ? `点击为变量 ${tok.text} 选取颜色` : undefined}
                    >
                      {tok.text}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Token Chips */}
            <div>
              <div className="tex-styler-section-title">公式变量与符号列表（点击选择着色目标）</div>
              <div className="tex-styler-token-chips">
                {distinctMathTokens.map(tok => {
                  const color = colorMap[tok] || '#ffffff';
                  const isActive = tok === currentToken;
                  return (
                    <button
                      key={tok}
                      className={`tex-styler-chip ${isActive ? 'active' : ''}`}
                      onClick={() => setSelectedTokenKey(tok)}
                    >
                      <span className="tex-styler-dot" style={{ backgroundColor: color }} />
                      <span>{tok}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3B1B Palette Swatches */}
            <div>
              <div className="tex-styler-section-title">
                3B1B 专属色彩拾取盘（为当前目标 <span style={{ color: '#e2b340' }}>{currentToken}</span> 设色）
              </div>
              <div className="tex-styler-palette-bar">
                {PALETTE_3B1B.map(swatch => {
                  const isCurrent = (colorMap[currentToken] || '#ffffff').toLowerCase() === swatch.hex.toLowerCase();
                  return (
                    <button
                      key={swatch.hex}
                      className={`tex-styler-swatch-btn ${isCurrent ? 'active' : ''}`}
                      onClick={() => handleSelectColor(swatch.hex)}
                    >
                      <span className="tex-styler-dot" style={{ backgroundColor: swatch.hex }} />
                      <span>{swatch.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Code Output Preview */}
            <div className="tex-styler-output-box">
              <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>生成带颜色标注 LaTeX 代码：</span>
              <span className="tex-styler-code-text">{coloredTex}</span>
            </div>
          </div>

          {/* Right: Presets & Formula Input */}
          <div className="tex-styler-controls-pane">
            <div>
              <div className="tex-styler-section-title">经典公式预设</div>
              <div className="tex-styler-preset-list">
                {TEX_STYLING_PRESETS.map(p => (
                  <button
                    key={p.id}
                    className={`tex-styler-preset-card ${p.id === activePreset.id ? 'active' : ''}`}
                    onClick={() => handleSelectPreset(p)}
                  >
                    <span style={{ fontWeight: 600 }}>{p.name.split(' ')[0]}</span>
                    <span style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>{p.rawTex}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="tex-styler-section-title">自定义 LaTeX 公式</div>
              <input
                type="text"
                value={rawTex}
                onChange={e => {
                  setErrorMsg('');
                  setRawTex(e.target.value);
                }}
                placeholder="例如: \int_0^1 x^2 dx = \frac{1}{3}"
                className="tex-styler-input"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="tex-styler-footer">
          <div style={{ fontSize: 11, color: '#8892b0' }}>
            {errorMsg ? (
              <span role="alert" style={{ color: '#fca5a5' }}>{errorMsg}</span>
            ) : (
              '彩色公式使用 MathTex 扩展；渲染时需要现有的可信扩展授权，并需安装 LaTeX。'
            )}
          </div>
          <div className="tex-styler-action-btn-row">
            <button className="tex-styler-btn-secondary" onClick={handleCopyCode}>
              {copied ? <Check size={14} color="#48bb78" /> : <Copy size={14} />}
              <span>{copied ? '已复制 Manim 代码' : '复制 Python 代码'}</span>
            </button>
            <button className="tex-styler-btn-primary" onClick={handleInsert} disabled={inserted}>
              {inserted ? <Check size={14} /> : <Sparkles size={14} />}
              <span>插入到动画编排</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
