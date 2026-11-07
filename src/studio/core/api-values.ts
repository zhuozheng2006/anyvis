import { compileExpression } from './expression.ts';

export interface ApiValueContext {
  references: ReadonlySet<string>;
  symbols?: Record<string, string>; // 已由编译器生成的数学变量映射
  constants: Record<string, { code: string; requiresTrust?: boolean }>;
  callables: Record<string, { code: string; requiresTrust?: boolean; instance?: boolean; ownerCode?: string }>;
  properties?: Record<string,{name:string;ownerCode:string;requiresTrust?:boolean}>;
  resolveCallable?: (name:string)=>ApiValueContext['callables'][string]|undefined;
  resolveProperty?: (name:string)=>NonNullable<ApiValueContext['properties']>[string]|undefined;
}

export interface CompiledApiValue {
  code: string;
  references: string[];
  requiresTrust: boolean;
}

const MAX_DEPTH = 20;
const MAX_NODES = 4000;
const MAX_STRING_LENGTH = 20000;
const MAX_INDEX_ABSOLUTE = 100000;
const MAX_LAMBDA_PARAMS = 8;

const VALID_TAGS = new Set([
  '$ref',
  '$constant',
  '$api',
  '$expr',
  '$array',
  '$tuple',
  '$dict',
  '$complex',
  '$lambda',
  '$local',
  '$index',
  '$slice',
  '$call',
  '$op', '$if', '$not', '$property',
]);

const PYTHON_KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await',
  'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
  'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is',
  'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return',
  'try', 'while', 'with', 'yield', 'match', 'case', 'type',
]);

const RESERVED_IDENTIFIERS = new Set([
  'self', 'objects', 'np', 'scene', 'params', 'context', 'complex', 'abs', 'min', 'max',
  'constructor', 'prototype', '__proto__',
]);

const py = (value: string): string =>
  JSON.stringify(value).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

function isForbiddenKey(key: string): boolean {
  return (
    key === '__proto__' ||
    key === 'constructor' ||
    key === 'prototype' ||
    key.startsWith('_')
  );
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  if (val === null || typeof val !== 'object' || Array.isArray(val)) return false;
  const proto = Object.getPrototypeOf(val);
  return proto === null || proto === Object.prototype;
}

interface CompileState {
  nodeCount: number;
  references: Set<string>;
  requiresTrust: boolean;
}

function validateAndCompileDictKey(
  key: unknown,
  context: ApiValueContext,
  state: CompileState,
  depth: number,
  locals: ReadonlySet<string>,
  symbols: Record<string, string>,
): string {
  if (++state.nodeCount > MAX_NODES) {
    throw new Error(`节点总数超过上限（最多 ${MAX_NODES} 个）。`);
  }
  if (depth > MAX_DEPTH) {
    throw new Error(`嵌套深度超过上限（最多 ${MAX_DEPTH} 层）。`);
  }

  if (typeof key === 'number') {
    if (!Number.isInteger(key) || !Number.isFinite(key) || Math.abs(key) > 1e15) {
      throw new Error('字典键中的数字必须为有限整数。');
    }
    return String(key);
  }

  if (typeof key === 'string') {
    if (key.length > MAX_STRING_LENGTH) {
      throw new Error(`字符串长度超过限制（最多 ${MAX_STRING_LENGTH} 字符）。`);
    }
    if (isForbiddenKey(key)) {
      throw new Error(`字典键禁止使用私有或原型污染键: "${key}"。`);
    }
    return py(key);
  }

  if (isPlainObject(key)) {
    const ownKeys = Reflect.ownKeys(key);
    if (ownKeys.length === 1 && ownKeys[0] === '$tuple' && Array.isArray((key as Record<string, unknown>).$tuple)) {
      const tupleItems = (key as Record<string, unknown>).$tuple as unknown[];
      const compiledItems = tupleItems.map((item) =>
        validateAndCompileDictKey(item, context, state, depth + 1, locals, symbols),
      );
      if (compiledItems.length === 0) return '()';
      if (compiledItems.length === 1) return `(${compiledItems[0]},)`;
      return `(${compiledItems.join(', ')})`;
    }
  }

  throw new Error('字典键仅允许有限整数、非私有字符串或不可变元组，拒绝不可哈希类型。');
}

