import { describe, expect, it, vi } from 'vitest';
import { filterCommandPaletteItems, type CommandPaletteItem } from './CommandPalette';

describe('CommandPalette search and filtering', () => {
  const sampleItems: CommandPaletteItem[] = [
    {
      id: 'studio:render',
      title: '更新预览画面',
      subtitle: '重新编译并渲染 Manim 预览 (⌘/Ctrl + Enter)',
      category: '快捷指令',
      colour: '#38bdf8',
      keywords: 'render preview 渲染 预览',
      run: vi.fn(),
    },
    {
      id: 'jump:c1',
      title: '定位对象：单位圆',
      subtitle: '类型：圆形',
      category: '场景对象',
      colour: '#58C4DD',
      keywords: 'circle 单位圆',
      run: vi.fn(),
    },
    {
      id: 'add:formula',
      title: '添加：数学公式 (LaTeX)',
      subtitle: '创建 LaTeX 公式对象',
      category: '新建 · 文字与公式',
      colour: '#9A72AC',
      keywords: 'formula tex math 公式',
      run: vi.fn(),
    },
  ];

  it('returns top items when query is empty', () => {
    expect(filterCommandPaletteItems(sampleItems, '')).toHaveLength(3);
  });

  it('matches multi-keyword queries across title, subtitle, category, and keywords', () => {
    const res1 = filterCommandPaletteItems(sampleItems, '定位 单位圆');
    expect(res1).toHaveLength(1);
    expect(res1[0].id).toBe('jump:c1');

    const res2 = filterCommandPaletteItems(sampleItems, 'latex 公式');
    expect(res2).toHaveLength(1);
    expect(res2[0].id).toBe('add:formula');
  });
});
