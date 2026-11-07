// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Blockly from 'blockly/core';
import { createAction } from '../core/catalog';
import { createEmptyProject } from '../core/project';
import type { Action, Project } from '../core/types';
import {
  detachedBlockCount, loadProjectWorkspace, releaseReferenceNames,
  saveWorkspace, workspaceToActions,
} from './model';

const workspaces: Blockly.WorkspaceSvg[] = [];
const svgDescriptors = new Map<string, PropertyDescriptor | undefined>();

/**
 * These tests exercise real BlockSvg constructors, field initialization and
 * Blockly serialization. jsdom has no SVG layout engine: queueRender is mocked
 * deliberately, so this is a batching regression test, not a speed benchmark.
 */
beforeEach(() => {
  vi.useFakeTimers();
  const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse() { return this; } };
  for (const [name, value] of Object.entries({
    getScreenCTM: () => identity,
    getCTM: () => identity,
    getBBox: () => ({ x: 0, y: 0, width: 100, height: 40 }),
  })) {
    svgDescriptors.set(name, Object.getOwnPropertyDescriptor(SVGElement.prototype, name));
    Object.defineProperty(SVGElement.prototype, name, { configurable: true, value });
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    font: '',
    measureText: (text: string) => ({ width: text.length * 8, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 3 }),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(Blockly.BlockSvg.prototype, 'queueRender').mockResolvedValue();
});

afterEach(() => {
  Blockly.Events.disable();
  try {
    for (const workspace of workspaces.splice(0)) {
      releaseReferenceNames(workspace);
      workspace.dispose();
    }
  } finally { Blockly.Events.enable(); }
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const [name, descriptor] of svgDescriptors) {
    if (descriptor) Object.defineProperty(SVGElement.prototype, name, descriptor);
    else Reflect.deleteProperty(SVGElement.prototype, name);
  }
  svgDescriptors.clear();
  document.body.replaceChildren();
});

function inject(): Blockly.WorkspaceSvg {
  const host = document.createElement('div');
  host.style.width = '1000px';
  host.style.height = '700px';
  document.body.append(host);
  const workspace = Blockly.inject(host, {
    renderer: 'zelos', sounds: false, trashcan: false,
    move: { drag: false, scrollbars: false, wheel: false },
    zoom: { controls: false, wheel: false },
  });
  workspaces.push(workspace);
  return workspace;
}

function largeProject(blockCount: 260 | 500): Project {
  const sections = blockCount === 260 ? 10 : 20;
  const childrenPerSection = blockCount / sections - 1;
  const actions: Action[] = Array.from({ length: sections }, (_, section) => {
    const name = `镜头 ${section + 1} 的圆`;
    const children = [createAction('circle', { name, radius: 0.72, x: section / 10, appear: 'hidden' })];
    for (let index = 1; index < childrenPerSection; index++) {
      children.push(createAction('move', { target: name, x: index / 7, duration: 0.25 }));
    }
    return { ...createAction('sequence', { label: `镜头 ${section + 1}` }), children };
  });
  return { ...createEmptyProject(), actions };
}

describe('rendered Blockly project loading', () => {
  it.each([260, 500] as const)('loads %i blocks without synchronous per-block rendering and keeps every action', (count) => {
    const workspace = inject();
    const synchronousRender = vi.spyOn(Blockly.BlockSvg.prototype, 'render').mockImplementation(() => {});
    const project = largeProject(count);

    loadProjectWorkspace(project, workspace);

    expect(synchronousRender).not.toHaveBeenCalled();
    expect(Blockly.BlockSvg.prototype.queueRender).toHaveBeenCalled();
    const blocks = workspace.getAllBlocks(false);
    expect(blocks).toHaveLength(count + 1); // The extra block is the scene entry point.
    expect(blocks.every(block => block instanceof Blockly.BlockSvg && block.initialized)).toBe(true);
    expect(workspaceToActions(workspace)).toEqual(project.actions);
    for (const section of project.actions) expect(workspace.getBlockById(section.id)?.isCollapsed()).toBe(true);
  });

  it('restores an explicitly expanded saved paragraph and its detached draft without changing semantic actions', () => {
    const original = largeProject(260);
    const workspace = inject();
    loadProjectWorkspace(original, workspace);
    const section = workspace.getBlockById(original.actions[0].id)!;
    section.setCollapsed(false);
    const firstObject = workspace.getBlockById(original.actions[0].children![0].id)!;
    firstObject.setFieldValue('expanded', '__details');
    const draft = workspace.newBlock('anyvis2_wait');
    draft.setFieldValue('7.25', 'duration');
    draft.initSvg();
    const saved: Project = { ...original, workspace: saveWorkspace(workspace, original.actions) };

    const restored = inject();
    const synchronousRender = vi.spyOn(Blockly.BlockSvg.prototype, 'render').mockImplementation(() => {});
    loadProjectWorkspace(saved, restored);

    expect(synchronousRender).not.toHaveBeenCalled();
    expect(restored.getBlockById(section.id)?.isCollapsed()).toBe(false);
    expect(restored.getBlockById(original.actions[1].id)?.isCollapsed()).toBe(true);
    expect(restored.getBlockById(firstObject.id)?.getFieldValue('__details')).toBe('expanded');
    expect(detachedBlockCount(restored)).toBe(1);
    expect(restored.getBlockById(draft.id)?.getFieldValue('duration')).toBe(7.25);
    expect(workspaceToActions(restored)).toEqual(original.actions);
  });
});
