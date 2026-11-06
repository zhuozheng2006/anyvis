import { afterEach, describe, expect, it } from 'vitest';
import * as Blockly from 'blockly/core';
import { createAction } from '../core/catalog';
import type { Project } from '../core/types';
import { renameProjectObject } from './rename';
import { applyWorkspaceRename, loadProjectWorkspace, registerStudioBlocks, setRenameErrorHandler, workspaceToActions } from './model';

const workspaces: Blockly.Workspace[] = [];
afterEach(() => { for (const ws of workspaces.splice(0)) ws.dispose(); });
function project(actions: Project['actions']): Project {
  return { schemaVersion: 2, id: 'rename-test', name: '重命名', scene: { dimension: '2d', background: '#111827', width: 1280, height: 720, fps: 30 }, actions };
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 15));

describe('Semantic object renaming', () => {
  it('updates references and comma-separated members, while preserving labels and object ids', () => {
    const source = createAction('circle', { name: '圆' });
    const original = project([
      source,
      createAction('move', { target: '圆' }),
      createAction('group', { members: '圆, 圆2,  圆 ' }),
      createAction('text', { text: '这是圆，不是圆2' }),
      createAction('formula', { tex: '圆 + 圆2' }),
    ]);
    original.workspace = { old: true };
    const updated = renameProjectObject(original, source.id, '主体');
    expect(updated.actions.map((a) => a.id)).toEqual(original.actions.map((a) => a.id));
    expect(updated.actions[1].fields.target).toBe('主体');
    expect(updated.actions[2].fields.members).toBe('主体, 圆2,  主体 ');
    expect(updated.actions[3].fields.text).toBe(original.actions[3].fields.text);
    expect(updated.actions[4].fields.tex).toBe(original.actions[4].fields.tex);
    expect(updated.workspace).toBeUndefined();
    expect(original.actions[0].fields.name).toBe('圆');
  });

  it('updates optional axes references that are text fields with explicit reference metadata', () => {
    const axes = createAction('axes');
    const updated = renameProjectObject(project([axes, createAction('dynamic_dot', { axes: '坐标系' }), createAction('dynamic_line', { axes: '坐标系' })]), axes.id, '新坐标');
    expect(updated.actions[1].fields.axes).toBe('新坐标');
    expect(updated.actions[2].fields.axes).toBe('新坐标');
  });

  it('renames tracker identifier tokens without altering angle, alpha, a2, text, LaTeX or code', () => {
    const tracker = createAction('tracker', { name: 'a' });
    const updated = renameProjectObject(project([
      tracker,
      createAction('dynamic_dot', { xExpr: 'a*cos(a) + angle + alpha + a2 + a_b + 1e-3*a' }),
      createAction('animate_value', { target: 'a' }),
      createAction('text', { text: 'a 和 angle' }),
      createAction('formula', { tex: 'a+\\alpha' }),
      createAction('code', { code: "self.play(objects['a'].animate.set_value(2))" }),
    ]), tracker.id, 'frequency');
    expect(updated.actions[1].fields.xExpr).toBe('frequency*cos(frequency) + angle + alpha + a2 + a_b + 1e-3*frequency');
    expect(updated.actions[2].fields.target).toBe('frequency');
    expect(updated.actions[3].fields.text).toBe('a 和 angle');
    expect(updated.actions[4].fields.tex).toBe('a+\\alpha');
    expect(updated.actions[5].fields.code).toBe("self.play(objects['a'].animate.set_value(2))");
  });

  it('rejects duplicate or reserved parameter names without mutating the project', () => {
    const a = createAction('tracker', { name: 'a' });
    const original = project([a, createAction('tracker', { name: 'b' })]);
    expect(() => renameProjectObject(original, a.id, 'b')).toThrow('已被使用');
    expect(() => renameProjectObject(original, a.id, 'x')).toThrow('数学名称');
    expect(original.actions[0].fields.name).toBe('a');
  });

  it('groups a Blockly name change and its references into one undo/redo step', async () => {
    registerStudioBlocks();
    const circle = createAction('circle');
    const move = createAction('move');
    const group = createAction('group', { members: '圆' });
    const ws = new Blockly.Workspace(); workspaces.push(ws);
    loadProjectWorkspace(project([circle, move, group]), ws);
    await flush(); ws.clearUndo();
    const errors: (string | null)[] = [];
    setRenameErrorHandler(ws, (error) => errors.push(error));
    const listener = (event: Blockly.Events.Abstract) => {
      if (event.type === Blockly.Events.BLOCK_CHANGE) applyWorkspaceRename(ws, event as Blockly.Events.BlockChange);
    };
    ws.addChangeListener(listener);
    ws.getBlockById(circle.id)!.setFieldValue('新圆', 'name');
    await flush(); await flush();
    expect(workspaceToActions(ws).map((a) => a.fields.name ?? a.fields.target)).toEqual(['新圆', '新圆', '组合']);
    expect(ws.getBlockById(group.id)!.getFieldValue('members')).toBe('新圆');
    ws.undo(false); await flush();
    expect(ws.getBlockById(circle.id)!.getFieldValue('name')).toBe('圆');
    expect(ws.getBlockById(move.id)!.getFieldValue('target')).toBe('圆');
    expect(ws.getBlockById(group.id)!.getFieldValue('members')).toBe('圆');
    ws.undo(true); await flush();
    expect(ws.getBlockById(circle.id)!.getFieldValue('name')).toBe('新圆');
    expect(ws.getBlockById(move.id)!.getFieldValue('target')).toBe('新圆');
    expect(ws.getBlockById(group.id)!.getFieldValue('members')).toBe('新圆');
    expect(errors.filter(Boolean)).toEqual([]);
    ws.removeChangeListener(listener);
  });
});
