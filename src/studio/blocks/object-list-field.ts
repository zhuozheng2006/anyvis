import * as Blockly from 'blockly/core';
import './object-list-field.css';

/**
 * Split comma-separated member names strictly by English comma,
 * matching compiler.ts: str(a, 'members').split(',').map(v => v.trim()).filter(Boolean).
 * Trims whitespace and deduplicates while preserving sequence.
 * Names containing Chinese commas are preserved as single legacy member names.
 */
export function parseMemberList(raw: string): string[] {
  if (typeof raw !== 'string') return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const parts = raw.split(',').map((item) => item.trim()).filter(Boolean);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of parts) {
    if (!seen.has(part)) {
      seen.add(part);
      result.push(part);
    }
  }
  return result;
}

/**
 * Preserve untouched raw string byte-for-byte and spacing when selections have not changed.
 * When changes are made, serialize as comma-separated string in selected order.
 */
export function serializeMemberList(draft: string[], previousRaw: string): string {
  const previousList = parseMemberList(previousRaw);
  if (
    draft.length === previousList.length &&
    draft.every((item, index) => item === previousList[index])
  ) {
    return previousRaw;
  }
  return draft.join(',');
}

export interface ObjectListEditorOptions {
  value: string;
  choices?: string[];
  getChoices?: () => string[];
  apply(value: string): void;
  cancel(): void;
}

function isElementVisible(el: HTMLElement, container: HTMLElement): boolean {
  let current: HTMLElement | null = el;
  while (current && current !== container) {
    if (current.style.display === 'none') return false;
    current = current.parentElement;
  }
  return true;
}

/**
 * Accessible dialog inside DropDownDiv with search, checkbox list,
 * missing-item preservation, and comma validation.
 */