function compileTagged(
  tag: string,
  payload: unknown,
  context: ApiValueContext,
  state: CompileState,
  depth: number,
  locals: ReadonlySet<string>,
  symbols: Record<string, string>,
): string {
  switch (tag) {
    case '$op': {
      if(!Array.isArray(payload)||payload.length!==3||typeof payload[0]!=='string'||!['+','-','*','/','**','%','@','<','<=','>','>=','==','!=','and','or'].includes(payload[0])) throw new Error('$op 需要 [允许的运算符, 左值, 右值]。');
      const left=compileNode(payload[1],context,state,depth+1,locals,symbols);
      const right=compileNode(payload[2],context,state,depth+1,locals,symbols);
      return `((${left}) ${payload[0]} (${right}))`;
    }
    case '$if': {
      if(!Array.isArray(payload)||payload.length!==3)throw new Error('$if 需要 [条件, 成立时的值, 不成立时的值]。');
      const parts=payload.map(v=>compileNode(v,context,state,depth+1,locals,symbols));
      return `((${parts[1]}) if (${parts[0]}) else (${parts[2]}))`;
    }
    case '$not': return `(not (${compileNode(payload,context,state,depth+1,locals,symbols)}))`;
    case '$property': {
      if(!isPlainObject(payload)||Object.keys(payload).length!==2||typeof payload.api!=='string'||!('receiver' in payload)) throw new Error('$property 需要清单中的属性 api 和 receiver。');
      const entry=context.properties && Object.prototype.hasOwnProperty.call(context.properties,payload.api) ? context.properties[payload.api] : context.resolveProperty?.(payload.api);
      if(!entry)throw new Error('$property 需要清单中的属性 api 和 receiver。');
      state.requiresTrust ||= !!entry.requiresTrust;
      return `_av_receiver(${compileNode(payload.receiver,context,state,depth+1,locals,symbols)}, ${entry.ownerCode}).${entry.name}`;
    }
    case '$call': {
      if (!isPlainObject(payload)) throw new Error('$call 需要调用描述。');
      const keys=Object.keys(payload);
      if(keys.some(k=>!['api','function','receiver','args','kwargs'].includes(k)) || ('api' in payload)===('function' in payload)) throw new Error('$call 需要 api 或 function，且不能包含其它字段。');
      const args=payload.args ?? [];
      const kwargs=payload.kwargs ?? {};
      if(!Array.isArray(args) || !isPlainObject(kwargs) || Object.keys(kwargs).some(k=>!(/^[A-Za-z][A-Za-z_0-9]*$/).test(k))) throw new Error('$call 的 args 需要列表，kwargs 需要命名参数字典。');
      const inner=(v:unknown)=>compileNode(v,context,state,depth+1,locals,symbols);
      const positional=inner(args);const named=inner(kwargs);
      if('api' in payload) {
        if(typeof payload.api!=='string') throw new Error('$call API 不在清单中。');
        const entry=Object.prototype.hasOwnProperty.call(context.callables,payload.api) ? context.callables[payload.api] : context.resolveCallable?.(payload.api);
        if(!entry) throw new Error('$call API 不在清单中。');
        state.requiresTrust ||= !!entry.requiresTrust;
        if(entry.instance) {
          if(!('receiver' in payload)||!entry.ownerCode)throw new Error('$call 对象方法缺少 receiver。');
          return `_av_method(${inner(payload.receiver)}, ${entry.ownerCode}, ${entry.code}, ${positional}, ${named})`;
        }
        if('receiver' in payload) throw new Error('此 API 不接受 receiver。');
        return `${entry.code}(*${positional}, **${named})`;
      }
      if('receiver' in payload) throw new Error('返回函数调用不接受 receiver。');
      return `(${inner(payload.function)})(*${positional}, **${named})`;
    }
    case '$ref': {
      if (typeof payload !== 'string') {
        throw new Error('$ref 必须是对象名称字符串。');
      }
      if (payload.length > MAX_STRING_LENGTH) {
        throw new Error(`$ref 名称长度超过限制（最多 ${MAX_STRING_LENGTH} 字符）。`);
      }
      if (!context.references.has(payload)) {
        throw new Error(`找不到引用的对象“${payload}”。`);
      }
      state.references.add(payload);
      return `objects[${py(payload)}]`;
    }

    case '$constant': {
      if (typeof payload !== 'string') {
        throw new Error('$constant 必须是常量名称字符串。');
      }
      if (payload.length > MAX_STRING_LENGTH) {
        throw new Error(`$constant 名称长度超过限制（最多 ${MAX_STRING_LENGTH} 字符）。`);
      }
      if (!Object.prototype.hasOwnProperty.call(context.constants, payload)) {
        throw new Error(`未定义的常量“${payload}”。`);
      }
      const entry = context.constants[payload];
      if (entry.requiresTrust) state.requiresTrust = true;
      return entry.code;
    }

    case '$api': {
      if (typeof payload !== 'string') {
        throw new Error('$api 必须是可调用对象名称字符串。');
      }
      if (payload.length > MAX_STRING_LENGTH) {
        throw new Error(`$api 名称长度超过限制（最多 ${MAX_STRING_LENGTH} 字符）。`);
      }
      const entry=Object.prototype.hasOwnProperty.call(context.callables,payload) ? context.callables[payload] : context.resolveCallable?.(payload);
      if (!entry) {
        throw new Error(`未知的可调用对象“${payload}”。`);
      }
      if (entry.requiresTrust) state.requiresTrust = true;
      return entry.code;
    }

    case '$expr': {
      if (typeof payload !== 'string') {
        throw new Error('$expr 必须是数学表达式字符串。');
      }
      if (payload.length > MAX_STRING_LENGTH) {
        throw new Error(`$expr 表达式长度超过限制（最多 ${MAX_STRING_LENGTH} 字符）。`);
      }
      return compileExpression(payload, symbols);
    }

    case '$array': {
      if (!Array.isArray(payload)) {
        throw new Error('$array 必须为数组。');
      }
      const elements = payload.map((item) =>
        compileNode(item, context, state, depth + 1, locals, symbols),
      );
      return `np.array([${elements.join(', ')}])`;
    }

    case '$tuple': {
      if (!Array.isArray(payload)) {
        throw new Error('$tuple 必须为数组。');
      }
      const elements = payload.map((item) =>
        compileNode(item, context, state, depth + 1, locals, symbols),
      );
      if (elements.length === 0) return '()';
      if (elements.length === 1) return `(${elements[0]},)`;
      return `(${elements.join(', ')})`;
    }

    case '$dict': {
      if (!Array.isArray(payload)) {
        throw new Error('$dict 必须为键值对数组。');
      }
      const entries: string[] = [];
      for (const entry of payload) {
        if (!Array.isArray(entry) || entry.length !== 2) {
          throw new Error('$dict 项必须是 [key, value] 二元组。');
        }
        const [k, v] = entry;
        const kCode = validateAndCompileDictKey(k, context, state, depth + 1, locals, symbols);
        const vCode = compileNode(v, context, state, depth + 1, locals, symbols);
        entries.push(`${kCode}: ${vCode}`);
      }
      return `{${entries.join(', ')}}`;
    }

    case '$complex': {
      if (!Array.isArray(payload) || payload.length !== 2) {
        throw new Error('$complex 必须是包含两个数的数组 [real, imag]。');
      }
      const [real, imag] = payload;
      if (typeof real !== 'number' || !Number.isFinite(real)) {
        throw new Error('$complex 实部必须为有限数。');
      }
      if (typeof imag !== 'number' || !Number.isFinite(imag)) {
        throw new Error('$complex 虚部必须为有限数。');
      }
      const r = Object.is(real, -0) ? 0 : real;
      const i = Object.is(imag, -0) ? 0 : imag;
      return `complex(${r}, ${i})`;
    }

    case '$lambda': {
      if (!isPlainObject(payload)) {
        throw new Error('$lambda 必须为包含 params 与 body 的对象。');
      }
      const innerKeys = Reflect.ownKeys(payload);
      if (innerKeys.length !== 2 || !innerKeys.includes('params') || !innerKeys.includes('body')) {
        throw new Error('$lambda 对象必须且仅包含 params 和 body 字段。');
      }
      const params = (payload as Record<string, unknown>).params;
      if (!Array.isArray(params)) {
        throw new Error('$lambda params 必须为数组。');
      }
      if (params.length > MAX_LAMBDA_PARAMS) {
        throw new Error(`lambda 最多允许 ${MAX_LAMBDA_PARAMS} 个参数。`);
      }
      const seenParams = new Set<string>();
      for (const p of params) {
        if (typeof p !== 'string') {
          throw new Error('lambda 参数必须为字符串。');
        }
        if (p.length > MAX_STRING_LENGTH) {
          throw new Error(`lambda 参数名长度超过限制（最多 ${MAX_STRING_LENGTH} 字符）。`);
        }
        if (!/^[A-Za-z][A-Za-z_0-9]*$/.test(p)) {
          throw new Error(`lambda 参数名“${p}”必须是以字母开头的 ASCII 标识符，且不能以 _ 开头。`);
        }
        if (PYTHON_KEYWORDS.has(p)) {
          throw new Error(`lambda 参数名“${p}”不能是 Python 关键字。`);
        }
        if (RESERVED_IDENTIFIERS.has(p) || isForbiddenKey(p)) {
          throw new Error(`lambda 参数名“${p}”是保留标识符。`);
        }
        if (seenParams.has(p)) {
          throw new Error(`lambda 参数名“${p}”重复。`);
        }
        seenParams.add(p);
      }

      const childLocals = new Set<string>([...locals, ...params]);
      const childSymbols: Record<string, string> = { ...symbols };
      for (const p of params) {
        childSymbols[p] = p;
      }

      const bodyCode = compileNode(
        (payload as Record<string, unknown>).body,
        context,
        state,
        depth + 1,
        childLocals,
        childSymbols,
      );

      return params.length === 0 ? `lambda: ${bodyCode}` : `lambda ${params.join(', ')}: ${bodyCode}`;
    }

    case '$local': {
      if (typeof payload !== 'string') {
        throw new Error('$local 必须是参数名称字符串。');
      }
      if (payload.length > MAX_STRING_LENGTH) {
        throw new Error(`$local 名称长度超过限制（最多 ${MAX_STRING_LENGTH} 字符）。`);
      }
      if (!locals.has(payload)) {
        throw new Error(`局部变量“${payload}”未在当前 lambda 参数作用域中定义。`);
      }
      return payload;
    }

    case '$index': {
      if (!isPlainObject(payload)) {
        throw new Error('$index 必须为包含 value 与 index 的对象。');
      }
      const innerKeys = Reflect.ownKeys(payload);
      if (innerKeys.length !== 2 || !innerKeys.includes('value') || !innerKeys.includes('index')) {
        throw new Error('$index 对象必须且仅包含 value 和 index 字段。');
      }
      const targetCode = compileNode(
        (payload as Record<string, unknown>).value,
        context,
        state,
        depth + 1,
        locals,
        symbols,
      );
      const wrappedTarget =
        targetCode.startsWith('lambda ') || targetCode.startsWith('lambda:')
          ? `(${targetCode})`
          : targetCode;
      const idx = (payload as Record<string, unknown>).index;
      let idxCode: string;
      if (typeof idx === 'number') {
        if (!Number.isInteger(idx)) {
          throw new Error('索引必须是有限整数或非私有字符串。');
        }
        if (Math.abs(idx) > MAX_INDEX_ABSOLUTE) {
          throw new Error(`索引整数绝对值不能超过 ${MAX_INDEX_ABSOLUTE}。`);
        }
        idxCode = String(idx);
      } else if (typeof idx === 'string') {
        if (idx.length > MAX_STRING_LENGTH) {
          throw new Error(`索引字符串长度超过限制（最多 ${MAX_STRING_LENGTH} 字符）。`);
        }
        if (isForbiddenKey(idx)) {
          throw new Error(`字符串索引必须非私有，禁止使用: "${idx}"。`);
        }
        idxCode = py(idx);
      } else {
        throw new Error('索引必须是有限整数或非私有字符串。');
      }
      return `${wrappedTarget}[${idxCode}]`;
    }

    case '$slice': {
      if (!isPlainObject(payload)) {
        throw new Error('$slice 必须为包含切片信息的对象。');
      }
      const innerKeys = Reflect.ownKeys(payload);
      if (!innerKeys.includes('value')) {
        throw new Error('$slice 对象必须包含 value 字段。');
      }
      for (const k of innerKeys) {
        if (typeof k !== 'string' || !['value', 'start', 'stop', 'step'].includes(k)) {
          throw new Error(`$slice 对象不允许额外键: "${String(k)}"。`);
        }
      }
      const targetCode = compileNode(
        (payload as Record<string, unknown>).value,
        context,
        state,
        depth + 1,
        locals,
        symbols,
      );
      const wrappedTarget =
        targetCode.startsWith('lambda ') || targetCode.startsWith('lambda:')
          ? `(${targetCode})`
          : targetCode;

      const validateSliceBound = (val: unknown, name: string): string => {
        if (val === null || val === undefined) return '';
        if (typeof val !== 'number' || !Number.isInteger(val) || Math.abs(val) > MAX_INDEX_ABSOLUTE) {
          throw new Error(`切片 ${name} 必须是绝对值不超过 ${MAX_INDEX_ABSOLUTE} 的整数或 null。`);
        }
        return String(val);
      };

      const sliceRecord = payload as Record<string, unknown>;
      const startStr = validateSliceBound(sliceRecord.start, 'start');
      const stopStr = validateSliceBound(sliceRecord.stop, 'stop');
      let stepStr = '';
      if (sliceRecord.step !== null && sliceRecord.step !== undefined) {
        if (
          typeof sliceRecord.step !== 'number' ||
          !Number.isInteger(sliceRecord.step) ||
          Math.abs(sliceRecord.step) > MAX_INDEX_ABSOLUTE
        ) {
          throw new Error(`切片 step 必须是绝对值不超过 ${MAX_INDEX_ABSOLUTE} 的整数。`);
        }
        if (sliceRecord.step === 0) {
          throw new Error('切片 step 不能为 0。');
        }
        stepStr = `:${sliceRecord.step}`;
      }
      return `${wrappedTarget}[${startStr}:${stopStr}${stepStr}]`;
    }

    default:
      throw new Error(`未实现的标签处理: ${tag}`);
  }
}

