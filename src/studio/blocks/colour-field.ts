import * as Blockly from 'blockly/core';
import './colour-field.css';

export const COMMON_COLOURS = [
  { name: '雾白', value: '#F8FAFC' }, { name: '浅灰', value: '#CBD5E1' },
  { name: '石板灰', value: '#64748B' }, { name: '深蓝灰', value: '#334155' },
  { name: '午夜蓝', value: '#0B1020' }, { name: '黑色', value: '#000000' },
  { name: '浅蓝', value: '#93C5FD' }, { name: '天蓝', value: '#38BDF8' },
  { name: '蓝色', value: '#60A5FA' }, { name: '靛蓝', value: '#818CF8' },
  { name: '紫色', value: '#A78BFA' }, { name: '粉紫', value: '#E879F9' },
  { name: '浅青', value: '#67E8F9' }, { name: '青绿', value: '#2DD4BF' },
  { name: '翡翠绿', value: '#34D399' }, { name: '草绿', value: '#A3E635' },
  { name: '柠檬黄', value: '#FDE047' }, { name: '琥珀黄', value: '#FBBF24' },
  { name: '杏色', value: '#FDBA74' }, { name: '橙色', value: '#FB923C' },
  { name: '珊瑚红', value: '#FB7185' }, { name: '红色', value: '#F87171' },
  { name: '玫红', value: '#F472B6' }, { name: '淡粉', value: '#FDA4AF' },
] as const;

/** Keep valid six-digit values byte-for-byte stable when opening a project. */
export function normaliseHexColour(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const hex = value.trim();
  if (/^#[\da-f]{6}$/i.test(hex)) return hex;
  if (/^#[\da-f]{3}$/i.test(hex)) return `#${[...hex.slice(1)].map((digit) => digit + digit).join('')}`;
  return null;
}

interface ColourEditorOptions {
  value: string;
  apply(value: string): void;
  cancel(): void;
}

/** Native browser picker and ordinary accessible controls inside DropDownDiv. */
export function createColourEditor(options: ColourEditorOptions): HTMLDivElement {
  const root = document.createElement('div');
  root.className = 'av-colour-editor';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', '选择颜色');
  root.addEventListener('pointerdown', (event) => event.stopPropagation());
  const heading = document.createElement('div');
  heading.className = 'av-colour-heading';
  heading.textContent = '常用颜色';
  root.append(heading);
  const palette = document.createElement('div');
  palette.className = 'av-colour-palette';
  palette.setAttribute('role', 'group');
  palette.setAttribute('aria-label', '常用颜色');
  const buttons: HTMLButtonElement[] = [];
  for (const colour of COMMON_COLOURS) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'av-colour-chip';
    button.style.backgroundColor = colour.value;
    button.setAttribute('aria-label', `${colour.name} ${colour.value}`);
    button.setAttribute('title', `${colour.name} · ${colour.value}`);
    button.setAttribute('aria-pressed', String(colour.value.toLowerCase() === options.value.toLowerCase()));
    button.addEventListener('click', () => options.apply(colour.value));
    button.addEventListener('keydown', (event) => {
      const offset = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 6, ArrowUp: -6 }[event.key];
      if (offset === undefined) return;
      event.preventDefault(); event.stopPropagation();
      const index = buttons.indexOf(button);
      buttons[(index + offset + COMMON_COLOURS.length) % COMMON_COLOURS.length]?.focus();
    });
    buttons.push(button); palette.append(button);
  }
  root.append(palette);

  const customHeading = document.createElement('div');
  customHeading.className = 'av-colour-heading av-colour-custom-heading';
  customHeading.textContent = '自定义颜色';
  root.append(customHeading);
  const row = document.createElement('div'); row.className = 'av-colour-custom';
  const pickerLabel = document.createElement('label'); pickerLabel.className = 'av-colour-native-label';
  const native = document.createElement('input'); native.type = 'color';
  native.value = normaliseHexColour(options.value) ?? '#60A5FA';
  native.setAttribute('aria-label', '打开任意颜色选择器');
  native.setAttribute('title', '选择任意颜色');
  native.setAttribute('data-is-text-input', 'true');
  const pickerHint = document.createElement('span'); pickerHint.textContent = '任选';
  pickerLabel.append(native, pickerHint);
  const hexLabel = document.createElement('label'); hexLabel.className = 'av-colour-hex-label';
  const hexLabelText = document.createElement('span'); hexLabelText.textContent = 'HEX';
  const hex = document.createElement('input'); hex.type = 'text';
  hex.value = options.value; hex.maxLength = 7; hex.spellcheck = false;
  hex.setAttribute('aria-label', '十六进制颜色'); hex.setAttribute('placeholder', '#60A5FA');
  hex.setAttribute('autocomplete', 'off'); hex.setAttribute('data-is-text-input', 'true');
  hexLabel.append(hexLabelText, hex);
  row.append(pickerLabel, hexLabel); root.append(row);
  const message = document.createElement('div'); message.className = 'av-colour-message';
  message.setAttribute('aria-live', 'polite');
  message.textContent = '点击色块直接使用，或自选颜色后应用。';
  root.append(message);
  const footer = document.createElement('div'); footer.className = 'av-colour-footer';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'av-colour-cancel';
  cancel.textContent = '取消'; cancel.addEventListener('click', options.cancel);
  const apply = document.createElement('button'); apply.type = 'button'; apply.className = 'av-colour-apply';
  apply.textContent = '应用颜色';
  footer.append(cancel, apply); root.append(footer);

  const validate = () => {
    const value = normaliseHexColour(hex.value);
    hex.setAttribute('aria-invalid', String(!value));
    apply.disabled = !value;
    message.classList.toggle('is-error', !value);
    message.textContent = value ? '点击色块直接使用，或自选颜色后应用。' : '请输入 #RGB 或 #RRGGBB 格式的颜色。';
    return value;
  };
  const updateDraft = () => {
    // A native colour dialog can emit hundreds of input events while dragging.
    // They update only this local draft. The Blockly field changes on Apply.
    hex.value = native.value;
    validate();
  };
  native.addEventListener('input', updateDraft);
  native.addEventListener('change', updateDraft);
  hex.addEventListener('input', () => { const value = validate(); if (value) native.value = value; });
  apply.addEventListener('click', () => { const value = validate(); if (value) options.apply(value); });
  hex.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); const value = validate(); if (value) options.apply(value); }
  });
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); options.cancel(); }
  });
  return root;
}

