import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as Blockly from 'blockly/core';
import { ChevronDown, Maximize, Minus, Plus, Search, Undo2, Redo2, X } from 'lucide-react';
import { createAction, getBlockDefinition } from '../core/catalog';
import type { Project } from '../core/types';
import {
  actionSignature, actionsToWorkspace, applyWorkspaceRename, createToolbox, detachedBlockCount,
  loadProjectWorkspace, registerStudioBlocks, releaseReferenceNames, saveWorkspace,
  setReferenceNames, setRenameErrorHandler, START_TYPE, workspaceToActions,
} from './model';
import './studio-blocks.css';

export interface StudioBlocksHandle {
  undo(): void;
  redo(): void;
  zoomIn(): void;
  zoomOut(): void;
  fit(): void;
  highlight(id: string | null): void;
  addBlock(type: string): void;
  focusSearch(): void;
}

export interface StudioBlocksProps {
  project: Project;
  onChange(project: Project): void;
  onSelect?(blockId: string | null): void;
  selectedBlockId?: string | null;
  highlightedBlockId?: string | null;
  readOnly?: boolean;
  onWorkspaceError?(message: string | null): void;
}

const theme = Blockly.Theme.defineTheme('anyvis-studio', {
  name: 'anyvis-studio', base: Blockly.Themes.Classic,
  componentStyles: {
    workspaceBackgroundColour: '#f8f9fc', toolboxBackgroundColour: '#ffffff', toolboxForegroundColour: '#4b5268',
    flyoutBackgroundColour: '#f1f2f8', flyoutForegroundColour: '#343b53', flyoutOpacity: 0.98,
    scrollbarColour: '#bfc5d6', scrollbarOpacity: 0.5, insertionMarkerColour: '#6458e8', insertionMarkerOpacity: 0.4,
    markerColour: '#6458e8', cursorColour: '#6458e8',
  },
  fontStyle: { family: 'Inter, PingFang SC, Microsoft YaHei, system-ui, sans-serif', weight: '500', size: 12 },
  startHats: true,
});

function keepNewNamesUnique(workspace: Blockly.Workspace, ids: string[]): void {
  // Rename a newly dragged constructor, but keep copied multi-block programs
  // intact: their expressions and group lists need an explicit semantic rename.
  if (ids.length !== 1) return;
  const newIds = new Set(ids);
  const used = new Set<string>();
  const renamed = new Map<string, string>();
  for (const block of workspace.getAllBlocks(false)) {
    if (newIds.has(block.id)) continue;
    const definition = getBlockDefinition(block.type.replace(/^anyvis2_/, ''));
    if (definition?.createsObject) used.add(String(block.getFieldValue('name')));
  }
  for (const id of ids) {
    const block = workspace.getBlockById(id);
    if (!block) continue;
    const definition = getBlockDefinition(block.type.replace(/^anyvis2_/, ''));
    if (!definition?.createsObject) continue;
    const original = String(block.getFieldValue('name'));
    let name = original;
    let count = 2;
    while (used.has(name)) name = `${original}${definition.objectKind === 'tracker' ? '_' : ' '}${count++}`;
    if (name !== original) { block.setFieldValue(name, 'name'); renamed.set(original, name); }
    used.add(name);
  }
  if (!renamed.size) return;
  // Dropdown validation must see the newly assigned names before references
  // inside a duplicated stack are rewritten.
  setReferenceNames(workspace, []);
  for (const id of ids) {
    const block = workspace.getBlockById(id);
    if (!block) continue;
    const definition = getBlockDefinition(block.type.replace(/^anyvis2_/, ''));
    definition?.fields.filter((field) => field.type === 'object').forEach((field) => {
      const replacement = renamed.get(String(block.getFieldValue(field.name)));
      if (replacement) block.setFieldValue(replacement, field.name);
    });
  }
}

