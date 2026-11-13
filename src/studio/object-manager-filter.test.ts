// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { ObjectManager } from './ObjectManager';
import { BLOCK_CATALOG, createAction } from './core/catalog';
import { managedDefinition } from './authoring';
import { createEmptyProject } from './core/project';
import type { Project } from './core/types';

// @ts-expect-error test flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function changeInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('ObjectManager category filtering, search, and layer reordering', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('renders category filter pills when 3 or more objects exist, and filters properly', async () => {
    const circle = createAction('circle', { name: '红圆' });
    const text = createAction('text', { name: '说明文' });
    const axes = createAction('axes', { name: '坐标轴' });

    const project: Project = {
      ...createEmptyProject(),
      actions: [circle, text, axes],
    };

    await act(async () => {
      root.render(
        React.createElement(ObjectManager, {
          project,
          selectedId: null,
          onSelect: vi.fn(),
          onChange: vi.fn(),
          onAdd: vi.fn(),
          onError: vi.fn(),
        })
      );
    });

    const pills = container.querySelectorAll('.om-tray-pill');
    expect(pills.length).toBe(4); // 全部, 图形, 文字, 坐标

    // Initially all 3 cards are shown
    expect(container.querySelectorAll('.om-card').length).toBe(3);

    // Click '图形' pill (shapes)
    const shapesPill = Array.from(pills).find(p => p.textContent?.includes('图形')) as HTMLButtonElement;
    expect(shapesPill).toBeTruthy();

    await act(async () => {
      shapesPill.click();
    });

    // Only circle card should be shown
    const cardsAfterShape = container.querySelectorAll('.om-card');
    expect(cardsAfterShape.length).toBe(1);
    expect(cardsAfterShape[0].textContent).toContain('红圆');

    // Click '文字' pill
    const textPill = Array.from(pills).find(p => p.textContent?.includes('文字')) as HTMLButtonElement;
    await act(async () => {
      textPill.click();
    });
    const cardsAfterText = container.querySelectorAll('.om-card');
    expect(cardsAfterText.length).toBe(1);
    expect(cardsAfterText[0].textContent).toContain('说明文');

    // Click '全部' pill
    const allPill = Array.from(pills).find(p => p.textContent?.includes('全部')) as HTMLButtonElement;
    await act(async () => {
      allPill.click();
    });
    expect(container.querySelectorAll('.om-card').length).toBe(3);
  });

  it('filters cards by search input', async () => {
    const circle = createAction('circle', { name: '主圆' });
    const square = createAction('square', { name: '方框' });
    const text = createAction('text', { name: '标题' });
    const axes = createAction('axes', { name: '平面' });

    const project: Project = {
      ...createEmptyProject(),
      actions: [circle, square, text, axes],
    };

    await act(async () => {
      root.render(
        React.createElement(ObjectManager, {
          project,
          selectedId: null,
          onSelect: vi.fn(),
          onChange: vi.fn(),
          onAdd: vi.fn(),
          onError: vi.fn(),
        })
      );
    });

    const searchInput = container.querySelector('.om-tray-search-input') as HTMLInputElement;
    expect(searchInput).toBeTruthy();

    await act(async () => {
      changeInput(searchInput, '方框');
    });

    const cards = container.querySelectorAll('.om-card');
    expect(cards.length).toBe(1);
    expect(cards[0].textContent).toContain('方框');
  });

  it('reorders layers when ◀ / ▶ buttons are clicked', async () => {
    const circle = createAction('circle', { name: '第1层' });
    const square = createAction('square', { name: '第2层' });

    const project: Project = {
      ...createEmptyProject(),
      actions: [circle, square],
    };
    const onChange = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(ObjectManager, {
          project,
          selectedId: null,
          onSelect: vi.fn(),
          onChange,
          onAdd: vi.fn(),
          onError: vi.fn(),
        })
      );
    });

    const cards = container.querySelectorAll('.om-card');
    expect(cards.length).toBe(2);

    // The first card can be moved right (▶)
    const rightBtn = cards[0].querySelector('.om-card-layer-btn') as HTMLButtonElement;
    expect(rightBtn).toBeTruthy();
    expect(rightBtn.textContent).toContain('▶');

    await act(async () => {
      rightBtn.click();
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    const updatedProject = onChange.mock.calls[0][0] as Project;
    // square should now be before circle
    expect(updatedProject.actions[0].id).toBe(square.id);
    expect(updatedProject.actions[1].id).toBe(circle.id);
  });

  it('reorders an object right after its neighbor without pushing it behind later animations', async () => {
    const circle = createAction('circle', { name: '第1层' });
    const square = createAction('square', { name: '第2层' });
    const wait = createAction('wait', { duration: 1 });
    const move = createAction('shift', { target: '第1层', dx: 1 });

    const project: Project = {
      ...createEmptyProject(),
      actions: [circle, square, wait, move],
    };
    const onChange = vi.fn();
    const onError = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(ObjectManager, {
          project,
          selectedId: null,
          onSelect: vi.fn(),
          onChange,
          onAdd: vi.fn(),
          onError,
        })
      );
    });

    const cards = container.querySelectorAll('.om-card');
    const rightBtn = cards[0].querySelector('.om-card-layer-btn') as HTMLButtonElement;
    await act(async () => {
      rightBtn.click();
    });

    expect(onError).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledTimes(1);
    const updatedProject = onChange.mock.calls[0][0] as Project;
    expect(updatedProject.actions.map(a => a.id)).toEqual([square.id, circle.id, wait.id, move.id]);
  });

  async function mount(project: Project, selectedId: string | null = null, onSelect = vi.fn()) {
    await act(async () => root.render(React.createElement(ObjectManager, {
      project, selectedId, onSelect, onChange: vi.fn(), onAdd: vi.fn(), onError: vi.fn(),
    })));
    return onSelect;
  }
  async function filter(label: string) {
    const button = [...container.querySelectorAll<HTMLButtonElement>('.om-tray-pill')].find(button => button.textContent?.trim() === label)!;
    await act(async () => button.click());
  }

  it('classifies shapes, text, and coordinates by their actual kind, including API objects', async () => {
    const apiAxes = BLOCK_CATALOG.find(definition => definition.apiId && definition.objectKind === 'axes3d' && managedDefinition(definition))!;
    const project = { ...createEmptyProject(), actions: [
      createAction('ellipse', { name: '椭圆' }), createAction('sphere', { name: '球' }),
      createAction('number_line', { name: '数轴' }), createAction('dynamic_number', { name: '读数' }),
      createAction(apiAxes.type, { name: 'API 空间坐标' }),
    ] };
    await mount(project);
    await filter('图形');
    expect([...container.querySelectorAll('.om-card-name')].map(node => node.textContent)).toEqual(['椭圆', '球']);
    await filter('文字');
    expect([...container.querySelectorAll('.om-card-name')].map(node => node.textContent)).toEqual(['读数']);
    await filter('坐标');
    expect([...container.querySelectorAll('.om-card-name')].map(node => node.textContent)).toEqual(['数轴', 'API 空间坐标']);
  });

  it('keeps active filters recoverable after deleting enough objects to hide the usual controls', async () => {
    const project = { ...createEmptyProject(), actions: [createAction('circle'), createAction('text'), createAction('axes'), createAction('square')] };
    await mount(project);
    await filter('文字');
    await act(async () => changeInput(container.querySelector('.om-tray-search-input')!, '找不到'));
    await mount({ ...project, actions: [project.actions[0]] });
    expect(container.querySelector('.om-tray-search-input')).not.toBeNull();
    expect(container.querySelector('.om-tray-filter-pills')).not.toBeNull();
    expect(container.querySelector('.om-empty-results')?.textContent).toContain('没有匹配');
    await act(async () => container.querySelector<HTMLButtonElement>('.om-filter-status button')!.click());
    expect(container.querySelectorAll('.om-card')).toHaveLength(1);
    expect(container.querySelector('.om-filter-status')).toBeNull();
  });

  it('clears filters when opening another project and does not silently switch a hidden selection', async () => {
    const circle = createAction('circle', { name: '原选中对象' });
    const project = { ...createEmptyProject(), actions: [circle, createAction('text'), createAction('axes')] };
    const select = await mount(project, circle.id);
    await filter('文字');
    expect(select).not.toHaveBeenCalled();
    expect(container.querySelector('.om-selected-name')?.textContent).toBe('原选中对象');
    expect(container.querySelector('.om-selection-notice')?.textContent).toContain('不在筛选结果');
    await mount({ ...createEmptyProject(), actions: [createAction('square')] });
    expect(container.querySelectorAll('.om-card')).toHaveLength(1);
    expect(container.querySelector('.om-filter-status')).toBeNull();
  });

  it('moves selection with arrow keys and Home/End without nesting action buttons', async () => {
    const actions = [createAction('circle'), createAction('square'), createAction('text')];
    const project = { ...createEmptyProject(), actions };
    const select = await mount(project);
    const buttons = container.querySelectorAll<HTMLButtonElement>('.om-card-select');
    expect(buttons[0].tabIndex).toBe(0);
    expect(buttons[1].tabIndex).toBe(-1);
    expect(container.querySelector('button button')).toBeNull();
    buttons[0].focus();
    await act(async () => buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    expect(select).toHaveBeenLastCalledWith(actions[1].id);
    expect(document.activeElement).toBe(buttons[1]);
    await act(async () => buttons[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })));
    expect(document.activeElement).toBe(buttons[2]);
    await act(async () => buttons[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })));
    expect(document.activeElement).toBe(buttons[0]);
    select.mockClear();
    await act(async () => container.querySelector<HTMLButtonElement>('.om-card-del-btn')!.click());
    expect(select).not.toHaveBeenCalledWith(actions[0].id);
  });

  it('reveals an externally selected card without stealing keyboard focus', async () => {
    const actions = [createAction('circle'), createAction('square')];
    const project = { ...createEmptyProject(), actions };
    await mount(project, actions[0].id);
    const buttons = container.querySelectorAll<HTMLButtonElement>('.om-card-select');
    const scroll = vi.fn(); buttons[1].scrollIntoView = scroll;
    const add = container.querySelector<HTMLButtonElement>('.om-card-add-trigger')!; add.focus();
    await mount(project, actions[1].id);
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
    expect(document.activeElement).toBe(add);
    expect(buttons[1].tabIndex).toBe(0);
    scroll.mockClear();
    await mount({ ...project, actions: [actions[0], { ...actions[1], fields: { ...actions[1].fields, side: 3 } }] }, actions[1].id);
    expect(scroll).not.toHaveBeenCalled();
  });

  it('uses Escape to clear search without leaving the editor', async () => {
    const project = { ...createEmptyProject(), actions: [createAction('circle'), createAction('square'), createAction('axes'), createAction('text')] };
    await mount(project);
    const input = container.querySelector<HTMLInputElement>('.om-tray-search-input')!;
    await act(async () => changeInput(input, 'not-found'));
    expect(container.querySelectorAll('.om-card')).toHaveLength(0);
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(input.value).toBe('');
    expect(container.querySelectorAll('.om-card')).toHaveLength(4);
  });

});
