// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Blockly from 'blockly/core';
import { MatrixField, createMatrixEditor, parseMatrixValue, serializeMatrixDraft } from './matrix-field';

const numeric = { fixedRows: 2, fixedColumns: 2, numericOnly: true };
function button(editor: HTMLElement, label: string): HTMLButtonElement {
  const result = [...editor.querySelectorAll('button')].find((item) => item.textContent === label);
  if (!result) throw new Error(`Missing button ${label}`);
  return result;
}
function change(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  input.value = value; input.dispatchEvent(new Event('input', { bubbles: true }));
}
afterEach(() => document.body.replaceChildren());

describe('matrix field data', () => {
  it('accepts numeric and TeX cells while enforcing shape and numeric-only transforms', () => {
    expect(parseMatrixValue('[[1,"\\\\frac{1}{2}"],["a",-0.5]]')).toEqual([[1, '\\frac{1}{2}'], ['a', -0.5]]);
    expect(() => parseMatrixValue('[[1,2],[3]]')).toThrow('每一行');
    expect(() => parseMatrixValue('[[1,2,3],[4,5,6]]', numeric)).toThrow('2 行 × 2 列');
    expect(() => parseMatrixValue('[[1,"a"],[0,1]]', numeric)).toThrow('有限数字');
    expect(() => parseMatrixValue('[[true]]')).toThrow('数字或简短数学公式');
  });

  it('preserves exact original JSON and untouched numeric-string cell types', () => {
    const original = '[ [1, "2"], ["x", 4] ]';
    expect(serializeMatrixDraft([['1', '2'], ['x', '4']], original)).toBe(original);
    expect(serializeMatrixDraft([['3', '2'], ['x', '4']], original)).toBe('[[3,"2"],["x",4]]');
    expect(serializeMatrixDraft([['1e2', '-.25'], ['0', '1']], '[[1,0],[0,1]]', numeric)).toBe('[[100,-0.25],[0,1]]');
  });

  it('rejects empty edits, invalid numeric cells and overlarge values without coercion', () => {
    expect(() => serializeMatrixDraft([['', '0'], ['0', '1']], '[[1,0],[0,1]]', numeric)).toThrow('还没有内容');
    expect(() => serializeMatrixDraft([['x', '0'], ['0', '1']], '[[1,0],[0,1]]', numeric)).toThrow('需要数字');
    expect(() => serializeMatrixDraft([['1e99']], '[[1]]')).toThrow('10000');
  });

  it('preserves invalid imported data instead of silently replacing it', () => {
    const field = new MatrixField('broken matrix', numeric);
    expect(field.getValue()).toBe('broken matrix');
    expect(() => field.commitMatrix('[[1]]')).toThrow('2 行');
    expect(field.getValue()).toBe('broken matrix');
    field.dispose();
  });
});

describe('matrix editor interactions', () => {
  it('applies all edited cells in a single callback and Cancel never commits', () => {
    const apply = vi.fn(), cancel = vi.fn();
    const editor = createMatrixEditor({ value: '[[1,0],[0,1]]', settings: numeric, apply, cancel });
    document.body.append(editor);
    const cells = [...editor.querySelectorAll<HTMLInputElement>('.av-matrix-grid input')];
    change(cells[0], '2'); change(cells[1], '-1');
    expect(apply).not.toHaveBeenCalled();
    button(editor, '取消').click();
    expect(cancel).toHaveBeenCalledOnce(); expect(apply).not.toHaveBeenCalled();
    button(editor, '应用矩阵').click();
    expect(apply).toHaveBeenCalledExactlyOnceWith('[[2,-1],[0,1]]');
  });

  it('uses editable rows and columns without publishing draft resize operations', () => {
    const apply = vi.fn();
    const editor = createMatrixEditor({ value: '[[1,2],[3,4]]', apply, cancel: vi.fn() });
    const rows = editor.querySelector<HTMLSelectElement>('[aria-label="矩阵行数"]')!;
    rows.value = '3'; rows.dispatchEvent(new Event('change', { bubbles: true }));
    expect(editor.querySelectorAll('.av-matrix-grid input')).toHaveLength(6);
    expect(apply).not.toHaveBeenCalled();
    button(editor, '应用矩阵').click();
    expect(apply).toHaveBeenCalledExactlyOnceWith('[[1,2],[3,4],[0,0]]');
  });

  it('keeps matrices beyond six rows complete in the explicit raw-data fallback', () => {
    const raw = JSON.stringify(Array.from({ length: 7 }, (_, i) => [i, i + 1]));
    const apply = vi.fn();
    const editor = createMatrixEditor({ value: raw, apply, cancel: vi.fn() });
    expect(editor.querySelector('textarea')?.value).toBe(raw);
    expect(editor.querySelectorAll('.av-matrix-grid input')).toHaveLength(0);
    expect(editor.textContent).toContain('超过 6 × 6');
    button(editor, '应用矩阵').click();
    expect(apply).toHaveBeenCalledExactlyOnceWith(raw);
  });

  it('shows invalid existing content and requires explicit repair before applying', () => {
    const apply = vi.fn();
    const editor = createMatrixEditor({ value: 'invalid old value', settings: numeric, apply, cancel: vi.fn() });
    expect(editor.querySelector('textarea')?.value).toBe('invalid old value');
    button(editor, '应用矩阵').click();
    expect(apply).not.toHaveBeenCalled(); expect(editor.querySelector('.is-error')?.textContent).toContain('格式不正确');
    button(editor, '新建 2 × 2 网格').click();
    expect(apply).not.toHaveBeenCalled();
    button(editor, '应用矩阵').click();
    expect(apply).toHaveBeenCalledExactlyOnceWith('[[1,0],[0,1]]');
  });

  it('restores a complete grid change with one Blockly undo', async () => {
    const original = '[ [1, 0], [0, 1] ]';
    Blockly.Blocks.anyvis_matrix_editor_test = { init(this: Blockly.Block) { this.appendDummyInput().appendField(new MatrixField(original, numeric), 'matrix'); } };
    const workspace = new Blockly.Workspace();
    const block = workspace.newBlock('anyvis_matrix_editor_test');
    const field = block.getField('matrix') as MatrixField;
    await new Promise((resolve) => setTimeout(resolve, 15));
    workspace.clearUndo();
    const editor = createMatrixEditor({ value: original, settings: numeric, apply: (value) => field.commitMatrix(value), cancel: vi.fn() });
    const cells = [...editor.querySelectorAll<HTMLInputElement>('.av-matrix-grid input')];
    change(cells[0], '3'); change(cells[3], '4');
    expect(field.getValue()).toBe(original);
    button(editor, '应用矩阵').click();
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(field.getValue()).toBe('[[3,0],[0,4]]');
    expect(workspace.getUndoStack()).toHaveLength(1);
    workspace.undo(false);
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(field.getValue()).toBe(original);
    workspace.dispose(); delete Blockly.Blocks.anyvis_matrix_editor_test;
  });
});
