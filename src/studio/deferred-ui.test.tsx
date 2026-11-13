// @vitest-environment jsdom
import { act, useState, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { deferredDialog, deferredPanel } from './deferred-ui';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const host = document.createElement('div');
document.body.appendChild(host);
let root = createRoot(host);
afterEach(async () => { await act(async () => root.unmount()); root = createRoot(host); vi.restoreAllMocks(); });

type Props = { isOpen: boolean; onClose: () => void; name?: string };
function Tool({ isOpen, name }: Props) {
  const [count, setCount] = useState(0);
  return isOpen ? <button onClick={() => setCount(count + 1)}>{name}:{count}</button> : null;
}

it('loads only on first open, preserves tool settings and receives current props on reopen', async () => {
  const load = vi.fn(async () => ({ default: Tool }));
  const Dialog = deferredDialog(load, '测试工具');
  const render = (isOpen: boolean, name: string) => act(async () => root.render(<Dialog isOpen={isOpen} name={name} onClose={() => {}} />));
  await render(false, '旧项目');
  expect(load).not.toHaveBeenCalled();
  await render(true, '旧项目');
  await act(async () => host.querySelector('button')!.click());
  await render(false, '新项目');
  expect(host.textContent).toBe('');
  await render(true, '新项目');
  expect(host.textContent).toBe('新项目:1');
  expect(load).toHaveBeenCalledTimes(1);
});

it('can close a pending dialog and never shows it after its delayed import resolves', async () => {
  let resolve!: (module: { default: ComponentType<Props> }) => void;
  const Dialog = deferredDialog(() => new Promise<{ default: ComponentType<Props> }>(done => { resolve = done; }), '慢工具');
  function App() {
    const [open, setOpen] = useState(true);
    return <Dialog isOpen={open} onClose={() => setOpen(false)} />;
  }
  await act(async () => root.render(<App />));
  expect(host.querySelector('[role="status"]')?.textContent).toContain('正在加载');
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  await act(async () => resolve({ default: Tool }));
  expect(host.textContent).toBe('');
});

it('retries a rejected import without losing the surrounding editor', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const load = vi.fn<() => Promise<{ default: ComponentType<Props> }>>()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ default: Tool });
  const Dialog = deferredDialog(load, '重试工具');
  await act(async () => root.render(<><input defaultValue="未保存内容" /><Dialog isOpen onClose={() => {}} name="恢复" /></>));
  const editor = host.querySelector('input');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('请重试');
  await act(async () => host.querySelector('button')!.click());
  expect(load).toHaveBeenCalledTimes(2);
  expect(host.textContent).toBe('恢复:0');
  expect(host.querySelector('input')).toBe(editor);
  expect(editor?.value).toBe('未保存内容');
});

it('hides a failed dialog on close and keeps its retry available when reopened', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const Dialog = deferredDialog<Props>(() => Promise.reject(new Error('offline')), '失败工具');
  const onClose = vi.fn();
  await act(async () => root.render(<Dialog isOpen onClose={onClose} />));
  await act(async () => host.querySelectorAll('button')[1].click());
  expect(onClose).toHaveBeenCalledOnce();
  await act(async () => root.render(<Dialog isOpen={false} onClose={onClose} />));
  expect(host.textContent).toBe('');
  await act(async () => root.render(<Dialog isOpen onClose={onClose} />));
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
});

it('closes a loaded deferred dialog on Escape unless already prevented or composing', async () => {
  const Dialog = deferredDialog(async () => ({
    default: ({ isOpen }: Props) => isOpen ? <div role="dialog" aria-label="测试弹窗">内容</div> : null,
  }), '快捷键弹窗');
  const onClose = vi.fn();
  await act(async () => root.render(<Dialog isOpen onClose={onClose} />));
  expect(host.querySelector('[role="dialog"]')).not.toBeNull();

  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, cancelable: true })));
  expect(onClose).not.toHaveBeenCalled();

  const cancelled = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
  cancelled.preventDefault();
  await act(async () => window.dispatchEvent(cancelled));
  expect(onClose).not.toHaveBeenCalled();

  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })));
  expect(onClose).toHaveBeenCalledOnce();
});

it('loads an editor panel with current props and recovers from an import failure', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const load = vi.fn<() => Promise<{ default: ComponentType<{ value: string }> }>>()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ default: ({ value }) => <pre>{value}</pre> });
  const Panel = deferredPanel(load, '代码编辑器');
  await act(async () => root.render(<Panel value="old" />));
  await act(async () => root.render(<Panel value="current" />));
  await act(async () => host.querySelector('button')!.click());
  expect(host.querySelector('pre')?.textContent).toBe('current');
  expect(host.querySelector('[role="dialog"]')).toBeNull();
});
