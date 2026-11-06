import { afterEach, describe, expect, it } from 'vitest';
import * as Blockly from 'blockly/core';
import { createAction } from '../core/catalog';
import type { Action, Project } from '../core/types';
import { applyWorkspaceRename, loadProjectWorkspace, registerStudioBlocks, setReferenceNames, setRenameErrorHandler, workspaceToActions } from './model';

registerStudioBlocks();
const workspaces: Blockly.Workspace[] = [];
function project(actions: Action[]): Project {
  return { schemaVersion: 2, id: 'reference-test', name: '对象选择', scene: { dimension: '2d', background: '#111827', width: 1280, height: 720, fps: 30 }, actions };
}
function workspace(actions: Action[]) {
  const ws = new Blockly.Workspace(); workspaces.push(ws);
  loadProjectWorkspace(project(actions), ws);
  return ws;
}
function dropdown(ws: Blockly.Workspace, action: Action, name = 'target') {
  const field = ws.getBlockById(action.id)!.getField(name);
  expect(field).toBeInstanceOf(Blockly.FieldDropdown);
  return field as Blockly.FieldDropdown;
}
function options(field: Blockly.FieldDropdown) {
  return field.getOptions(false).filter(Array.isArray) as [string, string][];
}
function offered(field: Blockly.FieldDropdown) { return options(field).filter(([label, value]) => value && !label.startsWith('⚠')).map(([, value]) => value); }
const flush = () => new Promise(resolve => setTimeout(resolve, 15));
afterEach(() => { for (const ws of workspaces.splice(0)) ws.dispose(); });

