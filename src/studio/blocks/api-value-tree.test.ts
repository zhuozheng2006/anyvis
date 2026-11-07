// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createApiValueTree } from './api-value-tree';
import { createApiValueEditor } from './api-value-field';
import { createApiCompiler } from '../core/api-compiler';
import type { FieldDefinition } from '../core/types';
const ref = (name: string) => ({ $ref: name });
const local = (name: string) => ({ $local: name });
const field: FieldDefinition = { name: 'value', label: '参数', type: 'api-value', default: '' };
const input = (el: HTMLElement, label: string) => el.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;
const click = (el: HTMLElement, text: string) => [...el.querySelectorAll('button')].find(b => b.textContent === text)!.click();
const change = (el: HTMLElement, label: string, value: string) => { const c = input(el, label); c.value = value; c.dispatchEvent(new Event('change')); };
const compile = (v: unknown) => createApiCompiler().value(JSON.stringify(v), new Set(['circle']), {});

describe('visual structured API values', () => {
  it('opens supported structured tags visually and preserves malformed callback names verbatim', () => {
    const values = [{ $float: 1 }, { $method: { api: 'Mobject.shift', receiver: ref('circle') } }, { $call: { api: 'Dot', args: [] } }, { $op: ['+', 1, 2] }, { $tuple: [1, 2] }];
    for (const value of values) {
      const save = vi.fn();
      const editor = createApiValueEditor(field, JSON.stringify(value), ['circle'], save, vi.fn());
      expect(input(editor, '参数值类型').value).toBe('tree');
      expect(editor.querySelector('fieldset')).not.toBeNull();
      editor.dispose();
    }
    for (const params of [['a,b'], [' t '], [''], ['t', '']]) {
      const value = { $lambda: { params, body: { $expr: '1' } } };
      const tree = createApiValueTree(value, []);
      expect(tree.read()).toEqual(value);
      const save = vi.fn();
      const editor = createApiValueEditor(field, JSON.stringify(value), [], save, vi.fn());
      click(editor, '应用参数');
      expect(JSON.parse(save.mock.calls[0][0])).toEqual(value);
      editor.dispose(); tree.dispose();
    }
  });

  it('edits a bound method for an animation parameter without invoking it', () => {
    const tree = createApiValueTree({ $method: { api: 'Mobject.shift', receiver: ref('circle') } }, ['circle']);
    change(tree.element, '值 / API 名称', 'Mobject.rotate');
    expect(compile(tree.read()).code).toMatch(/\)\.rotate$/);
    expect(tree.element.textContent).not.toContain('位置参数');
  });
  it('retains malformed or very large imported subtrees without dropping fields or flooding the DOM', () => {
    for (const value of [{ $lambda: { params: [], body: 0, extra: 7 } }, { $call: { api: 'Dot', unsupported: 2 } }, Array.from({ length: 800 }, (_, i) => i)]) {
      const tree = createApiValueTree(value, []);
      expect(tree.read()).toEqual(value);
      expect(tree.element.querySelectorAll('fieldset').length).toBe(0);
    }
  });
  it('lets normalized colors retain integral float components', () => {
    const tree = createApiValueTree([{ $float: 1 }, { $float: 0 }, { $float: 0 }], []);
    expect(compile(tree.read()).code).toBe('[1.0, 0.0, 0.0]');
    input(tree.element, '值 / 第 2 项 / 浮点数').value = '0.5';
    expect(compile(tree.read()).code).toBe('[1.0, 0.5, 0.0]');
  });
  it('edits a nested updater with scoped locals and compiles it without Python text', () => {
    const value = { $lambda: { params: ['m', 'dt'], body: { $call: { api: 'Mobject.shift', receiver: local('m'), args: [{ $array: [{ $expr: 'dt' }, 0, 0] }], kwargs: {} } } } };
    const tree = createApiValueTree(value, ['circle']);
    input(tree.element, '值 / 返回值 / 操作 / 位置参数 / 第 1 项 / 第 1 项 / 表达式').value = 'dt * 2';
    const updated = tree.read();
    expect(compile(updated).code).toContain('lambda m, dt: _av_method(m,');
    expect(JSON.stringify(updated)).toContain('dt * 2');
    expect(value.$lambda.body.$call.args[0].$array[0]).toEqual({ $expr: 'dt' });
  });
  it('adds, reorders and deletes list items while retaining pending edits', () => {
    const tree = createApiValueTree([1, 2], []);
    input(tree.element, '值 / 第 1 项 / 数值').value = '8';
    click(tree.element, '添加一项');
    expect(tree.read()).toEqual([8, 2, 0]);
    click(tree.element, '上移第 2 项'); expect(tree.read()).toEqual([2, 8, 0]);
    click(tree.element, '删除第 3 项'); expect(tree.read()).toEqual([2, 8]);
  });
  it('rejects duplicate dictionary keys rather than silently dropping a value', () => {
    const tree = createApiValueTree({ a: 1, b: 2 }, []);
    input(tree.element, '值 / 第 2 项名称').value = 'a';
    expect(() => tree.read()).toThrow('重复');
    click(tree.element, '添加键值对');
    expect(tree.element.textContent).toContain('重复');
    expect(input(tree.element, '值 / 第 2 项名称').value).toBe('a');
  });
  it('preserves tuples, integer keys, lazy branches, slices, complex values and properties', () => {
    const value = { $dict: [[{ $tuple: [1, 'v'] }, { $if: [{ $not: false }, { $complex: [2, -3] }, { $slice: { value: [1, 2], start: null, stop: 1 } }] }], [2, { $property: { api: 'Circle.width', receiver: ref('circle') } }]] };
    const tree = createApiValueTree(value, ['circle']);
    expect(tree.read()).toEqual(value);
    expect(compile(tree.read()).code).toContain('complex(2, -3)');
  });
  it('can switch a function call to a method and enter its receiver', () => {
    const tree = createApiValueTree({ $call: { api: 'linear', args: [1], kwargs: {} } }, ['circle']);
    change(tree.element, '值 / API 名称', 'Mobject.scale');
    change(tree.element, '值 / 操作对象 / 对象', 'circle');
    expect(compile(tree.read()).code).toContain('_av_method(objects["circle"],');
    change(tree.element, '值 / API 名称', 'linear');
    expect(objectCall(tree.read())).not.toHaveProperty('receiver');
  });
  it('preserves the entire subtree when limiting deeply nested DOM rendering', () => {
    let value: unknown = 5;
    for (let i = 0; i < 16; i++) value = [value];
    const tree = createApiValueTree(value, []);
    expect(tree.read()).toEqual(value);
    expect(tree.element.querySelectorAll('fieldset').length).toBeLessThan(12);
  });
  it('returns scoped callbacks from a no-argument outer callback', () => {
    const value = { $lambda: { params: [], body: { $lambda: { params: ['t'], body: { $expr: 't+1' } } } } };
    const tree = createApiValueTree(value, []);
    expect(tree.read()).toEqual(value);
    expect(compile(tree.read()).code).toBe('lambda: lambda t: (t + 1)');
  });
  it('preserves current values when switching between the visual tree and JSON', () => {
    const apply = vi.fn();
    const editor = createApiValueEditor(field, '[1,2]', [], apply, vi.fn());
    expect(input(editor, '参数值类型').value).toBe('tree');
    input(editor, '值 / 第 2 项 / 数值').value = '9';
    change(editor, '参数值类型', 'json');
    expect(input(editor, '结构化参数 JSON').value).toBe('[1,9]');
    input(editor, '结构化参数 JSON').value = '[3,9]';
    change(editor, '参数值类型', 'tree');
    click(editor, '应用参数'); expect(apply).toHaveBeenCalledWith('[3,9]');
  });
  it('keeps an invalid JSON draft visible on a mode switch', () => {
    const editor = createApiValueEditor(field, '{bad', [], vi.fn(), vi.fn());
    change(editor, '参数值类型', 'tree');
    expect(input(editor, '参数值类型').value).toBe('json');
    expect(input(editor, '结构化参数 JSON').value).toBe('{bad');
  });
  it('does not truncate non-three-dimensional or nested-expression callback results', () => {
    for (const body of [{ $array: [1, 2, 3, 4] }, { $array: [{ $call: { api: 'linear', args: [0.5], kwargs: {} } }, 0, 0] }]) {
      const value = { $lambda: { params: [], body } }, apply = vi.fn();
      const editor = createApiValueEditor(field, JSON.stringify(value), [], apply, vi.fn());
      expect(input(editor, '参数值类型').value).toBe('tree');
      click(editor, '应用参数'); expect(JSON.parse(apply.mock.calls[0][0])).toEqual(value);
    }
  });
  it('keeps zero-argument mathematical callbacks zero-argument', () => {
    const apply = vi.fn();
    const editor = createApiValueEditor(field, '{"$lambda":{"params":[],"body":{"$expr":"1"}}}', [], apply, vi.fn());
    click(editor, '应用参数'); expect(JSON.parse(apply.mock.calls[0][0]).$lambda.params).toEqual([]);
  });
  it('can construct a callback and an explicit None without JSON', () => {
    const tree = createApiValueTree(null, []);
    change(tree.element, '值 / 类型', 'lambda');
    input(tree.element, '值 / 自变量（逗号分隔）').value = 'x';
    input(tree.element, '值 / 返回值 / 操作 / 表达式').value = 'x*x';
    expect(compile(tree.read()).code).toContain('lambda x:');
    change(tree.element, '值 / 类型', 'null'); expect(tree.read()).toBeNull();
    change(tree.element, '值 / 类型', 'lambda'); expect(compile(tree.read()).code).toContain('(x * x)');
  });
  it('does not silently mutate malformed imported values like non-string ref, non-numeric float, or malformed dict/call', () => {
    const malformed = [
      { $ref: 123 },
      { $float: 'not-a-number' },
      { $dict: [1, 2, 3] },
      { $call: { api: 456 } },
      { $call: { api: 'Dot', args: 'invalid-args' } },
      { $op: ['invalid_op', 1, 2] },
      { $slice: { start: 0 } },
      { $lambda: { params: [123], body: 0 } },
      { $constant: 999 },
      { $number: 100 },
      { $text: 'raw-text' },
      { $boolean: true },
      { $null: true },
    ];
    for (const item of malformed) {
      const tree = createApiValueTree(item, []);
      expect(input(tree.element, '值 / 类型').value).toBe('json');
      expect(tree.read()).toEqual(item);
    }
  });
  it('allows deleting an item if it holds an invalid draft, but strictly blocks structure change without resetting invalid sibling drafts', () => {
    const tree = createApiValueTree([10, 20, 30], []);
    // 1. 非法自身能删除：第 2 项数值清空（非法草稿），删除第 2 项自身必定成功
    input(tree.element, '值 / 第 2 项 / 数值').value = '';
    click(tree.element, '删除第 2 项');
    expect(tree.read()).toEqual([10, 30]);

    // 2. 非法相邻项不被重置：第 1 项输入非法草稿，删除第 2 项时严格拦截，保留第 1 项的 DOM 与未合法输入
    const item1Input = input(tree.element, '值 / 第 1 项 / 数值');
    item1Input.value = '';
    click(tree.element, '删除第 2 项');

    // 验证操作被拦截报错，第 1 项的 DOM 与输入草稿完全未被重绘或覆盖回旧值 10
    expect(tree.element.textContent).toContain('请输入有限数字');
    expect(input(tree.element, '值 / 第 1 项 / 数值').value).toBe('');
    expect(input(tree.element, '值 / 第 2 项 / 数值').value).toBe('30');
  });
  it('strictly checks remaining dictionary keys for collision and only allows resolving by deleting the offending key', () => {
    const tree = createApiValueTree({ a: 1, b: 2, c: 3 }, []);
    input(tree.element, '值 / 第 2 项名称').value = 'a'; // a 与 a 重名

    // 尝试删除第 3 项（c）：因为剩余项第 1 项与第 2 项仍然重名，必须严格拦截，不覆盖赋值，保留 DOM
    click(tree.element, '删除第 3 项');
    expect(tree.element.textContent).toContain('字典名称重复：a');
    expect(input(tree.element, '值 / 第 2 项名称').value).toBe('a');
    expect(input(tree.element, '值 / 第 3 项名称').value).toBe('c');

    // 只有删除造成重复的第 2 项后，剩余的 a 与 c 无重名，操作成功恢复合法
    click(tree.element, '删除第 2 项');
    expect(tree.read()).toEqual({ a: 1, c: 3 });
  });
  it('restores API name and preserves drafts when API change fails validation', () => {
    const tree = createApiValueTree({ $call: { api: 'linear', args: ['existing'], kwargs: {} } }, []);
    const apiInput = input(tree.element, '值 / API 名称');
    expect(apiInput.value).toBe('linear');

    // 在位置参数第一项输入草稿
    const argInput = input(tree.element, '值 / 位置参数 / 第 1 项 / 文字');
    argInput.value = 'draft_parameter';

    // 切换至不存在的非法 API
    change(tree.element, '值 / API 名称', 'InvalidNonExistentApi');

    // 报错、API 名称回退为原合法名称、草稿完好保留在 DOM
    expect(tree.element.textContent).toContain('请选择有效的 API');
    expect(input(tree.element, '值 / API 名称').value).toBe('linear');
    expect(input(tree.element, '值 / 位置参数 / 第 1 项 / 文字').value).toBe('draft_parameter');
  });
  it('stays in current mode and keeps invalid JSON draft when node type change read throws', () => {
    const tree = createApiValueTree({ custom: 1 }, []);
    expect(input(tree.element, '值 / 类型').value).toBe('object');
    change(tree.element, '值 / 类型', 'json');
    expect(input(tree.element, '值 / 类型').value).toBe('json');

    const jsonTextarea = tree.element.querySelector('textarea')!;
    jsonTextarea.value = '{invalid: json';

    // 尝试切换到 number，因非法 JSON 读取失败，必须留在 json 模式且草稿不被冲掉
    change(tree.element, '值 / 类型', 'number');
    expect(input(tree.element, '值 / 类型').value).toBe('json');
    expect(tree.element.querySelector('textarea')!.value).toBe('{invalid: json');
  });
  it('properly cleans up child node counts across repeated mutations without exhausting active node limit', () => {
    const tree = createApiValueTree([1], []);
    // Mutate the list 30 times (which would exceed 250 if child nodes leaked without cleanup)
    for (let i = 0; i < 30; i++) {
      click(tree.element, '添加一项');
      click(tree.element, '删除第 2 项');
    }
    // Node should still be a visual list, not forced into json
    expect(input(tree.element, '值 / 类型').value).toBe('list');
    expect(tree.read()).toEqual([1]);
  });
  it('notifies onMutate callback on tree edits so dropdown can reposition', () => {
    const onMutate = vi.fn();
    const tree = createApiValueTree([1], [], onMutate);
    click(tree.element, '添加一项');
    expect(onMutate).toHaveBeenCalled();
  });
});
function objectCall(value: any) { return value.$call; }
