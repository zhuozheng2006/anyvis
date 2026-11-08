import React, { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { Project } from './core/types';
import { CURATED_BLOCK_CATALOG, getBlockDefinition } from './core/catalog';
import { actionLabel, actionTrack, flattenActions, managedObject } from './authoring';
import './command-palette.css';

export interface CommandPaletteItem {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  colour: string;
  keywords: string;
  run(): void;
}

export function filterCommandPaletteItems(
  items: ReadonlyArray<CommandPaletteItem>,
  query: string
): CommandPaletteItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items.slice(0, 32);
  const terms = q.split(/\s+/).filter(Boolean);
  return items
    .filter(item => {
      const haystack = `${item.title} ${item.subtitle} ${item.category} ${item.keywords}`.toLowerCase();
      return terms.every(t => haystack.includes(t));
    })
    .slice(0, 40);
}

export interface CommandPaletteProps {
  project: Project;
  onClose(): void;
  onSelectAction(id: string): void;
  onAddBlock(type: string): void;
  studioActions: ReadonlyArray<{
    id: string;
    title: string;
    subtitle: string;
    colour?: string;
    keywords?: string;
    run(): void;
  }>;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  project,
  onClose,
  onSelectAction,
  onAddBlock,
  studioActions,
}) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const allItems = useMemo<CommandPaletteItem[]>(() => {
    const list: CommandPaletteItem[] = [];

    // 1. Studio actions
    for (const act of studioActions) {
      list.push({
        id: `studio:${act.id}`,
        title: act.title,
        subtitle: act.subtitle,
        category: '快捷指令',
        colour: act.colour || '#38bdf8',
        keywords: act.keywords || '',
        run: act.run,
      });
    }

    // 2. Existing objects & actions in current project
    for (const action of flattenActions(project.actions)) {
      const def = getBlockDefinition(action.type);
      const isObj = managedObject(action);
      const name = isObj ? String(action.fields.name || def?.label || action.type) : actionLabel(action);
      const track = actionTrack(action);
      list.push({
        id: `jump:${action.id}`,
        title: isObj ? `定位对象：${name}` : `定位动作：${name}`,
        subtitle: isObj ? `类型：${def?.label || action.type}` : `轨道：${track}`,
        category: isObj ? '场景对象' : '时间轴动作',
        colour: def?.colour || '#83C167',
        keywords: `${action.type} ${name} ${track}`,
        run: () => onSelectAction(action.id),
      });
    }

    // 3. Curated catalog blocks to add
    for (const block of CURATED_BLOCK_CATALOG) {
      if (['code', 'audio_play'].includes(block.type)) continue;
      list.push({
        id: `add:${block.type}`,
        title: `添加：${block.label}`,
        subtitle: block.tooltip || block.category,
        category: `新建 · ${block.category}`,
        colour: block.colour || '#58C4DD',
        keywords: `${block.type} ${(block.keywords || []).join(' ')}`,
        run: () => onAddBlock(block.type),
      });
    }

    return list;
  }, [project.actions, studioActions, onSelectAction, onAddBlock]);

  const filtered = useMemo(
    () => filterCommandPaletteItems(allItems, query),
    [allItems, query]
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const executeItem = (item?: CommandPaletteItem) => {
    if (!item) return;
    onClose();
    item.run();
  };

  return (
    <div className="cmd-palette-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className="cmd-palette-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="全局命令面板"
        onKeyDown={e => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(i => (filtered.length ? (i + 1) % filtered.length : 0));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(i => (filtered.length ? (i - 1 + filtered.length) % filtered.length : 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            executeItem(filtered[activeIndex]);
          }
        }}
      >
        <div className="cmd-palette-search-row">
          <Search size={17} className="cmd-palette-search-icon" />
          <input
            type="text"
            className="cmd-palette-input"
            placeholder="搜索命令、定位场景对象、或快速添加图形与动画… (⌘/Ctrl + K)"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
            aria-label="搜索命令或对象"
          />
          <span className="cmd-palette-esc-badge">ESC</span>
        </div>

        <div className="cmd-palette-list" role="listbox">
          {filtered.length === 0 ? (
            <div className="cmd-palette-empty">未找到匹配的命令、对象或积木</div>
          ) : (
            filtered.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={idx === activeIndex}
                className={`cmd-palette-item ${idx === activeIndex ? 'active' : ''}`}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => executeItem(item)}
              >
                <div className="cmd-palette-item-left">
                  <span className="cmd-palette-dot" style={{ background: item.colour }} />
                  <span className="cmd-palette-item-title">{item.title}</span>
                  <span className="cmd-palette-item-sub">{item.subtitle}</span>
                </div>
                <span className="cmd-palette-category">{item.category}</span>
              </button>
            ))
          )}
        </div>

        <div className="cmd-palette-footer">
          <span>↑↓ 选择 · Enter 执行 · Esc 关闭</span>
          <span>共 {filtered.length} 项可用操作</span>
        </div>
      </div>
    </div>
  );
};
