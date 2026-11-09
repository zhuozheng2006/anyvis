import React from 'react';
import { Type, Sigma, Circle, Square, Grid, ArrowUpRight, Plus } from 'lucide-react';
import './quick-add.css';

interface QuickAddToolbarProps {
  onAdd: (type: string) => void;
}

export const QuickAddToolbar: React.FC<QuickAddToolbarProps> = ({ onAdd }) => {
  return (
    <div className="quick-add-toolbar" role="toolbar" aria-label="快捷添加场景对象">
      <span className="quick-add-label">
        <Plus size={13} />
        <span>添加对象</span>
      </span>

      <button
        type="button"
        className="quick-add-btn"
        title="快速添加文字标题 (Text)"
        onClick={() => onAdd('text')}
      >
        <Type size={12} />
        <span>文字</span>
      </button>

      <button
        type="button"
        className="quick-add-btn"
        title="快速添加 LaTeX 数学公式 (Formula)"
        onClick={() => onAdd('formula')}
      >
        <Sigma size={12} />
        <span>公式</span>
      </button>

      <button
        type="button"
        className="quick-add-btn"
        title="快速添加几何圆 (Circle)"
        onClick={() => onAdd('circle')}
      >
        <Circle size={12} />
        <span>圆</span>
      </button>

      <button
        type="button"
        className="quick-add-btn"
        title="快速添加正方形 (Square)"
        onClick={() => onAdd('square')}
      >
        <Square size={12} />
        <span>正方形</span>
      </button>

      <button
        type="button"
        className="quick-add-btn"
        title="快速添加数学坐标系 (Axes)"
        onClick={() => onAdd('axes')}
      >
        <Grid size={12} />
        <span>坐标系</span>
      </button>

      <button
        type="button"
        className="quick-add-btn"
        title="快速添加向量箭头 (Arrow)"
        onClick={() => onAdd('arrow')}
      >
        <ArrowUpRight size={12} />
        <span>箭头</span>
      </button>
    </div>
  );
};