export function createObjectListEditor(options: ObjectListEditorOptions): HTMLDivElement {
  const rawChoices = options.choices ?? (options.getChoices ? options.getChoices() : []);
  const initialValue = options.value ?? '';
  let draftSelected: string[] = parseMemberList(initialValue);

  // Deduplicate choices while keeping original sequence
  const choiceList: string[] = [];
  const seenChoices = new Set<string>();
  for (const c of rawChoices) {
    if (typeof c === 'string' && !seenChoices.has(c)) {
      seenChoices.add(c);
      choiceList.push(c);
    }
  }

  // Missing members are selected items that are not in the choices provider
  const missingItems = draftSelected.filter((name) => !seenChoices.has(name));

  // Combine items: missing members first, followed by all provided choices
  const displayItems: { name: string; isMissing: boolean; hasComma: boolean }[] = [];
  for (const name of missingItems) {
    displayItems.push({
      name,
      isMissing: true,
      // Existing members parsed via split(',') never contain English comma;
      // legacy names containing Chinese commas are preserved.
      hasComma: name.includes(','),
    });
  }
  for (const name of choiceList) {
    const isExisting = draftSelected.includes(name);
    displayItems.push({
      name,
      isMissing: false,
      // Prohibit English comma always; prohibit Chinese comma for new choices
      hasComma: name.includes(',') || (!isExisting && /[,，]/.test(name)),
    });
  }

  const root = document.createElement('div');
  root.className = 'av-object-list-editor';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', '选择组合成员');
  root.addEventListener('pointerdown', (event) => event.stopPropagation());

  const title = document.createElement('strong');
  title.className = 'av-object-list-title';
  title.textContent = '选择组合成员';

  const intro = document.createElement('p');
  intro.className = 'av-object-list-intro';
  intro.textContent = '勾选要加入组合的对象，成员按选择顺序排列。';

  const searchWrap = document.createElement('div');
  searchWrap.className = 'av-object-list-search-wrap';
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'av-object-list-search';
  searchInput.placeholder = '搜索对象名称...';
  searchInput.setAttribute('aria-label', '搜索对象名称');
  searchInput.setAttribute('data-is-text-input', 'true');
  searchInput.setAttribute('autocomplete', 'off');
  searchInput.spellcheck = false;
  searchWrap.append(searchInput);

  const list = document.createElement('div');
  list.className = 'av-object-list-items';
  list.setAttribute('role', 'group');
  list.setAttribute('aria-label', '可选对象列表');

  const emptyState = document.createElement('div');
  emptyState.className = 'av-object-list-empty';
  emptyState.setAttribute('role', 'status');
  emptyState.textContent = '暂无可选图形，请先创建图形。';

  const noMatchMsg = document.createElement('div');
  noMatchMsg.className = 'av-object-list-no-match';
  noMatchMsg.setAttribute('role', 'status');
  noMatchMsg.textContent = '未找到匹配的对象。';
  noMatchMsg.style.display = 'none';

  const status = document.createElement('div');
  status.className = 'av-object-list-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  const footer = document.createElement('div');
  footer.className = 'av-object-list-footer';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'av-object-list-cancel';
  cancelBtn.textContent = '取消';
  cancelBtn.addEventListener('click', () => options.cancel());

  const applyBtn = document.createElement('button');
  applyBtn.type = 'button';
  applyBtn.className = 'av-object-list-apply';
  applyBtn.textContent = '应用成员';

  const updateStatus = () => {
    if (displayItems.length === 0) {
      status.textContent = '暂无可选图形，请先创建图形。';
      return;
    }
    const count = draftSelected.length;
    const missingCount = draftSelected.filter((n) => !seenChoices.has(n)).length;
    if (count === 0) {
      status.textContent = '未选择成员（点击取消保留原值，或点击应用清空成员）。';
    } else if (missingCount > 0) {
      status.textContent = `已选 ${count} 个对象（含 ${missingCount} 个已缺失）。`;
    } else {
      status.textContent = `已选 ${count} 个对象。`;
    }
  };

  const itemRows: { row: HTMLLabelElement; name: string }[] = [];

  if (displayItems.length === 0) {
    searchInput.disabled = true;
    searchInput.placeholder = '暂无可选图形';
    list.append(emptyState);
  } else {
    for (const item of displayItems) {
      const row = document.createElement('label');
      row.className = 'av-object-list-item';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'av-object-list-checkbox';
      checkbox.checked = draftSelected.includes(item.name);

      const nameSpan = document.createElement('span');
      nameSpan.className = 'av-object-list-name';
      nameSpan.textContent = item.name;

      if (item.hasComma) {
        checkbox.disabled = true;
        checkbox.setAttribute('aria-disabled', 'true');
        row.classList.add('is-disabled');
        const reasonBadge = document.createElement('span');
        reasonBadge.className = 'av-object-list-badge av-object-list-badge-disabled';
        reasonBadge.textContent = '含逗号不可选';
        reasonBadge.title = '名称包含逗号，无法加入组合（组合成员以逗号分隔）';
        checkbox.setAttribute('aria-label', `${item.name}（包含逗号，不可作为成员）`);
        row.title = '名称包含逗号，无法加入组合（组合成员以逗号分隔）';
        row.append(checkbox, nameSpan, reasonBadge);
      } else {
        if (item.isMissing) {
          const missingBadge = document.createElement('span');
          missingBadge.className = 'av-object-list-badge av-object-list-badge-missing';
          missingBadge.textContent = '已缺失';
          checkbox.setAttribute('aria-label', `${item.name}（已缺失）`);
          row.title = '该对象在当前场景中不存在，原引用已保留';
          row.append(checkbox, nameSpan, missingBadge);
        } else {
          checkbox.setAttribute('aria-label', item.name);
          row.append(checkbox, nameSpan);
        }

        checkbox.addEventListener('change', () => {
          if (checkbox.checked) {
            if (!draftSelected.includes(item.name)) {
              draftSelected.push(item.name);
            }
          } else {
            draftSelected = draftSelected.filter((n) => n !== item.name);
          }
          updateStatus();
        });

        checkbox.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            checkbox.checked = !checkbox.checked;
            checkbox.dispatchEvent(new Event('change'));
          }
        });
      }

      list.append(row);
      itemRows.push({ row, name: item.name });
    }
    list.append(noMatchMsg);
  }

  const filterItems = () => {
    const query = searchInput.value.trim().toLowerCase();
    let visibleCount = 0;
    for (const { row, name } of itemRows) {
      const match = !query || name.toLowerCase().includes(query);
      row.style.display = match ? 'flex' : 'none';
      if (match) visibleCount++;
    }
    noMatchMsg.style.display = visibleCount === 0 && displayItems.length > 0 ? 'block' : 'none';
  };

  searchInput.addEventListener('input', filterItems);
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      const visibleCheckboxes = [...list.querySelectorAll<HTMLInputElement>(
        'input:not(:disabled)'
      )].filter((input) => isElementVisible(input, root));
      if (visibleCheckboxes.length > 0) {
        visibleCheckboxes[0].focus();
      } else {
        applyBtn.focus();
      }
    }
  });

  const commit = () => {
    const serialized = serializeMemberList(draftSelected, initialValue);
    options.apply(serialized);
  };

  applyBtn.addEventListener('click', commit);

  root.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      options.cancel();
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      commit();
    } else if (event.key === 'Tab') {
      const focusable = [...root.querySelectorAll<HTMLElement>(
        'input:not(:disabled), button:not(:disabled)'
      )].filter((el) => isElementVisible(el, root));
      if (focusable.length > 0) {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
  });

  footer.append(cancelBtn, applyBtn);
  root.append(title, intro, searchWrap, list, status, footer);

  updateStatus();
  return root;
}

