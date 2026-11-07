import * as Blockly from 'blockly/core';
import { API_REGISTRY, API_ENTRIES } from '../core/api-registry';
import type { FieldDefinition } from '../core/types';
import { createApiValueTree } from './api-value-tree';
import './api-editor.css';

const modes = [
    ['default', '采用默认值'],
    ['number', '数字'],
    ['text', '文字'],
    ['color', '颜色'],
    ['boolean', '是 / 否'],
    ['ref', '已有对象 / 返回值'],
    ['objects', '选择多个对象'],
    ['constant', 'Manim 常量'],
    ['api', '函数 / 类'],
    ['vector', '三维向量'],
    ['function', '数学函数'],
    ['function3', '曲线 / 曲面函数'],
    ['tree', '嵌套参数 / 回调（可视编辑）'],
    ['json', '高级 JSON'],
];

const palette = ['#58C4DD', '#83C167', '#FFFF00', '#FC6255', '#9A72AC', '#FF862F', '#FFFFFF', '#222222'];

export interface ApiValueEditorElement extends HTMLDivElement {
    dispose: () => void;
}

export function clampDropdownToViewport(editor: HTMLElement) {
    const contentDiv = (editor.parentElement as HTMLElement | null) || Blockly.DropDownDiv.getContentDiv();
    if (!contentDiv) return;
    const dropdownDiv = (contentDiv.parentElement as HTMLElement | null) || document.querySelector<HTMLElement>('.blocklyDropDownDiv');
    if (!dropdownDiv || !dropdownDiv.offsetParent) return;

    const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const viewportWidth = window.visualViewport ? window.visualViewport.width : window.innerWidth;
    const MARGIN = 12;

    // 1. 保证 contentDiv 能够自适应展开，不被默认的 300px max-height 截断
    if (contentDiv.style && contentDiv.style.maxHeight !== 'none') {
        contentDiv.style.maxHeight = 'none';
        contentDiv.style.height = 'auto';
    }

    // 2. 约束编辑器最大可用高度（保持在 560px 左右的合理尺寸，绝不盲目放大至 795px）
    const maxAvailableHeight = Math.min(560, Math.max(200, Math.floor(viewportHeight - MARGIN * 2)));
    if (editor.style.maxHeight !== `${maxAvailableHeight}px`) {
        editor.style.maxHeight = `${maxAvailableHeight}px`;
    }

    // 3. 测量真实的 editor 与 footer 在视口中的绝对物理坐标（已自动包含 parent translateY 等 transform）
    const editorRect = editor.getBoundingClientRect();
    const footer = editor.querySelector<HTMLElement>('.av-api-actions');
    const footerBottom = footer ? footer.getBoundingClientRect().bottom : editorRect.bottom;
    const actualBottom = Math.max(editorRect.bottom, footerBottom);

    const maxAllowedBottom = viewportHeight - MARGIN;
    if (actualBottom > maxAllowedBottom) {
        const overflow = actualBottom - maxAllowedBottom;
        const currentTop = parseFloat(dropdownDiv.style.top) || dropdownDiv.getBoundingClientRect().top;
        const currentVisualTop = dropdownDiv.getBoundingClientRect().top;
        const maxShiftUp = Math.max(0, currentVisualTop - MARGIN);
        const shiftY = Math.min(overflow, maxShiftUp);
        if (shiftY > 0) {
            dropdownDiv.style.top = `${Math.floor(currentTop - shiftY)}px`;
        }
    } else if (dropdownDiv.getBoundingClientRect().top < MARGIN) {
        const overflowTop = MARGIN - dropdownDiv.getBoundingClientRect().top;
        const currentTop = parseFloat(dropdownDiv.style.top) || dropdownDiv.getBoundingClientRect().top;
        dropdownDiv.style.top = `${Math.floor(currentTop + overflowTop)}px`;
    }

    // 水平方向 clamp
    const rectX = dropdownDiv.getBoundingClientRect();
    if (rectX.right > viewportWidth - MARGIN) {
        const overflowRight = rectX.right - (viewportWidth - MARGIN);
        const currentLeft = parseFloat(dropdownDiv.style.left) || rectX.left;
        dropdownDiv.style.left = `${Math.max(MARGIN, Math.floor(currentLeft - overflowRight))}px`;
    } else if (rectX.left < MARGIN) {
        const overflowLeft = MARGIN - rectX.left;
        const currentLeft = parseFloat(dropdownDiv.style.left) || rectX.left;
        dropdownDiv.style.left = `${Math.floor(currentLeft + overflowLeft)}px`;
    }
}