describe('typed object selection', () => {
  it('offers only compatible declarations for coordinate, parameter and ordinary-object inputs', () => {
    const axes = createAction('axes', { name: '平面坐标' });
    const axes3d = createAction('three_axes', { name: '空间坐标' });
    const circle = createAction('circle', { name: '圆形' });
    const tracker = createAction('tracker', { name: 'a' });
    const graph = createAction('graph', { name: '网络' });
    const highlight = createAction('graph_highlight', { target: '网络' });
    const plot = createAction('function_plot', { axes: '平面坐标' });
    const change = createAction('animate_value', { target: 'a' });
    const move = createAction('move', { target: '圆形' });
    const ws = workspace([axes, axes3d, circle, tracker, graph, highlight, plot, change, move]);
    expect(offered(dropdown(ws, plot, 'axes'))).toEqual(['平面坐标']);
    expect(offered(dropdown(ws, change))).toEqual(['a']);
    expect(offered(dropdown(ws, highlight))).toEqual(['网络']);
    expect(offered(dropdown(ws, move))).toContain('圆形');
    expect(offered(dropdown(ws, move))).not.toContain('a');
  });

  it('gives optional coordinates an explicit empty choice and round-trips it unchanged', () => {
    const axes = createAction('axes', { name: '数学坐标' });
    const dot = createAction('dynamic_dot', { axes: '' });
    const ws = workspace([axes, dot]);
    const field = dropdown(ws, dot, 'axes');
    expect(options(field)).toContainEqual(['画面坐标（不使用坐标系）', '']);
    expect(field.getValue()).toBe('');
    expect(workspaceToActions(ws)[1].fields.axes).toBe('');
    field.setValue('数学坐标'); field.setValue('');
    expect(workspaceToActions(ws)[1].fields.axes).toBe('');
  });

  it('does not offer disconnected declarations and explains an existing disconnected reference', () => {
    const circle = createAction('circle', { name: '圆形' });
    const move = createAction('move', { target: '圆形' });
    const ws = workspace([circle, move]);
    ws.getBlockById(circle.id)!.unplug(true);
    setReferenceNames(ws, workspaceToActions(ws));
    const field = dropdown(ws, move);
    expect(offered(field)).not.toContain('圆形');
    expect(field.getValue()).toBe('圆形');
    expect(field.getText()).toBe('⚠ 未连接：圆形');
    expect(workspaceToActions(ws)).toEqual([move]);
  });

  it('preserves unresolved and mistyped imported references without offering them elsewhere', () => {
    const circle = createAction('circle', { name: '圆形' });
    const tracker = createAction('tracker', { name: 'a' });
    const missing = createAction('move', { target: '已删除对象' });
    const wrongType = createAction('move', { target: 'a' });
    const valid = createAction('rotate', { target: '圆形' });
    const actions = [circle, tracker, missing, wrongType, valid];
    const ws = workspace(actions);
    expect(workspaceToActions(ws)).toEqual(actions);
    expect(dropdown(ws, missing).getText()).toBe('⚠ 已缺失：已删除对象');
    expect(dropdown(ws, wrongType).getText()).toBe('⚠ 类型不符：a');
    expect(options(dropdown(ws, valid)).map(([, value]) => value)).not.toContain('已删除对象');
    expect(offered(dropdown(ws, valid))).not.toContain('a');
  });

  it('shows a useful empty-state choice rather than inventing an object name', () => {
    const ws = workspace([]);
    const block = ws.newBlock('anyvis2_animate_value');
    const field = block.getField('target') as Blockly.FieldDropdown;
    expect(field.getValue()).toBe('');
    expect(field.getText()).toBe('先创建参数');
    expect(options(field)).toEqual([['先创建参数', '']]);
  });

  it('updates an existing label after deletion and does not leak names from a previous project', () => {
    const circle = createAction('circle', { name: '将删除' });
    const move = createAction('move', { target: '将删除' });
    const ws = workspace([circle, move]);
    ws.getBlockById(circle.id)!.dispose(true);
    setReferenceNames(ws, workspaceToActions(ws));
    expect(dropdown(ws, move).getValue()).toBe('将删除');
    expect(dropdown(ws, move).getText()).toBe('⚠ 已缺失：将删除');
    const fresh = createAction('move', { target: '' });
    loadProjectWorkspace(project([fresh]), ws);
    expect(options(dropdown(ws, fresh))).toEqual([['先创建图形对象', '']]);
  });

  it('keeps typed optional coordinate references correct through rename, undo and redo', async () => {
    const axes = createAction('axes', { name: '坐标系' });
    const dot = createAction('dynamic_dot', { axes: '坐标系' });
    const ws = workspace([axes, dot]);
    await flush(); ws.clearUndo();
    setRenameErrorHandler(ws, () => {});
    const listener = (event: Blockly.Events.Abstract) => {
      if (event.type === Blockly.Events.BLOCK_CHANGE) applyWorkspaceRename(ws, event as Blockly.Events.BlockChange);
    };
    ws.addChangeListener(listener);
    ws.getBlockById(axes.id)!.setFieldValue('坐标 A', 'name');
    await flush(); await flush();
    setReferenceNames(ws, workspaceToActions(ws));
    expect(dropdown(ws, dot, 'axes').getValue()).toBe('坐标 A');
    expect(dropdown(ws, dot, 'axes').getText()).toBe('坐标 A');
    ws.undo(false); await flush(); setReferenceNames(ws, workspaceToActions(ws));
    expect(dropdown(ws, dot, 'axes').getValue()).toBe('坐标系');
    expect(dropdown(ws, dot, 'axes').getText()).toBe('坐标系');
    ws.undo(true); await flush(); setReferenceNames(ws, workspaceToActions(ws));
    expect(dropdown(ws, dot, 'axes').getValue()).toBe('坐标 A');
    expect(dropdown(ws, dot, 'axes').getText()).toBe('坐标 A');
    ws.removeChangeListener(listener);
  });

  it('renders units after their inputs without changing the stored numbers', () => {
    const rotate = createAction('rotate', { angle: 12.5 });
    const wait = createAction('wait', { duration: 0.35 });
    const repeat = createAction('repeat', { count: 3 });
    const scale = createAction('scale', { factor: 1.25 });
    const actions = [rotate, wait, repeat, scale];
    const ws = workspace(actions);
    expect(ws.getBlockById(rotate.id)!.getField('__unit_angle')?.getText()).toBe('°');
    expect(ws.getBlockById(wait.id)!.getField('__unit_duration')?.getText()).toBe('秒');
    expect(ws.getBlockById(repeat.id)!.getField('__unit_count')?.getText()).toBe('次');
    expect(ws.getBlockById(scale.id)!.getField('__unit_factor')?.getText()).toBe('倍');
    expect(workspaceToActions(ws)).toEqual(actions);
  });
});