export const StudioBlocks = forwardRef<StudioBlocksHandle, StudioBlocksProps>(function StudioBlocks({
  project, onChange, onSelect, selectedBlockId, highlightedBlockId, readOnly = false, onWorkspaceError,
}, ref) {
  const host = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const workspace = useRef<Blockly.WorkspaceSvg | null>(null);
  const latest = useRef({ project, onChange, onSelect, onWorkspaceError });
  const lastActions = useRef('');
  const lastState = useRef('');
  const updateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [query, setQuery] = useState('');
  const [stats, setStats] = useState({ connected: 0, detached: 0 });
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(90);
  latest.current = { project, onChange, onSelect, onWorkspaceError };

  const zoom = (direction: number) => {
    workspace.current?.zoomCenter(direction);
    if (workspace.current) setScale(Math.round(workspace.current.scale * 100));
  };
  const fit = () => {
    workspace.current?.zoomToFit();
    if (workspace.current) setScale(Math.round(workspace.current.scale * 100));
  };

  useImperativeHandle(ref, () => ({
    undo: () => workspace.current?.undo(false),
    redo: () => workspace.current?.undo(true),
    zoomIn: () => zoom(1), zoomOut: () => zoom(-1), fit,
    highlight: (id) => { workspace.current?.highlightBlock(id); if (id) workspace.current?.centerOnBlock(id, true); },
    focusSearch: () => search.current?.focus(),
    addBlock: (type) => {
      const ws = workspace.current;
      if (!ws || readOnly) return;
      const definition = getBlockDefinition(type);
      if (!definition) return;
      const action = createAction(type);
      const wrapped = actionsToWorkspace([action]) as { blocks: { blocks: Blockly.serialization.blocks.State[] } };
      const state = wrapped.blocks.blocks[0].next?.block;
      if (!state) return;
      Blockly.Events.setGroup(true);
      try {
        const block = Blockly.serialization.blocks.append(state, ws, { recordUndo: true }) as Blockly.BlockSvg;
        const start = ws.getTopBlocks(false).find((item) => item.type === START_TYPE);
        let last = start;
        while (last?.getNextBlock()) last = last.getNextBlock()!;
        if (last?.nextConnection && block.previousConnection) last.nextConnection.connect(block.previousConnection);
        block.select();
        ws.centerOnBlock(block.id, true);
      } finally { Blockly.Events.setGroup(false); }
    },
  }));

  useEffect(() => {
    if (!host.current) return;
    registerStudioBlocks();
    const ws = Blockly.inject(host.current, {
      toolbox: readOnly ? undefined : createToolbox(), theme, renderer: 'zelos',
      trashcan: !readOnly, sounds: false, readOnly,
      move: { scrollbars: true, drag: true, wheel: true },
      zoom: { controls: false, wheel: true, startScale: 0.9, minScale: 0.35, maxScale: 1.5, scaleSpeed: 1.15 },
      grid: { spacing: 24, length: 2, colour: '#dce0ec', snap: false },
      maxBlocks: 2000,
    });
    workspace.current = ws;
    let loading = true;
    let disposed = false;
    const publishError = (message: string | null) => { setError(message); latest.current.onWorkspaceError?.(message); };
    setRenameErrorHandler(ws, publishError);
    const updateStats = () => {
      const detached = detachedBlockCount(ws);
      setStats({ connected: Math.max(0, ws.getAllBlocks(false).length - detached - 1), detached });
      setScale(Math.round(ws.scale * 100));
    };
    try {
      loadProjectWorkspace(latest.current.project, ws);
      lastActions.current = actionSignature(latest.current.project.actions);
      lastState.current = JSON.stringify(Blockly.serialization.workspaces.save(ws));
      updateStats();
    } catch (cause) { publishError(cause instanceof Error ? cause.message : '无法读取积木，请检查项目文件。'); }
    loading = false;

    const publish = () => {
      if (loading || disposed) return;
      if (ws.isDragging()) { updateTimer.current = setTimeout(publish, 100); return; }
      try {
        const actions = workspaceToActions(ws);
        setReferenceNames(ws, actions);
        updateStats();
        publishError(null);
        const state = Blockly.serialization.workspaces.save(ws);
        const serialized = JSON.stringify(state);
        if (serialized === lastState.current) return;
        lastState.current = serialized;
        lastActions.current = actionSignature(actions);
        latest.current.onChange({ ...latest.current.project, actions, workspace: saveWorkspace(ws, actions) });
      } catch (cause) { publishError(cause instanceof Error ? cause.message : '积木连接存在问题。'); }
    };
    const listener = (event: Blockly.Events.Abstract) => {
      if (event.type === Blockly.Events.SELECTED && 'newElementId' in event) {
        const id = typeof event.newElementId === 'string' ? event.newElementId : null;
        latest.current.onSelect?.(id === 'anyvis-scene-start' ? null : id);
      }
      if (event.type === Blockly.Events.VIEWPORT_CHANGE) setScale(Math.round(ws.scale * 100));
      if (loading || event.isUiEvent || event.type === Blockly.Events.FINISHED_LOADING) return;
      if (event.type === Blockly.Events.BLOCK_CHANGE) {
        try { applyWorkspaceRename(ws, event as Blockly.Events.BlockChange); }
        catch (cause) { publishError(cause instanceof Error ? cause.message : '无法更新对象引用。'); }
      }
      if (event.type === Blockly.Events.BLOCK_CREATE && 'ids' in event && Array.isArray(event.ids)) {
        const group = Blockly.Events.getGroup();
        Blockly.Events.setGroup(event.group || true);
        try { keepNewNamesUnique(ws, event.ids); } finally { Blockly.Events.setGroup(group); }
      }
      if (updateTimer.current) clearTimeout(updateTimer.current);
      updateTimer.current = setTimeout(publish, 70);
    };
    ws.addChangeListener(listener);
    const observer = new ResizeObserver(() => Blockly.svgResize(ws));
    observer.observe(host.current);
    const frame = requestAnimationFrame(() => { Blockly.svgResize(ws); ws.scroll(36, 28); });
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      if (updateTimer.current) clearTimeout(updateTimer.current);
      observer.disconnect(); ws.removeChangeListener(listener); releaseReferenceNames(ws); ws.dispose();
      workspace.current = null;
    };
  }, [project.id, readOnly]);

  useEffect(() => {
    const ws = workspace.current;
    if (!ws) return;
    const signature = actionSignature(project.actions);
    if (signature === lastActions.current) return;
    if (updateTimer.current) clearTimeout(updateTimer.current);
    try {
      loadProjectWorkspace(project, ws);
      lastActions.current = signature;
      lastState.current = JSON.stringify(Blockly.serialization.workspaces.save(ws));
      const detached = detachedBlockCount(ws);
      setStats({ connected: Math.max(0, ws.getAllBlocks(false).length - detached - 1), detached });
      setError(null); onWorkspaceError?.(null);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '无法更新积木。';
      setError(message); onWorkspaceError?.(message);
    }
  }, [project, onWorkspaceError]);

  useEffect(() => {
    const ws = workspace.current;
    if (!ws || readOnly) return;
    ws.updateToolbox(createToolbox(query));
    setReferenceNames(ws, latest.current.project.actions);
    if (query.trim()) ws.getToolbox()?.selectItemByPosition(0);
    else ws.getToolbox()?.clearSelection();
  }, [query, readOnly, project.id]);

  useEffect(() => {
    workspace.current?.highlightBlock(highlightedBlockId ?? selectedBlockId ?? null);
  }, [highlightedBlockId, selectedBlockId]);

  return <section className="av-block-editor" aria-label="动画积木工作区">
    <div className="av-block-toolbar">
      <div className="av-block-search"><Search size={15} aria-hidden="true" />
        <input ref={search} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索积木，如：圆、公式、移动" aria-label="搜索积木" />
        {query && <button type="button" aria-label="清空搜索" onClick={() => setQuery('')}><X size={14} /></button>}
      </div>
      <div className="av-block-history">
        <button type="button" aria-label="撤销积木修改" title="撤销（Ctrl / ⌘ Z）" onClick={() => workspace.current?.undo(false)} disabled={readOnly}><Undo2 size={16} /></button>
        <button type="button" aria-label="重做积木修改" title="重做（Ctrl / ⌘ Shift Z）" onClick={() => workspace.current?.undo(true)} disabled={readOnly}><Redo2 size={16} /></button>
      </div>
    </div>
    <div className="av-block-canvas" ref={host} />
    <div className="av-block-footer">
      <span className={error || stats.detached ? 'av-block-status is-warning' : 'av-block-status'}>
        {error || (stats.detached ? `${stats.detached} 块未连接，不进入动画` : `${stats.connected} 块积木 · 顺序播放`)}
      </span>
      <div className="av-block-zoom">
        <button type="button" title="缩小" aria-label="缩小积木" onClick={() => zoom(-1)}><Minus size={14} /></button>
        <button type="button" className="av-block-scale" title="完整显示积木" onClick={fit}>{scale}% <ChevronDown size={10} /></button>
        <button type="button" title="放大" aria-label="放大积木" onClick={() => zoom(1)}><Plus size={14} /></button>
        <button type="button" title="适应工作区" aria-label="完整显示积木" onClick={fit}><Maximize size={14} /></button>
      </div>
    </div>
    {!stats.connected && !error && <div className="av-block-empty-hint" aria-hidden="true">
      <span>从左侧选择积木</span><span>拖到「当动画开始」下面</span>
    </div>}
  </section>;
});