export function infer(raw: string, field: FieldDefinition): string {
    if (!raw)
        return 'default';
    try {
        const v = JSON.parse(raw);
        if (typeof v === 'number')
            return Number.isFinite(v) ? 'number' : 'json';
        if (typeof v === 'boolean')
            return 'boolean';
        if (typeof v === 'string')
            return field.apiParameter?.name.includes('color') ? 'color' : 'text';

        // 对象类型：严格先校验 shape，避免未知额外属性被快捷模式吞掉
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            const keys = Object.keys(v);
            // 含有额外属性的多 key 对象，绝不能走单一 shortcut 模式，进入 tree 保留完整数据
            if (keys.length !== 1) {
                return 'tree';
            }
            const tag = keys[0];

            if (tag === '$ref') {
                return typeof v.$ref === 'string' ? 'ref' : 'json';
            }
            if (tag === '$constant') {
                return typeof v.$constant === 'string' ? 'constant' : 'json';
            }
            if (tag === '$api') {
                return typeof v.$api === 'string' ? 'api' : 'json';
            }
            if (tag === '$array') {
                if (Array.isArray(v.$array) && v.$array.length === 3 && v.$array.every((x: unknown) => typeof x === 'number' && Number.isFinite(x))) {
                    return 'vector';
                }
                return 'tree';
            }
            if (tag === '$lambda') {
                const lambdaObj = v.$lambda;
                if (!lambdaObj || typeof lambdaObj !== 'object' || Array.isArray(lambdaObj)) return 'tree';
                const lambdaKeys = Object.keys(lambdaObj);
                if (lambdaKeys.length !== 2 || !('params' in lambdaObj) || !('body' in lambdaObj)) return 'tree';
                if (!Array.isArray(lambdaObj.params) || !lambdaObj.params.every((p: unknown) => typeof p === 'string' && p.length > 0 && p === p.trim() && !p.includes(','))) return 'tree';

                const body = lambdaObj.body;
                if (!body || typeof body !== 'object' || Array.isArray(body)) return 'tree';
                const bodyKeys = Object.keys(body);

                // function3: params, body 必须且仅有 $array，长度为 3，且每一项都是 number 或 {$expr: string}
                if (bodyKeys.length === 1 && bodyKeys[0] === '$array' && Array.isArray(body.$array) && body.$array.length === 3) {
                    const isCoord = (x: unknown) =>
                        typeof x === 'number' ||
                        (x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length === 1 && typeof (x as { $expr?: unknown }).$expr === 'string');
                    if (body.$array.every(isCoord)) {
                        return 'function3';
                    }
                }

                // function: body 必须且仅有 $expr，且值为 string
                if (bodyKeys.length === 1 && bodyKeys[0] === '$expr' && typeof body.$expr === 'string') {
                    return 'function';
                }

                return 'tree';
            }

            // Known structured tags open the recursive editor; it preserves malformed subtrees as JSON.
            if (['$path', '$float', '$method', '$call', '$property', '$tuple', '$dict', '$complex', '$local', '$expr', '$index', '$slice', '$op', '$if', '$not'].includes(tag)) return 'tree';

            // 未知 $tag（如 $number, $text, $boolean, $null 等）一律作为 json 保留，不误当快捷模式
            if (tag.startsWith('$')) {
                return 'json';
            }

            return 'tree';
        }

        // 数组类型：若要作为 objects 快捷模式，每个元素必须且仅有 $ref 键，无任何 extra
        if (Array.isArray(v)) {
            if (v.length > 0 && v.every(x => x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length === 1 && typeof (x as Record<string, unknown>).$ref === 'string')) {
                return 'objects';
            }
            return 'tree';
        }

        return 'tree';
    }
    catch {
        return 'json';
    }
}

