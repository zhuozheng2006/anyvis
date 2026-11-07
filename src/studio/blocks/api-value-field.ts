import * as Blockly from 'blockly/core';
import { API_REGISTRY, API_ENTRIES } from '../core/api-registry';
import type { FieldDefinition } from '../core/types';
import './api-editor.css';
const modes = [['default', '采用默认值'], ['number', '数字'], ['text', '文字'], ['color', '颜色'], ['boolean', '是 / 否'], ['ref', '已有对象 / 返回值'], ['objects', '选择多个对象'], ['constant', 'Manim 常量'], ['api', '函数 / 类'], ['vector', '三维向量'], ['function', '数学函数'], ['function3', '曲线 / 曲面函数'], ['json', '列表、字典及高级值（JSON）']];
const palette = ['#58C4DD', '#83C167', '#FFFF00', '#FC6255', '#9A72AC', '#FF862F', '#FFFFFF', '#222222'];
function infer(raw: string, field: FieldDefinition) {
    if (!raw)
        return 'default';
    try {
        const v = JSON.parse(raw);
        if (typeof v === 'number')
            return 'number';
        if (typeof v === 'boolean')
            return 'boolean';
        if (typeof v === 'string')
            return field.apiParameter?.name.includes('color') ? 'color' : 'text';
        if (v?.$ref)
            return 'ref';
        if (v?.$constant)
            return 'constant';
        if (v?.$api)
            return 'api';
        if (Array.isArray(v) && v.length && v.every(x => x && typeof x.$ref === 'string' && Object.keys(x).length === 1))
            return 'objects';
        if (v?.$lambda && Array.isArray(v.$lambda.body?.$array))
            return 'function3';
        if (v?.$lambda && v.$lambda.body?.$expr)
            return 'function';
        if (Array.isArray(v?.$array) && v.$array.length === 3 && v.$array.every((x: unknown) => typeof x === 'number'))
            return 'vector';
        return 'json';
    }
    catch {
        return 'json';
    }
}
export function createApiValueEditor(field: FieldDefinition, raw: string, references: string[], apply: (v: string) => void, close: () => void) {
    const root = document.createElement('div');
    root.className = 'av-api-value-editor';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', `编辑${field.label}`);
    root.addEventListener('pointerdown', e => e.stopPropagation());
    const title = document.createElement('strong');
    title.textContent = field.label;
    const help = document.createElement('p');
    help.textContent = field.description || '选择一种值类型。列表和字典可以嵌套对象引用。';
    const mode = document.createElement('select');
    mode.setAttribute('aria-label', '参数值类型');
    for (const [id, label] of modes)
        mode.add(new Option(label, id));
    mode.value = infer(raw, field);
    const body = document.createElement('div');
    body.className = 'av-api-value-controls';
    const error = document.createElement('p');
    error.setAttribute('role', 'alert');
    error.className = 'av-api-error';
    let read = () => raw;
    const render = () => {
        body.replaceChildren();
        error.textContent = '';
        let current: unknown;
        try {
            current = JSON.parse(raw);
        }
        catch {
            current = mode.value !== 'default' ? field.apiParameter?.default?.value : undefined;
        }
        const input = (label: string, value: string, type = 'text') => { const wrap = document.createElement('label'); wrap.textContent = label; const el = document.createElement('input'); el.type = type; el.value = value; el.setAttribute('aria-label', label); el.spellcheck = false; wrap.append(el); body.append(wrap); return el; };
        const tagged = current && typeof current === 'object' ? current as Record<string, unknown> : {};
        switch (mode.value) {
            case 'default': {
                const note = document.createElement('p');
                const d = field.apiParameter?.default;
                note.textContent = field.apiParameter?.required ? '此参数必填，请选择值类型。' : `留空使用默认值${d ? '：' + ('value' in d ? JSON.stringify(d.value) : d.description) : ''}`;
                body.append(note);
                read = () => '';
                break;
            }
            case 'number': {
                const el = input('数值', typeof current === 'number' ? String(current) : '0', 'number');
                el.step = 'any';
                read = () => { if (!el.value.trim() || !Number.isFinite(Number(el.value)))
                    throw Error('请输入有限数字。'); return JSON.stringify(Number(el.value)); };
                break;
            }
            case 'text': {
                const el = input('文字内容', typeof current === 'string' ? current : '');
                read = () => JSON.stringify(el.value);
                break;
            }
            case 'color': {
                const el = input('自由选色', typeof current === 'string' && /^#[0-9a-f]{6}$/i.test(current) ? current : '#58c4dd', 'color');
                const swatches = document.createElement('div');
                swatches.className = 'av-api-swatches';
                for (const hex of palette) {
                    const b = document.createElement('button');
                    b.type = 'button';
                    b.style.background = hex;
                    b.setAttribute('aria-label', `颜色 ${hex}`);
                    b.onclick = () => { el.value = hex; };
                    swatches.append(b);
                }
                body.append(swatches);
                read = () => JSON.stringify(el.value);
                break;
            }
            case 'boolean': {
                const el = document.createElement('select');
                el.setAttribute('aria-label', '是或否');
                el.add(new Option('是', 'true'));
                el.add(new Option('否', 'false'));
                el.value = String(current === true);
                body.append(el);
                read = () => el.value;
                break;
            }
            case 'ref': {
                const el = document.createElement('select');
                el.setAttribute('aria-label', '已有对象');
                el.add(new Option('请选择', ''));
                for (const name of [...new Set([...references, '@scene', '@camera', '@frame', '@renderer'])])
                    el.add(new Option(name, name));
                if (typeof tagged.$ref === 'string' && ![...el.options].some(o => o.value === tagged.$ref))
                    el.add(new Option(`已缺失：${tagged.$ref}`, tagged.$ref));
                el.value = String(tagged.$ref || '');
                body.append(el);
                read = () => { if (!el.value)
                    throw Error('请选择一个已创建的对象。'); return JSON.stringify({ $ref: el.value }); };
                break;
            }
            case 'objects': {
                const selected = new Set<string>(Array.isArray(current) ? current.flatMap(v => typeof v?.$ref === 'string' ? [v.$ref] : []) : []);
                const search = input('搜索对象', '');
                const list = document.createElement('div');
                list.className = 'av-api-object-list';
                body.append(list);
                const update = () => {
                    list.replaceChildren();
                    for (const name of [...new Set([...selected, ...references])].filter(n => n.toLowerCase().includes(search.value.toLowerCase()))) {
                        const label = document.createElement('label');
                        const box = document.createElement('input');
                        box.type = 'checkbox';
                        box.checked = selected.has(name);
                        box.setAttribute('aria-label', name);
                        box.onchange = () => { if (box.checked)
                            selected.add(name);
                        else
                            selected.delete(name); };
                        label.append(box, document.createTextNode(references.includes(name) ? name : `已缺失：${name}`));
                        list.append(label);
                    }
                };
                search.oninput = update;
                update();
                read = () => JSON.stringify([...selected].map(name => ({ $ref: name })));
                break;
            }
            case 'function3': {
                const fn = tagged.$lambda as {
                    params?: string[];
                    body?: {
                        $array?: ({
                            $expr?: string;
                        } | number)[];
                    };
                } | undefined;
                const params = input('自变量（逗号分隔）', fn?.params?.join(', ') || 't');
                const defaults = ['cos(t)', 'sin(t)', '0'];
                const coordinates = ['x 表达式', 'y 表达式', 'z 表达式'].map((label, i) => { const v = fn?.body?.$array?.[i]; return input(label, typeof v === 'number' ? String(v) : v?.$expr || defaults[i]); });
                read = () => JSON.stringify({ $lambda: { params: params.value.split(',').map(s => s.trim()).filter(Boolean), body: { $array: coordinates.map(c => ({ $expr: c.value })) } } });
                break;
            }
            case 'constant':
            case 'api': {
                const tag = mode.value === 'constant' ? '$constant' : '$api';
                const values = mode.value === 'constant' ? Object.keys(API_REGISTRY.constants) : API_ENTRIES.filter(e => ['class', 'function', 'classmethod', 'staticmethod'].includes(e.kind)).map(e => e.id);
                const el = input(mode.value === 'constant' ? '常量名称' : '函数或类名称', String(tagged[tag] || ''));
                const list = document.createElement('datalist');
                list.id = `av-api-options-${crypto.randomUUID()}`;
                el.setAttribute('list', list.id);
                const update = () => { list.replaceChildren(...values.filter(v => v.toLowerCase().includes(el.value.toLowerCase())).slice(0, 60).map(v => new Option(v, v))); };
                el.oninput = update;
                update();
                body.append(list);
                read = () => { if (!values.includes(el.value))
                    throw Error('请从清单中选择有效名称。'); return JSON.stringify({ [tag]: el.value }); };
                break;
            }
            case 'vector': {
                const v = Array.isArray(tagged.$array) ? tagged.$array : [0, 0, 0];
                const controls = ['x', 'y', 'z'].map((label, i) => input(label, String(v[i] ?? 0), 'number'));
                controls.forEach(e => e.step = 'any');
                read = () => { const vals = controls.map(e => Number(e.value)); if (controls.some(e => !e.value.trim()) || vals.some(v => !Number.isFinite(v)))
                    throw Error('向量坐标必须是有限数字。'); return JSON.stringify({ $array: vals }); };
                break;
            }
            case 'function': {
                const fn = tagged.$lambda as {
                    params?: string[];
                    body?: {
                        $expr?: string;
                    };
                } | undefined;
                const params = input('自变量（逗号分隔）', fn?.params?.join(', ') || 't');
                const expr = input('表达式', fn?.body?.$expr || 'sin(t)');
                read = () => JSON.stringify({ $lambda: { params: params.value.split(',').map(s => s.trim()).filter(Boolean), body: { $expr: expr.value } } });
                break;
            }
            default: {
                const el = document.createElement('textarea');
                el.setAttribute('aria-label', '结构化参数 JSON');
                el.spellcheck = false;
                el.maxLength = 20000;
                el.value = raw || (field.apiParameter?.kind === 'var_keyword' ? '{}' : '[]');
                body.append(el);
                const note = document.createElement('p');
                note.textContent = '示例：[{"$ref":"圆"}] · {"stroke_width":2} · {"$array":[1,0,0]}。这里只接受数据，不执行 Python。';
                body.append(note);
                read = () => JSON.stringify(JSON.parse(el.value));
            }
        }
    };
    const drafts = new Map<string, string>();
    let previousMode = mode.value;
    mode.onchange = () => { try {
        drafts.set(previousMode, read());
    }
    catch { /* Keep an invalid draft visible until cancelled. */ } previousMode = mode.value; raw = drafts.get(previousMode) ?? raw; render(); };
    render();
    const footer = document.createElement('div');
    footer.className = 'av-api-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = '取消';
    cancel.onclick = close;
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.textContent = '应用参数';
    ok.className = 'primary';
    ok.onclick = () => { try {
        const value = read();
        if (value.length > 20000)
            throw Error('参数超过 20,000 字符。');
        apply(value);
    }
    catch (e) {
        error.textContent = (e as Error).message;
    } };
    footer.append(cancel, ok);
    root.addEventListener('keydown', e => { if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
    } if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        ok.click();
    } });
    root.append(title, help, mode, body, error, footer);
    return root;
}
export class ApiValueField extends Blockly.FieldTextInput {
    constructor(private definition: FieldDefinition, private references: () => string[]) { super(String(definition.default)); this.setSpellcheck(false); }
    protected override getText_(): string { const raw = this.getValue() || ''; if (!raw)
        return this.definition.apiParameter?.required ? '填写参数…' : '默认'; try {
        const v = JSON.parse(raw);
        if (v?.$ref)
            return `↗ ${v.$ref}`;
        if (v?.$lambda)
            return 'ƒ 函数';
        const text = typeof v === 'string' ? v : JSON.stringify(v);
        return text.length > 30 ? text.slice(0, 28) + '…' : text;
    }
    catch {
        return '⚠ 修改参数';
    } }
    protected override doClassValidation_(value?: unknown): string | null { return typeof value === 'string' && value.length <= 20000 ? value : null; }
    protected override showEditor_(): void { if (!this.sourceBlock_ || this.disposed)
        return; Blockly.DropDownDiv.hideWithoutAnimation(); Blockly.DropDownDiv.clearContent(); const close = () => Blockly.DropDownDiv.hideIfOwner<string>(this); const editor = createApiValueEditor(this.definition, this.getValue() || '', this.references(), v => { this.setValue(v); close(); }, close); Blockly.DropDownDiv.getContentDiv().append(editor); Blockly.DropDownDiv.setColour('#fff', '#d8ddeb'); Blockly.DropDownDiv.showPositionedByField<string>(this, () => editor.remove()); editor.querySelector('select')?.focus(); }
    override dispose(): void { Blockly.DropDownDiv.hideIfOwner<string>(this, true); super.dispose(); }
}
