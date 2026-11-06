// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Blockly from 'blockly/core';
import { createMultilineCodeEditor, indentCode, MultilineCodeField } from './multiline-code-field';

const workspaces: Blockly.Workspace[] = [];
afterEach(() => { for (const workspace of workspaces.splice(0)) workspace.dispose(); document.body.replaceChildren(); });
const flush = () => new Promise((resolve) => setTimeout(resolve, 15));

describe('Multiline Python field', () => {
  it('indents and outdents selected lines without touching the next unselected line', () => {
    const original = 'first\nsecond\nthird';
    const indented = indentCode(original, 0, 13);
    expect(indented.value).toBe('    first\n    second\nthird');
    const restored = indentCode(indented.value, indented.start, indented.end, true);
    expect(restored.value).toBe(original);
    expect(indentCode('a\nb', 0, 2).value).toBe('    a\nb');
    expect(indentCode('\nx', 0, 1).value).toBe('    \nx');
  });

  it('preserves source bytes on an unchanged apply and keeps edits local until confirmation', () => {
    const original = 'if True:\r\n    self.wait(1)\r\n';
    const apply = vi.fn();
    const editor = createMultilineCodeEditor({ value: original, apply, cancel: vi.fn() });
    document.body.append(editor);
    editor.querySelector<HTMLButtonElement>('.av-multiline-apply')!.click();
    expect(apply).toHaveBeenLastCalledWith(original);
    apply.mockClear();
    const textarea = editor.querySelector('textarea')!;
    textarea.value = 'self.wait(2)\nself.wait(3)';
    textarea.dispatchEvent(new Event('input'));
    expect(apply).not.toHaveBeenCalled();
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    expect(apply).toHaveBeenCalledExactlyOnceWith('self.wait(2)\nself.wait(3)');
  });

  it('serializes all newlines and undoes an applied code edit in one step', async () => {
    const original = 'if True:\n    self.wait(1)\n';
    Blockly.Blocks.av_multiline_field_test = {
      init(this: Blockly.Block) { this.appendDummyInput().appendField(new MultilineCodeField(original), 'CODE'); },
    };
    const workspace = new Blockly.Workspace(); workspaces.push(workspace);
    const block = workspace.newBlock('av_multiline_field_test');
    const field = block.getField('CODE') as MultilineCodeField;
    expect(Blockly.serialization.blocks.save(block)?.fields?.CODE).toBe(original);
    await flush(); workspace.clearUndo();
    const replacement = 'for i in range(2):\n    self.wait(0.5)\n';
    field.commitCode(replacement); await flush();
    expect(workspace.getUndoStack()).toHaveLength(1);
    workspace.undo(false); await flush();
    expect(field.getValue()).toBe(original);
    workspace.undo(true); await flush();
    expect(field.getValue()).toBe(replacement);
  });
});