export function createApiValueEditor(
    field: FieldDefinition,
    raw: string,
    references: string[],
    apply: (v: string) => void,
    close: () => void,
    reposition?: () => void
): ApiValueEditorElement {
    const root = document.createElement('div') as ApiValueEditorElement;
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

    let currentTreeDispose: (() => void) | null = null;
    let read = () => raw;

    const requestReposition = () => {
        reposition?.();
        clampDropdownToViewport(root);
    };

    const render = () => {
        if (currentTreeDispose) {
            currentTreeDispose();
            currentTreeDispose = null;
        }
        body.replaceChildren();
        error.textContent = '';
        let current: unknown;
        try {
            current = JSON.parse(raw);
        }
        catch {
            current = mode.value !== 'default' ? field.apiParameter?.default?.value : undefined;
        }
        const input = (label: string, value: string, type = 'text') => {
            const wrap = document.createElement('label');
            wrap.textContent = label;
            const el = document.createElement('input');
            el.type = type;
            el.value = value;
            el.setAttribute('aria-label', label);
            el.spellcheck = false;
            wrap.append(el);
            body.append(wrap);
            return el;
        };
        const tagged = current && typeof current === 'object' ? current as Record<string, unknown> : {};
        switch (mode.value) {
            case 'tree': {
                const tree = createApiValueTree(
                    current === undefined ? (field.apiParameter?.kind === 'var_keyword' ? {} : []) : current,
                    references,
                    requestReposition
                );
                currentTreeDispose = tree.dispose;
                body.append(tree.element);
                read = () => JSON.stringify(tree.read());
                break;
            }
            case 'default': {
                const note = document.createElement('p');
                const d = field.apiParameter?.default;
                note.textContent = field.apiParameter?.required
                    ? '此参数必填，请选择值类型。'
                    : `留空使用默认值${d ? '：' + ('value' in d ? JSON.stringify(d.value) : d.description) : ''}`;
                body.append(note);
                read = () => '';
                break;
            }
            case 'number': {
                const el = input('数值', typeof current === 'number' ? String(current) : '0', 'number');
                el.step = 'any';
                read = () => {
                    if (!el.value.trim() || !Number.isFinite(Number(el.value)))
                        throw Error('请输入有限数字。');
                    return JSON.stringify(Number(el.value));
                };
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
                read = () => {
                    if (!el.value)
                        throw Error('请选择一个已创建的对象。');
                    return JSON.stringify({ $ref: el.value });
                };
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
                        box.onchange = () => {
                            if (box.checked)
                                selected.add(name);
                            else
                                selected.delete(name);
                        };
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
                const params = input('自变量（逗号分隔）', fn?.params?.join(', ') ?? 't');
                const defaults = ['cos(t)', 'sin(t)', '0'];
                const coordinates = ['x 表达式', 'y 表达式', 'z 表达式'].map((label, i) => {
                    const v = fn?.body?.$array?.[i];
                    return input(label, typeof v === 'number' ? String(v) : v?.$expr || defaults[i]);
                });
                read = () => JSON.stringify({
                    $lambda: {
                        params: params.value.split(',').map(s => s.trim()).filter(Boolean),
                        body: { $array: coordinates.map(c => ({ $expr: c.value })) }
                    }
                });
                break;
            }
            case 'constant':
            case 'api': {
                const tag = mode.value === 'constant' ? '$constant' : '$api';
                const values = mode.value === 'constant' ? Object.keys(API_REGISTRY.constants) : API_ENTRIES.filter(e => ['class', 'function', 'classmethod', 'staticmethod'].includes(e.kind)).map(e => e.id);
                const el = input(mode.value === 'constant' ? '常量名称' : '函数或类名称', String(tagged[tag] || ''));
                const list = document.createElement('datalist');
                list.id = `av-api-options-${Math.random().toString(36).slice(2, 9)}`;
                el.setAttribute('list', list.id);
                const update = () => {
                    list.replaceChildren(...values.filter(v => v.toLowerCase().includes(el.value.toLowerCase())).slice(0, 60).map(v => new Option(v, v)));
                };
                el.oninput = update;
                update();
                body.append(list);
                read = () => {
                    if (!values.includes(el.value))
                        throw Error('请从清单中选择有效名称。');
                    return JSON.stringify({ [tag]: el.value });
                };
                break;
            }
            case 'vector': {
                const v = Array.isArray(tagged.$array) ? tagged.$array : [0, 0, 0];
                const controls = ['x', 'y', 'z'].map((label, i) => input(label, String(v[i] ?? 0), 'number'));
                controls.forEach(e => e.step = 'any');
                read = () => {
                    const vals = controls.map(e => Number(e.value));
                    if (controls.some(e => !e.value.trim()) || vals.some(val => !Number.isFinite(val)))
                        throw Error('向量坐标必须是有限数字。');
                    return JSON.stringify({ $array: vals });
                };
                break;
            }
            case 'function': {
                const fn = tagged.$lambda as {
                    params?: string[];
                    body?: {
                        $expr?: string;
                    };
                } | undefined;
                const params = input('自变量（逗号分隔）', fn?.params?.join(', ') ?? 't');
                const expr = input('表达式', fn?.body?.$expr || 'sin(t)');
                read = () => JSON.stringify({
                    $lambda: {
                        params: params.value.split(',').map(s => s.trim()).filter(Boolean),
                        body: { $expr: expr.value }
                    }
                });
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
    mode.onchange = () => {
        const requested = mode.value;
        try {
            const current = read();
            drafts.set(previousMode, current);
            raw = (requested === 'tree' || requested === 'json') ? current : drafts.get(requested) ?? current;
            previousMode = requested;
            render();
            requestReposition();
        } catch (e) {
            mode.value = previousMode;
            error.textContent = (e as Error).message;
            requestReposition();
        }
    };
    render();

    const footer = document.createElement('div');
    footer.className = 'av-api-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = '取消';

    const ok = document.createElement('button');
    ok.type = 'button';
    ok.textContent = '应用参数';
    ok.className = 'primary';

    footer.append(cancel, ok);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && reposition) {
        ro = new ResizeObserver(() => {
            requestReposition();
        });
        ro.observe(root);
    }

    let disposed = false;
    const cleanup = () => {
        if (disposed) return;
        disposed = true;
        if (ro) {
            ro.disconnect();
            ro = null;
        }
        if (currentTreeDispose) {
            currentTreeDispose();
            currentTreeDispose = null;
        }
    };

    root.dispose = cleanup;

    cancel.onclick = () => {
        cleanup();
        close();
    };

    ok.onclick = () => {
        try {
            const value = read();
            if (value.length > 20000)
                throw Error('参数超过 20,000 字符。');
            cleanup();
            apply(value);
        }
        catch (e) {
            error.textContent = (e as Error).message;
            requestReposition();
        }
    };

    root.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            cleanup();
            close();
        }
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            ok.click();
        }
    });

    root.append(title, help, mode, body, error, footer);
    return root;
}

