import { afterEach, describe, expect, it } from 'vitest';
import * as Blockly from 'blockly/core';
import { compileWorkspace, registerAnyVisBlocks } from './BlockEditor';
import type { Parameter } from '../core/types';

registerAnyVisBlocks();
const parameters: Parameter[] = [{ id: 'radius', name: '半径', value: 1, min: 0.2, max: 4, step: 0.1, color: '#b5ec78' }];
const workspaces: Blockly.Workspace[] = [];
type TestBlock = { type: string; fields?: Record<string, string | number>; next?: { block: TestBlock }; inputs?: Record<string, { block: TestBlock }> };
function createProgram(first: TestBlock) {
  const workspace = new Blockly.Workspace(); workspaces.push(workspace);
  Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [{ type: 'anyvis_start', next: { block: first } }] } }, workspace);
  return workspace;
}
const animate = (next?: TestBlock): TestBlock => ({ type: 'anyvis_animate', fields: { PARAM: 'radius', FROM: 1, TO: 2, DURATION: 2, EASING: 'linear' }, ...(next ? { next: { block: next } } : {}) });
afterEach(() => workspaces.splice(0).forEach((workspace) => workspace.dispose()));

describe('Blockly compilation', () => {
  it('expands repeated sequences into deterministic sequential clips and pauses', () => {
    const workspace = createProgram({ type: 'anyvis_repeat', fields: { COUNT: 3 }, inputs: { BODY: { block: animate({ type: 'anyvis_wait', fields: { SECONDS: 1 } }) } }, next: { block: { type: 'anyvis_pause', fields: { TITLE: '观察半径' } } } });
    const result = compileWorkspace(workspace, parameters);
    expect(result.clips.map((clip) => clip.start)).toEqual([0, 3, 6]);
    expect(result.cues[0]).toMatchObject({ time: 9, title: '观察半径' });
    expect(result.duration).toBe(10);
    expect(new Set(result.clips.map((clip) => clip.id)).size).toBe(3);
  });
  it('rejects two parallel animations writing the same parameter', () => {
    const workspace = createProgram({ type: 'anyvis_parallel', inputs: { A: { block: animate() }, B: { block: animate() } } });
    expect(() => compileWorkspace(workspace, parameters)).toThrow('同时修改');
  });
  it('rejects removed parameters and out of range animation values', () => {
    const workspace = createProgram(animate());
    expect(() => compileWorkspace(workspace, [])).toThrow('已删除');
    expect(() => compileWorkspace(workspace, [{ ...parameters[0], max: 1.5 }])).toThrow('范围内');
  });
  it('rejects ambiguous disconnected stacks', () => {
    const workspace = createProgram(animate());
    workspace.newBlock('anyvis_wait');
    expect(() => compileWorkspace(workspace, parameters)).toThrow('未连接');
  });
  it('guards exponential expansion before blocking the editor', () => {
    const workspace = createProgram({ type: 'anyvis_repeat', fields: { COUNT: 100 }, inputs: { BODY: { block: { type: 'anyvis_repeat', fields: { COUNT: 100 }, inputs: { BODY: { block: { type: 'anyvis_wait', fields: { SECONDS: 0 } } } } } } } });
    expect(() => compileWorkspace(workspace, parameters)).toThrow('1000');
  });
});
