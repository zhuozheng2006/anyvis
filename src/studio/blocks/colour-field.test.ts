// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Blockly from 'blockly/core';
import { ColourField, createColourEditor, normaliseHexColour } from './colour-field';

const workspaces: Blockly.Workspace[] = [];
afterEach(() => { for (const workspace of workspaces.splice(0)) workspace.dispose(); document.body.replaceChildren(); });
const flush = () => new Promise((resolve) => setTimeout(resolve, 15));

describe('Colour field', () => {
  it('preserves valid six-digit values and expands short hex without accepting arbitrary CSS', () => {
    expect(normaliseHexColour('#F8FAFC')).toBe('#F8FAFC');
    expect(normaliseHexColour('#aBc123')).toBe('#aBc123');
    expect(normaliseHexColour(' #aB3 ')).toBe('#aaBB33');
    for (const value of ['red', '#ffffff00', 'url(https://example.test)', '#12GG34', '', null]) expect(normaliseHexColour(value)).toBeNull();
  });

  it('keeps native-picker dragging local until one explicit apply', () => {
    const apply = vi.fn(); const cancel = vi.fn();
    const editor = createColourEditor({ value: '#60A5FA', apply, cancel });
    document.body.append(editor);
    const native = editor.querySelector<HTMLInputElement>('input[type="color"]')!;
    for (let index = 0; index < 100; index++) {
      native.value = `#${index.toString(16).padStart(6, '0')}`;
      native.dispatchEvent(new Event('input', { bubbles: true }));
    }
    expect(apply).not.toHaveBeenCalled();
    editor.querySelector<HTMLButtonElement>('.av-colour-apply')!.click();
    expect(apply).toHaveBeenCalledExactlyOnceWith('#000063');
    expect(cancel).not.toHaveBeenCalled();
  });

  it('validates hex drafts, supports keyboard apply, and cancels without a commit', () => {
    const apply = vi.fn(); const cancel = vi.fn();
    const editor = createColourEditor({ value: '#F8FAFC', apply, cancel });
    document.body.append(editor);
    const hex = editor.querySelector<HTMLInputElement>('input[type="text"]')!;
    hex.value = '#xyz'; hex.dispatchEvent(new Event('input'));
    expect(hex.getAttribute('aria-invalid')).toBe('true');
    expect(editor.querySelector<HTMLButtonElement>('.av-colour-apply')!.disabled).toBe(true);
    hex.value = '#abc'; hex.dispatchEvent(new Event('input'));
    hex.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(apply).toHaveBeenCalledExactlyOnceWith('#aabbcc');
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('serializes as hex text and makes a chosen colour one undoable change', async () => {
    Blockly.Blocks.av_colour_field_test = {
      init(this: Blockly.Block) { this.appendDummyInput().appendField(new ColourField('#F8FAFC'), 'COLOUR'); },
    };
    const workspace = new Blockly.Workspace(); workspaces.push(workspace);
    const block = workspace.newBlock('av_colour_field_test');
    const field = block.getField('COLOUR') as ColourField;
    await flush(); workspace.clearUndo();
    expect(field.commitColour('#123abc')).toBe(true);
    await flush();
    expect(workspace.getUndoStack()).toHaveLength(1);
    expect(Blockly.serialization.blocks.save(block)?.fields?.COLOUR).toBe('#123abc');
    workspace.undo(false); await flush();
    expect(field.getValue()).toBe('#F8FAFC');
    workspace.undo(true); await flush();
    expect(field.getValue()).toBe('#123abc');
    expect(field.commitColour('#123ABC')).toBe(false);
    expect(field.getValue()).toBe('#123abc');
  });
});
