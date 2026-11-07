import { API_ENTRIES, API_REGISTRY, getApiEntry } from '../core/api-registry';

// Each node owns a reader rather than writing into the project as the user types.
// Applying the outer field is therefore one undoable Blockly change.
type Reader = () => unknown;
interface TreeNode {
  element: HTMLElement;
  read: Reader;
  dispose: () => void;
}

const kinds = [
  ['number', '数字'], ['float', '浮点数（如 1.0）'], ['text', '文字'], ['path', '本机路径'], ['boolean', '是 / 否'], ['null', '空值 None'],
  ['ref', '已有对象'], ['local', '回调参数'], ['constant', 'Manim 常量'], ['api', '函数 / 类'],
  ['expr', '数学表达式'], ['list', '列表'], ['array', '数值数组 / 向量'], ['tuple', '元组'],
  ['object', '字典'], ['dict', '带整数 / 元组键的字典'], ['complex', '复数'],
  ['lambda', '回调函数'], ['call', '调用 API'], ['invoke', '调用返回的函数'],
  ['property', '读取属性'], ['method', '绑定对象方法'], ['op', '运算 / 比较'], ['if', '条件分支'], ['not', '取反'],
  ['index', '取元素'], ['slice', '切片'], ['json', '高级 JSON'],
];
const operators = ['+', '-', '*', '/', '**', '%', '@', '<', '<=', '>', '>=', '==', '!=', 'and', 'or'];
const object = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};

function kindOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'list';
  if (typeof value === 'number') return Number.isFinite(value) ? 'number' : 'json';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') return 'text';
  const obj = object(value);
  const keys = Object.keys(obj);
  if (!keys.some(k => k.startsWith('$'))) return 'object';
  if (keys.length !== 1) return 'json';
  const tag = keys[0].slice(1);
  const data = obj[keys[0]];

  // 严格白名单专用语法 tag：绝不能把未知 tag（如 $number, $text, $boolean, $null 等）误判为专用模式
  switch (tag) {
    case 'float':
      return typeof data === 'number' && Number.isFinite(data) ? 'float' : 'json';
    case 'ref':
    case 'local':
    case 'constant':
    case 'api':
    case 'expr':
    case 'path':
      return typeof data === 'string' ? tag : 'json';
    case 'complex':
      return Array.isArray(data) && data.length === 2 ? 'complex' : 'json';
    case 'array':
    case 'tuple':
      return Array.isArray(data) ? tag : 'json';
    case 'dict':
      return Array.isArray(data) && data.every(item => Array.isArray(item) && item.length === 2) ? 'dict' : 'json';
    case 'op':
      return Array.isArray(data) && data.length === 3 && typeof data[0] === 'string' && operators.includes(data[0]) ? 'op' : 'json';
    case 'if':
      return Array.isArray(data) && data.length === 3 ? 'if' : 'json';
    case 'not':
      return 'not';
    case 'index': {
      if (!data || typeof data !== 'object' || Array.isArray(data)) return 'json';
      const k = Object.keys(data);
      return k.length === 2 && 'value' in data && 'index' in data ? 'index' : 'json';
    }
    case 'slice': {
      if (!data || typeof data !== 'object' || Array.isArray(data)) return 'json';
      const k = Object.keys(data);
      const allowed = ['value', 'start', 'stop', 'step'];
      if (!('value' in data) || k.some(prop => !allowed.includes(prop))) return 'json';
      return 'slice';
    }
    case 'lambda': {
      if (!data || typeof data !== 'object' || Array.isArray(data)) return 'json';
      const k = Object.keys(data);
      if (k.length !== 2 || !('params' in data) || !('body' in data)) return 'json';
      if (!Array.isArray(data.params) || !data.params.every((p: unknown) => typeof p === 'string' && p.length > 0 && p === p.trim() && !p.includes(','))) return 'json';
      return 'lambda';
    }
    case 'property':
    case 'method': {
      if (!data || typeof data !== 'object' || Array.isArray(data)) return 'json';
      const k = Object.keys(data);
      if (k.length !== 2 || typeof data.api !== 'string' || !('receiver' in data) || !data.receiver || typeof data.receiver !== 'object') return 'json';
      return tag;
    }
    case 'call': {
      if (!data || typeof data !== 'object' || Array.isArray(data)) return 'json';
      const k = Object.keys(data);
      const allowed = ['api', 'function', 'receiver', 'args', 'kwargs'];
      if (k.some(prop => !allowed.includes(prop))) return 'json';
      if (('api' in data) === ('function' in data)) return 'json';
      if ('api' in data && typeof data.api !== 'string') return 'json';
      if ('args' in data && !Array.isArray(data.args)) return 'json';
      if ('kwargs' in data && (!data.kwargs || typeof data.kwargs !== 'object' || Array.isArray(data.kwargs))) return 'json';
      if ('function' in data) return 'invoke';
      return 'call';
    }
    default:
      return 'json';
  }
}

