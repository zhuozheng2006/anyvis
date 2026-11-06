// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Blockly from 'blockly/core';
import {
  ObjectListField,
  createObjectListEditor,
  parseMemberList,
  serializeMemberList,
} from './object-list-field';

const workspaces: Blockly.Workspace[] = [];
afterEach(() => {
  for (const workspace of workspaces.splice(0)) workspace.dispose();
  document.body.replaceChildren();
});
const flush = () => new Promise((resolve) => setTimeout(resolve, 15));

function button(editor: HTMLElement, label: string): HTMLButtonElement {
  const result = [...editor.querySelectorAll('button')].find((item) => item.textContent?.trim() === label);
  if (!result) throw new Error(`Missing button: ${label}`);
  return result;
}

function getCheckbox(editor: HTMLElement, name: string): HTMLInputElement {
  const row = [...editor.querySelectorAll<HTMLLabelElement>('.av-object-list-item')].find((el) => {
    return el.querySelector('.av-object-list-name')?.textContent === name;
  });
  if (!row) throw new Error(`Missing item row for ${name}`);
  const input = row.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (!input) throw new Error(`Missing checkbox for ${name}`);
  return input;
}

describe('ObjectListField data helpers', () => {
  it('parses comma-separated names strictly by English comma and preserves Chinese comma in names', () => {
    expect(parseMemberList('圆, 方块,  三角 ')).toEqual(['圆', '方块', '三角']);
    // Chinese comma is not a separator; it is preserved as part of the legacy name
    expect(parseMemberList('圆，带逗号, 普通圆, 圆，带逗号')).toEqual(['圆，带逗号', '普通圆']);
    expect(parseMemberList('')).toEqual([]);
    expect(parseMemberList('   ')).toEqual([]);
  });

  it('preserves exact original string byte-for-byte and spacing when unchanged', () => {
    const original = ' 圆,  方块 , 圆 ';
    expect(serializeMemberList(['圆', '方块'], original)).toBe(original);
    const untouched = 'A, B, C';
    expect(serializeMemberList(['A', 'B', 'C'], untouched)).toBe(untouched);
    const legacy = ' 名称，带中文逗号 , 正常名称 ';
    expect(serializeMemberList(['名称，带中文逗号', '正常名称'], legacy)).toBe(legacy);
  });

  it('serializes modified selections as comma-separated string in user selection order', () => {
    expect(serializeMemberList(['圆', '星形', '方块'], '圆, 方块')).toBe('圆,星形,方块');
    expect(serializeMemberList(['方块'], '圆, 方块')).toBe('方块');
    expect(serializeMemberList([], '圆')).toBe('');
  });
});

