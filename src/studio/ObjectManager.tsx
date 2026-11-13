import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Action, FieldValue, Project } from './core/types';
import { CURATED_BLOCK_CATALOG, BLOCK_CATALOG, getBlockDefinition } from './core/catalog';
import { flattenActions, duplicateAction, managedDefinition, managedObject, objectDependents, removeAction, reorderAction, updateAction } from './authoring';
import { ActionInspector } from './ActionInspector';
import { AssetShelf } from './AssetShelf';
import { TrackerControlBar } from './TrackerControlBar';
import { ObjectDialog } from './ObjectDialog';
import './object-manager.css';

export interface ObjectManagerProps {
  project: Project;
  selectedId: string | null;
  onSelect(id: string): void;
  onChange(project: Project): void;
  onAdd(type: string): void;
  onError(message: string): void;
  onMusicSettings?(): void;
}

const ANIMATION_FIELDS = new Set(['appear', 'duration', 'mode', 'run_time', 'rate_func', 'lag_ratio']);
const COMMON_FIELD_NAMES = new Set([
  'name',
  'text',
  'formula',
  'expression',
  'x',
  'y',
  'z',
  'radius',
  'width',
  'height',
  'side_length',
  'color',
  'fill',
  'opacity',
  'stroke_width',
  'stroke_color',
  'members',
  'font_size',
  'fontSize'
]);