/** Plain string serialization; Blockly owns field events and undo history. */
export class ColourField extends Blockly.FieldTextInput {
  private swatch: SVGRectElement | null = null;

  constructor(value = '#60A5FA', validator?: Blockly.FieldTextInputValidator | null) {
    super(normaliseHexColour(value) ?? '#60A5FA', validator);
    this.setSpellcheck(false);
  }

  override initView(): void {
    super.initView();
    this.fieldGroup_?.setAttribute('role', 'button');
    this.fieldGroup_?.setAttribute('aria-haspopup', 'dialog');
    this.fieldGroup_?.setAttribute('aria-expanded', 'false');
    this.swatch = Blockly.utils.dom.createSvgElement(Blockly.utils.Svg.RECT, {
      width: 18, height: 18, rx: 4, stroke: '#00000030', 'stroke-width': 1,
      class: 'av-colour-field-swatch',
    }, this.fieldGroup_!);
    this.swatch.setAttribute('aria-hidden', 'true');
    this.swatch.style.setProperty('fill', this.getValue() || '#60A5FA', 'important');
  }

  protected override doClassValidation_(value?: unknown): string | null {
    return normaliseHexColour(value);
  }

  protected override render_(): void {
    super.render_();
    this.size_.width += 25;
    this.textElement_?.setAttribute('transform', 'translate(25, 0)');
    this.borderRect_?.setAttribute('width', String(this.size_.width));
    this.swatch?.setAttribute('x', '6');
    this.swatch?.setAttribute('y', String((this.size_.height - 18) / 2));
    this.swatch?.setAttribute('fill', this.getValue() || '#60A5FA');
    // Blockly styles editable-field rects as white; a swatch is an intentional
    // exception and must retain its colour across renderer/theme styles.
    this.swatch?.style.setProperty('fill', this.getValue() || '#60A5FA', 'important');
    this.fieldGroup_?.setAttribute('aria-label', `颜色 ${this.getValue()}，选择颜色`);
  }

  /** One explicit choice creates one undoable field change. */
  commitColour(value: string): boolean {
    const normalized = normaliseHexColour(value);
    if (!normalized || normalized.toLowerCase() === this.getValue()?.toLowerCase()) return false;
    const group = Blockly.Events.getGroup();
    if (!group) Blockly.Events.setGroup(true);
    try { this.setValue(normalized); }
    finally { Blockly.Events.setGroup(group); }
    return this.getValue()?.toLowerCase() === normalized.toLowerCase();
  }

  protected override showEditor_(): void {
    if (!this.sourceBlock_ || this.disposed) return;
    Blockly.DropDownDiv.hideWithoutAnimation();
    Blockly.DropDownDiv.clearContent();
    const close = () => { Blockly.DropDownDiv.hideIfOwner<string>(this); };
    const editor = createColourEditor({
      value: this.getValue() || '#60A5FA',
      apply: (value) => { this.commitColour(value); close(); },
      cancel: close,
    });
    Blockly.DropDownDiv.getContentDiv().append(editor);
    Blockly.DropDownDiv.setColour('#ffffff', '#e1e5ee');
    this.fieldGroup_?.setAttribute('aria-expanded', 'true');
    Blockly.DropDownDiv.showPositionedByField<string>(this, () => {
      this.fieldGroup_?.setAttribute('aria-expanded', 'false');
      editor.remove();
    });
    const active = editor.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
      ?? editor.querySelector<HTMLButtonElement>('.av-colour-chip');
    active?.focus();
  }

  override dispose(): void {
    Blockly.DropDownDiv.hideIfOwner<string>(this, true);
    this.swatch = null;
    super.dispose();
  }
}
