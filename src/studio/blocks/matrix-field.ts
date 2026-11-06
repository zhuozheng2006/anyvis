import * as Blockly from 'blockly/core';
import './matrix-field.css';

export type MatrixCell = number | string;
export interface MatrixFieldOptions {
  fixedRows?: number;
  fixedColumns?: number;
  numericOnly?: boolean;
}
const MAX_EXISTING_SIZE = 12;
const MAX_GRID_SIZE = 6;
const NUMERIC_TEXT = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/** The stored value stays JSON, including values imported before this editor existed. */
export function parseMatrixValue(raw: string, options: MatrixFieldOptions = {}): MatrixCell[][] {
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { throw new Error('矩阵数据格式不正确。原值已保留，可以修正原始数据，或明确新建一个网格。'); }
  if (!Array.isArray(value) || !value.length || value.length > MAX_EXISTING_SIZE || !value.every(Array.isArray)) {
    throw new Error('矩阵需要 1–12 行，每一行都需要包含元素。');
  }
  const rows = value as unknown[][];
  const columns = rows[0].length;
  if (!columns || columns > MAX_EXISTING_SIZE || rows.some((row) => row.length !== columns)) {
    throw new Error('每一行的元素数量必须相同，列数需要在 1–12 之间。');
  }
  if ((options.fixedRows && rows.length !== options.fixedRows) || (options.fixedColumns && columns !== options.fixedColumns)) {
    throw new Error(`二维线性变换需要 ${options.fixedRows ?? 2} 行 × ${options.fixedColumns ?? 2} 列矩阵。`);
  }
  rows.forEach((row, r) => row.forEach((cell, c) => {
    const numeric = typeof cell === 'number' && Number.isFinite(cell) && Math.abs(cell) <= 10000;
    const mathematicalText = !options.numericOnly && typeof cell === 'string' && cell.length < 200;
    if (!numeric && !mathematicalText) {
      throw new Error(`第 ${r + 1} 行第 ${c + 1} 列需要${options.numericOnly ? '有限数字' : '数字或简短数学公式'}；数值绝对值不能超过 10000。`);
    }
  }));
  return rows as MatrixCell[][];
}

/** Preserve untouched cell types and byte-for-byte JSON when a user makes no change. */
export function serializeMatrixDraft(draft: string[][], previousRaw: string, options: MatrixFieldOptions = {}): string {
  let previous: MatrixCell[][] | null = null;
  try { previous = parseMatrixValue(previousRaw, options); } catch { /* Explicit repair can replace invalid imported data. */ }
  const next: MatrixCell[][] = draft.map((row, r) => row.map((text, c) => {
    if (previous?.[r]?.[c] !== undefined && text === String(previous[r][c])) return previous[r][c];
    const trimmed = text.trim();
    if (!trimmed) throw new Error(`第 ${r + 1} 行第 ${c + 1} 列还没有内容。请输入 0，或填写所需的元素。`);
    if (NUMERIC_TEXT.test(trimmed)) {
      const number = Number(trimmed);
      if (!Number.isFinite(number) || Math.abs(number) > 10000) throw new Error(`第 ${r + 1} 行第 ${c + 1} 列的数值需要在 -10000 到 10000 之间。`);
      return number;
    }
    if (options.numericOnly) throw new Error(`第 ${r + 1} 行第 ${c + 1} 列需要数字，例如 1、-0.5 或 2e3。`);
    if (text.length >= 200) throw new Error(`第 ${r + 1} 行第 ${c + 1} 列的公式过长，请控制在 200 个字符以内。`);
    return text;
  }));
  const encoded = JSON.stringify(next);
  if (encoded.length > 4000) throw new Error('矩阵总内容过长，请减少元素或缩短公式。');
  parseMatrixValue(encoded, options);
  return previous && JSON.stringify(previous) === encoded ? previousRaw : encoded;
}

interface MatrixEditorOptions {
  value: string;
  settings?: MatrixFieldOptions;
  apply(value: string): void;
  cancel(): void;
}