export class ApiValueField extends Blockly.FieldTextInput {
    constructor(private definition: FieldDefinition, private references: () => string[]) {
        super(String(definition.default));
        this.setSpellcheck(false);
    }
    protected override getText_(): string {
        const raw = this.getValue() || '';
        if (!raw)
            return this.definition.apiParameter?.required ? '填写参数…' : '默认';
        try {
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
        }
    }
    protected override doClassValidation_(value?: unknown): string | null {
        return typeof value === 'string' && value.length <= 20000 ? value : null;
    }
    protected override showEditor_(): void {
        if (!this.sourceBlock_ || this.disposed)
            return;
        Blockly.DropDownDiv.hideWithoutAnimation();
        Blockly.DropDownDiv.clearContent();
        const close = () => Blockly.DropDownDiv.hideIfOwner<string>(this);

        const contentDiv = Blockly.DropDownDiv.getContentDiv();
        const prevContentMaxHeight = contentDiv.style.maxHeight;
        const prevContentHeight = contentDiv.style.height;
        const prevContentOverflow = contentDiv.style.overflow;

        let editorRef: ApiValueEditorElement | null = null;
        const reposition = () => {
            if (Blockly.DropDownDiv.getOwner() === this) {
                Blockly.DropDownDiv.repositionForWindowResize();
            }
            if (editorRef) {
                clampDropdownToViewport(editorRef);
            }
        };

        const editor = createApiValueEditor(
            this.definition,
            this.getValue() || '',
            this.references(),
            v => {
                this.setValue(v);
                close();
            },
            close,
            reposition
        );
        editorRef = editor;

        contentDiv.append(editor);
        Blockly.DropDownDiv.setColour('#fff', '#d8ddeb');

        const onWindowResize = () => {
            reposition();
        };
        window.addEventListener('resize', onWindowResize);
        window.visualViewport?.addEventListener('resize', onWindowResize);

        Blockly.DropDownDiv.showPositionedByField<string>(this, () => {
            window.removeEventListener('resize', onWindowResize);
            window.visualViewport?.removeEventListener('resize', onWindowResize);
            // 恢复 contentDiv 原生样式，仅对本 editor 生效
            contentDiv.style.maxHeight = prevContentMaxHeight;
            contentDiv.style.height = prevContentHeight;
            contentDiv.style.overflow = prevContentOverflow;
            editor.dispose();
            editor.remove();
        });

        // show 后立即执行覆盖与 clamp
        reposition();
        editor.querySelector('select')?.focus();
    }
    override dispose(): void {
        Blockly.DropDownDiv.hideIfOwner<string>(this, true);
        super.dispose();
    }
}
