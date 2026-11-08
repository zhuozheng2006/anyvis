import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Action, FieldDefinition, FieldValue, MediaAsset } from './core/types';
import { getBlockDefinition } from './core/catalog';
import { flattenActions } from './authoring';
import { createApiValueEditor, type ApiValueEditorElement } from './blocks/api-value-field';
import { RateFuncPicker } from './RateFuncPicker';
import { MathSymbolPalette } from './MathSymbolPalette';
import { ExpressionPlotPreview } from './ExpressionPlotPreview';
import './object-manager.css';

export interface ActionInspectorProps {
  action: Action;
  actions: Action[];
  fields?: string[];
  assets?: MediaAsset[];
  onChange(fields: Record<string, FieldValue>): void;
  onError?(message: string): void;
}

const COMMON_PALETTE = ['#58C4DD', '#83C167', '#FFFF00', '#FC6255', '#9A72AC', '#FF862F', '#FFFFFF', '#222222'];

export const ActionInspector: React.FC<ActionInspectorProps> = ({
  action,
  actions,
  fields,
  assets,
  onChange,
  onError
}) => {
  const definition = getBlockDefinition(action.type);
  const allFields = definition?.fields || [];
  const targetFields = fields ? allFields.filter(f => fields.includes(f.name)) : allFields;

  // Local drafts for editable text/number/multiline/expression fields
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  // Synchronize local drafts when external action fields change
  useEffect(() => {
    const nextDrafts: Record<string, string> = {};
    for (const f of allFields) {
      const val = action.fields[f.name];
      nextDrafts[f.name] = val !== undefined ? String(val) : (f.default !== undefined ? String(f.default) : '');
    }
    setDrafts(nextDrafts);
  }, [action.id, action.fields, definition]);

  // Keep fresh references for callbacks and actions to prevent re-opening or recreating DOM editor on parent re-renders
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const actionFieldsRef = useRef(action.fields);
  actionFieldsRef.current = action.fields;

  // API-value modal state & stable lifecycle
  const [activeApiField, setActiveApiField] = useState<FieldDefinition | null>(null);
  const activeEditorRef = useRef<ApiValueEditorElement | null>(null);
  const editorMountedRef = useRef(false);
  const mathInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const closeApiEditor = useCallback(() => {
    if (activeEditorRef.current) {
      activeEditorRef.current.dispose();
      activeEditorRef.current = null;
    }
    editorMountedRef.current = false;
    setActiveApiField(null);
  }, []);

  // Callback ref to mount the DOM editor once per active field opening, avoiding recreation on timeline/preview re-renders
  const modalContainerCallbackRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) {
        if (activeEditorRef.current) {
          activeEditorRef.current.dispose();
          activeEditorRef.current = null;
        }
        editorMountedRef.current = false;
        return;
      }
      if (activeApiField && !editorMountedRef.current) {
        editorMountedRef.current = true;
        const raw = String(actionFieldsRef.current[activeApiField.name] ?? '');
        // References from all createsObject actions (including ValueTracker, callbacks, color, etc.)
        const refs = flattenActions(actionsRef.current)
          .filter(a => getBlockDefinition(a.type)?.createsObject)
          .map(a => String(a.fields.name))
          .filter(Boolean);

        const editor = createApiValueEditor(
          activeApiField,
          raw,
          refs,
          (newVal: string) => {
            onChangeRef.current({ [activeApiField.name]: newVal });
            closeApiEditor();
          },
          () => {
            closeApiEditor();
          }
        );
        activeEditorRef.current = editor;
        node.replaceChildren(editor);
      }
    },
    [activeApiField, closeApiEditor]
  );

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      if (activeEditorRef.current) {
        activeEditorRef.current.dispose();
        activeEditorRef.current = null;
      }
    };
  }, []);

  // Compute available declared objects for object and object-list fields
  const allDeclaredObjects = useMemo(() => {
    return flattenActions(actions).filter(a => getBlockDefinition(a.type)?.createsObject);
  }, [actions]);

  const trackerValues = useMemo(() => {
    const map: Record<string, number> = {};
    for (const obj of allDeclaredObjects) {
      const def = getBlockDefinition(obj.type);
      if (def?.objectKind === 'tracker') {
        const name = String(obj.fields.name || '').trim();
        const val = Number(obj.fields.value ?? 0);
        if (name) {
          map[name] = Number.isFinite(val) ? val : 0;
        }
      }
    }
    return map;
  }, [allDeclaredObjects]);

  if (!definition) {
    return <div className="ai-fields-empty">未找到动作定义</div>;
  }

  const handleDraftChange = (fieldName: string, value: string) => {
    setDrafts(prev => ({ ...prev, [fieldName]: value }));
  };

  const commitDraft = (field: FieldDefinition) => {
    const draft = drafts[field.name];
    if (draft === undefined) return;
    const currentVal = action.fields[field.name];

    if (field.type === 'number') {
      const trimmed = draft.trim();
      if (trimmed === '') {
        onError?.(`${field.label}不能为空`);
        setDrafts(prev => ({
          ...prev,
          [field.name]: currentVal !== undefined ? String(currentVal) : (field.default !== undefined ? String(field.default) : '')
        }));
        return;
      }
      const num = Number(trimmed);
      if (!Number.isFinite(num)) {
        onError?.(`${field.label}必须是有效数字`);
        setDrafts(prev => ({
          ...prev,
          [field.name]: currentVal !== undefined ? String(currentVal) : (field.default !== undefined ? String(field.default) : '')
        }));
        return;
      }
      if (field.min !== undefined && num < field.min) {
        onError?.(`${field.label}不能小于 ${field.min}`);
        setDrafts(prev => ({
          ...prev,
          [field.name]: currentVal !== undefined ? String(currentVal) : (field.default !== undefined ? String(field.default) : '')
        }));
        return;
      }
      if (field.max !== undefined && num > field.max) {
        onError?.(`${field.label}不能大于 ${field.max}`);
        setDrafts(prev => ({
          ...prev,
          [field.name]: currentVal !== undefined ? String(currentVal) : (field.default !== undefined ? String(field.default) : '')
        }));
        return;
      }
      if (num !== currentVal) {
        onChange({ [field.name]: num });
      }
    } else if (field.type === 'text' || field.type === 'expression' || field.type === 'multiline') {
      if (draft !== String(currentVal ?? '')) {
        onChange({ [field.name]: draft });
      }
    }
  };

  const renderControl = (field: FieldDefinition) => {
    const currentVal = action.fields[field.name];

    // 1. Reference: object-list
    if (field.reference === 'object-list') {
      const eligibleObjects = allDeclaredObjects.filter(obj => {
        if (!field.objectKinds || !field.objectKinds.length) return true;
        const objDef = getBlockDefinition(obj.type);
        return objDef?.objectKind && field.objectKinds.includes(objDef.objectKind);
      });
      const selectedSet = new Set(
        String(currentVal || '')
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
      );

      const toggleMember = (name: string) => {
        const next = new Set(selectedSet);
        if (next.has(name)) next.delete(name);
        else next.add(name);
        onChange({ [field.name]: Array.from(next).join(', ') });
      };

      return (
        <div className="ai-fields-chips" role="group" aria-label={field.label}>
          {eligibleObjects.length === 0 ? (
            <span className="ai-fields-empty">（暂无可用对象）</span>
          ) : (
            eligibleObjects.map(obj => {
              const name = String(obj.fields.name || '');
              const active = selectedSet.has(name);
              return (
                <button
                  key={obj.id}
                  type="button"
                  className={`ai-fields-chip ${active ? 'ai-fields-chip-active' : ''}`}
                  onClick={() => toggleMember(name)}
                  aria-pressed={active}
                >
                  {name}
                </button>
              );
            })
          )}
        </div>
      );
    }

    // 2. Reference: object (or type === 'object')
    if (field.type === 'object' || field.reference === 'object') {
      const eligibleObjects = allDeclaredObjects.filter(obj => {
        if (!field.objectKinds || !field.objectKinds.length) return true;
        const objDef = getBlockDefinition(obj.type);
        return objDef?.objectKind && field.objectKinds.includes(objDef.objectKind);
      });

      return (
        <select
          className="ai-fields-select"
          value={String(currentVal ?? '')}
          onChange={e => onChange({ [field.name]: e.target.value })}
          aria-label={field.label}
        >
          {field.optional && <option value="">{field.emptyLabel || '（无）'}</option>}
          {field.name === 'receiver' && ['@scene', '@camera', '@frame', '@renderer'].map(name => <option key={name} value={name}>{name}</option>)}
          {currentVal && !eligibleObjects.some(obj => obj.fields.name === currentVal) && !(field.name === 'receiver' && ['@scene', '@camera', '@frame', '@renderer'].includes(String(currentVal))) && <option value={String(currentVal)}>未找到对象：{String(currentVal)}</option>}
          {eligibleObjects.map(obj => {
            const name = String(obj.fields.name || '');
            return (
              <option key={obj.id} value={name}>
                {name}
              </option>
            );
          })}
        </select>
      );
    }

    // 2b. Asset picker (field.name === 'asset')
    if (field.name === 'asset') {
      const expectedKind: 'image' | 'audio' =
        action.type === 'image_asset' || field.label.includes('图片') ? 'image' : 'audio';
      const availableAssets = (assets || []).filter(a => a.kind === expectedKind);
      const selectedId = String(currentVal ?? '');
      const selectedAsset = availableAssets.find(a => a.id === selectedId);

      return (
        <div className="ai-fields-asset-control">
          <select
            className="ai-fields-select ai-fields-asset-select"
            value={selectedId}
            onChange={e => onChange({ [field.name]: e.target.value })}
            aria-label={field.label}
          >
            {availableAssets.length === 0 ? (
              <option value="">（暂无可用的{expectedKind === 'image' ? '图片' : '配音'}素材）</option>
            ) : (
              <>
                {!selectedId && <option value="">选择{expectedKind === 'image' ? '图片' : '配音'}素材...</option>}
                {availableAssets.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.extension.toUpperCase()})
                  </option>
                ))}
              </>
            )}
            {selectedId && !selectedAsset && (
              <option value={selectedId}>
                {selectedId} (已引用外部素材)
              </option>
            )}
          </select>
          {expectedKind === 'image' && selectedId && (
            <div className="ai-fields-asset-preview">
              <img
                src={`/api/assets/${encodeURIComponent(selectedId)}/file`}
                alt={selectedAsset?.name || selectedId}
                className="ai-fields-asset-thumb"
                onError={e => {
                  (e.currentTarget as HTMLElement).style.display = 'none';
                }}
              />
            </div>
          )}
        </div>
      );
    }

    // 3. API-Value
    if (field.type === 'api-value') {
      const raw = String(currentVal ?? '');
      return (
        <button
          type="button"
          className="ai-fields-api-launcher"
          onClick={() => setActiveApiField(field)}
          aria-label={`配置${field.label}`}
        >
          <span>{raw ? '已配置参数' : '默认参数'}</span>
          <span className="ai-fields-api-badge">{raw || '点击展开配置'}</span>
        </button>
      );
    }

    // 4. Color
    if (field.type === 'color') {
      const hexValue = typeof currentVal === 'string' && currentVal.startsWith('#') ? currentVal : '#58C4DD';
      return (
        <div className="ai-fields-color-group">
          <input
            type="color"
            className="ai-fields-color-picker"
            value={hexValue}
            onChange={e => onChange({ [field.name]: e.target.value })}
            aria-label={field.label}
          />
          <div className="ai-fields-color-swatches">
            {COMMON_PALETTE.map(c => (
              <button
                key={c}
                type="button"
                className="ai-fields-swatch-btn"
                style={{ backgroundColor: c }}
                onClick={() => onChange({ [field.name]: c })}
                title={c}
                aria-label={`选择颜色 ${c}`}
              />
            ))}
          </div>
        </div>
      );
    }

    // 5. Select
    if (field.type === 'select') {
      if (field.name === 'easing' || field.name === 'rate_func' || field.label.includes('节奏') || field.label.includes('缓动')) {
        return (
          <RateFuncPicker
            value={String(currentVal ?? field.default ?? 'smooth')}
            onChange={val => onChange({ [field.name]: val })}
          />
        );
      }
      return (
        <select
          className="ai-fields-select"
          value={String(currentVal ?? field.default ?? '')}
          onChange={e => onChange({ [field.name]: e.target.value })}
          aria-label={field.label}
        >
          {(field.options || []).map(([optLabel, optVal]) => (
            <option key={optVal} value={optVal}>
              {optLabel}
            </option>
          ))}
        </select>
      );
    }

    const isMathTex =
      field.name === 'tex' ||
      (field.name === 'text' && (action.type === 'formula' || action.type === 'matching_tex')) ||
      action.type === 'formula' ||
      action.type === 'matching_tex';

    // 6. Multiline
    if (field.type === 'multiline') {
      return (
        <div className="ai-fields-multiline-wrapper">
          <textarea
            ref={isMathTex ? (mathInputRef as React.RefObject<HTMLTextAreaElement>) : undefined}
            className="ai-fields-textarea"
            value={drafts[field.name] ?? ''}
            onChange={e => handleDraftChange(field.name, e.target.value)}
            onBlur={() => commitDraft(field)}
            aria-label={field.label}
          />
          {isMathTex && (
            <MathSymbolPalette
              inputRef={mathInputRef}
              value={drafts[field.name] ?? ''}
              onChange={newVal => {
                handleDraftChange(field.name, newVal);
                onChange({ [field.name]: newVal });
              }}
            />
          )}
        </div>
      );
    }

    // 7. Number, Text, Expression (single-line draft inputs)
    return (
      <div className="ai-fields-text-wrapper">
        <div className="ai-fields-control">
          <input
            ref={isMathTex ? (mathInputRef as React.RefObject<HTMLInputElement>) : undefined}
            type="text"
            inputMode={field.type === 'number' ? 'decimal' : undefined}
            className="ai-fields-input"
            value={drafts[field.name] ?? ''}
            onChange={e => handleDraftChange(field.name, e.target.value)}
            onBlur={() => commitDraft(field)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                commitDraft(field);
                e.currentTarget.blur();
              }
            }}
            aria-label={field.label}
          />
          {field.suffix && <span className="ai-fields-suffix">{field.suffix}</span>}
        </div>
        {isMathTex && (
          <MathSymbolPalette
            inputRef={mathInputRef}
            value={drafts[field.name] ?? ''}
            onChange={newVal => {
              handleDraftChange(field.name, newVal);
              onChange({ [field.name]: newVal });
            }}
          />
        )}
        {field.type === 'expression' && (
          <ExpressionPlotPreview
            expression={drafts[field.name] ?? ''}
            trackerValues={trackerValues}
            onSelectPreset={presetExpr => {
              handleDraftChange(field.name, presetExpr);
              onChange({ [field.name]: presetExpr });
            }}
          />
        )}
      </div>
    );
  };

  return (
    <div className="ai-fields-container">
      {targetFields.map(field => (
        <div
          key={field.name}
          className="ai-fields-row"
          data-field={field.name}
          title={field.description || field.label}
        >
          <div className="ai-fields-label-row">
            <label className="ai-fields-label">{field.label}</label>
          </div>
          {renderControl(field)}
          {field.description && <p className="ai-fields-help">{field.description}</p>}
        </div>
      ))}

      {activeApiField && (
        <div className="ai-fields-modal-overlay" onClick={closeApiEditor}>
          <div className="ai-fields-modal-wrapper" onClick={e => e.stopPropagation()}>
            <div ref={modalContainerCallbackRef} />
          </div>
        </div>
      )}
    </div>
  );
};
