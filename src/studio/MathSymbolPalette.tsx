import React, { useCallback, useEffect, useRef } from 'react';
import './math-symbol-palette.css';

export interface MathSymbolPaletteProps {
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  value: string;
  onChange(newValue: string): void;
}

interface SymbolItem {
  label: string;
  template: string; // token to insert or wrap
  cursorOffset?: number; // relative cursor position after insertion
  isWrapper?: boolean;
}

const CATEGORIES: { name: string; items: SymbolItem[] }[] = [
  {
    name: '分块匹配',
    items: [
      { label: '{{ 拆分块 }}', template: '{{}}', isWrapper: true, cursorOffset: 2 },
    ],
  },
  {
    name: '常用结构',
    items: [
      { label: '分式 a/b', template: '\\frac{a}{b}', cursorOffset: 6 },
      { label: '根号 √x', template: '\\sqrt{x}', isWrapper: true, cursorOffset: 6 },
      { label: '上标 x²', template: '^{2}', cursorOffset: 2 },
      { label: '下标 xᵢ', template: '_{i}', cursorOffset: 2 },
      { label: '求和 ∑', template: '\\sum_{i=1}^{n}', cursorOffset: 13 },
      { label: '积分 ∫', template: '\\int_{a}^{b}', cursorOffset: 12 },
      { label: '极限 lim', template: '\\lim_{x \\to 0}', cursorOffset: 14 },
    ],
  },
  {
    name: '希腊字母',
    items: [
      { label: 'π', template: '\\pi ' },
      { label: 'θ', template: '\\theta ' },
      { label: 'α', template: '\\alpha ' },
      { label: 'β', template: '\\beta ' },
      { label: 'γ', template: '\\gamma ' },
      { label: 'λ', template: '\\lambda ' },
      { label: 'σ', template: '\\sigma ' },
      { label: 'ω', template: '\\omega ' },
      { label: 'Δ', template: '\\Delta ' },
      { label: 'μ', template: '\\mu ' },
    ],
  },
  {
    name: '关系与运算',
    items: [
      { label: '±', template: '\\pm ' },
      { label: '×', template: '\\times ' },
      { label: '÷', template: '\\div ' },
      { label: '·', template: '\\cdot ' },
      { label: '≈', template: '\\approx ' },
      { label: '≠', template: '\\neq ' },
      { label: '≤', template: '\\le ' },
      { label: '≥', template: '\\ge ' },
      { label: '∞', template: '\\infty ' },
      { label: '→', template: '\\to ' },
      { label: '∂', template: '\\partial ' },
      { label: '向量 v⃗', template: '\\vec{v}', isWrapper: true, cursorOffset: 5 },
    ],
  },
];

/**
 * Extracts Manim matching double-brace tokens {{...}} for visual preview.
 */
export function extractFormulaTokens(tex: string): { text: string; isChunk: boolean }[] {
  if (!tex) return [];
  const regex = /\{\{([\s\S]*?)\}\}/g;
  const result: { text: string; isChunk: boolean }[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(tex)) !== null) {
    if (match.index > lastIndex) {
      result.push({ text: tex.slice(lastIndex, match.index), isChunk: false });
    }
    result.push({ text: match[1], isChunk: true });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < tex.length) {
    result.push({ text: tex.slice(lastIndex), isChunk: false });
  }

  return result;
}

export const MathSymbolPalette: React.FC<MathSymbolPaletteProps> = ({
  inputRef,
  value,
  onChange,
}) => {
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (focusTimerRef.current) {
        clearTimeout(focusTimerRef.current);
        focusTimerRef.current = null;
      }
    };
  }, []);

  const insertSymbol = useCallback(
    (item: SymbolItem) => {
      const input = inputRef.current;
      if (!input) {
        onChange(value + item.template);
        return;
      }

      const start = input.selectionStart ?? value.length;
      const end = input.selectionEnd ?? value.length;
      const selected = value.slice(start, end);

      let nextVal = '';
      let newCursor = start;

      if (item.isWrapper && selected) {
        if (item.template === '{{}}') {
          nextVal = value.slice(0, start) + `{{${selected}}}` + value.slice(end);
          newCursor = start + selected.length + 4;
        } else if (item.template.includes('{x}')) {
          const replaced = item.template.replace('{x}', `{${selected}}`);
          nextVal = value.slice(0, start) + replaced + value.slice(end);
          newCursor = start + replaced.length;
        } else if (item.template.includes('{v}')) {
          const replaced = item.template.replace('{v}', `{${selected}}`);
          nextVal = value.slice(0, start) + replaced + value.slice(end);
          newCursor = start + replaced.length;
        } else {
          nextVal = value.slice(0, start) + item.template + value.slice(end);
          newCursor = start + item.template.length;
        }
      } else {
        nextVal = value.slice(0, start) + item.template + value.slice(end);
        newCursor = start + (item.cursorOffset ?? item.template.length);
      }

      onChange(nextVal);

      if (focusTimerRef.current) {
        clearTimeout(focusTimerRef.current);
      }
      focusTimerRef.current = setTimeout(() => {
        focusTimerRef.current = null;
        if (!input.isConnected) return;
        input.focus();
        input.setSelectionRange(newCursor, newCursor);
      }, 10);
    },
    [inputRef, value, onChange]
  );

  const tokens = extractFormulaTokens(value);
  const chunkCount = tokens.filter(t => t.isChunk).length;

  return (
    <div className="math-symbol-palette" aria-label="数学公式辅助工具">
      {chunkCount > 0 && (
        <div className="math-token-preview" title="Manim 动态匹配分块 (TransformMatchingTex)">
          <span className="math-token-header">分块预览 ({chunkCount} 个独立动画匹配块):</span>
          <div className="math-token-chips">
            {tokens.map((token, i) => (
              <span
                key={i}
                className={token.isChunk ? 'math-chunk-pill' : 'math-plain-pill'}
              >
                {token.text || '␣'}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="math-categories">
        {CATEGORIES.map(cat => (
          <div key={cat.name} className="math-category-group">
            <span className="math-category-title">{cat.name}</span>
            <div className="math-symbol-buttons">
              {cat.items.map(item => (
                <button
                  key={item.label}
                  type="button"
                  className="math-symbol-btn"
                  onClick={() => insertSymbol(item)}
                  title={`插入 ${item.template}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
