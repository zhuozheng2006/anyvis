import { afterEach, describe, expect, it } from 'vitest';
import * as Blockly from 'blockly/core';
import { createAction, BLOCK_CATALOG } from '../core/catalog';
import type { Project } from '../core/types';
import { actionsToWorkspace, createToolbox, detachedBlockCount, loadProjectWorkspace, registerStudioBlocks, saveWorkspace, setObjectPresentation, setReferenceNames, workspaceToActions } from './model';

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
  it('never hides a parameter on blocks that have no expand control', () => {
    for (const definition of BLOCK_CATALOG.filter(d => d.fields.length <= 4)) {
      const action = createAction(definition.type), ws = workspace([action]);
      const block = ws.getBlockById(action.id)!;
      for (const field of definition.fields) {
        const input = block.inputList.find(i => i.fieldRow.some(f => f.name === field.name));
        expect(input?.isVisible(), `${definition.type}.${field.name}`).toBe(true);
      }
      workspaces.splice(workspaces.indexOf(ws), 1); ws.dispose();
    }
  });
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

it('shows compact object cues while preserving hidden geometry and uploaded asset references', () => {
  const image = createAction('image_asset', { name: '主角', asset: 'a'.repeat(64), height: 4, x: 2 });
  const play = createAction('audio_play', { asset: 'b'.repeat(64) });
  const p = { ...project([image, play]), assets: [
    { id: 'a'.repeat(64), name: '主角.png', kind: 'image' as const, extension: 'png', bytes: 10, width: 32, height: 32 },
    { id: 'b'.repeat(64), name: '讲解.wav', kind: 'audio' as const, extension: 'wav', bytes: 10, duration: 2 },
  ] };
  const ws = new Blockly.Workspace(); workspaces.push(ws); setObjectPresentation(ws, true); loadProjectWorkspace(p, ws);
  const block = ws.getBlockById(image.id)!;
  expect(block.getInput('field_height')?.isVisible()).not.toBe(true);
  expect(block.getField('name')?.isEnabled()).toBe(false);
  const field = ws.getBlockById(play.id)!.getField('asset') as Blockly.FieldDropdown;
  expect(field.getOptions(false)).toContainEqual(['讲解.wav', 'b'.repeat(64)]);
  expect(workspaceToActions(ws)).toEqual(p.actions);
});


it('exposes complete movement coordinates and duration before opening more settings', () => {
  for (const type of ['move', 'shift', 'grow_from_point']) {
    const action = createAction(type);
    const ws = workspace([action]);
    const block = ws.getBlockById(action.id)!;
    const coordinates = type === 'shift' ? ['dx','dy','dz'] : ['x','y','z'];
    for (const name of ['target', ...coordinates, 'duration']) {
      const input = block.inputList.find(input => input.fieldRow.some(field => field.name === name));
      expect(input?.isVisible(), `${type}.${name}`).toBe(true);
    }
    block.setFieldValue('expanded', '__details');
    block.setFieldValue('compact', '__details');
    expect(workspaceToActions(ws)).toEqual([action]);
  }
});

it('groups every available action once and supports searching by its purpose', () => {
  const toolbox = createToolbox('', true) as { contents: { name: string; contents: { kind: string; type?: string }[] }[] };
  const types = toolbox.contents.flatMap(group => group.contents.filter(item => item.kind === 'block').map(item => item.type));
  expect(new Set(types).size).toBe(types.length);
  expect(toolbox.contents.find(group => group.name === '移动与变形')?.contents).toContainEqual({ kind: 'block', type: 'anyvis2_move' });
  for (const type of ['wait','sequence','parallel','repeat','audio_play','audio_stop','set_style','tracker','camera','code']) expect(types).toContain(`anyvis2_${type}`);
  const search = createToolbox('退场', true) as typeof toolbox;
  expect(search.contents[0].contents).toContainEqual({ kind: 'block', type: 'anyvis2_fade_out' });
});


it('shows a real choice prompt in the flyout when compatible objects already exist', () => {
  const main = workspace([createAction('circle')]);
  setReferenceNames(main, []);
  const flyout = new Blockly.Workspace(); workspaces.push(flyout);
  Object.defineProperty(flyout, 'isFlyout', { value: true });
  Object.assign(flyout, { targetWorkspace: main });
  const block = flyout.newBlock('anyvis2_move');
  const field = block.getField('target') as Blockly.FieldDropdown;
  expect(field.getText()).toBe('选择图形对象');
  expect(field.getOptions(false)).toContainEqual(['圆','圆']);
});