function compileNode(
  value: unknown,
  context: ApiValueContext,
  state: CompileState,
  depth: number,
  locals: ReadonlySet<string>,
  symbols: Record<string, string>,
): string {
  if (++state.nodeCount > MAX_NODES) {
    throw new Error(`节点总数超过上限（最多 ${MAX_NODES} 个）。`);
  }
  if (depth > MAX_DEPTH) {
    throw new Error(`嵌套深度超过上限（最多 ${MAX_DEPTH} 层）。`);
  }

  // Null
  if (value === null) {
    return 'None';
  }

  // Boolean
  if (typeof value === 'boolean') {
    return value ? 'True' : 'False';
  }

  // Number
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('数值必须为有限数字，不支持 NaN 或 Infinity。');
    }
    return Object.is(value, -0) ? '0' : String(value);
  }

  // String
  if (typeof value === 'string') {
    if (value.length > MAX_STRING_LENGTH) {
      throw new Error(`字符串长度超过限制（最多 ${MAX_STRING_LENGTH} 字符）。`);
    }
    return py(value);
  }

  // Array (compiled to Python list)
  if (Array.isArray(value)) {
    const items = value.map((item) =>
      compileNode(item, context, state, depth + 1, locals, symbols),
    );
    return `[${items.join(', ')}]`;
  }

  // Check if object prototype has been tampered with
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const proto = Object.getPrototypeOf(value);
    if (proto !== null && proto !== Object.prototype) {
      throw new Error('禁止使用私有或原型污染键，或篡改原型的对象。');
    }
  }

  // Plain object or Tagged AST object
  if (isPlainObject(value)) {
    const ownKeys = Reflect.ownKeys(value);
    for (const k of ownKeys) {
      if (typeof k !== 'string') {
        throw new Error('不支持非字符串对象键。');
      }
      if (k.length > MAX_STRING_LENGTH) {
        throw new Error(`对象键长度超过限制（最多 ${MAX_STRING_LENGTH} 字符）。`);
      }
    }
    const stringKeys = ownKeys as string[];
    const dollarKeys = stringKeys.filter((k) => k.startsWith('$'));

    if (dollarKeys.length > 0) {
      // Must match exactly one tag and have no extra keys
      if (stringKeys.length !== 1) {
        throw new Error(`含 $ 标签的对象不允许额外键: ${stringKeys.join(', ')}。`);
      }
      const tag = stringKeys[0];
      if (!VALID_TAGS.has(tag)) {
        throw new Error(`未知的 $ 标签: "${tag}"。`);
      }
      return compileTagged(tag, value[tag], context, state, depth, locals, symbols);
    }

    // Normal plain dictionary
    const entries: string[] = [];
    for (const key of stringKeys) {
      if (isForbiddenKey(key)) {
        throw new Error(`禁止使用私有或原型污染键: "${key}"。`);
      }
      const valCode = compileNode(value[key], context, state, depth + 1, locals, symbols);
      entries.push(`${py(key)}: ${valCode}`);
    }
    return `{${entries.join(', ')}}`;
  }

  throw new Error(`不支持的值类型: ${typeof value}`);
}

export function compileApiValue(value: unknown, context: ApiValueContext): CompiledApiValue {
  if (!context || typeof context !== 'object') {
    throw new Error('无效的 ApiValueContext。');
  }
  if (!context.references || typeof context.references.has !== 'function') {
    throw new Error('context.references 必须提供有效的 Set。');
  }
  if (!context.constants || typeof context.constants !== 'object') {
    throw new Error('context.constants 必须提供对象。');
  }
  if (!context.callables || typeof context.callables !== 'object') {
    throw new Error('context.callables 必须提供对象。');
  }

  const state: CompileState = {
    nodeCount: 0,
    references: new Set<string>(),
    requiresTrust: false,
  };

  const initialSymbols: Record<string, string> = { ...(context.symbols ?? {}) };
  const initialLocals = new Set<string>();

  const code = compileNode(value, context, state, 1, initialLocals, initialSymbols);

  return {
    code,
    references: Array.from(state.references),
    requiresTrust: state.requiresTrust,
  };
}
