// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAction, BLOCK_CATALOG } from './core/catalog';
import { createEmptyProject } from './core/project';
import type { Action, MediaAsset, Project } from './core/types';
import * as api from './api';
import { ActionInspector } from './ActionInspector';
import { ObjectManager } from './ObjectManager';
import { AssetShelf } from './AssetShelf';

// Tell React this is a test environment to silence act warnings
// @ts-expect-error test flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function changeInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function blurInput(input: HTMLElement) {
  input.dispatchEvent(new Event('blur', { bubbles: true }));
  input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}

describe('ActionInspector and ObjectManager components', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  describe('ActionInspector', () => {
    it('uses catalog option values, displays Chinese labels and commits the canonical value', async () => {
      const action = createAction('image_asset', { appear: 'none' }), onChange = vi.fn();
      await act(async () => { root.render(React.createElement(ActionInspector, { action, actions: [action], fields: ['appear'], onChange })); });
      const select = container.querySelector('select')!;
      expect(select.value).toBe('none'); expect(select.selectedOptions[0].text).toBe('直接显示');
      await act(async () => { select.value = 'fade'; select.dispatchEvent(new Event('change', { bubbles: true })); });
      expect(onChange).toHaveBeenCalledWith({ appear: 'fade' });
    });

    it('renders only specified fields when fields prop is provided', async () => {
      const circleAction = createAction('circle', { name: '红圆', radius: 1.5, color: '#FC6255' });
      const actions = [circleAction];

      await act(async () => {
        root.render(
          React.createElement(ActionInspector, {
            action: circleAction,
            actions,
            fields: ['name', 'radius'],
            onChange: vi.fn()
          })
        );
      });

      const inputs = container.querySelectorAll<HTMLInputElement>('.ai-fields-input');
      expect(inputs.length).toBe(2);
      expect(inputs[0].value).toBe('红圆');
      expect(inputs[1].value).toBe('1.5');
      // color should not be rendered
      expect(container.querySelector('.ai-fields-color-picker')).toBeNull();
    });

    it('uses local draft and commits on blur/Enter; does not convert empty string to 0', async () => {
      const circleAction = createAction('circle', { name: '红圆', radius: 1.5 });
      const onChange = vi.fn();
      const onError = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(ActionInspector, {
            action: circleAction,
            actions: [circleAction],
            fields: ['radius'],
            onChange,
            onError
          })
        );
      });

      const radiusInput = container.querySelector<HTMLInputElement>('.ai-fields-input')!;
      expect(radiusInput.value).toBe('1.5');

      // 1. Enter empty string and blur -> should not convert to 0, should call onError and revert
      await act(async () => {
        changeInput(radiusInput, '   ');
      });
      await act(async () => {
        blurInput(radiusInput);
      });

      expect(onError).toHaveBeenCalledWith(expect.stringContaining('不能为空'));
      expect(onChange).not.toHaveBeenCalled();
      expect(radiusInput.value).toBe('1.5');

      // 2. Enter invalid number string
      onError.mockClear();
      await act(async () => {
        changeInput(radiusInput, 'abc');
      });
      await act(async () => {
        blurInput(radiusInput);
      });
      expect(onError).toHaveBeenCalledWith(expect.stringContaining('有效数字'));
      expect(onChange).not.toHaveBeenCalled();
      expect(radiusInput.value).toBe('1.5');

      // 3. Enter number out of bounds
      onError.mockClear();
      await act(async () => {
        changeInput(radiusInput, '-5');
      });
      await act(async () => {
        blurInput(radiusInput);
      });
      expect(onError).toHaveBeenCalledWith(expect.stringContaining('不能小于'));
      expect(onChange).not.toHaveBeenCalled();

      // 4. Enter valid number and commit via Enter key
      onError.mockClear();
      onChange.mockClear();
      await act(async () => {
        changeInput(radiusInput, '3.5');
      });
      await act(async () => {
        radiusInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        blurInput(radiusInput);
      });
      expect(onChange).toHaveBeenCalledWith({ radius: 3.5 });
      expect(onError).not.toHaveBeenCalled();
    });

    it('synchronizes local draft when external action fields change', async () => {
      let action = createAction('circle', { name: '初始圆', radius: 1 });

      const rerender = (actItem: Action) => {
        root.render(
          React.createElement(ActionInspector, {
            action: actItem,
            actions: [actItem],
            fields: ['name'],
            onChange: vi.fn()
          })
        );
      };

      await act(async () => {
        rerender(action);
      });

      const nameInput = container.querySelector<HTMLInputElement>('.ai-fields-input')!;
      expect(nameInput.value).toBe('初始圆');

      // External update
      action = { ...action, fields: { ...action.fields, name: '更新圆' } };
      await act(async () => {
        rerender(action);
      });

      expect(nameInput.value).toBe('更新圆');
    });

    it('handles object-list reference fields by toggling chips', async () => {
      const circleA = createAction('circle', { name: '圆A' });
      const circleB = createAction('circle', { name: '圆B' });
      const groupAction = createAction('group', { name: '我的组合', members: '圆A' });
      const onChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(ActionInspector, {
            action: groupAction,
            actions: [circleA, circleB, groupAction],
            fields: ['members'],
            onChange
          })
        );
      });

      const chips = container.querySelectorAll<HTMLButtonElement>('.ai-fields-chip');
      expect(chips.length).toBe(3); // 圆A, 圆B, 我的组合
      expect(chips[0].textContent).toBe('圆A');
      expect(chips[0].classList.contains('ai-fields-chip-active')).toBe(true);

      // Click 圆B to add to members
      await act(async () => {
        chips[1].click();
      });

      expect(onChange).toHaveBeenCalledWith({ members: '圆A, 圆B' });
    });

    it('passes all createsObject declarations to api-value references including non-managed objects', async () => {
      const tracker = createAction('tracker', { name: '数值T' });
      const circle = createAction('circle', { name: '主圆' });
      const apiBlock = BLOCK_CATALOG.find(b => b.apiId && b.fields.some(f => f.type === 'api-value'))!;
      const apiField = apiBlock.fields.find(f => f.type === 'api-value')!;
      const customAction = createAction(apiBlock.type, { [apiField.name]: '{"$ref":"数值T"}' });

      let capturedReferences: string[] = [];
      const apiFieldModule = await import('./blocks/api-value-field');
      const originalCreate = apiFieldModule.createApiValueEditor;
      vi.spyOn(apiFieldModule, 'createApiValueEditor').mockImplementation((f, raw, refs, app, cl, rep) => {
        capturedReferences = refs;
        return originalCreate(f, raw, refs, app, cl, rep);
      });

      await act(async () => {
        root.render(
          React.createElement(ActionInspector, {
            action: customAction,
            actions: [tracker, circle, customAction],
            fields: [apiField.name],
            onChange: vi.fn()
          })
        );
      });

      const launcher = container.querySelector<HTMLButtonElement>('.ai-fields-api-launcher')!;
      await act(async () => {
        launcher.click();
      });

      expect(capturedReferences).toContain('数值T');
      expect(capturedReferences).toContain('主圆');

      // Click cancel
      const cancelBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '取消');
      await act(async () => {
        cancelBtn!.click();
      });
    });

    it('keeps api-value editor stable across parent re-renders and disposes on close', async () => {
      const apiBlock = BLOCK_CATALOG.find(b => b.apiId && b.fields.some(f => f.type === 'api-value'))!;
      const apiField = apiBlock.fields.find(f => f.type === 'api-value')!;
      const customAction = createAction(apiBlock.type, { [apiField.name]: '10' });
      const onChange = vi.fn();

      const rerender = (actions: Action[]) => {
        root.render(
          React.createElement(ActionInspector, {
            action: customAction,
            actions,
            fields: [apiField.name],
            onChange
          })
        );
      };

      await act(async () => {
        rerender([customAction]);
      });

      const launcher = container.querySelector<HTMLButtonElement>('.ai-fields-api-launcher')!;
      await act(async () => {
        launcher.click();
      });

      const editorBefore = container.querySelector('.av-api-value-editor');
      expect(editorBefore).not.toBeNull();

      // Parent re-renders with new actions array (simulating preview playback / time ticks)
      await act(async () => {
        rerender([...[customAction], createAction('circle', { name: '新加圆' })]);
      });

      const editorAfter = container.querySelector('.av-api-value-editor');
      expect(editorAfter).toBe(editorBefore); // Editor DOM element must not be recreated

      // Click cancel button in editor to close and dispose
      const cancelBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '取消');
      await act(async () => {
        cancelBtn!.click();
      });

      expect(container.querySelector('.ai-fields-modal-overlay')).toBeNull();
    });

    it('renders asset picker for image_asset filtering by image kind with thumbnail preview', async () => {
      const imgAsset: MediaAsset = {
        id: 'img-123',
        name: '图表.png',
        kind: 'image',
        extension: 'png',
        bytes: 1234
      };
      const audioAsset: MediaAsset = {
        id: 'aud-456',
        name: '配音.mp3',
        kind: 'audio',
        extension: 'mp3',
        bytes: 5678
      };
      const imageAction = createAction('image_asset', { name: '展示图', asset: 'img-123' });
      const onChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(ActionInspector, {
            action: imageAction,
            actions: [imageAction],
            fields: ['asset'],
            assets: [imgAsset, audioAsset],
            onChange
          })
        );
      });

      const select = container.querySelector<HTMLSelectElement>('.ai-fields-asset-select')!;
      expect(select).not.toBeNull();
      // Should contain image asset option, but not audio asset option
      const options = Array.from(select.options);
      expect(options.some(o => o.value === 'img-123' && o.text.includes('图表.png (PNG)'))).toBe(true);
      expect(options.some(o => o.value === 'aud-456')).toBe(false);

      // Should display preview image
      const previewImg = container.querySelector<HTMLImageElement>('.ai-fields-asset-thumb')!;
      expect(previewImg).not.toBeNull();
      expect(previewImg.src).toContain('/api/assets/img-123/file');

      // Change asset
      await act(async () => {
        select.value = 'img-123';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      expect(onChange).toHaveBeenCalledWith({ asset: 'img-123' });
    });

    it('renders asset picker for audio_play filtering by audio kind', async () => {
      const imgAsset: MediaAsset = {
        id: 'img-123',
        name: '图表.png',
        kind: 'image',
        extension: 'png',
        bytes: 1234
      };
      const audioAsset: MediaAsset = {
        id: 'aud-456',
        name: '解说.mp3',
        kind: 'audio',
        extension: 'mp3',
        bytes: 5678
      };
      const audioAction = createAction('audio_play', { name: '解说', asset: 'aud-456' });
      const onChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(ActionInspector, {
            action: audioAction,
            actions: [audioAction],
            fields: ['asset'],
            assets: [imgAsset, audioAsset],
            onChange
          })
        );
      });

      const select = container.querySelector<HTMLSelectElement>('.ai-fields-asset-select')!;
      expect(select).not.toBeNull();
      const options = Array.from(select.options);
      expect(options.some(o => o.value === 'aud-456' && o.text.includes('解说.mp3 (MP3)'))).toBe(true);
      expect(options.some(o => o.value === 'img-123')).toBe(false);
    });
  });

  describe('ObjectManager', () => {
    it('defaults to selecting the first object when selectedId is null, and renders top bar + bottom tray', async () => {
      const circle = createAction('circle', { name: '首圆', color: '#58C4DD' });
      const square = createAction('square', { name: '次块', color: '#83C167' });
      const project: Project = {
        ...createEmptyProject(),
        actions: [circle, square]
      };

      await act(async () => {
        root.render(
          React.createElement(ObjectManager, {
            project,
            selectedId: null, // empty selectedId
            onSelect: vi.fn(),
            onChange: vi.fn(),
            onAdd: vi.fn(),
            onError: vi.fn()
          })
        );
      });

      // Top property bar should show 首圆 by default
      const propBar = container.querySelector('.om-property-bar')!;
      expect(propBar).not.toBeNull();
      const badge = propBar.querySelector('.om-prop-badge')!;
      expect(badge.textContent).toBe('圆');

      // Bottom cards tray should have 2 cards + 1 add button
      const tray = container.querySelector('.om-cards-tray')!;
      expect(tray).not.toBeNull();
      const cards = tray.querySelectorAll('.om-card');
      expect(cards.length).toBe(2);
      expect(cards[0].classList.contains('om-card-selected')).toBe(true);
      expect(cards[1].classList.contains('om-card-selected')).toBe(false);

      // Cards have accessible aria-labels
      expect(cards[0].querySelector('.om-card-select')!.getAttribute('aria-label')).toContain('首圆');
      expect(cards[1].querySelector('.om-card-select')!.getAttribute('aria-label')).toContain('次块');
    });

    it('uses native buttons for keyboard activation of object cards', async () => {
      const circle = createAction('circle', { name: '圆1' });
      const square = createAction('square', { name: '方1' });
      const project: Project = {
        ...createEmptyProject(),
        actions: [circle, square]
      };

      const onSelect = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(ObjectManager, {
            project,
            selectedId: circle.id,
            onSelect,
            onChange: vi.fn(),
            onAdd: vi.fn(),
            onError: vi.fn()
          })
        );
      });

      const buttons = container.querySelectorAll<HTMLButtonElement>('.om-card-select');
      expect(buttons[0].tabIndex).toBe(0);
      expect(buttons[1].tabIndex).toBe(-1);
      // Native buttons provide Enter/Space activation in the browser. jsdom
      // does not synthesize native default actions for dispatched key events.
      expect(buttons[1].tagName).toBe('BUTTON');
      expect(buttons[1].type).toBe('button');
      await act(async () => buttons[1].click());
      expect(onSelect).toHaveBeenCalledWith(square.id);

    });

    it('protects objects with dependents from deletion and reports error with aria-label', async () => {
      const circle = createAction('circle', { name: '目标圆' });
      const move = createAction('shift', { target: '目标圆', dx: 2 });
      const project: Project = {
        ...createEmptyProject(),
        actions: [circle, move]
      };

      const onError = vi.fn();
      const onChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(ObjectManager, {
            project,
            selectedId: circle.id,
            onSelect: vi.fn(),
            onChange,
            onAdd: vi.fn(),
            onError
          })
        );
      });

      const delBtn = container.querySelector<HTMLButtonElement>('.om-delete-btn')!;
      expect(delBtn.getAttribute('aria-label')).toBe('删除对象 目标圆');

      await act(async () => {
        delBtn.click();
      });

      expect(onError).toHaveBeenCalledWith(expect.stringContaining('仍被 1 个动作使用'));
      expect(onChange).not.toHaveBeenCalled();
    });

    it('allows deleting objects without dependents', async () => {
      const circle = createAction('circle', { name: '独立圆' });
      const project: Project = {
        ...createEmptyProject(),
        actions: [circle]
      };

      const onChange = vi.fn();
      const onError = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(ObjectManager, {
            project,
            selectedId: circle.id,
            onSelect: vi.fn(),
            onChange,
            onAdd: vi.fn(),
            onError
          })
        );
      });

      const delBtn = container.querySelector<HTMLButtonElement>('.om-delete-btn')!;
      await act(async () => {
        delBtn.click();
      });

      expect(onError).not.toHaveBeenCalled();
      expect(onChange).toHaveBeenCalled();
      const updatedProject = onChange.mock.calls[0][0] as Project;
      expect(updatedProject.actions.length).toBe(0);
    });

    it('opens add object modal, shows tabs including assets placeholder, and filters search', async () => {
      const project: Project = createEmptyProject();
      const onAdd = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(ObjectManager, {
            project,
            selectedId: null,
            onSelect: vi.fn(),
            onChange: vi.fn(),
            onAdd,
            onError: vi.fn()
          })
        );
      });

      const addBtn = container.querySelector<HTMLButtonElement>('.om-card-add-trigger')!;
      await act(async () => {
        addBtn.click();
      });

      const modal = container.querySelector('.om-modal');
      expect(modal).not.toBeNull();

      // Check tabs
      const tabs = container.querySelectorAll<HTMLButtonElement>('.om-tab-btn');
      expect(tabs.length).toBe(3);
      expect(tabs[0].textContent).toContain('常用图形');
      expect(tabs[1].textContent).toContain('高级 API 类');
      expect(tabs[2].textContent).toContain('素材与音画');

      // Click assets tab -> now displays real AssetShelf
      await act(async () => {
        tabs[2].click();
      });
      expect(container.querySelector('.om-asset-shelf')).not.toBeNull();
      expect(container.querySelector('.om-asset-dropzone')).not.toBeNull();

      // Switch back to curated tab and search
      await act(async () => {
        tabs[0].click();
      });

      const searchInput = container.querySelector<HTMLInputElement>('.om-search-input')!;
      await act(async () => {
        changeInput(searchInput, '矩形');
      });

      const catalogCards = container.querySelectorAll<HTMLButtonElement>('.om-catalog-card');
      expect(catalogCards.length).toBeGreaterThan(0);
      expect(catalogCards[0].textContent).toContain('矩形');

      // Click card
      await act(async () => {
        catalogCards[0].click();
      });

      expect(onAdd).toHaveBeenCalledWith('rectangle');
      // Modal should be closed
      expect(container.querySelector('.om-modal')).toBeNull();
    });

    it('opens advanced parameters drawer overlay without displacing cards tray', async () => {
      const arc = createAction('arc', { name: '圆弧', radius: 1.5, start: 0, angle: 90 });
      const project: Project = {
        ...createEmptyProject(),
        actions: [arc]
      };

      await act(async () => {
        root.render(
          React.createElement(ObjectManager, {
            project,
            selectedId: arc.id,
            onSelect: vi.fn(),
            onChange: vi.fn(),
            onAdd: vi.fn(),
            onError: vi.fn()
          })
        );
      });

      // Bottom cards tray must be present and visible
      const cardsTray = container.querySelector('.om-cards-tray');
      expect(cardsTray).not.toBeNull();

      // Expand button for advanced parameters
      const expandBtn = container.querySelector<HTMLButtonElement>('.om-expand-toggle-btn')!;
      expect(expandBtn).not.toBeNull();
      expect(expandBtn.textContent).toContain('全部参数');

      // Click to open advanced drawer
      await act(async () => {
        expandBtn.click();
      });

      const drawer = container.querySelector('.om-drawer');
      expect(drawer).not.toBeNull();
      expect(drawer.getAttribute('aria-label')).toContain('全部参数');

      // Cards tray remains present underneath the drawer overlay!
      expect(container.querySelector('.om-cards-tray')).toBe(cardsTray);

      // Close drawer
      const closeBtn = container.querySelector<HTMLButtonElement>('.om-drawer-close-btn')!;
      await act(async () => {
        closeBtn.click();
      });

      expect(container.querySelector('.om-drawer')).toBeNull();
      expect(container.querySelector('.om-cards-tray')).toBe(cardsTray);
    });
  });

  describe('AssetShelf and Media Upload', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('displays image thumbnail on image_asset cards in tray, and quick-opens asset shelf via tray button', async () => {
      const imgAsset: MediaAsset = {
        id: 'asset-img-1',
        name: '徽标.svg',
        kind: 'image',
        extension: 'svg',
        bytes: 1024
      };
      const imgAction = createAction('image_asset', { name: '徽标', asset: 'asset-img-1', appear: 'none' });
      const project: Project = {
        ...createEmptyProject(),
        assets: [imgAsset],
        actions: [imgAction]
      };

      await act(async () => {
        root.render(
          React.createElement(ObjectManager, {
            project,
            selectedId: imgAction.id,
            onSelect: vi.fn(),
            onChange: vi.fn(),
            onAdd: vi.fn(),
            onError: vi.fn()
          })
        );
      });

      // Card icon should render an <img> with /api/assets/asset-img-1/file
      const thumb = container.querySelector<HTMLImageElement>('.om-thumb-img')!;
      expect(thumb).not.toBeNull();
      expect(thumb.src).toContain('/api/assets/asset-img-1/file');

      // Click "素材库 (1)" button in tray header
      const shelfBtn = container.querySelector<HTMLButtonElement>('.om-shelf-open-btn')!;
      expect(shelfBtn).not.toBeNull();
      expect(shelfBtn.textContent).toContain('素材库 (1)');

      await act(async () => {
        shelfBtn.click();
      });

      // Modal should be open directly to assets shelf
      expect(container.querySelector('.om-asset-shelf')).not.toBeNull();
      expect(container.querySelector('.om-asset-card')).not.toBeNull();
      expect(container.querySelector('.om-asset-name')?.textContent).toBe('徽标.svg');
    });

    it('allows reusing existing image asset to create new object with unique name and appear=none', async () => {
      const imgAsset: MediaAsset = {
        id: '1111111111111111111111111111111111111111111111111111111111111111',
        name: '图表.png',
        kind: 'image',
        extension: 'png',
        bytes: 2048, width: 64, height: 64
      };
      const existingCircle = createAction('circle', { name: '圆 1' });
      const project: Project = {
        ...createEmptyProject(),
        assets: [imgAsset],
        actions: [existingCircle]
      };

      const onChange = vi.fn();
      const onSelect = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(AssetShelf, {
            project,
            onProjectChange: onChange,
            onSelectObject: onSelect,
            onError: vi.fn()
          })
        );
      });

      const useBtn = container.querySelector<HTMLButtonElement>('.om-asset-btn-primary')!;
      expect(useBtn).not.toBeNull();
      expect(useBtn.textContent).toContain('作为新对象添加');

      await act(async () => {
        useBtn.click();
      });

      expect(onChange).toHaveBeenCalledTimes(1);
      const nextProj: Project = onChange.mock.calls[0][0];
      const newAction = nextProj.actions.find(a => a.type === 'image_asset')!;
      expect(newAction).toBeDefined();
      expect(newAction.fields.name).toBe('图表');
      expect(newAction.fields.asset).toBe('1111111111111111111111111111111111111111111111111111111111111111');
      expect(newAction.fields.appear).toBe('none');
      expect(onSelect).toHaveBeenCalledWith(newAction.id);
    });

    it('allows adding audio asset to track creating audio_play at start of actions with delay=0', async () => {
      const audioAsset: MediaAsset = {
        id: '2222222222222222222222222222222222222222222222222222222222222222',
        name: '旁白.mp3',
        kind: 'audio',
        extension: 'mp3',
        bytes: 4096,
        duration: 5
      };
      const existingCircle = createAction('circle', { name: '初始图形' });
      const project: Project = {
        ...createEmptyProject(),
        assets: [audioAsset],
        actions: [existingCircle]
      };

      const onChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(AssetShelf, {
            project,
            onProjectChange: onChange,
            onError: vi.fn()
          })
        );
      });

      // Verify audio element with controls is rendered for previewing
      const audioEl = container.querySelector<HTMLAudioElement>('.om-asset-audio-player')!;
      expect(audioEl).not.toBeNull();
      expect(audioEl.controls).toBe(true);
      expect(audioEl.src).toContain('/api/assets/2222222222222222222222222222222222222222222222222222222222222222/file');

      // Click "加入音轨" button
      const addTrackBtn = container.querySelector<HTMLButtonElement>('.om-asset-btn-track')!;
      expect(addTrackBtn).not.toBeNull();

      await act(async () => {
        addTrackBtn.click();
      });

      expect(onChange).toHaveBeenCalledTimes(1);
      const nextProj: Project = onChange.mock.calls[0][0];
      // Must be at index 0 (start of actions)
      const firstAction = nextProj.actions[0];
      expect(firstAction.type).toBe('audio_play');
      expect(firstAction.fields.name).toBe('旁白');
      expect(firstAction.fields.asset).toBe('2222222222222222222222222222222222222222222222222222222222222222');
      expect(firstAction.fields.delay).toBe(0);
      expect(firstAction.fields.offset).toBe(0);
      expect(nextProj.actions[1].id).toBe(existingCircle.id);
    });

    it('handles image upload: calls uploadAsset, saves to project.assets, creates image_asset action and selects it', async () => {
      const project = createEmptyProject();
      const onChange = vi.fn();
      const onSelect = vi.fn();
      const onError = vi.fn();

      const uploadedImage: MediaAsset = {
        id: '3333333333333333333333333333333333333333333333333333333333333333',
        name: '插图.jpg',
        kind: 'image',
        extension: 'jpg',
        bytes: 10240,
        width: 800,
        height: 600
      };

      vi.spyOn(api, 'uploadAsset').mockResolvedValue(uploadedImage);

      await act(async () => {
        root.render(
          React.createElement(AssetShelf, {
            project,
            onProjectChange: onChange,
            onSelectObject: onSelect,
            onError
          })
        );
      });

      const fileInput = container.querySelector<HTMLInputElement>('[data-testid="om-asset-file-input"]')!;
      const testFile = new File(['dummy-bytes'], '插图.jpg', { type: 'image/jpeg' });

      await act(async () => {
        Object.defineProperty(fileInput, 'files', {
          value: [testFile],
          writable: true
        });
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      });

      expect(api.uploadAsset).toHaveBeenCalledWith(testFile);
      expect(onChange).toHaveBeenCalledTimes(1);
      const resultProject: Project = onChange.mock.calls[0][0];

      // Asset saved in project.assets
      expect(resultProject.assets?.some(a => a.id === '3333333333333333333333333333333333333333333333333333333333333333')).toBe(true);

      // image_asset action created with unique name, asset ID, appear none
      const createdAction = resultProject.actions.find(a => a.type === 'image_asset')!;
      expect(createdAction).toBeDefined();
      expect(createdAction.fields.name).toBe('插图');
      expect(createdAction.fields.asset).toBe('3333333333333333333333333333333333333333333333333333333333333333');
      expect(createdAction.fields.appear).toBe('none');
      expect(onSelect).toHaveBeenCalledWith(createdAction.id);
      expect(onError).not.toHaveBeenCalled();
    });

    it('handles audio upload: calls uploadAsset, saves to project.assets without creating image action', async () => {
      const project = createEmptyProject();
      const onChange = vi.fn();
      const onSelect = vi.fn();
      const onError = vi.fn();

      const uploadedAudio: MediaAsset = {
        id: '4444444444444444444444444444444444444444444444444444444444444444',
        name: '背景乐.mp3',
        kind: 'audio',
        extension: 'mp3',
        bytes: 32000,
        duration: 12.5
      };

      vi.spyOn(api, 'uploadAsset').mockResolvedValue(uploadedAudio);

      await act(async () => {
        root.render(
          React.createElement(AssetShelf, {
            project,
            onProjectChange: onChange,
            onSelectObject: onSelect,
            onError
          })
        );
      });

      const fileInput = container.querySelector<HTMLInputElement>('[data-testid="om-asset-file-input"]')!;
      const testFile = new File(['audio-bytes'], '背景乐.mp3', { type: 'audio/mpeg' });

      await act(async () => {
        Object.defineProperty(fileInput, 'files', {
          value: [testFile],
          writable: true
        });
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      });

      expect(api.uploadAsset).toHaveBeenCalledWith(testFile);
      expect(onChange).toHaveBeenCalledTimes(1);
      const resultProject: Project = onChange.mock.calls[0][0];

      // Audio saved to assets
      expect(resultProject.assets?.some(a => a.id === '4444444444444444444444444444444444444444444444444444444444444444')).toBe(true);
      // No visual image action created
      expect(resultProject.actions.length).toBe(0);
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('safe asynchronous merge: preserves concurrent user edits when upload completes', async () => {
      let currentProject: Project = {
        ...createEmptyProject(),
        actions: [createAction('circle', { name: '红圆', radius: 1 })]
      };

      let resolveUpload!: (asset: MediaAsset) => void;
      const uploadPromise = new Promise<MediaAsset>(resolve => {
        resolveUpload = resolve;
      });
      vi.spyOn(api, 'uploadAsset').mockReturnValue(uploadPromise);

      const onChange = vi.fn((next: Project) => {
        currentProject = next;
      });

      const { rerender } = {
        rerender: (proj: Project) => {
          root.render(
            React.createElement(AssetShelf, {
              project: proj,
              onProjectChange: onChange,
              onError: vi.fn()
            })
          );
        }
      };

      await act(async () => {
        rerender(currentProject);
      });

      // 1. Start uploading file
      const fileInput = container.querySelector<HTMLInputElement>('[data-testid="om-asset-file-input"]')!;
      const testFile = new File(['pic-bytes'], '示意图.png', { type: 'image/png' });

      await act(async () => {
        Object.defineProperty(fileInput, 'files', {
          value: [testFile],
          writable: true
        });
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      });

      // 2. While upload is in flight, user concurrently edits existing circle (e.g. radius changed to 3.5, and adds square)
      const updatedCircle = { ...currentProject.actions[0], fields: { ...currentProject.actions[0].fields, radius: 3.5 } };
      const newSquare = createAction('square', { name: '蓝方' });
      currentProject = {
        ...currentProject,
        actions: [updatedCircle, newSquare]
      };

      await act(async () => {
        rerender(currentProject);
      });

      // 3. Resolve upload promise
      await act(async () => {
        resolveUpload({
          id: '5555555555555555555555555555555555555555555555555555555555555555',
          name: '示意图.png',
          kind: 'image',
          extension: 'png',
          bytes: 4096, width: 64, height: 64
        });
      });

      expect(onChange).toHaveBeenCalledTimes(1);
      const mergedProject = currentProject;
      // The concurrent edit (radius = 3.5 and newSquare) must be preserved!
      const circleAction = mergedProject.actions.find(a => a.fields.name === '红圆')!;
      expect(circleAction.fields.radius).toBe(3.5);
      expect(mergedProject.actions.some(a => a.fields.name === '蓝方')).toBe(true);
      // And the uploaded image action is also present!
      expect(mergedProject.actions.some(a => a.fields.name === '示意图')).toBe(true);
      expect(mergedProject.assets?.some(a => a.id === '5555555555555555555555555555555555555555555555555555555555555555')).toBe(true);
    });

    it('displays upload error banner and reports onError when upload rejects', async () => {
      const project = createEmptyProject();
      const onChange = vi.fn();
      const onError = vi.fn();

      vi.spyOn(api, 'uploadAsset').mockRejectedValue(new Error('单个素材最大 64 MB。'));

      await act(async () => {
        root.render(
          React.createElement(AssetShelf, {
            project,
            onProjectChange: onChange,
            onError
          })
        );
      });

      const fileInput = container.querySelector<HTMLInputElement>('[data-testid="om-asset-file-input"]')!;
      const testFile = new File(['too-big'], 'large.mp4', { type: 'video/mp4' });

      await act(async () => {
        Object.defineProperty(fileInput, 'files', {
          value: [testFile],
          writable: true
        });
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      });

      expect(onError).toHaveBeenCalledWith('单个素材最大 64 MB。');
      expect(onChange).not.toHaveBeenCalled();

      // Error banner rendered in UI
      const errorBanner = container.querySelector('.om-asset-error-banner')!;
      expect(errorBanner).not.toBeNull();
      expect(errorBanner.textContent).toContain('单个素材最大 64 MB。');
    });

    it('guards against switching project during upload: does not merge old project upload into new project', async () => {
      const projectA: Project = {
        ...createEmptyProject(),
        id: 'project-A',
        actions: [createAction('circle', { name: '圆A' })]
      };
      const projectB: Project = {
        ...createEmptyProject(),
        id: 'project-B',
        actions: [createAction('square', { name: '方B' })]
      };

      let resolveUpload!: (asset: MediaAsset) => void;
      const uploadPromise = new Promise<MediaAsset>(resolve => {
        resolveUpload = resolve;
      });
      vi.spyOn(api, 'uploadAsset').mockReturnValue(uploadPromise);

      const onChange = vi.fn();

      const { rerender } = {
        rerender: (proj: Project) => {
          root.render(
            React.createElement(AssetShelf, {
              project: proj,
              onProjectChange: onChange,
              onError: vi.fn()
            })
          );
        }
      };

      await act(async () => {
        rerender(projectA);
      });

      // Start upload on projectA
      const fileInput = container.querySelector<HTMLInputElement>('[data-testid="om-asset-file-input"]')!;
      const testFile = new File(['pic-bytes'], 'old-proj.png', { type: 'image/png' });
      await act(async () => {
        Object.defineProperty(fileInput, 'files', {
          value: [testFile],
          writable: true
        });
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      });

      // User switches to projectB while upload is in progress!
      await act(async () => {
        rerender(projectB);
      });

      // Upload resolves
      await act(async () => {
        resolveUpload({
          id: 'old-pic',
          name: 'old-proj.png',
          kind: 'image',
          extension: 'png',
          bytes: 1024
        });
      });

      // onChange must NOT be called to contaminate projectB!
      expect(onChange).not.toHaveBeenCalled();
    });

    it('guards against unmounting during upload: does not write state or trigger onChange', async () => {
      const project = createEmptyProject();
      let resolveUpload!: (asset: MediaAsset) => void;
      const uploadPromise = new Promise<MediaAsset>(resolve => {
        resolveUpload = resolve;
      });
      vi.spyOn(api, 'uploadAsset').mockReturnValue(uploadPromise);

      const onChange = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(AssetShelf, {
            project,
            onProjectChange: onChange,
            onError: vi.fn()
          })
        );
      });

      const fileInput = container.querySelector<HTMLInputElement>('[data-testid="om-asset-file-input"]')!;
      const testFile = new File(['pic-bytes'], 'unmount.png', { type: 'image/png' });
      await act(async () => {
        Object.defineProperty(fileInput, 'files', {
          value: [testFile],
          writable: true
        });
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      });

      // Unmount component before upload completes
      await act(async () => {
        root.unmount();
      });

      // Upload completes after unmount
      await act(async () => {
        resolveUpload({
          id: 'unmounted-pic',
          name: 'unmount.png',
          kind: 'image',
          extension: 'png',
          bytes: 1024
        });
      });

      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
