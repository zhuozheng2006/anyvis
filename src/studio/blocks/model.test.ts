import { afterEach, describe, expect, it } from 'vitest';
import * as Blockly from 'blockly/core';
import { createAction, BLOCK_CATALOG } from '../core/catalog';
import type { Project } from '../core/types';
import { actionsToWorkspace, detachedBlockCount, loadProjectWorkspace, registerStudioBlocks, saveWorkspace, setReferenceNames, workspaceToActions } from './model';

registerStudioBlocks();
const workspaces: Blockly.Workspace[] = [];
function workspace(actions: Project['actions']) {
  const ws = new Blockly.Workspace();
  workspaces.push(ws);
  setReferenceNames(ws, actions);
  Blockly.serialization.workspaces.load(actionsToWorkspace(actions), ws);
  return ws;
}
function project(actions: Project['actions']): Project {
  return { schemaVersion: 2, id: 'project', name: '测试', scene: { dimension: '2d', background: '#111827', width: 1280, height: 720, fps: 30 }, actions };
}
afterEach(() => { for (const ws of workspaces.splice(0)) ws.dispose(); });

describe('Studio Blockly model', () => {
  it('preserves every catalog field and selected default through a Blockly round trip', () => {
    // A stale dropdown default or hidden numeric field must not silently alter a scene.
    // Projects have a 500-block limit. Test every entry in bounded workspaces,
    // rather than constructing an invalid >2,000-block recursive Blockly stack.
    for (let i=0; i<BLOCK_CATALOG.length; i+=150) {
      const actions=BLOCK_CATALOG.slice(i,i+150).map(d=>createAction(d.type));
      const ws=workspace(actions);
      expect(workspaceToActions(ws)).toEqual(actions);
      workspaces.splice(workspaces.indexOf(ws),1); ws.dispose();
    }
  });

  it('preserves named references, nested actions and explicitly separated parallel branches', () => {
    const actions = [
      createAction('circle', { name: '圆 A', radius: 2.5, appear: 'hidden' }),
      { ...createAction('parallel'), children: [
        createAction('move', { target: '圆 A', x: -2, duration: 2.5 }),
        { ...createAction('sequence'), children: [createAction('wait', { duration: 0.5 }), createAction('fade_in', { target: '圆 A' })] },
      ] },
      { ...createAction('parallel'), branches: [
        [createAction('wait', { duration: 1 }), createAction('rotate', { target: '圆 A', angle: 60 })],
        [createAction('wait', { duration: 2 })],
      ], children: undefined },
    ];
    const result = workspaceToActions(workspace(actions));
    expect(result).toEqual(JSON.parse(JSON.stringify(actions)));
  });

  it('keeps detached draft blocks in metadata, while only the start stack executes', () => {
    const actions = [createAction('circle')];
    const ws = workspace(actions);
    ws.newBlock('anyvis2_wait');
    expect(detachedBlockCount(ws)).toBe(1);
    const saved = { ...project(actions), workspace: saveWorkspace(ws, actions) };
    const restored = workspace([]);
    loadProjectWorkspace(saved, restored);
    expect(detachedBlockCount(restored)).toBe(1);
    expect(workspaceToActions(restored)).toEqual(actions);
  });

  it('rebuilds stale Blockly metadata after an external AI or inspector change', () => {
    const actions = [createAction('circle', { radius: 1 })];
    const ws = workspace(actions);
    const saved = { ...project(actions), workspace: saveWorkspace(ws, actions) };
    saved.actions = [{ ...actions[0], fields: { ...actions[0].fields, radius: 3 } }];
    loadProjectWorkspace(saved, ws);
    expect(workspaceToActions(ws)[0].fields.radius).toBe(3);
  });

  it('preserves an unresolved reference so the compiler can report the real problem', () => {
    const actions = [createAction('move', { target: '已删除的对象', x: 4 })];
    expect(workspaceToActions(workspace(actions))).toEqual(actions);
  });

  it('never trusts stale embedded workspace content over authoritative actions', () => {
    const actions = [createAction('circle', { radius: 1 })];
    const ws = workspace(actions);
    const saved = saveWorkspace(ws, actions);
    const state = saved.blockly as { blocks: { blocks: { next: { block: { fields: { radius: number } } } }[] } };
    state.blocks.blocks[0].next.block.fields.radius = 9;
    loadProjectWorkspace({ ...project(actions), workspace: saved }, ws);
    expect(workspaceToActions(ws)[0].fields.radius).toBe(1);
  });
});