describe('ObjectListEditor interactions', () => {
  it('handles select and deselect in draft, applies on button click, and cancels without applying', () => {
    const apply = vi.fn();
    const cancel = vi.fn();
    const editor = createObjectListEditor({
      value: '圆',
      choices: ['圆', '方块', '三角'],
      apply,
      cancel,
    });
    document.body.append(editor);

    const circle = getCheckbox(editor, '圆');
    const square = getCheckbox(editor, '方块');
    const triangle = getCheckbox(editor, '三角');

    expect(circle.checked).toBe(true);
    expect(square.checked).toBe(false);
    expect(triangle.checked).toBe(false);

    // Cancel without changes
    button(editor, '取消').click();
    expect(cancel).toHaveBeenCalledOnce();
    expect(apply).not.toHaveBeenCalled();

    // Toggle items
    square.checked = true;
    square.dispatchEvent(new Event('change', { bubbles: true }));
    triangle.checked = true;
    triangle.dispatchEvent(new Event('change', { bubbles: true }));

    // Press Escape to cancel draft
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(apply).not.toHaveBeenCalled();

    // Now apply
    button(editor, '应用成员').click();
    expect(apply).toHaveBeenCalledExactlyOnceWith('圆,方块,三角');
  });

  it('displays and preserves missing members with annotation and allows unchecking them', () => {
    const apply = vi.fn();
    const editor = createObjectListEditor({
      value: '已删除对象, 现有对象',
      choices: ['现有对象', '新对象'],
      apply,
      cancel: vi.fn(),
    });
    document.body.append(editor);

    const missingRow = [...editor.querySelectorAll('.av-object-list-item')].find((el) =>
      el.textContent?.includes('已删除对象')
    );
    expect(missingRow).toBeDefined();
    expect(missingRow?.textContent).toContain('已缺失');

    const missingCheckbox = getCheckbox(editor, '已删除对象');
    expect(missingCheckbox.checked).toBe(true);

    // If applied as-is, the missing member is preserved byte-for-byte
    button(editor, '应用成员').click();
    expect(apply).toHaveBeenCalledWith('已删除对象, 现有对象');

    // If unchecked, the missing member is removed
    missingCheckbox.checked = false;
    missingCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
    button(editor, '应用成员').click();
    expect(apply).toHaveBeenLastCalledWith('现有对象');
  });

  it('preserves user selection order for newly selected members', () => {
    const apply = vi.fn();
    const editor = createObjectListEditor({
      value: 'A',
      choices: ['A', 'B', 'C', 'D'],
      apply,
      cancel: vi.fn(),
    });
    document.body.append(editor);

    // User checks D first, then B
    const dBox = getCheckbox(editor, 'D');
    const bBox = getCheckbox(editor, 'B');

    dBox.checked = true;
    dBox.dispatchEvent(new Event('change', { bubbles: true }));

    bBox.checked = true;
    bBox.dispatchEvent(new Event('change', { bubbles: true }));

    button(editor, '应用成员').click();
    expect(apply).toHaveBeenCalledExactlyOnceWith('A,D,B');
  });

  it('preserves legacy Chinese-comma member while prohibiting new choices containing commas', () => {
    const apply = vi.fn();
    const editor = createObjectListEditor({
      value: '旧，中文逗号名称',
      choices: ['合法名称', '非法,含英文逗号', '新，含中文逗号'],
      apply,
      cancel: vi.fn(),
    });
    document.body.append(editor);

    // Legacy member with Chinese comma is preserved and enabled
    const legacyBox = getCheckbox(editor, '旧，中文逗号名称');
    expect(legacyBox.disabled).toBe(false);
    expect(legacyBox.checked).toBe(true);

    // New choices with commas are disabled
    const badEnglish = getCheckbox(editor, '非法,含英文逗号');
    const badChinese = getCheckbox(editor, '新，含中文逗号');
    const good = getCheckbox(editor, '合法名称');

    expect(badEnglish.disabled).toBe(true);
    expect(badChinese.disabled).toBe(true);
    expect(good.disabled).toBe(false);

    // Select good choice
    good.checked = true;
    good.dispatchEvent(new Event('change', { bubbles: true }));
    button(editor, '应用成员').click();
    expect(apply).toHaveBeenCalledExactlyOnceWith('旧，中文逗号名称,合法名称');
  });

  it('shows an empty-list prompt when no choices and no members exist', () => {
    const editor = createObjectListEditor({
      value: '',
      choices: [],
      apply: vi.fn(),
      cancel: vi.fn(),
    });
    document.body.append(editor);

    expect(editor.textContent).toContain('暂无可选图形，请先创建图形');
    const searchInput = editor.querySelector<HTMLInputElement>('.av-object-list-search')!;
    expect(searchInput.disabled).toBe(true);
  });

  it('supports searching names without discarding existing draft selections', () => {
    const apply = vi.fn();
    const editor = createObjectListEditor({
      value: '圆A',
      choices: ['圆A', '圆B', '方形'],
      apply,
      cancel: vi.fn(),
    });
    document.body.append(editor);

    const searchInput = editor.querySelector<HTMLInputElement>('.av-object-list-search')!;
    searchInput.value = '方形';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));

    const squareBox = getCheckbox(editor, '方形');
    squareBox.checked = true;
    squareBox.dispatchEvent(new Event('change', { bubbles: true }));

    // Search something with no match
    searchInput.value = '未知';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(editor.querySelector<HTMLElement>('.av-object-list-no-match')?.style.display).toBe('block');

    // Apply with filter active still retains both selected items
    button(editor, '应用成员').click();
    expect(apply).toHaveBeenCalledExactlyOnceWith('圆A,方形');
  });

  it('filters out checkboxes whose ancestor label is hidden by search during Tab navigation', () => {
    const editor = createObjectListEditor({
      value: '',
      choices: ['圆', '方块'],
      apply: vi.fn(),
      cancel: vi.fn(),
    });
    document.body.append(editor);

    const searchInput = editor.querySelector<HTMLInputElement>('.av-object-list-search')!;
    const circleBox = getCheckbox(editor, '圆');
    const squareBox = getCheckbox(editor, '方块');
    const applyBtn = button(editor, '应用成员');

    // Search '方' so '圆' is hidden on its parent label
    searchInput.value = '方';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));

    const circleLabel = circleBox.closest<HTMLLabelElement>('.av-object-list-item')!;
    const squareLabel = squareBox.closest<HTMLLabelElement>('.av-object-list-item')!;
    expect(circleLabel.style.display).toBe('none');
    expect(squareLabel.style.display).toBe('flex');

    // Enter in search input should jump straight to the visible '方块' checkbox, skipping '圆'
    searchInput.focus();
    searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(document.activeElement).toBe(squareBox);

    // Shift+Tab from search input should wrap to applyBtn, not the hidden circleBox
    searchInput.focus();
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    expect(document.activeElement).toBe(applyBtn);

    // Tab from applyBtn should wrap back to searchInput
    applyBtn.focus();
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: false, bubbles: true }));
    expect(document.activeElement).toBe(searchInput);
  });
});

