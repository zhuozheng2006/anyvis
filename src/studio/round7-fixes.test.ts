// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionInspector } from './ActionInspector';
import { Timeline } from './Timeline';
import { BLOCK_CATALOG, createAction } from './core/catalog';
import { createEmptyProject } from './core/project';
import type { Action } from './core/types';

vi.mock('./blocks/StudioBlocks', () => ({
  StudioBlocks: () => React.createElement('div', { 'data-testid': 'stub-studio-blocks' }),
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('Round 7 regression fixes', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    if (!window.matchMedia) {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation((query: string) => ({
          matches: false,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      });
    }
    if (!globalThis.ResizeObserver) {
      globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      } as typeof ResizeObserver;
    }
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  describe('ActionInspector', () => {
    it('normalizes shorthand #RGB color values and falls back on invalid color strings', async () => {
      const circleShort = createAction('circle', { name: '短色圆', color: '#f0a' });
      await act(async () => {
        root.render(
          React.createElement(ActionInspector, {
            action: circleShort,
            actions: [circleShort],
            fields: ['color'],
            onChange: vi.fn(),
          })
        );
      });
      const pickerShort = container.querySelector<HTMLInputElement>('input[type="color"]')!;
      expect(pickerShort.value).toBe('#ff00aa');

      const circleBad = createAction('circle', { name: '错色圆', color: 'not-a-color' });
      await act(async () => {
        root.render(
          React.createElement(ActionInspector, {
            action: circleBad,
            actions: [circleBad],
            fields: ['color'],
            onChange: vi.fn(),
          })
        );
      });
      const pickerBad = container.querySelector<HTMLInputElement>('input[type="color"]')!;
      expect(pickerBad.value).toBe('#58c4dd');
    });

    it('guards PositionPad against NaN/non-numeric coordinates in action fields', async () => {
      const circle = createAction('circle', {
        name: '坐标圆',
        x: 'not-a-number' as unknown as number,
        y: Number.NaN,
      });
      await act(async () => {
        root.render(
          React.createElement(ActionInspector, {
            action: circle,
            actions: [circle],
            fields: ['x', 'y'],
            onChange: vi.fn(),
          })
        );
      });
      const tools = container.querySelector('.ai-position-tools')!;
      expect(tools).not.toBeNull();
      expect(tools.innerHTML).not.toContain('NaN');
    });

    it('opens API modal as accessible dialog, focuses into it, closes on Escape restoring focus, and closes when switching action.id', async () => {
      const apiBlock = BLOCK_CATALOG.find(b => b.apiId && b.fields.some(f => f.type === 'api-value'))!;
      const apiField = apiBlock.fields.find(f => f.type === 'api-value')!;
      const actionA = createAction(apiBlock.type, { [apiField.name]: '1' });
      const actionB = createAction(apiBlock.type, { [apiField.name]: '2' });

      await act(async () => {
        root.render(
          React.createElement(ActionInspector, {
            action: actionA,
            actions: [actionA, actionB],
            fields: [apiField.name],
            onChange: vi.fn(),
          })
        );
      });

      const launcher = container.querySelector<HTMLButtonElement>('.ai-fields-api-launcher')!;
      await act(async () => {
        launcher.focus();
        launcher.click();
      });

      const dialog = container.querySelector<HTMLDivElement>('.ai-fields-modal-wrapper')!;
      expect(dialog).not.toBeNull();
      expect(dialog.getAttribute('role')).toBe('dialog');
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      expect(dialog.contains(document.activeElement)).toBe(true);

      await act(async () => {
        dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      });
      expect(container.querySelector('.ai-fields-modal-overlay')).toBeNull();
      expect(document.activeElement).toBe(launcher);

      // Reopen on actionA, then switch inspected action to actionB
      await act(async () => {
        launcher.click();
      });
      expect(container.querySelector('.ai-fields-modal-overlay')).not.toBeNull();

      await act(async () => {
        root.render(
          React.createElement(ActionInspector, {
            action: actionB,
            actions: [actionA, actionB],
            fields: [apiField.name],
            onChange: vi.fn(),
          })
        );
      });
      expect(container.querySelector('.ai-fields-modal-overlay')).toBeNull();
    });
  });

  describe('Timeline', () => {
    it('preserves selection when deleting referenced objects fails, and clears it on success', async () => {
      const project = createEmptyProject();
      const circle = createAction('circle', { name: '主圆' });
      const createAnim = createAction('create', { target: '主圆' });
      const waitAnim = createAction('wait', { duration: 1 });
      project.actions = [circle, createAnim, waitAnim];

      const onChange = vi.fn();
      const onError = vi.fn();
      const onSelectIds = vi.fn();

      // Batch delete with a dependency-blocked object selected -> throws, keeps selection
      await act(async () => {
        root.render(
          React.createElement(Timeline, {
            project,
            selectedId: circle.id,
            selectedIds: [circle.id, waitAnim.id],
            time: 0,
            onChange,
            onSelect: vi.fn(),
            onSelectIds,
            onShowBlocks: vi.fn(),
            onSeek: vi.fn(),
            onError,
          })
        );
      });

      const batchDeleteBtn = container.querySelector<HTMLButtonElement>('button[aria-label="批量删除所选片段"]')!;
      await act(async () => {
        batchDeleteBtn.click();
      });
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onChange).not.toHaveBeenCalled();
      expect(onSelectIds).not.toHaveBeenCalled();

      // Keyboard Delete with referenced object selected -> throws, keeps selection
      await act(async () => {
        root.render(
          React.createElement(Timeline, {
            project,
            selectedId: circle.id,
            selectedIds: [circle.id],
            time: 0,
            onChange,
            onSelect: vi.fn(),
            onSelectIds,
            onShowBlocks: vi.fn(),
            onSeek: vi.fn(),
            onError,
          })
        );
      });
      const section = container.querySelector<HTMLElement>('section[aria-label="动画时间轴"]')!;
      await act(async () => {
        section.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
      });
      expect(onError).toHaveBeenCalledTimes(2);
      expect(onChange).not.toHaveBeenCalled();
      expect(onSelectIds).not.toHaveBeenCalled();

      // Now batch delete unreferenced animations -> succeeds and clears selection
      await act(async () => {
        root.render(
          React.createElement(Timeline, {
            project,
            selectedId: createAnim.id,
            selectedIds: [createAnim.id, waitAnim.id],
            time: 0,
            onChange,
            onSelect: vi.fn(),
            onSelectIds,
            onShowBlocks: vi.fn(),
            onSeek: vi.fn(),
            onError,
          })
        );
      });
      const leafBatchDeleteBtn = container.querySelector<HTMLButtonElement>('button[aria-label="批量删除所选片段"]')!;
      await act(async () => {
        leafBatchDeleteBtn.click();
      });
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onSelectIds).toHaveBeenCalledWith([]);
    });
  });

  describe('StudioApp', () => {
    it('shows 1280x720 in stage-hud-select, rejects null JSON import cleanly, and exposes 3D vector playground in CommandPalette', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.includes('/api/session')) {
            return new Response(JSON.stringify({ token: 't' }), { status: 200 });
          }
          if (url.includes('/api/health')) {
            return new Response(JSON.stringify({ available: true, capabilities: {} }), { status: 200 });
          }
          return new Response('{}', { status: 200 });
        })
      );

      const { default: StudioApp } = await import('./StudioApp');
      await act(async () => {
        root.render(React.createElement(StudioApp));
      });

      const hudSelect = container.querySelector<HTMLSelectElement>('select.stage-hud-select')!;
      expect(hudSelect).not.toBeNull();
      expect(hudSelect.value).toBe('1280x720');
      expect(hudSelect.options[hudSelect.selectedIndex]?.textContent).toContain('720p');

      // Import JSON `null` -> handled gracefully without crashing
      const fileInput = container.querySelector<HTMLInputElement>('input[type="file"][accept*=".anyvis"]')!;
      const nullFile = new File(['null'], 'empty.anyvis', { type: 'application/json' });
      Object.defineProperty(nullFile, 'text', { value: async () => 'null' });
      Object.defineProperty(fileInput, 'files', { value: [nullFile], configurable: true });
      await act(async () => {
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        await Promise.resolve();
      });
      expect(container.textContent).toContain('旧版课件或其他格式');

      // Import valid v2 project with custom resolution -> fallback option appears in stage-hud-select
      const empty = createEmptyProject();
      const customProj = { ...empty, scene: { ...empty.scene, width: 1600, height: 900 } };
      const customJson = JSON.stringify(customProj);
      const customFile = new File([customJson], 'custom.anyvis', { type: 'application/json' });
      Object.defineProperty(customFile, 'text', { value: async () => customJson });
      Object.defineProperty(fileInput, 'files', { value: [customFile], configurable: true });
      await act(async () => {
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        await Promise.resolve();
      });
      expect(hudSelect.value).toBe('1600x900');
      expect(hudSelect.options[hudSelect.selectedIndex]?.textContent).toContain('自定义 (1600×900)');

      // CommandPalette exposes 3D Vector Playground
      const cmdBtn = container.querySelector<HTMLButtonElement>('button[aria-label="全局命令面板"]')!;
      await act(async () => {
        cmdBtn.click();
      });
      expect(document.body.textContent).toContain('三维向量投影与叉积几何演播室');
    });
  });
});
