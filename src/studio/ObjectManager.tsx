import React, { useMemo, useState } from 'react';
import type { Action, FieldValue, Project } from './core/types';
import { CURATED_BLOCK_CATALOG, BLOCK_CATALOG, getBlockDefinition } from './core/catalog';
import { flattenActions, duplicateAction, managedDefinition, managedObject, objectDependents, removeAction, updateAction } from './authoring';
import { ActionInspector } from './ActionInspector';
import { AssetShelf } from './AssetShelf';
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

  // Default to selecting the first object when selectedId is empty / not in objects
  const effectiveSelectedId = selectedId || (objects.length > 0 ? objects[0].id : null);

  const selectedObject = useMemo(
    () => objects.find(o => o.id === effectiveSelectedId) || null,
    [objects, effectiveSelectedId]
  );

  const [isExpanded, setIsExpanded] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addTab, setAddTab] = useState<'curated' | 'api' | 'assets'>('curated');
  const [searchQuery, setSearchQuery] = useState('');

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
    return matched.length >= 2 ? matched : nonAnimFields.slice(0, 5);
  }, [nonAnimFields]);

  const hasMoreFields = nonAnimFields.length > commonFields.length;

  return (
    <div className="om-container">
      {/* Top: Scratch-style Compact Properties Bar */}
      <div className="om-property-bar">
        {selectedObject ? (
          <>
            <div className="om-prop-header-row">
              <div className="om-prop-left">
                <div className="om-prop-icon">{renderObjectIcon(selectedObject)}</div>
                <span className="om-prop-badge">{selectedDef?.label || selectedObject.type}</span>
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
            <span>尚未选择对象，点击下方卡片选择或新建对象</span>
          </div>
        )}
      </div>

      {/* Advanced Parameters Drawer Overlay (does not displace cards tray) */}
      {isExpanded && selectedObject && (
        <div className="om-drawer-backdrop" onClick={() => setIsExpanded(false)}>
          <div
            className="om-drawer"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`${selectedObject.fields.name || '对象'}全部参数`}
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
          </div>
        </div>
      )}

      {/* Bottom: Scratch-style Horizontal Cards Tray */}
      <div className="om-cards-tray">
        <div className="om-cards-tray-header">
          <span>对象角色 ({objects.length})</span>
          {onMusicSettings && <button type="button" className="om-shelf-open-btn" aria-label="对象管理器默认配乐设置" onClick={onMusicSettings}>♫ {project.scene.backgroundMusic === 'piano' ? '钢琴配乐' : '无配乐'}</button>}
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
        <div className="om-cards-scroll-area" role="region" aria-label="对象卡片列表">
          {objects.map(obj => {
            const isSelected = obj.id === effectiveSelectedId;
            const def = getBlockDefinition(obj.type);
            const name = String(obj.fields.name || '未命名');
            const label = def?.label || obj.type;

            return (
              <div
                key={obj.id}
                tabIndex={0}
                role="button"
                aria-selected={isSelected}
                aria-label={`选择对象 ${name}，类型 ${label}`}
                className={`om-card ${isSelected ? 'om-card-selected' : ''}`}
                onClick={() => onSelect(obj.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(obj.id);
                  }
                }}
              >
                <button
                  type="button"
                  className="om-card-del-btn"
                  onClick={e => handleDelete(e, obj.id, name)}
                  aria-label={`删除对象 ${name}`}
                  title={`删除对象 ${name}`}
                >
                  ✕
                </button>
                <div className="om-card-icon">{renderObjectIcon(obj)}</div>
                <div className="om-card-info">
                  <span className="om-card-name" title={name}>
                    {name}
                  </span>
                  <span className="om-card-type" title={label}>
                    {label}
                  </span>
                </div>
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

      {/* Add Object Modal */}
      {isAddModalOpen && (
        <div className="om-modal-backdrop" onClick={() => setIsAddModalOpen(false)}>
          <div className="om-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="添加对象">
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
                  autoFocus
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
          </div>
        </div>
      )}
    </div>
  );
};
