import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Action, FieldDefinition, FieldValue, MediaAsset } from './core/types';
import { getBlockDefinition } from './core/catalog';
import { flattenActions } from './authoring';
import { createApiValueEditor, type ApiValueEditorElement } from './blocks/api-value-field';
import { normaliseHexColour } from './blocks/colour-field';
import { RateFuncPicker } from './RateFuncPicker';
import { MathSymbolPalette } from './MathSymbolPalette';
import { ExpressionPlotPreview } from './ExpressionPlotPreview';
import { PositionPad } from './PositionPad';
import { copyTextToClipboard } from './browser-utils';
import './object-manager.css';

const finiteNumber = (value: unknown) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export interface ActionInspectorProps {
  action: Action;
  actions: Action[];
  fields?: string[];
  assets?: MediaAsset[];
  onChange(fields: Record<string, FieldValue>): void;
  onError?(message: string): void;
}

const COMMON_PALETTE = ['#58C4DD', '#83C167', '#FFFF00', '#FC6255', '#9A72AC', '#FF862F', '#FFFFFF', '#222222'];

function isMathTexField(actionType: string, fieldName: string): boolean {
  return (
    fieldName === 'tex' ||
    (fieldName === 'text' && (actionType === 'formula' || actionType === 'matching_tex'))
  );
}

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
  const targetFields = fields ? allFields.filter(f => fields.includes(f.name)).sort((a, b) => fields.indexOf(a.name) - fields.indexOf(b.name)) : allFields;

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
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeEditorRef = useRef<ApiValueEditorElement | null>(null);
  const editorMountedRef = useRef(false);
  const apiPreviousFocusRef = useRef<HTMLElement | null>(null);
  const apiModalWrapperRef = useRef<HTMLDivElement | null>(null);
  const mathInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const scrubCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    return () => {
      scrubCleanupRef.current?.();
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
        copyTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    setCopiedField(null);
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
  }, [action.id]);

  const stepNumericField = (start: number, f: FieldDefinition, ticks: number, shiftKey: boolean, altKey: boolean): number => {
    const integerOnly = f.step === 1;
    const baseStep = f.step || 0.1;
    const rawStep = shiftKey ? baseStep * 10 : altKey ? (integerOnly ? baseStep : baseStep * 0.1) : baseStep;
    const step = integerOnly ? Math.max(1, Math.round(rawStep)) : rawStep;
    let nextVal = Math.round((start + ticks * step) * 10000) / 10000;
    if (integerOnly) nextVal = Math.round(nextVal);
    if (typeof f.min === 'number') nextVal = Math.max(f.min, nextVal);
    if (typeof f.max === 'number') nextVal = Math.min(f.max, nextVal);
    return nextVal;
  };

  const handleScrubPointerDown = (e: React.PointerEvent, f: FieldDefinition) => {
    e.preventDefault();
    scrubCleanupRef.current?.();
    const startX = e.clientX;
    const raw = drafts[f.name] ?? '';
    const startVal = !isNaN(parseFloat(raw)) ? parseFloat(raw) : (typeof f.default === 'number' ? f.default : 0);
    let pendingVal = startVal;
    let moved = false;

    const cleanup = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      scrubCleanupRef.current = null;
    };

    const onPointerMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (dx === 0 && !moved) return;
      moved = true;
      const nextVal = stepNumericField(startVal, f, Math.round(dx / 4), ev.shiftKey, ev.altKey);
      pendingVal = nextVal;
      setDrafts(prev => ({ ...prev, [f.name]: String(nextVal) }));
    };

    const onPointerUp = () => {
      cleanup();
      // Commit once at drag end so scrubbing produces a single undo step.
      if (moved && pendingVal !== startVal) onChangeRef.current({ [f.name]: pendingVal });
    };

    const onPointerCancel = () => {
      cleanup();
      setDrafts(prev => ({ ...prev, [f.name]: raw }));
    };

    scrubCleanupRef.current = cleanup;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
  };

  const disposeApiEditor = useCallback((restoreFocus = false) => {
    if (activeEditorRef.current) {
      activeEditorRef.current.dispose();
      activeEditorRef.current = null;
    }
    editorMountedRef.current = false;
    setActiveApiField(null);
    const prev = apiPreviousFocusRef.current;
    apiPreviousFocusRef.current = null;
    if (restoreFocus && prev?.isConnected) prev.focus();
  }, []);

  const closeApiEditor = useCallback(() => disposeApiEditor(true), [disposeApiEditor]);

  const openApiEditor = useCallback((field: FieldDefinition) => {
    apiPreviousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setActiveApiField(field);
  }, []);

  useEffect(() => {
    disposeApiEditor(false);
    return () => disposeApiEditor(false);
  }, [action.id, disposeApiEditor]);

  useEffect(() => {
    if (!activeApiField) return;
    const wrapper = apiModalWrapperRef.current;
    const focusTarget = wrapper?.querySelector<HTMLElement>('select, input, textarea, button') ?? wrapper;
    focusTarget?.focus();
  }, [activeApiField]);

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
      const rejectNumeric = (message: string) => {
        onError?.(message);
        setDrafts(prev => ({
          ...prev,
          [field.name]: currentVal !== undefined ? String(currentVal) : (field.default !== undefined ? String(field.default) : '')
        }));
      };
      if (field.max !== undefined && num > field.max) {
        rejectNumeric(`${field.label}不能大于 ${field.max}`);
        return;
      }
      if (field.step === 1 && !Number.isInteger(num)) {
        rejectNumeric(`${field.label}须为整数`);
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
          onClick={() => openApiEditor(field)}
          aria-label={`配置${field.label}`}
        >
          <span>{raw ? '已配置参数' : '默认参数'}</span>
          <span className="ai-fields-api-badge">{raw || '点击展开配置'}</span>
        </button>
      );
    }

    // 4. Color
    if (field.type === 'color') {
      const hexValue = normaliseHexColour(currentVal)?.toLowerCase() ?? '#58c4dd';
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
            options={field.options}
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

    const isMathTex = isMathTexField(action.type, field.name);

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
              } else if (field.type === 'number' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                e.preventDefault();
                const raw = drafts[field.name] ?? '';
                const currentNum = parseFloat(raw);
                const valid = !isNaN(currentNum) ? currentNum : (typeof field.default === 'number' ? field.default : 0);
                const nextVal = stepNumericField(valid, field, e.key === 'ArrowUp' ? 1 : -1, e.shiftKey, e.altKey);
                const strVal = String(nextVal);
                handleDraftChange(field.name, strVal);
                onChange({ [field.name]: nextVal });
              }
            }}
            aria-label={field.label}
          />
          {field.type === 'number' && (
            <span
              className="ai-fields-scrub-handle"
              title="按住拖拽快速调整数值（Shift 加速，Alt 微调）"
              aria-label={`按住拖拽调整${field.label}`}
              onPointerDown={e => handleScrubPointerDown(e, field)}
            >
              ↔
            </span>
          )}
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
      {targetFields.map(field => {
        const isFieldMathTex = isMathTexField(action.type, field.name);
        const isFieldModified =
          field.default !== undefined &&
          action.fields[field.name] !== undefined &&
          String(action.fields[field.name]) !== String(field.default);

        return (
          <div
            key={field.name}
            className="ai-fields-row"
            data-field={field.name}
            title={field.description || field.label}
          >
            <div className="ai-fields-label-row">
              <label className="ai-fields-label">{field.label}</label>
              <div className="ai-fields-label-actions">
                {isFieldMathTex && (
                  <button
                    type="button"
                    className="ai-fields-copy-tex-btn"
                    title="复制 LaTeX 公式代码"
                    aria-label="复制 LaTeX 公式代码"
                    onClick={async () => {
                      const val = String(drafts[field.name] ?? action.fields[field.name] ?? '');
                      if (await copyTextToClipboard(val)) {
                        setCopiedField(field.name);
                        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
                        copyTimerRef.current = setTimeout(() => {
                          copyTimerRef.current = null;
                          setCopiedField(null);
                        }, 2000);
                      }
                    }}
                  >
                    {copiedField === field.name ? '✓ 已复制' : '📋 复制'}
                  </button>
                )}
                {isFieldModified && (
                  <button
                    type="button"
                    className="ai-fields-reset-btn"
                    title={`重置为默认值 (${field.default})`}
                    aria-label={`重置${field.label}为默认值`}
                    onClick={() => {
                      handleDraftChange(field.name, String(field.default));
                      onChange({ [field.name]: field.default });
                    }}
                  >
                    ↺ 重置
                  </button>
                )}
              </div>
            </div>
            {renderControl(field)}
            {field.description && <p className="ai-fields-help">{field.description}</p>}
          </div>
        );
      })}

      {activeApiField && (
        <div className="ai-fields-modal-overlay" onClick={closeApiEditor}>
          <div
            ref={apiModalWrapperRef}
            className="ai-fields-modal-wrapper"
            role="dialog"
            aria-modal="true"
            aria-label={`配置${activeApiField.label}`}
            tabIndex={-1}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                closeApiEditor();
              }
            }}
          >
            <div ref={modalContainerCallbackRef} />
          </div>
        </div>
      )}
      {(targetFields.some(f => f.name === 'x') || targetFields.some(f => f.name === 'dx')) && <details className="ai-position-tools"><summary>位置辅助 · 九宫格与拖动定位</summary>
        {targetFields.some(f => f.name === 'y') && targetFields.some(f => f.name === 'x') && (
          <PositionPad
            mode="position"
            x={finiteNumber(action.fields.x)}
            y={finiteNumber(action.fields.y)}
            onChange={({ x: nextX, y: nextY }) => {
              setDrafts(prev => ({ ...prev, x: String(nextX), y: String(nextY) }));
              onChange({ x: nextX, y: nextY });
            }}
          />
        )}
        {targetFields.some(f => f.name === 'dy') && targetFields.some(f => f.name === 'dx') && (
          <PositionPad
            mode="shift"
            x={finiteNumber(action.fields.dx)}
            y={finiteNumber(action.fields.dy)}
            onChange={({ x: nextDx, y: nextDy }) => {
              setDrafts(prev => ({ ...prev, dx: String(nextDx), dy: String(nextDy) }));
              onChange({ dx: nextDx, dy: nextDy });
            }}
          />
        )}
      </details>}
    </div>
  );
};