function renderObjectIcon(action: Action) {
  const def = getBlockDefinition(action.type);
  const color =
    typeof action.fields.color === 'string' && action.fields.color.startsWith('#')
      ? action.fields.color
      : '#58C4DD';
  const type = action.type.toLowerCase();
  const kind = def?.objectKind || '';

  if (type.includes('circle') || type.includes('arc') || kind === 'curve') {
    return (
      <svg width="24" height="24" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="10" fill="none" stroke={color} strokeWidth="2.5" />
      </svg>
    );
  }
  if (type.includes('image') || action.type === 'image_asset') {
    const assetId = action.fields.asset;
    if (assetId) {
      return (
        <img
          src={`/api/assets/${encodeURIComponent(String(assetId))}/file`}
          alt={String(action.fields.name || '图片')}
          className="om-thumb-img"
          onError={e => {
            (e.currentTarget as HTMLElement).style.display = 'none';
          }}
        />
      );
    }
    return (
      <svg width="24" height="24" viewBox="0 0 32 32">
        <rect x="5" y="5" width="22" height="22" rx="3" fill="none" stroke={color} strokeWidth="2" />
        <circle cx="11" cy="11" r="2.5" fill={color} />
        <path d="M6,23 L14,15 L21,22 L26,17" fill="none" stroke={color} strokeWidth="2" />
      </svg>
    );
  }
  if (type.includes('square') || type.includes('rect')) {
    return (
      <svg width="24" height="24" viewBox="0 0 32 32">
        <rect x="6" y="6" width="20" height="20" rx="2" fill="none" stroke={color} strokeWidth="2.5" />
      </svg>
    );
  }
  if (type.includes('dot') || type.includes('point')) {
    return (
      <svg width="24" height="24" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="6" fill={color} />
      </svg>
    );
  }
  if (type.includes('arrow') || type.includes('vector')) {
    return (
      <svg width="24" height="24" viewBox="0 0 32 32">
        <line x1="6" y1="24" x2="24" y2="8" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        <polyline points="16,8 24,8 24,16" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (type.includes('line')) {
    return (
      <svg width="24" height="24" viewBox="0 0 32 32">
        <line x1="6" y1="24" x2="26" y2="8" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (type.includes('text') || kind === 'text') {
    return (
      <svg width="24" height="24" viewBox="0 0 32 32">
        <text x="16" y="23" textAnchor="middle" fill={color} fontSize="20" fontWeight="bold">T</text>
      </svg>
    );
  }
  if (type.includes('latex') || type.includes('formula') || kind === 'formula') {
    return (
      <svg width="24" height="24" viewBox="0 0 32 32">
        <text x="16" y="22" textAnchor="middle" fill={color} fontSize="17" fontStyle="italic" fontWeight="600">fx</text>
      </svg>
    );
  }
  if (type.includes('axes') || type.includes('plane') || type.includes('number_line') || kind === 'axes') {
    return (
      <svg width="24" height="24" viewBox="0 0 32 32">
        <path d="M6,6 V26 H26" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        <polyline points="4,9 6,6 8,9" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
        <polyline points="23,24 26,26 23,28" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (type.includes('polygon') || type.includes('poly') || type.includes('triangle')) {
    return (
      <svg width="24" height="24" viewBox="0 0 32 32">
        <polygon points="16,6 26,25 6,25" fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
    );
  }
  if (type.includes('matrix') || type.includes('table') || kind === 'matrix') {
    return (
      <svg width="24" height="24" viewBox="0 0 32 32">
        <rect x="7" y="7" width="7" height="7" rx="1" fill="none" stroke={color} strokeWidth="2" />
        <rect x="18" y="7" width="7" height="7" rx="1" fill="none" stroke={color} strokeWidth="2" />
        <rect x="7" y="18" width="7" height="7" rx="1" fill="none" stroke={color} strokeWidth="2" />
        <rect x="18" y="18" width="7" height="7" rx="1" fill="none" stroke={color} strokeWidth="2" />
      </svg>
    );
  }
  if (type.includes('group')) {
    return (
      <svg width="24" height="24" viewBox="0 0 32 32">
        <circle cx="12" cy="14" r="7" fill="none" stroke={color} strokeWidth="2" />
        <rect x="14" y="12" width="12" height="12" rx="1" fill="none" stroke={color} strokeWidth="2" />
      </svg>
    );
  }
  return (
    <svg width="24" height="24" viewBox="0 0 32 32">
      <rect x="6" y="6" width="20" height="20" rx="5" fill="none" stroke={color} strokeWidth="2" />
      <circle cx="16" cy="16" r="3" fill={color} />
    </svg>
  );
}

export const ObjectManager: React.FC<ObjectManagerProps> = ({
  project,
  selectedId,
  onSelect,
  onChange,
  onAdd,
  onError,
  onMusicSettings
}) => {
  const objects = useMemo(
    () => flattenActions(project.actions).filter(managedObject),
    [project.actions]
  );
  const topObjects = useMemo(
    () => project.actions.filter(managedObject),
    [project.actions]
  );

  // Default to selecting the first object when selectedId is empty / not in objects
  const effectiveSelectedId = objects.some(object => object.id === selectedId) ? selectedId : objects[0]?.id ?? null;

  const selectedObject = useMemo(
    () => objects.find(o => o.id === effectiveSelectedId) || null,
    [objects, effectiveSelectedId]
  );

  const [isExpanded, setIsExpanded] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addTab, setAddTab] = useState<'curated' | 'api' | 'assets'>('curated');
  const [searchQuery, setSearchQuery] = useState('');
  const [trayFilter, setTrayFilter] = useState<'all' | 'shapes' | 'text' | 'axes'>('all');
  const [traySearch, setTraySearch] = useState('');

  const filteredTrayObjects = useMemo(() => {
    let list = objects;
    if (trayFilter !== 'all') {
      list = list.filter(object => {
        const kind = getBlockDefinition(object.type)?.objectKind;
        const category = ['text', 'formula', 'number'].includes(kind || '') ? 'text'
          : ['axes', 'axes3d', 'number_line'].includes(kind || '') ? 'axes' : 'shapes';
        return category === trayFilter;
      });
    }

    if (traySearch.trim()) {
      const q = traySearch.trim().toLowerCase();
      list = list.filter(o => {
        const name = String(o.fields.name || '').toLowerCase();
        const label = (getBlockDefinition(o.type)?.label || o.type).toLowerCase();
        return name.includes(q) || label.includes(q);
      });
    }
    return list;
  }, [objects, trayFilter, traySearch]);

  const cardButtons = useRef(new Map<string, HTMLButtonElement>());
  const filtering = trayFilter !== 'all' || Boolean(traySearch.trim());
  const clearFilters = () => { setTrayFilter('all'); setTraySearch(''); };
  useEffect(() => { setTrayFilter('all'); setTraySearch(''); }, [project.id]);
  const visibleCardIds = JSON.stringify(filteredTrayObjects.map(object => object.id));
  useEffect(() => {
    cardButtons.current.get(effectiveSelectedId || '')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [effectiveSelectedId, visibleCardIds]);
  const navigateCards = (event: React.KeyboardEvent<HTMLButtonElement>, id: string) => {
    const index = filteredTrayObjects.findIndex(object => object.id === id);
    const last = filteredTrayObjects.length - 1;
    const next = event.key === 'ArrowRight' ? Math.min(last, index + 1)
      : event.key === 'ArrowLeft' ? Math.max(0, index - 1)
      : event.key === 'Home' ? 0 : event.key === 'End' ? last : -1;
    if (next < 0) return;
    event.preventDefault(); event.stopPropagation();
    const object = filteredTrayObjects[next];
    onSelect(object.id);
    cardButtons.current.get(object.id)?.focus();
  };

  const handleMoveLayer = (e: React.MouseEvent, id: string, dir: -1 | 1) => {
    e.stopPropagation();
    const idx = topObjects.findIndex(o => o.id === id);
    if (idx === -1) {
      onError('复合片段内部的动作请在积木中调整顺序。');
      return;
    }
    try {
      if (dir === -1 && idx > 0) {
        const prevId = topObjects[idx - 1].id;
        const next = reorderAction(project, id, prevId);
        onChange(next);
      } else if (dir === 1 && idx < topObjects.length - 1) {
        const nextObjId = topObjects[idx + 1].id;
        const nextObjPos = project.actions.findIndex(a => a.id === nextObjId);
        const beforeId = nextObjPos >= 0 ? (project.actions[nextObjPos + 1]?.id ?? null) : null;
        const next = reorderAction(project, id, beforeId);
        onChange(next);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '调整图层顺序失败';
      onError(msg);
    }
  };

  // Curated managed definitions
  const curatedDefinitions = useMemo(
    () => CURATED_BLOCK_CATALOG.filter(managedDefinition),
    []
  );

  // API classes that create visual objects
  const apiDefinitions = useMemo(
    () => BLOCK_CATALOG.filter(b => b.apiId && managedDefinition(b)),
    []
  );

  const filteredCatalog = useMemo(() => {
    const list = addTab === 'curated' ? curatedDefinitions : apiDefinitions;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      item =>
        item.label.toLowerCase().includes(q) ||
        item.type.toLowerCase().includes(q) ||
        (item.keywords || []).some(k => k.toLowerCase().includes(q)) ||
        (item.tooltip || '').toLowerCase().includes(q)
    );
  }, [addTab, curatedDefinitions, apiDefinitions, searchQuery]);

  const handleDuplicate = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    try {
      const result = duplicateAction(project, id);
      onChange(result.project);
      onSelect(result.action.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : `复制对象 ${name} 失败`;
      onError(msg);
    }
  };

  const handleDelete = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    const dependents = objectDependents(project, id);
    if (dependents.length > 0) {
      onError(`此对象仍被 ${dependents.length} 个动作使用，请先修改或移除这些动作。`);
      return;
    }
    try {
      const next = removeAction(project, id);
      onChange(next);
      if (effectiveSelectedId === id) {
        const remaining = objects.filter(o => o.id !== id);
        onSelect(remaining[0]?.id || '');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : `删除对象 ${name} 失败`;
      onError(msg);
    }
  };

  const handleInspectorChange = (fields: Record<string, FieldValue>) => {
    if (!selectedObject) return;
    try {
      const next = updateAction(project, selectedObject.id, fields);
      onChange(next);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '更新对象属性失败';
      onError(msg);
    }
  };

  // Compute fields to display for selected object
  const selectedDef = selectedObject ? getBlockDefinition(selectedObject.type) : undefined;
  const nonAnimFields = useMemo(() => {
    if (!selectedDef) return [];
    return selectedDef.fields.filter(f => !ANIMATION_FIELDS.has(f.name));
  }, [selectedDef]);

  const commonFields = useMemo(() => {
    const matched = nonAnimFields.filter(f => COMMON_FIELD_NAMES.has(f.name));
    const priority = ['name','text','tex','radius','side','width','height','fill','opacity','color','x','y','z'];
    matched.sort((a, b) => (priority.indexOf(a.name) < 0 ? 99 : priority.indexOf(a.name)) - (priority.indexOf(b.name) < 0 ? 99 : priority.indexOf(b.name)));
    return matched.length >= 2 ? matched : nonAnimFields.slice(0, 5);
  }, [nonAnimFields]);

  const hasMoreFields = nonAnimFields.length > commonFields.length;

  return (
    <div className="om-container">
      {/* Bottom: Scratch-style Horizontal Cards Tray */}
      <div className="om-cards-tray">
        <div className="om-cards-tray-header">
          <div className="om-tray-title-group">
            <span>对象 ({objects.length})</span>
            {(objects.length >= 3 || trayFilter !== 'all') && (
              <div className="om-tray-filter-pills" role="group" aria-label="对象类型分类过滤">
                <button
                  type="button"
                  className={`om-tray-pill ${trayFilter === 'all' ? 'active' : ''}`}
                  aria-pressed={trayFilter === 'all'} onClick={() => setTrayFilter('all')}
                >
                  全部
                </button>
                <button
                  type="button"
                  className={`om-tray-pill ${trayFilter === 'shapes' ? 'active' : ''}`}
                  aria-pressed={trayFilter === 'shapes'} onClick={() => setTrayFilter('shapes')}
                >
                  图形
                </button>
                <button
                  type="button"
                  className={`om-tray-pill ${trayFilter === 'text' ? 'active' : ''}`}
                  aria-pressed={trayFilter === 'text'} onClick={() => setTrayFilter('text')}
                >
                  文字
                </button>
                <button
                  type="button"
                  className={`om-tray-pill ${trayFilter === 'axes' ? 'active' : ''}`}
                  aria-pressed={trayFilter === 'axes'} onClick={() => setTrayFilter('axes')}
                >
                  坐标
                </button>
              </div>
            )}
          </div>
          <div className="om-tray-tools-group">
            {(objects.length >= 4 || traySearch.length > 0) && (
              <input
                type="text"
                className="om-tray-search-input"
                placeholder="搜索对象…"
                value={traySearch}
                onChange={e => setTraySearch(e.target.value)}
                aria-label="快速筛选对象角色"
                onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setTraySearch(''); } }}
              />
            )}
            {onMusicSettings && (
              <button
                type="button"
                className="om-shelf-open-btn"
                aria-label="对象管理器默认配乐设置"
                onClick={onMusicSettings}
              >
                ♫ {project.scene.backgroundMusic === 'piano' ? '钢琴' : '无配乐'}
              </button>
            )}
            <button
              type="button"
              className="om-shelf-open-btn"
              onClick={() => {
                setAddTab('assets');
                setIsAddModalOpen(true);
              }}
              aria-label="查看项目素材库"
            >
              📁 素材库 ({project.assets?.length || 0})
            </button>
          </div>
        </div>
        {filtering && <div className="om-filter-status" role="status">
          <span>显示 {filteredTrayObjects.length} / {objects.length} 个对象</span>
          <button type="button" onClick={clearFilters}>清除筛选</button>
        </div>}
        <div className="om-cards-scroll-area" role="region" aria-label="对象卡片列表">
          {!filteredTrayObjects.length && <p className="om-empty-results">{filtering ? '没有匹配的对象，请更换关键词或清除筛选。' : '添加第一个对象，开始创作。'}</p>}
          {filteredTrayObjects.map(obj => {
            const isSelected = obj.id === effectiveSelectedId;
            const def = getBlockDefinition(obj.type);
            const name = String(obj.fields.name || '未命名');
            const label = def?.label || obj.type;
            const topIdx = topObjects.findIndex(o => o.id === obj.id);

            return (
              <div
                key={obj.id}
                className={`om-card ${isSelected ? 'om-card-selected' : ''}`}
                onClick={() => onSelect(obj.id)}
              >
                <div className="om-card-actions">
                  {topIdx > 0 && (
                    <button
                      type="button"
                      className="om-card-layer-btn"
                      tabIndex={isSelected ? 0 : -1}
                      title="提前创建（不改变画面叠放层级）"
                      aria-label={`提前创建 ${name}`}
                      onClick={e => handleMoveLayer(e, obj.id, -1)}
                    >
                      ◀
                    </button>
                  )}
                  {topIdx !== -1 && topIdx < topObjects.length - 1 && (
                    <button
                      type="button"
                      className="om-card-layer-btn"
                      tabIndex={isSelected ? 0 : -1}
                      title="延后创建（不改变画面叠放层级）"
                      aria-label={`延后创建 ${name}`}
                      onClick={e => handleMoveLayer(e, obj.id, 1)}
                    >
                      ▶
                    </button>
                  )}
                  <button
                    type="button"
                    className="om-card-del-btn"
                    tabIndex={isSelected ? 0 : -1}
                    onClick={e => handleDelete(e, obj.id, name)}
                    aria-label={`删除对象 ${name}`}
                    title={`删除对象 ${name}`}
                  >
                    ✕
                  </button>
                </div>
                <button type="button" className="om-card-select"
                  ref={node => { if (node) cardButtons.current.set(obj.id, node); else cardButtons.current.delete(obj.id); }}
                  tabIndex={isSelected || (!filteredTrayObjects.some(object => object.id === effectiveSelectedId) && obj.id === filteredTrayObjects[0]?.id) ? 0 : -1}
                  aria-pressed={isSelected} aria-label={`选择对象 ${name}，类型 ${label}`}
                  title={`${name} · ${label}；方向键切换对象`}
                  onKeyDown={event => navigateCards(event, obj.id)}>
                <div className="om-card-icon">{renderObjectIcon(obj)}</div>
                <div className="om-card-info">
                  <span className="om-card-name" title={name}>
                    {name}
                  </span>
                  <span className="om-card-type" title={label}>
                    {label}
                  </span>
                </div>
                </button>
              </div>
            );
          })}

          <button
            type="button"
            className="om-card-add-trigger"
            onClick={() => setIsAddModalOpen(true)}
            aria-label="添加新对象"
            title="添加新对象"
          >
            <span className="om-card-add-plus">+</span>
            <span>添加对象</span>
          </button>
        </div>
      </div>

      {/* Top: Scratch-style Compact Properties Bar */}
      <div className="om-property-bar">
        {selectedObject ? (
          <>
            <div className="om-prop-header-row">
              <div className="om-prop-left">
                <div className="om-prop-icon">{renderObjectIcon(selectedObject)}</div>
                <span className="om-selected-name" title={String(selectedObject.fields.name || '未命名')}>{String(selectedObject.fields.name || '未命名')}</span><span className="om-prop-badge">{selectedDef?.label || selectedObject.type}</span>
              </div>
              <div className="om-prop-right">
                {hasMoreFields && (
                  <button
                    type="button"
                    className="om-expand-toggle-btn"
                    onClick={() => setIsExpanded(true)}
                    aria-expanded={isExpanded}
                    title="展开查看并编辑全部高级参数"
                  >
                    全部参数 ({nonAnimFields.length}) ⚙️
                  </button>
                )}
                <button
                  type="button"
                  className="om-expand-toggle-btn"
                  onClick={e =>
                    handleDuplicate(e, selectedObject.id, String(selectedObject.fields.name || '未命名'))
                  }
                  aria-label={`复制对象 ${selectedObject.fields.name || '未命名'}`}
                  title={`复制对象 ${selectedObject.fields.name || '未命名'}`}
                >
                  复制 ⧉
                </button>
                <button
                  type="button"
                  className="om-delete-btn"
                  onClick={e =>
                    handleDelete(e, selectedObject.id, String(selectedObject.fields.name || '未命名'))
                  }
                  aria-label={`删除对象 ${selectedObject.fields.name || '未命名'}`}
                  title={`删除对象 ${selectedObject.fields.name || '未命名'}`}
                >
                  ✕
                </button>
              </div>
            </div>

            {filtering && !filteredTrayObjects.some(object => object.id === effectiveSelectedId) && <div className="om-selection-notice">当前对象不在筛选结果中。<button type="button" onClick={clearFilters}>显示当前对象</button></div>}
            <div className="om-prop-body-compact">
              <ActionInspector
                action={selectedObject}
                actions={project.actions}
                fields={commonFields.map(f => f.name)}
                assets={project.assets || []}
                onChange={handleInspectorChange}
                onError={onError}
              />
            </div>
          </>
        ) : (
          <div className="om-prop-empty-bar">
            <span>尚未选择对象，点击上方卡片选择或新建对象</span>
          </div>
        )}
      </div>

      {/* Advanced Parameters Drawer Overlay (does not displace cards tray) */}
      {isExpanded && selectedObject && (
        <div className="om-drawer-backdrop" onClick={() => setIsExpanded(false)}>
          <ObjectDialog
            className="om-drawer"
            onClose={() => setIsExpanded(false)}
            label={`${selectedObject.fields.name || '对象'}全部参数`}
          >
            <div className="om-drawer-header">
              <div className="om-drawer-title">
                <div className="om-drawer-icon">{renderObjectIcon(selectedObject)}</div>
                <span className="om-drawer-heading">
                  {selectedObject.fields.name || selectedDef?.label || '对象'} · 全部参数
                </span>
                <span className="om-drawer-badge">共 {nonAnimFields.length} 项</span>
              </div>
              <button
                type="button"
                className="om-drawer-close-btn"
                onClick={() => setIsExpanded(false)}
                aria-label="关闭参数面板"
              >
                ✕
              </button>
            </div>
            <div className="om-drawer-body">
              <ActionInspector
                action={selectedObject}
                actions={project.actions}
                fields={nonAnimFields.map(f => f.name)}
                assets={project.assets || []}
                onChange={handleInspectorChange}
                onError={onError}
              />
            </div>
          </ObjectDialog>
        </div>
      )}

      <details className="om-tracker-section">
        <summary>动态参数与函数联动</summary>
      <TrackerControlBar
        project={project}
        selectedId={selectedId}
        onSelect={onSelect}
        onChange={onChange}
        onError={onError}
      />
      </details>

      {/* Add Object Modal */}
      {isAddModalOpen && (
        <div className="om-modal-backdrop" onClick={() => setIsAddModalOpen(false)}>
          <ObjectDialog className="om-modal" onClose={() => setIsAddModalOpen(false)} label="添加对象">
            <div className="om-modal-header">
              <h4 className="om-modal-title">添加可视对象</h4>
              <button
                type="button"
                className="om-modal-close-btn"
                onClick={() => setIsAddModalOpen(false)}
                aria-label="关闭窗口"
              >
                ✕
              </button>
            </div>

            {addTab !== 'assets' && (
              <div className="om-search-bar">
                <input
                  type="text"
                  className="om-search-input"
                  placeholder="搜索图形、文字、公式或几何类..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  data-dialog-initial-focus
                  aria-label="搜索对象"
                />
              </div>
            )}

            <div className="om-tabs">
              <button
                type="button"
                className={`om-tab-btn ${addTab === 'curated' ? 'om-tab-btn-active' : ''}`}
                onClick={() => setAddTab('curated')}
              >
                常用图形 ({curatedDefinitions.length})
              </button>
              <button
                type="button"
                className={`om-tab-btn ${addTab === 'api' ? 'om-tab-btn-active' : ''}`}
                onClick={() => setAddTab('api')}
              >
                高级 API 类 ({apiDefinitions.length})
              </button>
              <button
                type="button"
                className={`om-tab-btn ${addTab === 'assets' ? 'om-tab-btn-active' : ''}`}
                onClick={() => setAddTab('assets')}
              >
                素材与音画 ({project.assets?.length || 0})
              </button>
            </div>

            <div className="om-modal-body">
              {addTab === 'assets' ? (
                <AssetShelf
                  project={project}
                  onProjectChange={onChange}
                  onSelectObject={id => {
                    onSelect(id);
                    setIsAddModalOpen(false);
                  }}
                  onError={onError}
                  onClose={() => setIsAddModalOpen(false)}
                />
              ) : filteredCatalog.length === 0 ? (
                <div className="om-asset-placeholder">
                  未匹配到符合条件的对象
                </div>
              ) : (
                <div className="om-catalog-grid">
                  {filteredCatalog.map(item => (
                    <button
                      key={item.type}
                      type="button"
                      className="om-catalog-card"
                      onClick={() => {
                        onAdd(item.type);
                        setIsAddModalOpen(false);
                        setSearchQuery('');
                      }}
                      title={item.tooltip || item.label}
                      aria-label={`添加 ${item.label}`}
                    >
                      <div className="om-catalog-icon">
                        {renderObjectIcon({ id: '', type: item.type, fields: {} })}
                      </div>
                      <div className="om-catalog-details">
                        <span className="om-catalog-label">{item.label}</span>
                        <span className="om-catalog-type">{item.category}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </ObjectDialog>
        </div>
      )}
    </div>
  );
};
