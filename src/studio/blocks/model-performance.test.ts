import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Blockly from 'blockly/core';
import { createAction } from '../core/catalog';
import { createEmptyProject } from '../core/project';
import type { Action } from '../core/types';
import { loadProjectWorkspace, releaseReferenceNames, saveWorkspace, setReferenceNames, workspaceToActions } from './model';

const workspaces: Blockly.Workspace[] = [];
function load(actions: Action[]) {
  const ws = new Blockly.Workspace(); workspaces.push(ws);
  loadProjectWorkspace({ ...createEmptyProject(), actions }, ws);
  return ws;
}
const target = (ws: Blockly.Workspace, action: Action) => ws.getBlockById(action.id)!.getField('target') as Blockly.FieldDropdown;
const options = (field: Blockly.FieldDropdown) => field.getOptions(false);
afterEach(() => {
  vi.restoreAllMocks();
  for (const ws of workspaces.splice(0)) { releaseReferenceNames(ws); ws.dispose(); }
});

describe('large workspace import and reference cache', () => {
  it('keeps menus cached for ordinary field edits without serializing all block fields', () => {
    const circle = createAction('circle', { name: '圆 A' });
    const move = createAction('move', { target: '圆 A' });
    const ws = load([circle, move]);
    const field = target(ws, move);
    const before = options(field);
    const getAllBlocks = vi.spyOn(ws, 'getAllBlocks');
    for (let i = 0; i < 50; i++) expect(options(field)).toBe(before);
    expect(getAllBlocks).not.toHaveBeenCalled();
    ws.getBlockById(circle.id)!.setFieldValue(2, 'radius');
    const reads = ws.getAllBlocks(false).map(block => vi.spyOn(block, 'getFieldValue'));
    setReferenceNames(ws, []);
    expect(options(field)).toBe(before);
    // Re-indexing declarations reads names only, not a full IR snapshot for
    // each reference/field in the potentially 500-block workspace.
    for (const read of reads) expect(read.mock.calls.every(([name]) => name === 'name')).toBe(true);
    expect(field.getText()).toBe('圆 A');
  });

  it('invalidates cached choices on rename, disable, detach, reconnect and deletion', () => {
    const circle = createAction('circle', { name: '圆 A' });
    const section = { ...createAction('sequence', { label: '对象' }), children: [circle] };
    const move = createAction('move', { target: '圆 A' });
    const ws = load([section, move]);
    const field = target(ws, move);
    const first = options(field);
    ws.getBlockById(circle.id)!.setFieldValue('圆 B', 'name');
    setReferenceNames(ws, []);
    expect(options(field)).not.toBe(first);
    expect(options(field)).toContainEqual(['圆 B', '圆 B']);
    expect(field.getText()).toBe('⚠ 已缺失：圆 A');
    field.setValue('圆 B');
    const container = ws.getBlockById(section.id)!;
    container.setDisabledReason(true, 'test'); setReferenceNames(ws, []);
    expect(field.getText()).toBe('⚠ 已禁用：圆 B');
    container.setDisabledReason(false, 'test'); setReferenceNames(ws, []);
    expect(field.getText()).toBe('圆 B');
    const declaration = ws.getBlockById(circle.id)!;
    declaration.unplug(true); setReferenceNames(ws, []);
    expect(field.getText()).toBe('⚠ 未连接：圆 B');
    container.getInput('BODY')!.connection!.connect(declaration.previousConnection!);
    setReferenceNames(ws, []);
    expect(field.getText()).toBe('圆 B');
    declaration.dispose(true); setReferenceNames(ws, []);
    expect(field.getText()).toBe('⚠ 已缺失：圆 B');
    expect(field.getValue()).toBe('圆 B');
  });

  it('round-trips 500 actions, preserves detached drafts and respects saved expansion', () => {
    const shapes = Array.from({ length: 249 }, (_, i) => createAction('circle', { name: `圆 ${i}`, radius: 0.1 + i / 1000 }));
    const section = { ...createAction('sequence', { label: '第一段' }), children: shapes };
    const moves = shapes.map(shape => createAction('move', { target: shape.fields.name, x: 1.25 }));
    const actions = [section, ...moves, createAction('wait', { duration: 0.5 })];
    const ws = load(actions);
    expect(ws.getAllBlocks(false)).toHaveLength(501);
    expect(ws.getBlockById(section.id)!.isCollapsed()).toBe(true);
    expect(workspaceToActions(ws)).toEqual(actions);
    ws.getBlockById(section.id)!.setCollapsed(false);
    const draft = ws.newBlock('anyvis2_circle'); draft.setFieldValue('未连接草稿', 'name');
    const saved = saveWorkspace(ws, actions);
    const restored = load([]);
    loadProjectWorkspace({ ...createEmptyProject(), actions, workspace: saved }, restored);
    expect(restored.getAllBlocks(false)).toHaveLength(502);
    expect(restored.getBlockById(section.id)!.isCollapsed()).toBe(false);
    expect(restored.getBlockById(draft.id)?.getFieldValue('name')).toBe('未连接草稿');
    expect(workspaceToActions(restored)).toEqual(actions);
    expect(options(target(restored, moves[0]))).not.toContainEqual(['未连接草稿', '未连接草稿']);
  });

  it('restores undo recording and the event transaction after a broken saved layout falls back', () => {
    const actions = [createAction('circle')];
    const ws = load(actions);
    const saved = saveWorkspace(ws, actions);
    saved.blockly = { blocks: { languageVersion: 0, blocks: [{ type: 'not_a_real_block' }] } };
    const previousGroup = Blockly.Events.getGroup();
    const previousUndo = Blockly.Events.getRecordUndo();
    Blockly.Events.setGroup('existing-transaction');
    Blockly.Events.setRecordUndo(true);
    try {
      loadProjectWorkspace({ ...createEmptyProject(), actions, workspace: saved }, ws);
      expect(workspaceToActions(ws)).toEqual(actions);
      expect(Blockly.Events.getRecordUndo()).toBe(true);
      expect(Blockly.Events.getGroup()).toBe('existing-transaction');
      expect(Blockly.Events.isEnabled()).toBe(true);
    } finally {
      Blockly.Events.setGroup(previousGroup);
      Blockly.Events.setRecordUndo(previousUndo);
    }
  });
});
