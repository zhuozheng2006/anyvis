import * as Blockly from 'blockly/core';
import './multiline-code-field.css';

export interface IndentResult { value: string; start: number; end: number }

export function indentCode(value: string, start: number, end: number, outdent = false): IndentResult {
  if (start === end && !outdent) return { value: value.slice(0, start) + '    ' + value.slice(end), start: start + 4, end: start + 4 };
  const lineStart = (offset: number) => offset <= 0 ? 0 : value.lastIndexOf('\n', offset - 1) + 1;
  const firstLine = lineStart(start);
  const lastLine = lineStart(end > start ? end - 1 : start);
  const edits: { position: number; remove: number; insert: string }[] = [];
  let position = firstLine;
  while (position <= lastLine) {
    const prefix = /^(?: {1,4}|\t)/.exec(value.slice(position))?.[0] ?? '';
    edits.push({ position, remove: outdent ? prefix.length : 0, insert: outdent ? '' : '    ' });
    const newline = value.indexOf('\n', position);
    if (newline < 0) break;
    position = newline + 1;
  }
  const map = (offset: number) => {
    let delta = 0;
    for (const edit of edits) {
      if (offset < edit.position) break;
      if (offset < edit.position + edit.remove) return edit.position + delta + edit.insert.length;
      delta += edit.insert.length - edit.remove;
    }
    return offset + delta;
  };
  let result = value;
  for (const edit of [...edits].reverse()) result = result.slice(0, edit.position) + edit.insert + result.slice(edit.position + edit.remove);
  return { value: result, start: map(start), end: map(end) };
}

interface CodeEditorOptions { value: string; apply(value: string): void; cancel(): void }

export function createMultilineCodeEditor(options: CodeEditorOptions): HTMLDivElement {
  const root = document.createElement('div'); root.className = 'av-multiline-editor';
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', '编辑 Python 扩展');
  root.addEventListener('pointerdown', (event) => event.stopPropagation());
  const heading = document.createElement('div'); heading.className = 'av-multiline-heading'; heading.textContent = 'Python 扩展';
  const description = document.createElement('p'); description.className = 'av-multiline-description';
  description.textContent = '可使用 self 和 objects；代码会在你允许后于本机运行。';
  const textarea = document.createElement('textarea'); textarea.className = 'av-multiline-textarea';
  textarea.value = options.value; textarea.spellcheck = false; textarea.maxLength = 20000;
  textarea.setAttribute('aria-label', 'Python 代码'); textarea.setAttribute('data-is-text-input', 'true');
  textarea.setAttribute('autocapitalize', 'off'); textarea.setAttribute('autocomplete', 'off');
  textarea.setAttribute('wrap', 'off');
  let draft = options.value;
  const status = document.createElement('div'); status.className = 'av-multiline-status';
  const updateStatus = () => { status.textContent = `${textarea.value.split('\n').length} 行 · Tab 缩进 · Shift Tab 减少缩进 · Ctrl / ⌘ Enter 应用`; };
  updateStatus();
  textarea.addEventListener('input', () => { draft = textarea.value; updateStatus(); });
  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
      event.preventDefault(); event.stopPropagation();
      const result = indentCode(textarea.value, textarea.selectionStart, textarea.selectionEnd, event.shiftKey);
      if (result.value.length > 20000) return;
      textarea.value = result.value; draft = result.value;
      textarea.setSelectionRange(result.start, result.end); updateStatus();
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault(); event.stopPropagation(); options.apply(draft);
    }
  });
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); options.cancel(); }
  });
  const footer = document.createElement('div'); footer.className = 'av-multiline-footer';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'av-multiline-cancel'; cancel.textContent = '取消';
  cancel.addEventListener('click', options.cancel);
  const apply = document.createElement('button'); apply.type = 'button'; apply.className = 'av-multiline-apply'; apply.textContent = '应用代码';
  apply.addEventListener('click', () => options.apply(draft));
  footer.append(cancel, apply);
  root.append(heading, description, textarea, status, footer);
  return root;
}

export class MultilineCodeField extends Blockly.FieldTextInput {
  constructor(value = '', validator?: Blockly.FieldTextInputValidator | null) {
    super(value, validator);
    this.setSpellcheck(false);
  }

  override initView(): void {
    super.initView();
    this.fieldGroup_?.setAttribute('role', 'button');
    this.fieldGroup_?.setAttribute('aria-haspopup', 'dialog');
    this.fieldGroup_?.setAttribute('aria-expanded', 'false');
  }

  protected override getText_(): string {
    return `Python · ${(this.getValue() ?? '').split('\n').length} 行`;
  }

  protected override render_(): void {
    super.render_();
    this.fieldGroup_?.setAttribute('aria-label', `编辑 ${(this.getValue() ?? '').split('\n').length} 行 Python 代码`);
  }

  protected override doClassValidation_(value?: unknown): string | null {
    return typeof value === 'string' && value.length <= 20000 ? value : null;
  }

  commitCode(value: string): boolean {
    if (this.doClassValidation_(value) === null || value === this.getValue()) return false;
    const group = Blockly.Events.getGroup();
    if (!group) Blockly.Events.setGroup(true);
    try { this.setValue(value); }
    finally { Blockly.Events.setGroup(group); }
    return this.getValue() === value;
  }

  protected override showEditor_(): void {
    if (!this.sourceBlock_ || this.disposed) return;
    Blockly.DropDownDiv.hideWithoutAnimation();
    Blockly.DropDownDiv.clearContent();
    const close = () => { Blockly.DropDownDiv.hideIfOwner<string>(this); };
    const editor = createMultilineCodeEditor({
      value: this.getValue() ?? '', apply: (value) => { this.commitCode(value); close(); }, cancel: close,
    });
    Blockly.DropDownDiv.getContentDiv().append(editor);
    Blockly.DropDownDiv.setColour('#ffffff', '#e1e5ee');
    this.fieldGroup_?.setAttribute('aria-expanded', 'true');
    Blockly.DropDownDiv.showPositionedByField<string>(this, () => {
      this.fieldGroup_?.setAttribute('aria-expanded', 'false'); editor.remove();
    });
    editor.querySelector('textarea')?.focus();
  }

  override dispose(): void {
    Blockly.DropDownDiv.hideIfOwner<string>(this, true);
    super.dispose();
  }
}
