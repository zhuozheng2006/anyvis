import { useMemo, useRef, useState } from 'react';
import { ArrowRight, Clapperboard, Search, X } from 'lucide-react';
import { flattenActions } from './authoring';
import type { Project } from './core/types';
import type { SavedProject } from './storage';
import './saved-projects.css';

export function SavedProjects({ items, currentProject, onOpen, onContinue }: {
  items: SavedProject[];
  currentProject: Project;
  onOpen(project: Project): void;
  onContinue(): void;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('recent');
  const searchInput = useRef<HTMLInputElement>(null);
  const clearSearch = () => { setQuery(''); searchInput.current?.focus(); };
  const projects = useMemo(() => {
    // The active work may be newer than the last automatic save, or not saved yet.
    const current = items.find(item => item.project.id === currentProject.id);
    return [{ project: currentProject, savedAt: current?.savedAt || 0 }, ...items.filter(item => item.project.id !== currentProject.id)];
  }, [items, currentProject]);
  const visible = useMemo(() => {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return projects.filter(({ project }) => terms.every(term => project.name.toLocaleLowerCase().includes(term))).sort((a, b) =>
      sort === 'name' ? a.project.name.localeCompare(b.project.name, 'zh-CN', { numeric: true }) : b.savedAt - a.savedAt);
  }, [projects, query, sort]);

  return <section className="saved-projects" aria-label="本机作品">
    <div className="saved-projects-toolbar">
      <div className="gallery-search">
        <Search size={16} aria-hidden="true" />
        <input ref={searchInput} aria-label="搜索作品" placeholder="按作品名称搜索…" value={query} onChange={event => setQuery(event.target.value)} />
        {query && <button type="button" className="icon-button" aria-label="清除作品搜索" onClick={clearSearch}><X size={14} /></button>}
      </div>
      <label>排序 <select aria-label="作品排序" value={sort} onChange={event => setSort(event.target.value)}>
        <option value="recent">最近保存</option><option value="name">作品名称</option>
      </select></label>
    </div>
    <p className="saved-projects-count" role="status">{query.trim() ? `找到 ${visible.length} / ${projects.length} 个作品` : `共 ${projects.length} 个作品`}</p>
    <div className="saved-project-list">
      {visible.map(({ project, savedAt }) => {
        const current = project.id === currentProject.id;
        return <button type="button" key={project.id} className={current ? 'current-project' : undefined}
          aria-label={`${current ? '继续编辑' : '打开作品'}：${project.name || '未命名动画'}`}
          onClick={() => current ? onContinue() : onOpen(project)}>
          <span className="project-file-icon"><Clapperboard size={21} /></span>
          <span><strong>{project.name || '未命名动画'}</strong><small>{flattenActions(project.actions).length} 个积木 · {savedAt ? new Date(savedAt).toLocaleString('zh-CN') : '当前编辑中'}</small></span>
          {current && <span className="saved-projects-current">当前作品</span>}<ArrowRight size={16} />
        </button>;
      })}
    </div>
    {!visible.length && <div className="saved-projects-empty"><p>没有找到匹配的作品</p><button type="button" className="small-button" onClick={clearSearch}>显示全部作品</button></div>}
  </section>;
}
