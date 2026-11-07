// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createApiValueEditor } from './api-value-field';
import type { FieldDefinition } from '../core/types';
const field: FieldDefinition = { name: 'p_func', label: '函数', type: 'api-value', default: '' };
const choose = (root: HTMLElement, value: string) => { const select = root.querySelector('select')!; select.value = value; select.dispatchEvent(new Event('change')); };
const apply = (root: HTMLElement) => [...root.querySelectorAll('button')].find(b => b.textContent === '应用参数')!.click();
describe('structured API editors', () => {
    it('selects multiple objects without requiring JSON or losing punctuation in names', () => {
        const save = vi.fn();
        const root = createApiValueEditor(field, '', ['圆, A', '圆 B'], save, vi.fn());
        choose(root, 'objects');
        document.body.append(root);
        const boxes = root.querySelectorAll<HTMLInputElement>('input[type=checkbox]');
        boxes[0].click();
        boxes[1].click();
        apply(root);
        expect(JSON.parse(save.mock.calls[0][0])).toEqual([{ $ref: '圆, A' }, { $ref: '圆 B' }]);
    });
    it('creates a surface callback with three coordinate expressions', () => {
        const save = vi.fn();
        const root = createApiValueEditor(field, '', [], save, vi.fn());
        choose(root, 'function3');
        root.querySelector<HTMLInputElement>('input[aria-label="自变量（逗号分隔）"]')!.value = 'u, v';
        for (const [axis, expression] of [['x', 'u'], ['y', 'v'], ['z', 'sin(u)*cos(v)']])
            root.querySelector<HTMLInputElement>(`input[aria-label="${axis} 表达式"]`)!.value = expression;
        apply(root);
        expect(JSON.parse(save.mock.calls[0][0])).toEqual({ $lambda: { params: ['u', 'v'], body: { $array: [{ $expr: 'u' }, { $expr: 'v' }, { $expr: 'sin(u)*cos(v)' }] } } });
    });
    it('preserves edited values when temporarily exploring another value type', () => {
        const save = vi.fn();
        const root = createApiValueEditor(field, '2', [], save, vi.fn());
        root.querySelector<HTMLInputElement>('input')!.value = '3.5';
        choose(root, 'text');
        choose(root, 'number');
        apply(root);
        expect(save).toHaveBeenCalledWith('3.5');
    });
});
