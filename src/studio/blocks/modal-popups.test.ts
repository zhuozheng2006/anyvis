// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Blockly from 'blockly/core';
import { guardWorkspacePopups } from './modal-popups';

// DOM/event regressions, not browser paint or native context-menu acceptance.
describe('workspace popup ownership while dialogs are open', () => {
  let host: HTMLDivElement;
  let workspace: Blockly.WorkspaceSvg;
  let release: () => void;
  let close: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    host = document.createElement('div'); document.body.append(host);
    workspace = Blockly.inject(host, { sounds: false, trashcan: false,
      move: { scrollbars: false, drag: false, wheel: false } });
    close = vi.fn(() => Blockly.WidgetDiv.hide());
    release = guardWorkspacePopups(host, close);
  });
  afterEach(() => {
    release(); Blockly.WidgetDiv.hide(); workspace.dispose();
    Blockly.WidgetDiv.testOnly_setDiv(null); document.body.replaceChildren();
  });
  const flush = async () => { await new Promise<void>(resolve => queueMicrotask(resolve)); };
  const rightClick = (target: Element, type = 'pointerdown') => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 2 });
    target.dispatchEvent(event); return event;
  };
  function dialog() {
    const node = document.createElement('div'); node.setAttribute('role', 'dialog');
    node.innerHTML = '<input aria-label="参数" />'; document.body.append(node); return node;
  }
  it('closes an actual Blockly widget when a dialog opens and keeps dialog focus', async () => {
    Blockly.WidgetDiv.show({}, false, () => host.focus(), workspace, false);
    expect(Blockly.WidgetDiv.isVisible()).toBe(true);
    const modal = dialog(); const input = modal.querySelector('input')!; input.focus();
    await flush();
    expect(Blockly.WidgetDiv.isVisible()).toBe(false);
    expect(close).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(input);
    input.value = 'new value'; modal.append(document.createElement('span')); await flush();
    expect(close).toHaveBeenCalledOnce();
  });
  it('blocks background menu gestures, preserves dialog text menus, and restores workspace use on close', async () => {
    const openMenu = vi.fn(); host.addEventListener('pointerdown', openMenu);
    const modal = dialog(); await flush();
    expect(rightClick(host).defaultPrevented).toBe(true);
    expect(rightClick(host, 'contextmenu').defaultPrevented).toBe(true);
    expect(openMenu).not.toHaveBeenCalled();
    expect(rightClick(modal.querySelector('input')!, 'contextmenu').defaultPrevented).toBe(false);
    modal.remove(); await flush();
    expect(rightClick(host).defaultPrevented).toBe(false);
    expect(openMenu).toHaveBeenCalledOnce();
  });
  it('does not close Blockly parameter editors or block their workspace as external modals', async () => {
    const dropdown = document.createElement('div'); dropdown.className = 'blocklyDropDownDiv';
    document.body.append(dropdown); dropdown.append(dialog()); await flush();
    expect(close).not.toHaveBeenCalled();
    expect(rightClick(host).defaultPrevented).toBe(false);
  });
  it('ignores hidden and closed dialogs but observes opening a native dialog', async () => {
    const hidden = dialog(); hidden.hidden = true;
    const native = document.createElement('dialog'); document.body.append(native); await flush();
    expect(close).not.toHaveBeenCalled();
    native.setAttribute('open', ''); await flush(); expect(close).toHaveBeenCalledOnce();
    expect(rightClick(host).defaultPrevented).toBe(true);
  });
  it('removes listeners and observer when the workspace is disposed', async () => {
    release(); dialog(); await flush();
    expect(close).not.toHaveBeenCalled(); expect(rightClick(host).defaultPrevented).toBe(false);
  });
});