describe('ObjectListField block and undo integration', () => {
  it('displays “选择成员” when empty and “已选 N 个对象” when populated', () => {
    const emptyField = new ObjectListField('', () => ['圆', '方块']);
    expect(emptyField.getText()).toBe('选择成员');

    const singleField = new ObjectListField('圆', () => ['圆', '方块']);
    expect(singleField.getText()).toBe('已选 1 个对象');

    const multiField = new ObjectListField('圆, 方块, 三角', () => ['圆', '方块', '三角']);
    expect(multiField.getText()).toBe('已选 3 个对象');
  });

  it('records exactly one undo event per commit and restores the previous value on undo', async () => {
    Blockly.Blocks.av_object_list_field_test = {
      init(this: Blockly.Block) {
        this.appendDummyInput().appendField(
          new ObjectListField('圆', () => ['圆', '方块', '三角']),
          'MEMBERS'
        );
      },
    };

    const workspace = new Blockly.Workspace();
    workspaces.push(workspace);
    const block = workspace.newBlock('av_object_list_field_test');
    const field = block.getField('MEMBERS') as ObjectListField;

    await flush();
    workspace.clearUndo();
    expect(field.getValue()).toBe('圆');
    expect(field.getText()).toBe('已选 1 个对象');

    // First commit
    expect(field.commitMembers('圆,方块')).toBe(true);
    await flush();

    expect(workspace.getUndoStack()).toHaveLength(1);
    expect(field.getValue()).toBe('圆,方块');
    expect(field.getText()).toBe('已选 2 个对象');

    // Same value does not add an undo event
    expect(field.commitMembers('圆,方块')).toBe(false);
    expect(workspace.getUndoStack()).toHaveLength(1);

    // Undo restores previous value
    workspace.undo(false);
    await flush();
    expect(field.getValue()).toBe('圆');
    expect(field.getText()).toBe('已选 1 个对象');

    // Redo restores new value
    workspace.undo(true);
    await flush();
    expect(field.getValue()).toBe('圆,方块');
    expect(field.getText()).toBe('已选 2 个对象');

    delete Blockly.Blocks.av_object_list_field_test;
  });
});