/** All typing and resizing happens in a local draft until Apply is clicked. */
export function createMatrixEditor(options: MatrixEditorOptions): HTMLDivElement {
  const settings = options.settings ?? {};
  let baseRaw = options.value;
  let rawDraft = options.value;
  let draft: string[][] = [];
  let rawMode = false;
  let initialError = '';
  try {
    const matrix = parseMatrixValue(baseRaw, settings);
    draft = matrix.map((row) => row.map(String));
    rawMode = matrix.length > MAX_GRID_SIZE || matrix[0].length > MAX_GRID_SIZE;
    if (rawMode) initialError = `当前为 ${matrix.length} × ${matrix[0].length} 矩阵，超过 6 × 6 网格范围。原始数据完整保留，可在下方直接编辑。`;
  } catch (error) { rawMode = true; initialError = (error as Error).message; }

  const root = document.createElement('div'); root.className = 'av-matrix-editor';
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', settings.numericOnly ? '编辑二维变换矩阵' : '编辑矩阵');
  root.addEventListener('pointerdown', (event) => event.stopPropagation());
  const title = document.createElement('strong'); title.className = 'av-matrix-title';
  title.textContent = settings.numericOnly ? '二维变换矩阵' : '矩阵元素';
  const intro = document.createElement('p'); intro.className = 'av-matrix-intro';
  intro.textContent = settings.numericOnly ? '在四个格子里填写数字。修改后点击应用。' : '每个格子填写数字或 LaTeX 数学表达式，例如 2、a、\\frac{1}{2}。';
  const body = document.createElement('div'); body.className = 'av-matrix-body';
  const message = document.createElement('div'); message.className = 'av-matrix-message';
  message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
  const footer = document.createElement('div'); footer.className = 'av-matrix-footer';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'av-matrix-cancel'; cancel.textContent = '取消';
  cancel.addEventListener('click', options.cancel);
  const apply = document.createElement('button'); apply.type = 'button'; apply.className = 'av-matrix-apply'; apply.textContent = '应用矩阵';
  footer.append(cancel, apply); root.append(title, intro, body, message, footer);
  const showMessage = (text = '', error = false) => {
    message.textContent = text || '取消会保留原来的矩阵。';
    message.classList.toggle('is-error', error);
    root.dispatchEvent(new Event('anyvis-matrix-resize'));
  };
  const focusFirst = () => body.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')?.focus();

  const renderBody = () => {
    body.replaceChildren();
    if (rawMode) {
      const label = document.createElement('label'); label.className = 'av-matrix-raw-label';
      const text = document.createElement('span'); text.textContent = '原始矩阵数据（完整保留）';
      const input = document.createElement('textarea'); input.value = rawDraft; input.rows = 5; input.spellcheck = false;
      input.setAttribute('aria-label', '原始矩阵数据'); input.setAttribute('data-is-text-input', 'true');
      input.addEventListener('input', () => { rawDraft = input.value; showMessage('原值尚未替换，应用时会检查数据。'); });
      label.append(text, input); body.append(label);
      const actions = document.createElement('div'); actions.className = 'av-matrix-repair-actions';
      const load = document.createElement('button'); load.type = 'button'; load.textContent = '读取为网格';
      load.addEventListener('click', () => {
        try {
          const value = parseMatrixValue(rawDraft, settings);
          if (value.length > MAX_GRID_SIZE || value[0].length > MAX_GRID_SIZE) throw new Error('超过 6 × 6 的矩阵请使用原始数据编辑；不会截断已有元素。');
          baseRaw = rawDraft; draft = value.map((row) => row.map(String)); rawMode = false;
          renderBody(); showMessage('已读取到网格，点击应用后才会更新积木。'); focusFirst();
        } catch (error) { showMessage((error as Error).message, true); }
      });
      const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = '新建 2 × 2 网格';
      reset.addEventListener('click', () => {
        const rows = settings.fixedRows ?? 2, columns = settings.fixedColumns ?? 2;
        draft = Array.from({ length: rows }, (_, r) => Array.from({ length: columns }, (_, c) => settings.numericOnly && r === c ? '1' : '0'));
        baseRaw = options.value; rawMode = false; renderBody();
        showMessage('这是新的矩阵草稿；点击应用才会替换原值。'); focusFirst();
      });
      actions.append(load, reset); body.append(actions);
      return;
    }
    if (!settings.fixedRows || !settings.fixedColumns) {
      const dimensions = document.createElement('div'); dimensions.className = 'av-matrix-dimensions';
      for (const axis of ['row', 'column'] as const) {
        const label = document.createElement('label'); label.textContent = axis === 'row' ? '行数' : '列数';
        const select = document.createElement('select'); select.setAttribute('aria-label', axis === 'row' ? '矩阵行数' : '矩阵列数');
        const current = axis === 'row' ? draft.length : draft[0].length;
        for (let size = 1; size <= MAX_GRID_SIZE; size++) {
          const option = document.createElement('option'); option.value = String(size); option.textContent = String(size); select.append(option);
        }
        select.value = String(current);
        select.addEventListener('change', () => {
          const next = Number(select.value), rows = axis === 'row' ? next : draft.length, columns = axis === 'column' ? next : draft[0].length;
          draft = Array.from({ length: rows }, (_, r) => Array.from({ length: columns }, (_, c) => draft[r]?.[c] ?? '0'));
          renderBody(); showMessage('尺寸变化仅在草稿中，点击应用后生效。');
          body.querySelector<HTMLSelectElement>(`[aria-label="${axis === 'row' ? '矩阵行数' : '矩阵列数'}"]`)?.focus();
        });
        label.append(select); dimensions.append(label);
      }
      body.append(dimensions);
    }
    const bracket = document.createElement('div'); bracket.className = 'av-matrix-bracket';
    const grid = document.createElement('div'); grid.className = 'av-matrix-grid'; grid.style.gridTemplateColumns = `repeat(${draft[0].length}, minmax(0, 1fr))`;
    grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', `${draft.length} 行 ${draft[0].length} 列矩阵`);
    draft.forEach((row, r) => row.forEach((value, c) => {
      const input = document.createElement('input'); input.type = 'text'; input.value = value; input.spellcheck = false; input.autocomplete = 'off';
      input.setAttribute('aria-label', `第 ${r + 1} 行第 ${c + 1} 列`); input.setAttribute('data-is-text-input', 'true');
      if (settings.numericOnly) input.inputMode = 'decimal';
      input.addEventListener('input', () => { draft[r][c] = input.value; showMessage(); });
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          const cells = [...grid.querySelectorAll<HTMLInputElement>('input')];
          const next = cells[cells.indexOf(input) + 1];
          if (next) next.focus(); else apply.focus();
        }
      });
      grid.append(input);
    }));
    bracket.append(grid); body.append(bracket);
    const hint = document.createElement('p'); hint.className = 'av-matrix-keyboard'; hint.textContent = 'Tab / Enter 移到下一格，Ctrl / ⌘ Enter 应用。'; body.append(hint);
  };
  const commit = () => {
    try {
      let value: string;
      if (rawMode) { parseMatrixValue(rawDraft, settings); value = rawDraft; }
      else value = serializeMatrixDraft(draft, baseRaw, settings);
      options.apply(value);
    } catch (error) { showMessage((error as Error).message, true); }
  };
  apply.addEventListener('click', commit);
  root.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); options.cancel(); }
    else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); commit(); }
    else if (event.key === 'Tab') {
      const controls = [...root.querySelectorAll<HTMLElement>('input, select, textarea, button')].filter((node) => !(node as HTMLButtonElement).disabled);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  renderBody(); showMessage(initialError, Boolean(initialError));
  return root;
}