/**
 * Blockly field for comma-separated member object names.
 * Shows "选择成员" or "已选 N 个对象" on the block.
 */
export class ObjectListField extends Blockly.FieldTextInput {
  private getChoices: () => string[];

  constructor(
    value = '',
    getChoices: () => string[] = () => [],
    validator?: Blockly.FieldTextInputValidator | null,
  ) {
    super(value, validator);
    this.getChoices = typeof getChoices === 'function' ? getChoices : () => [];
    this.setSpellcheck(false);
  }

  override initView(): void {
    super.initView();
    this.fieldGroup_?.setAttribute('role', 'button');
    this.fieldGroup_?.setAttribute('aria-haspopup', 'dialog');
    this.fieldGroup_?.setAttribute('aria-expanded', 'false');
  }

  protected override getText_(): string {
    const count = parseMemberList(this.getValue() ?? '').length;
    return count === 0 ? '选择成员' : `已选 ${count} 个对象`;
  }

  protected override render_(): void {
    super.render_();
    const count = parseMemberList(this.getValue() ?? '').length;
    this.fieldGroup_?.setAttribute('aria-label', count === 0 ? '选择成员' : `已选 ${count} 个对象`);
  }

  protected override doClassValidation_(value?: unknown): string | null {
    return typeof value === 'string' ? value : null;
  }

  /**
   * Commits value as a single undoable transaction on the workspace.
   */
  commitMembers(value: string): boolean {
    if (value === this.getValue()) return false;
    const group = Blockly.Events.getGroup();
    if (!group) Blockly.Events.setGroup(true);
    try {
      this.setValue(value);
    } finally {
      Blockly.Events.setGroup(group);
    }
    return this.getValue() === value;
  }

  commitValue = this.commitMembers;

  setChoicesProvider(getChoices: () => string[]): void {
    this.getChoices = getChoices;
  }

  protected override showEditor_(): void {
    if (!this.sourceBlock_ || this.disposed) return;
    Blockly.DropDownDiv.hideWithoutAnimation();
    Blockly.DropDownDiv.clearContent();
    const close = () => {
      Blockly.DropDownDiv.hideIfOwner<string>(this);
    };
    const choices = this.getChoices ? this.getChoices() : [];
    const editor = createObjectListEditor({
      value: this.getValue() ?? '',
      choices,
      apply: (value) => {
        this.commitMembers(value);
        close();
      },
      cancel: close,
    });
    Blockly.DropDownDiv.getContentDiv().append(editor);
    Blockly.DropDownDiv.setColour('#ffffff', '#e1e5ee');
    this.fieldGroup_?.setAttribute('aria-expanded', 'true');
    Blockly.DropDownDiv.showPositionedByField<string>(this, () => {
      this.fieldGroup_?.setAttribute('aria-expanded', 'false');
      editor.remove();
    });
    const searchInput = editor.querySelector<HTMLInputElement>('.av-object-list-search');
    if (searchInput && !searchInput.disabled) {
      searchInput.focus();
    } else {
      editor.querySelector<HTMLButtonElement>('.av-object-list-cancel')?.focus();
    }
  }

  override dispose(): void {
    Blockly.DropDownDiv.hideIfOwner<string>(this, true);
    super.dispose();
  }
}

export function createObjectListField(value: string, getChoices: () => string[]): ObjectListField {
  return new ObjectListField(value, getChoices);
}