function initial(kind: string): unknown {
  switch (kind) {
    case 'number': return 0;
    case 'float': return { $float: 0 };
    case 'text': return '';
    case 'path': return { $path: 'asset.svg' };
    case 'boolean': return false;
    case 'null': return null;
    case 'list': return [];
    case 'object': return {};
    case 'ref': return { $ref: '' };
    case 'local': return { $local: 'm' };
    case 'constant': return { $constant: 'RIGHT' };
    case 'api': return { $api: 'linear' };
    case 'expr': return { $expr: 'sin(t)' };
    case 'lambda': return { $lambda: { params: ['t'], body: { $expr: 'sin(t)' } } };
    case 'call': return { $call: { api: 'Dot', args: [], kwargs: {} } };
    case 'invoke': return { $call: { function: { $ref: '' }, args: [], kwargs: {} } };
    case 'property': return { $property: { api: 'Mobject.width', receiver: { $ref: '' } } };
    case 'method': return { $method: { api: 'Mobject.shift', receiver: { $ref: '' } } };
    case 'op': return { $op: ['+', 0, 1] };
    case 'if': return { $if: [true, 1, 0] };
    case 'not': return { $not: false };
    case 'index': return { $index: { value: [], index: 0 } };
    case 'slice': return { $slice: { value: [], start: null, stop: null, step: null } };
    case 'complex': return { $complex: [0, 0] };
    case 'array': return { $array: [0, 0, 0] };
    case 'tuple': return { $tuple: [] };
    case 'dict': return { $dict: [] };
    default: return null;
  }
}

