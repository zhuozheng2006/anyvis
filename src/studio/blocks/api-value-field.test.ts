// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FieldDefinition } from '../core/types';
import { createApiValueEditor } from './api-value-field';

function button(editor: HTMLElement, label: string): HTMLButtonElement {
  const result = [...editor.querySelectorAll('button')].find((item) => item.textContent === label);
  if (!result) throw new Error(`Missing button: ${label}`);
  return result;
}

function getModeSelect(editor: HTMLElement): HTMLSelectElement {
  const sel = editor.querySelector<HTMLSelectElement>('select[aria-label="参数值类型"]');
  if (!sel) throw new Error('Missing mode select');
  return sel;
}

function switchMode(editor: HTMLElement, mode: string) {
  const sel = getModeSelect(editor);
  sel.value = mode;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
}

function getError(editor: HTMLElement): HTMLElement {
  const el = editor.querySelector<HTMLElement>('.av-api-error');
  if (!el) throw new Error('Missing error element');
  return el;
}

const createField = (overrides?: Partial<FieldDefinition>): FieldDefinition => ({
  name: 'param',
  label: '测试参数',
  type: 'api-value',
  default: '',
  description: '参数说明提示',
  apiParameter: {
    name: 'param',
    kind: 'positional_or_keyword',
    annotation: 'Any',
    required: false,
    default: { value: 10, description: '10' },
  },
  ...overrides,
});

afterEach(() => {
  document.body.replaceChildren();
});