export class MatrixField extends Blockly.FieldTextInput {
  private matrixOptions: MatrixFieldOptions;

  constructor(value = '[[1,0],[0,1]]', options: MatrixFieldOptions = {}) {
    // Keep imported text intact, even when invalid; the editor explains repairs.
    super(value);
    this.matrixOptions = options;
    this.setSpellcheck(false);
  }

  override initView(): void {
    super.initView();
    this.fieldGroup_?.setAttribute('role', 'button');
    this.fieldGroup_?.setAttribute('aria-haspopup', 'dialog');
    this.fieldGroup_?.setAttribute('aria-expanded', 'false');
  }

  protected override getText_(): string | null {
    try {
      const value = parseMatrixValue(this.getValue() ?? '', this.matrixOptions ?? {});
      return `${value.length} × ${value[0].length} 矩阵 ▾`;
    } catch { return '矩阵需要检查 ▾'; }
  }

  /** A whole grid edit becomes one ordinary undoable Blockly field change. */
  commitMatrix(value: string): boolean {
    parseMatrixValue(value, this.matrixOptions);
    if (value === this.getValue()) return false;
    const group = Blockly.Events.getGroup();
    if (!group) Blockly.Events.setGroup(true);
    try { this.setValue(value); }
    finally { Blockly.Events.setGroup(group); }
    return value === this.getValue();
  }

  protected override showEditor_(): void {
    if (!this.sourceBlock_ || this.disposed) return;
    Blockly.DropDownDiv.hideWithoutAnimation(); Blockly.DropDownDiv.clearContent();
    const close = () => { Blockly.DropDownDiv.hideIfOwner<string>(this); };
    const editor = createMatrixEditor({ value: this.getValue() ?? '', settings: this.matrixOptions, apply: (value) => { this.commitMatrix(value); close(); }, cancel: close });
    editor.addEventListener('anyvis-matrix-resize', () => {
      if (Blockly.DropDownDiv.getOwner() === this) Blockly.DropDownDiv.repositionForWindowResize();
    });
    Blockly.DropDownDiv.getContentDiv().append(editor);
    Blockly.DropDownDiv.setColour('#ffffff', '#e1e5ee');
    this.fieldGroup_?.setAttribute('aria-expanded', 'true');
    Blockly.DropDownDiv.showPositionedByField<string>(this, () => { this.fieldGroup_?.setAttribute('aria-expanded', 'false'); editor.remove(); });
    editor.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')?.focus();
  }

  override dispose(): void {
    Blockly.DropDownDiv.hideIfOwner<string>(this, true);
    super.dispose();
  }
}

export function createMatrixField(value: string, fixedSize?: 2): MatrixField {
  return new MatrixField(value, fixedSize ? { fixedRows: fixedSize, fixedColumns: fixedSize, numericOnly: true } : {});
}
