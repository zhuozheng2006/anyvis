// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { ObjectManager } from './ObjectManager';
import { createAction } from './core/catalog';
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
});