export function createApiValueTree(value: unknown, references: string[], onMutate?: () => void) {
  let activeNodes = 0;

  function node(seed: unknown, path: string, depth = 0): TreeNode {
    const children: TreeNode[] = [];
    const element = document.createElement('fieldset');
    element.className = 'av-api-tree-node';
    const legend = document.createElement('legend');
    legend.textContent = path.split(' / ').at(-1)!;
    const type = document.createElement('select');
    type.setAttribute('aria-label', `${path} / 类型`);
    for (const [id, label] of kinds) type.add(new Option(label, id));

    // Bound DOM growth for deeply nested or excessive values while preserving subtrees.
    const limited = depth >= 10 || (activeNodes + 1 > 250);
    if (!limited) activeNodes++;
    type.value = limited ? 'json' : kindOf(seed);
    if (limited) type.disabled = true;

    const body = document.createElement('div');
    const error = document.createElement('p');
    error.className = 'av-api-error';
    error.setAttribute('role', 'alert');
    element.append(legend, type, body, error);

    let read: Reader = () => seed;

    const dispose = () => {
      for (const ch of children) ch.dispose();
      children.length = 0;
      if (!limited) activeNodes--;
    };

    const notify = () => {
      onMutate?.();
    };

    const guarded = (run: () => void) => {
      try {
        run();
        error.textContent = '';
        notify();
      } catch (e) {
        error.textContent = (e as Error).message;
        notify();
      }
    };

    const button = (label: string, run: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.onclick = () => guarded(run);
      return b;
    };

    const render = () => {
      for (const ch of children) ch.dispose();
      children.length = 0;
      body.replaceChildren();
      const data = object(seed);

      const input = (label: string, text: string, inputType = 'text') => {
        const wrap = document.createElement('label');
        wrap.textContent = label;
        const el = document.createElement('input');
        el.type = inputType;
        el.value = text;
        el.setAttribute('aria-label', `${path} / ${label}`);
        if (inputType === 'number') el.step = 'any';
        wrap.append(el);
        body.append(wrap);
        return el;
      };

      const choice = (label: string, current: string, values: string[]) => {
        const el = document.createElement('select');
        el.setAttribute('aria-label', `${path} / ${label}`);
        for (const v of [...new Set([current, ...values])]) el.add(new Option(v || '请选择', v));
        el.value = current;
        body.append(el);
        return el;
      };

      const named = (label: string, current: string, values: string[]) => {
        const el = input(label, current);
        const list = document.createElement('datalist');
        list.id = `av-tree-${Math.random().toString(36).slice(2, 9)}`;
        el.setAttribute('list', list.id);
        body.append(list);
        const update = () => list.replaceChildren(...values.filter(v => v.toLowerCase().includes(el.value.toLowerCase())).slice(0, 40).map(v => new Option(v, v)));
        el.oninput = update;
        update();
        return el;
      };

      const child = (label: string, v: unknown) => {
        const c = node(v, `${path} / ${label}`, depth + 1);
        children.push(c);
        body.append(c.element);
        return c.read;
      };

      const number = (el: HTMLInputElement) => {
        if (!el.value.trim() || !Number.isFinite(Number(el.value))) throw Error(`${path}：请输入有限数字。`);
        return Number(el.value);
      };

      switch (type.value) {
        case 'number': {
          const el = input('数值', String(seed), 'number');
          read = () => number(el);
          break;
        }
        case 'float': {
          const el = input('浮点数', String(data.$float), 'number');
          read = () => ({ $float: number(el) });
          break;
        }
        case 'text': {
          const el = input('文字', String(seed));
          read = () => el.value;
          break;
        }
        case 'path': {
          const el = input('本机路径', String(data.$path));
          read = () => ({ $path: el.value });
          const note = document.createElement('small');
          note.textContent = '在运行 Manim 的电脑上解析，需要启用本机权限。';
          body.append(note);
          break;
        }
        case 'boolean': {
          const el = choice('是或否', String(seed), ['true', 'false']);
          read = () => el.value === 'true';
          break;
        }
        case 'null':
          body.textContent = '传入 None（不是采用默认值）';
          read = () => null;
          break;
        case 'ref': {
          const el = choice('对象', String(data.$ref || ''), [...references, '@scene', '@camera', '@frame', '@renderer']);
          read = () => ({ $ref: el.value });
          break;
        }
        case 'local':
        case 'expr': {
          const tag = `$${type.value}`;
          const el = input(type.value === 'local' ? '参数名' : '表达式', String(data[tag] ?? ''));
          read = () => ({ [tag]: el.value });
          break;
        }
        case 'constant':
        case 'api': {
          const tag = `$${type.value}`;
          const el = named(
            '名称',
            String(data[tag] || ''),
            type.value === 'constant' ? Object.keys(API_REGISTRY.constants) : API_ENTRIES.filter(e => e.kind !== 'property').map(e => e.path)
          );
          read = () => ({ [tag]: el.value });
          break;
        }
        case 'list':
        case 'array':
        case 'tuple':
        case 'dict':
        case 'complex': {
          const tag = `$${type.value}`;
          const rawValues = type.value === 'list' ? seed : data[tag];
          if (!Array.isArray(rawValues)) { type.value = 'json'; render(); break; }
          if (rawValues.length + activeNodes > 250) { type.value = 'json'; render(); break; }
          const values = rawValues;
          const rows: Reader[] = [];
          const pack = (v: unknown[]) => type.value === 'list' ? v : { [tag]: v };
          values.forEach((v, i) => {
            rows.push(child(type.value === 'complex' ? (i ? '虚部' : '实部') : `第 ${i + 1} 项`, v));
            if (type.value !== 'complex') {
              const actions = document.createElement('div');
              actions.className = 'av-api-tree-actions';
              actions.append(button(`删除第 ${i + 1} 项`, () => {
                // 删除目标项时跳过该目标 reader，其余项严格读取；若其余项非法抛错阻止结构变更并保留 DOM 和输入
                const next: unknown[] = [];
                for (let j = 0; j < rows.length; j++) {
                  if (j === i) continue;
                  next.push(rows[j]());
                }
                seed = pack(next);
                render();
              }));
              if (i) {
                actions.append(button(`上移第 ${i + 1} 项`, () => {
                  const all = rows.map(r => r());
                  [all[i - 1], all[i]] = [all[i], all[i - 1]];
                  seed = pack(all);
                  render();
                }));
              }
              body.append(actions);
            }
          });
          read = () => pack(rows.map(r => r()));
          if (type.value !== 'complex') {
            body.append(button('添加一项', () => {
              const all = rows.map(r => r());
              seed = pack([...all, type.value === 'dict' ? ['', null] : 0]);
              render();
            }));
          }
          break;
        }
        case 'object': {
          const entries = Object.entries(data);
          if (entries.length + activeNodes > 250) { type.value = 'json'; render(); break; }
          const rows = entries.map(([key, val], i) => {
            const k = input(`第 ${i + 1} 项名称`, key);
            const v = child(`第 ${i + 1} 项值`, val);
            body.append(button(`删除第 ${i + 1} 项`, () => {
              // 删除目标键值对时跳过目标值校验，其余项严格读取；若其余项非法抛错阻止
              const next: Record<string, unknown> = Object.create(null);
              for (let j = 0; j < rows.length; j++) {
                if (j === i) continue;
                const rowKey = rows[j].k.value;
                if (Object.hasOwn(next, rowKey)) throw Error(`字典名称重复：${rowKey}`);
                next[rowKey] = rows[j].v();
              }
              seed = next;
              render();
            }));
            return { k, v };
          });
          read = () => {
            const result: Record<string, unknown> = Object.create(null);
            for (const { k, v } of rows) {
              if (Object.hasOwn(result, k.value)) throw Error(`字典名称重复：${k.value}`);
              result[k.value] = v();
            }
            return result;
          };
          body.append(button('添加键值对', () => {
            const all = read() as Record<string, unknown>;
            let key = 'key';
            while (Object.hasOwn(all, key)) key += '_';
            seed = { ...all, [key]: null };
            render();
          }));
          break;
        }
        case 'lambda': {
          const fn = object(data.$lambda);
          if (!Array.isArray(fn.params)) { type.value = 'json'; render(); break; }
          const params = input('自变量（逗号分隔）', fn.params.join(', '));
          const result = child('返回值 / 操作', fn.body);
          read = () => ({
            $lambda: {
              params: params.value.split(',').map(p => p.trim()).filter(Boolean),
              body: result(),
            },
          });
          break;
        }
        case 'call':
        case 'invoke':
        case 'property':
        case 'method': {
          const property = type.value === 'property', method = type.value === 'method', invoke = type.value === 'invoke';
          const tag = property ? '$property' : method ? '$method' : '$call';
          const spec = object(data[tag]);
          const matches = (kind: string) => property ? kind === 'property' : method ? kind === 'method' : kind !== 'property';
          const name = !invoke ? named('API 名称', String(spec.api || ''), API_ENTRIES.filter(e => matches(e.kind)).map(e => e.path)) : undefined;
          const func = invoke ? child('函数', spec.function) : undefined;
          const entry = name && getApiEntry(name.value);
          const receiver = property || method || entry?.kind === 'method' || 'receiver' in spec ? child('操作对象', spec.receiver ?? { $ref: '' }) : undefined;
          const args = !property && !method ? child('位置参数', spec.args ?? []) : undefined;
          const kwargs = !property && !method ? child('命名参数', spec.kwargs ?? {}) : undefined;

          read = () => {
            if (name && (!getApiEntry(name.value) || !matches(getApiEntry(name.value)!.kind))) {
              throw Error(`${path}：请选择有效的 API。`);
            }
            const target = invoke ? { function: func!() } : { api: name!.value };
            return property || method
              ? { [tag]: { ...target, receiver: receiver!() } }
              : { $call: { ...target, ...(receiver ? { receiver: receiver() } : {}), args: args!(), kwargs: kwargs!() } };
          };

          if (name) {
            let lastValidApi = String(spec.api || '');
            name.onchange = () => guarded(() => {
              const targetApi = name.value.trim();
              const nextEntry = getApiEntry(targetApi);
              if (!nextEntry || !matches(nextEntry.kind)) {
                name.value = lastValidApi;
                throw Error(`${path}：请选择有效的 API。`);
              }
              // 严格读取其余参数；若参数处于非法草稿状态，恢复 API 名称并抛错保留 DOM
              let currentArgs: unknown;
              let currentKwargs: unknown;
              let currentReceiver: unknown;
              try {
                currentArgs = args ? args() : (spec.args ?? []);
                currentKwargs = kwargs ? kwargs() : (spec.kwargs ?? {});
                currentReceiver = receiver ? receiver() : (spec.receiver ?? { $ref: '' });
              } catch (err) {
                name.value = lastValidApi;
                throw err;
              }

              const updated: Record<string, unknown> = property || method
                ? { api: targetApi, receiver: currentReceiver }
                : { api: targetApi, args: currentArgs, kwargs: currentKwargs };
              if (property || method || nextEntry.kind === 'method') {
                updated.receiver = currentReceiver;
              }
              if (!property && nextEntry.kind !== 'method') {
                delete updated.receiver;
              }
              lastValidApi = targetApi;
              seed = { [tag]: updated };
              render();
            });
          }
          break;
        }
        case 'op': {
          if (!Array.isArray(data.$op) || data.$op.length !== 3) { type.value = 'json'; render(); break; }
          const op = choice('运算符', data.$op[0], operators), left = child('左值', data.$op[1]), right = child('右值', data.$op[2]);
          read = () => ({ $op: [op.value, left(), right()] });
          break;
        }
        case 'if': {
          if (!Array.isArray(data.$if) || data.$if.length !== 3) { type.value = 'json'; render(); break; }
          const parts = ['条件', '成立时', '不成立时'].map((s, i) => child(s, data.$if[i]));
          read = () => ({ $if: parts.map(r => r()) });
          break;
        }
        case 'not': {
          const v = child('值', data.$not);
          read = () => ({ $not: v() });
          break;
        }
        case 'index':
        case 'slice': {
          const tag = `$${type.value}`, spec = object(data[tag]);
          const rows = ['value', ...(type.value === 'index' ? ['index'] : ['start', 'stop', 'step'].filter(k => k in spec))].map(k => [k, child(k, spec[k])] as const);
          read = () => ({ [tag]: Object.fromEntries(rows.map(([k, r]) => [k, r()])) });
          break;
        }
        default: {
          const el = document.createElement('textarea');
          el.setAttribute('aria-label', `${path} / JSON`);
          el.value = JSON.stringify(seed, null, 2);
          body.append(el);
          read = () => JSON.parse(el.value);
          break;
        }
      }
    };

    const drafts = new Map<string, unknown>();
    let previous = type.value;
    type.onchange = () => {
      const requested = type.value;
      type.value = previous;
      guarded(() => {
        const current = read();
        drafts.set(previous, current);
        seed = drafts.has(requested) ? drafts.get(requested) : requested === 'json' ? current : initial(requested);
        type.value = requested;
        previous = requested;
        render();
      });
    };

    render();
    previous = type.value;
    return { element, read: () => read(), dispose };
  }

  const rootNode = node(value, '值');
  return { element: rootNode.element, read: rootNode.read, dispose: rootNode.dispose };
}