describe('createApiValueEditor', () => {
  describe('数字 0 与小数输入', () => {
    it('支持输入整数 0 并成功应用', () => {
      const apply = vi.fn();
      const close = vi.fn();
      const editor = createApiValueEditor(createField(), '10', [], apply, close);
      document.body.append(editor);

      expect(getModeSelect(editor).value).toBe('number');
      const input = editor.querySelector<HTMLInputElement>('input[aria-label="数值"]')!;
      expect(input).not.toBeNull();
      expect(input.type).toBe('number');

      input.value = '0';
      button(editor, '应用参数').click();

      expect(apply).toHaveBeenCalledExactlyOnceWith('0');
      expect(close).not.toHaveBeenCalled();
      expect(getError(editor).textContent).toBe('');
    });

    it('支持输入正负小数并成功应用', () => {
      const apply = vi.fn();
      const editor = createApiValueEditor(createField(), '', [], apply, vi.fn());
      document.body.append(editor);

      switchMode(editor, 'number');
      const input = editor.querySelector<HTMLInputElement>('input[aria-label="数值"]')!;

      input.value = '3.14159';
      button(editor, '应用参数').click();
      expect(apply).toHaveBeenLastCalledWith('3.14159');

      input.value = '-0.5';
      button(editor, '应用参数').click();
      expect(apply).toHaveBeenLastCalledWith('-0.5');
      expect(apply).toHaveBeenCalledTimes(2);
    });

    it('拒绝空值或非数字并显示错误提示', () => {
      const apply = vi.fn();
      const editor = createApiValueEditor(createField(), '42', [], apply, vi.fn());
      document.body.append(editor);

      const input = editor.querySelector<HTMLInputElement>('input[aria-label="数值"]')!;
      input.value = '   ';
      button(editor, '应用参数').click();

      expect(apply).not.toHaveBeenCalled();
      expect(getError(editor).textContent).toContain('请输入有限数字');
    });
  });

  describe('颜色调色板及自由颜色', () => {
    it('点击调色板预设按钮能真正更新颜色并应用', () => {
      const apply = vi.fn();
      const colorField = createField({
        apiParameter: {
          name: 'fill_color',
          kind: 'positional_or_keyword',
          annotation: 'ParsableManimColor',
          required: false,
          default: null,
        },
      });
      const editor = createApiValueEditor(colorField, '"#58C4DD"', [], apply, vi.fn());
      document.body.append(editor);

      expect(getModeSelect(editor).value).toBe('color');
      const swatches = editor.querySelectorAll('.av-api-swatches button');
      expect(swatches.length).toBe(8);

      const redSwatch = editor.querySelector<HTMLButtonElement>('button[aria-label="颜色 #FC6255"]')!;
      expect(redSwatch).not.toBeNull();
      redSwatch.click();

      button(editor, '应用参数').click();
      expect(apply).toHaveBeenCalledExactlyOnceWith('"#fc6255"');
    });

    it('支持通过自由选色 input 输入十六进制颜色并应用', () => {
      const apply = vi.fn();
      const editor = createApiValueEditor(createField(), '', [], apply, vi.fn());
      document.body.append(editor);

      switchMode(editor, 'color');
      const colorInput = editor.querySelector<HTMLInputElement>('input[aria-label="自由选色"]')!;
      expect(colorInput).not.toBeNull();
      expect(colorInput.type).toBe('color');

      colorInput.value = '#123456';
      button(editor, '应用参数').click();

      expect(apply).toHaveBeenCalledExactlyOnceWith('"#123456"');
    });
  });

  describe('对象下拉列表', () => {
    it('列出已有对象和内置场景对象并支持选择应用', () => {
      const apply = vi.fn();
      const references = ['circle1', 'square2', 'textLabel'];
      const editor = createApiValueEditor(createField(), '{"$ref":"circle1"}', references, apply, vi.fn());
      document.body.append(editor);

      expect(getModeSelect(editor).value).toBe('ref');
      const select = editor.querySelector<HTMLSelectElement>('select[aria-label="已有对象"]')!;
      expect(select).not.toBeNull();
      expect(select.value).toBe('circle1');

      const options = [...select.options].map((o) => o.value);
      expect(options).toContain('circle1');
      expect(options).toContain('square2');
      expect(options).toContain('@scene');
      expect(options).toContain('@camera');
      expect(options).toContain('@frame');
      expect(options).toContain('@renderer');

      select.value = 'square2';
      button(editor, '应用参数').click();
      expect(apply).toHaveBeenCalledExactlyOnceWith('{"$ref":"square2"}');

      select.value = '@camera';
      button(editor, '应用参数').click();
      expect(apply).toHaveBeenLastCalledWith('{"$ref":"@camera"}');
    });

    it('未选择对象时提示错误并不触发应用', () => {
      const apply = vi.fn();
      const editor = createApiValueEditor(createField(), '', ['circle1'], apply, vi.fn());
      document.body.append(editor);

      switchMode(editor, 'ref');
      const select = editor.querySelector<HTMLSelectElement>('select[aria-label="已有对象"]')!;
      select.value = '';

      button(editor, '应用参数').click();
      expect(apply).not.toHaveBeenCalled();
      expect(getError(editor).textContent).toContain('请选择一个已创建的对象');
    });

    it('当引用对象已被删除或缺失时标明已缺失项', () => {
      const editor = createApiValueEditor(createField(), '{"$ref":"deletedObj"}', ['circle1'], vi.fn(), vi.fn());
      document.body.append(editor);

      const select = editor.querySelector<HTMLSelectElement>('select[aria-label="已有对象"]')!;
      const missingOption = [...select.options].find((o) => o.value === 'deletedObj');
      expect(missingOption).toBeDefined();
      expect(missingOption?.textContent).toContain('已缺失：deletedObj');
    });
  });

  describe('布尔类型', () => {
    it('支持选择是/否并分别应用 true 和 false', () => {
      const apply = vi.fn();
      const editor = createApiValueEditor(createField(), 'true', [], apply, vi.fn());
      document.body.append(editor);

      expect(getModeSelect(editor).value).toBe('boolean');
      const select = editor.querySelector<HTMLSelectElement>('select[aria-label="是或否"]')!;
      expect(select.value).toBe('true');

      button(editor, '应用参数').click();
      expect(apply).toHaveBeenLastCalledWith('true');

      select.value = 'false';
      button(editor, '应用参数').click();
      expect(apply).toHaveBeenLastCalledWith('false');
      expect(apply).toHaveBeenCalledTimes(2);
    });
  });

  describe('默认值模式', () => {
    it('空字符串初始自动推断为 default 模式并显示说明', () => {
      const apply = vi.fn();
      const editor = createApiValueEditor(createField(), '', [], apply, vi.fn());
      document.body.append(editor);

      expect(getModeSelect(editor).value).toBe('default');
      expect(editor.textContent).toContain('留空使用默认值');

      button(editor, '应用参数').click();
      expect(apply).toHaveBeenCalledExactlyOnceWith('');
    });

    it('必填参数在 default 模式下提示必填警告', () => {
      const requiredField = createField({
        apiParameter: {
          name: 'required_param',
          kind: 'positional_only',
          annotation: 'int',
          required: true,
          default: null,
        },
      });
      const editor = createApiValueEditor(requiredField, '', [], vi.fn(), vi.fn());
      document.body.append(editor);

      expect(editor.textContent).toContain('此参数必填');
    });
  });

  describe('JSON 列表与字典', () => {
    it('支持输入和修改合法的 JSON 列表', () => {
      const apply = vi.fn();
      const editor = createApiValueEditor(createField(), '', [], apply, vi.fn());
      document.body.append(editor);

      switchMode(editor, 'json');
      const textarea = editor.querySelector<HTMLTextAreaElement>('textarea[aria-label="结构化参数 JSON"]')!;
      expect(textarea).not.toBeNull();

      textarea.value = '[ 1, "test", true, null ]';
      button(editor, '应用参数').click();

      expect(apply).toHaveBeenCalledExactlyOnceWith('[1,"test",true,null]');
    });

    it('支持输入和修改合法的 JSON 字典与嵌套结构', () => {
      const apply = vi.fn();
      const editor = createApiValueEditor(createField(), '', [], apply, vi.fn());
      document.body.append(editor);

      switchMode(editor, 'json');
      const textarea = editor.querySelector<HTMLTextAreaElement>('textarea[aria-label="结构化参数 JSON"]')!;

      textarea.value = '{\n  "stroke_width": 2,\n  "target": { "$ref": "dot1" }\n}';
      button(editor, '应用参数').click();

      expect(apply).toHaveBeenCalledExactlyOnceWith('{"stroke_width":2,"target":{"$ref":"dot1"}}');
    });
  });

  describe('不合法 JSON 错误拦截', () => {
    it('输入不合法 JSON 时拦截应用并向用户展示语法错误', () => {
      const apply = vi.fn();
      const editor = createApiValueEditor(createField(), '', [], apply, vi.fn());
      document.body.append(editor);

      switchMode(editor, 'json');
      const textarea = editor.querySelector<HTMLTextAreaElement>('textarea[aria-label="结构化参数 JSON"]')!;

      textarea.value = '{ broken json: true';
      button(editor, '应用参数').click();

      expect(apply).not.toHaveBeenCalled();
      const errorMsg = getError(editor).textContent;
      expect(errorMsg).not.toBe('');
      expect(errorMsg).toMatch(/JSON|Expected|token/i);
    });
  });

  describe('数学函数输入', () => {
    it('自动识别 lambda 函数并支持修改自变量与表达式', () => {
      const apply = vi.fn();
      const initial = JSON.stringify({
        $lambda: { params: ['t'], body: { $expr: 'sin(t)' } },
      });
      const editor = createApiValueEditor(createField(), initial, [], apply, vi.fn());
      document.body.append(editor);

      expect(getModeSelect(editor).value).toBe('function');
      const paramsInput = editor.querySelector<HTMLInputElement>('input[aria-label="自变量（逗号分隔）"]')!;
      const exprInput = editor.querySelector<HTMLInputElement>('input[aria-label="表达式"]')!;

      expect(paramsInput.value).toBe('t');
      expect(exprInput.value).toBe('sin(t)');

      paramsInput.value = '  u,  v  ';
      exprInput.value = 'u**2 + v**2';
      button(editor, '应用参数').click();

      expect(apply).toHaveBeenCalledExactlyOnceWith(
        '{"$lambda":{"params":["u","v"],"body":{"$expr":"u**2 + v**2"}}}',
      );
    });
  });

  describe('取消操作与快捷键行为', () => {
    it('点击取消按钮仅调用 close 回调，绝不调用 apply', () => {
      const apply = vi.fn();
      const close = vi.fn();
      const editor = createApiValueEditor(createField(), '10', [], apply, close);
      document.body.append(editor);

      const input = editor.querySelector<HTMLInputElement>('input[aria-label="数值"]')!;
      input.value = '999';

      button(editor, '取消').click();
      expect(close).toHaveBeenCalledOnce();
      expect(apply).not.toHaveBeenCalled();
    });

    it('按下 Escape 键触发 close 且不调用 apply', () => {
      const apply = vi.fn();
      const close = vi.fn();
      const editor = createApiValueEditor(createField(), '10', [], apply, close);
      document.body.append(editor);

      editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(close).toHaveBeenCalledOnce();
      expect(apply).not.toHaveBeenCalled();
    });

    it('按下 Ctrl+Enter 或 Meta+Enter 快捷键触发应用', () => {
      const apply = vi.fn();
      const editor = createApiValueEditor(createField(), '10', [], apply, vi.fn());
      document.body.append(editor);

      const input = editor.querySelector<HTMLInputElement>('input[aria-label="数值"]')!;
      input.value = '25';

      editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
      expect(apply).toHaveBeenCalledExactlyOnceWith('25');
    });
  });

  describe('真实修改值与模式切换流程', () => {
    it('用户能从一个类型切换至另一个类型并成功提交新值', () => {
      const apply = vi.fn();
      const editor = createApiValueEditor(createField(), '"初始文字"', ['box1'], apply, vi.fn());
      document.body.append(editor);

      expect(getModeSelect(editor).value).toBe('text');

      // 切换至 number 模式并修改
      switchMode(editor, 'number');
      const numInput = editor.querySelector<HTMLInputElement>('input[aria-label="数值"]')!;
      numInput.value = '100';
      button(editor, '应用参数').click();
      expect(apply).toHaveBeenLastCalledWith('100');

      // 切换至 ref 模式并修改
      switchMode(editor, 'ref');
      const refSelect = editor.querySelector<HTMLSelectElement>('select[aria-label="已有对象"]')!;
      refSelect.value = 'box1';
      button(editor, '应用参数').click();
      expect(apply).toHaveBeenLastCalledWith('{"$ref":"box1"}');

      // 切换至 json 模式并修改
      switchMode(editor, 'json');
      const jsonTextarea = editor.querySelector<HTMLTextAreaElement>('textarea[aria-label="结构化参数 JSON"]')!;
      jsonTextarea.value = '{"custom": true}';
      button(editor, '应用参数').click();
      expect(apply).toHaveBeenLastCalledWith('{"custom":true}');

      expect(apply).toHaveBeenCalledTimes(3);
    });

    it('当输入内容超过 20,000 字符限制时拒绝应用并报错', () => {
      const apply = vi.fn();
      const editor = createApiValueEditor(createField(), '', [], apply, vi.fn());
      document.body.append(editor);

      switchMode(editor, 'text');
      const textInput = editor.querySelector<HTMLInputElement>('input[aria-label="文字内容"]')!;
      textInput.value = 'a'.repeat(20005);

      button(editor, '应用参数').click();
      expect(apply).not.toHaveBeenCalled();
      expect(getError(editor).textContent).toContain('超过 20,000 字符');
    });
  });
});
