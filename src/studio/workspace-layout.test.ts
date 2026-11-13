// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import { WorkspaceLayout } from './WorkspaceLayout';

// @ts-expect-error React test flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const host = document.createElement('div');
document.body.append(host);
let root = createRoot(host);
afterEach(() => { act(() => root.unmount()); root = createRoot(host); localStorage.clear(); });
function render() {
  act(() => root.render(React.createElement(WorkspaceLayout, {
    editor: React.createElement('input', { defaultValue: '正在编辑的内容' }),
    preview: '预览', inspector: '属性', status: '已连接',
  })));
  return [...host.querySelectorAll<HTMLElement>('[role="separator"]')];
}
function key(element: HTMLElement, value: string) {
  act(() => element.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true })));
}
it('resizes each axis with the keyboard without remounting or clearing the editor', () => {
  const [columns, rows] = render();
  const input = host.querySelector('input')!;
  input.value = '未提交的输入';
  key(columns, 'ArrowRight'); key(rows, 'ArrowUp');
  expect(columns.getAttribute('aria-valuenow')).toBe('60');
  expect(rows.getAttribute('aria-valuenow')).toBe('46');
  expect(host.querySelector('input')).toBe(input);
  expect(input.value).toBe('未提交的输入');
  key(columns, 'End'); key(columns, 'ArrowRight');
  expect(columns.getAttribute('aria-valuenow')).toBe('72');
  key(columns, 'Enter');
  expect(columns.getAttribute('aria-valuenow')).toBe('58');
});
it('restores saved proportions and safely recovers from invalid storage', () => {
  const [columns] = render(); key(columns, 'ArrowLeft');
  act(() => root.unmount()); root = createRoot(host);
  expect(render()[0].getAttribute('aria-valuenow')).toBe('56');
  act(() => root.unmount()); root = createRoot(host);
  localStorage.setItem('anyvis.workspace-layout.v1', '{invalid');
  expect(render()[0].getAttribute('aria-valuenow')).toBe('58');
});
it('ignores pointer drags when the layout container has zero size instead of producing NaN CSS splits', () => {
  const [columns] = render();
  act(() => {
    columns.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 100 }));
    columns.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 250 }));
    columns.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
  });
  expect(columns.getAttribute('aria-valuenow')).toBe('58');
  const main = host.querySelector<HTMLElement>('main.workspace-split, main.resizable-workspace')!;
  expect(main.style.getPropertyValue('--editor-size')).toBe('58fr');
});
