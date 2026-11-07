import { describe, expect, it } from 'vitest';
import { compileApiValue, type ApiValueContext } from './api-values.ts';

const createBaseContext = (overrides?: Partial<ApiValueContext>): ApiValueContext => ({
  references: new Set(['circle1', 'square2', 'text3', 'groupA']),
  symbols: { x: 'trackers["x"].get_value()', alpha: 'trackers["alpha"].get_value()' },
  constants: {
    UP: { code: 'UP', requiresTrust: false },
    DOWN: { code: 'DOWN', requiresTrust: false },
    RED: { code: 'RED', requiresTrust: false },
    UNSAFE_CONST: { code: 'os.environ["PATH"]', requiresTrust: true },
  },
  callables: {
    Create: { code: 'Create', requiresTrust: false },
    FadeIn: { code: 'FadeIn', requiresTrust: false },
    CustomTool: { code: 'load_custom_tool()', requiresTrust: true },
  },
  ...overrides,
});

describe('compileApiValue', () => {
  describe('primitive literals and plain structures', () => {
    it('compiles null to None', () => {
      const ctx = createBaseContext();
      const res = compileApiValue(null, ctx);
      expect(res.code).toBe('None');
      expect(res.references).toEqual([]);
      expect(res.requiresTrust).toBe(false);
    });

    it('compiles booleans to True and False', () => {
      const ctx = createBaseContext();
      expect(compileApiValue(true, ctx).code).toBe('True');
      expect(compileApiValue(false, ctx).code).toBe('False');
    });

    it('compiles finite numbers correctly, normalizing -0', () => {
      const ctx = createBaseContext();
      expect(compileApiValue(0, ctx).code).toBe('0');
      expect(compileApiValue(-0, ctx).code).toBe('0');
      expect(compileApiValue(42, ctx).code).toBe('42');
      expect(compileApiValue(-3.14159, ctx).code).toBe('-3.14159');
      expect(compileApiValue(1e6, ctx).code).toBe('1000000');
    });

    it('compiles strings safely escaping quotes and control characters', () => {
      const ctx = createBaseContext();
      expect(compileApiValue('hello world', ctx).code).toBe('"hello world"');
      expect(compileApiValue('say "hello"', ctx).code).toBe('"say \\"hello\\""');
      expect(compileApiValue('line1\nline2\ttab', ctx).code).toBe('"line1\\nline2\\ttab"');
      expect(compileApiValue('line1\u2028line2\u2029line3', ctx).code).toBe('"line1\\u2028line2\\u2029line3"');
      expect(compileApiValue('中文与符号 ∑∫ π', ctx).code).toBe('"中文与符号 ∑∫ π"');
    });

    it('compiles arrays to Python lists', () => {
      const ctx = createBaseContext();
      expect(compileApiValue([], ctx).code).toBe('[]');
      expect(compileApiValue([1, 'a', true, null], ctx).code).toBe('[1, "a", True, None]');
      expect(compileApiValue([[1, 2], [3, 4]], ctx).code).toBe('[[1, 2], [3, 4]]');
    });

    it('compiles plain dictionaries to Python dict literals', () => {
      const ctx = createBaseContext();
      expect(compileApiValue({}, ctx).code).toBe('{}');
      expect(compileApiValue({ color: 'RED', width: 2, visible: true }, ctx).code).toBe(
        '{"color": "RED", "width": 2, "visible": True}',
      );
    });
  });

  describe('tagged AST shapes', () => {
    it('compiles $ref to objects[json(name)] and collects references', () => {
      const ctx = createBaseContext();
      const res = compileApiValue({ $ref: 'circle1' }, ctx);
      expect(res.code).toBe('objects["circle1"]');
      expect(res.references).toEqual(['circle1']);
      expect(res.requiresTrust).toBe(false);
    });

    it('compiles $constant from static context mapping', () => {
      const ctx = createBaseContext();
      const res = compileApiValue({ $constant: 'UP' }, ctx);
      expect(res.code).toBe('UP');
      expect(res.references).toEqual([]);
      expect(res.requiresTrust).toBe(false);
    });

    it('compiles $api from callables static mapping without invocation', () => {
      const ctx = createBaseContext();
      const res = compileApiValue({ $api: 'Create' }, ctx);
      expect(res.code).toBe('Create');
      expect(res.references).toEqual([]);
      expect(res.requiresTrust).toBe(false);
    });

    it('compiles $expr reusing compileExpression and context symbols', () => {
      const ctx = createBaseContext();
      const res = compileApiValue({ $expr: 'sin(x) + cos(pi)' }, ctx);
      expect(res.code).toBe('(np.sin(trackers["x"].get_value()) + np.cos(np.pi))');
      expect(res.references).toEqual([]);
      expect(res.requiresTrust).toBe(false);
    });

    it('compiles $array to np.array', () => {
      const ctx = createBaseContext();
      const res = compileApiValue({ $array: [1, 2, 3] }, ctx);
      expect(res.code).toBe('np.array([1, 2, 3])');
    });

    it('compiles $tuple handling 0, 1, and N elements correctly', () => {
      const ctx = createBaseContext();
      expect(compileApiValue({ $tuple: [] }, ctx).code).toBe('()');
      expect(compileApiValue({ $tuple: [1] }, ctx).code).toBe('(1,)');
      expect(compileApiValue({ $tuple: [1, 2] }, ctx).code).toBe('(1, 2)');
      expect(compileApiValue({ $tuple: ['a', 'b', 'c'] }, ctx).code).toBe('("a", "b", "c")');
    });

    it('compiles $dict with integer, string, and tuple keys', () => {
      const ctx = createBaseContext();
      const res = compileApiValue(
        {
          $dict: [
            ['color', 'RED'],
            [1, 'one'],
            [{ $tuple: [0, 0] }, 'origin'],
            [{ $tuple: [1, { $tuple: ['a', 2] }] }, 'nested-tuple-key'],
          ],
        },
        ctx,
      );
      expect(res.code).toBe(
        '{"color": "RED", 1: "one", (0, 0): "origin", (1, ("a", 2)): "nested-tuple-key"}',
      );
    });

    it('compiles empty $dict to {}', () => {
      const ctx = createBaseContext();
      expect(compileApiValue({ $dict: [] }, ctx).code).toBe('{}');
    });

    it('compiles $complex to complex(real, imag)', () => {
      const ctx = createBaseContext();
      expect(compileApiValue({ $complex: [1.5, -2.5] }, ctx).code).toBe('complex(1.5, -2.5)');
      expect(compileApiValue({ $complex: [-0, 0] }, ctx).code).toBe('complex(0, 0)');
    });

    it('compiles $lambda with 0, 1, or multiple parameters and body', () => {
      const ctx = createBaseContext();
      const res0 = compileApiValue({ $lambda: { params: [], body: 42 } }, ctx);
      expect(res0.code).toBe('lambda: 42');

      const res1 = compileApiValue(
        { $lambda: { params: ['t'], body: { $expr: 'sin(t)' } } },
        ctx,
      );
      expect(res1.code).toBe('lambda t: np.sin(t)');

      const res2 = compileApiValue(
        { $lambda: { params: ['u', 'v'], body: [{ $local: 'u' }, { $local: 'v' }] } },
        ctx,
      );
      expect(res2.code).toBe('lambda u, v: [u, v]');
    });

    it('compiles $local referring to active lambda parameters', () => {
      const ctx = createBaseContext();
      const res = compileApiValue(
        {
          $lambda: {
            params: ['p'],
            body: { $index: { value: { $local: 'p' }, index: 0 } },
          },
        },
        ctx,
      );
      expect(res.code).toBe('lambda p: p[0]');
    });

    it('compiles $index for integer and non-private string indices', () => {
      const ctx = createBaseContext();
      expect(
        compileApiValue({ $index: { value: { $ref: 'circle1' }, index: 0 } }, ctx).code,
      ).toBe('objects["circle1"][0]');
      expect(
        compileApiValue({ $index: { value: { $ref: 'circle1' }, index: -1 } }, ctx).code,
      ).toBe('objects["circle1"][-1]');
      expect(
        compileApiValue({ $index: { value: { $ref: 'circle1' }, index: 'color' } }, ctx).code,
      ).toBe('objects["circle1"]["color"]');
    });

    it('compiles $slice with various combinations of bounds and step', () => {
      const ctx = createBaseContext();
      expect(
        compileApiValue(
          { $slice: { value: { $ref: 'groupA' }, start: 0, stop: 2, step: 1 } },
          ctx,
        ).code,
      ).toBe('objects["groupA"][0:2:1]');

      expect(
        compileApiValue(
          { $slice: { value: { $ref: 'groupA' }, start: 1, stop: 5 } },
          ctx,
        ).code,
      ).toBe('objects["groupA"][1:5]');

      expect(
        compileApiValue(
          { $slice: { value: { $ref: 'groupA' }, start: null, stop: 3, step: null } },
          ctx,
        ).code,
      ).toBe('objects["groupA"][:3]');

      expect(
        compileApiValue(
          { $slice: { value: { $ref: 'groupA' }, start: 2, stop: null, step: null } },
          ctx,
        ).code,
      ).toBe('objects["groupA"][2:]');

      expect(
        compileApiValue(
          { $slice: { value: { $ref: 'groupA' }, start: null, stop: null, step: -1 } },
          ctx,
        ).code,
      ).toBe('objects["groupA"][::-1]');

      expect(
        compileApiValue(
          { $slice: { value: { $ref: 'groupA' }, start: null, stop: null, step: null } },
          ctx,
        ).code,
      ).toBe('objects["groupA"][:]');
    });

    it('wraps lambda expressions in parentheses when indexed or sliced', () => {
      const ctx = createBaseContext();
      expect(
        compileApiValue(
          {
            $index: {
              value: { $lambda: { params: ['x'], body: { $local: 'x' } } },
              index: 0,
            },
          },
          ctx,
        ).code,
      ).toBe('(lambda x: x)[0]');

      expect(
        compileApiValue(
          {
            $slice: {
              value: { $lambda: { params: ['x'], body: { $local: 'x' } } },
              start: 0,
              stop: 2,
            },
          },
          ctx,
        ).code,
      ).toBe('(lambda x: x)[0:2]');
    });
  });

  describe('injection resistance and text safety', () => {
    it('treats text containing Python injection payload as harmless string literal', () => {
      const ctx = createBaseContext();
      const payload = '__import__("os").system("rm -rf /")';
      const res = compileApiValue(payload, ctx);
      expect(res.code).toBe('"__import__(\\"os\\").system(\\"rm -rf /\\")"');
      expect(res.requiresTrust).toBe(false);
    });

    it('escapes statement breakouts in strings safely', () => {
      const ctx = createBaseContext();
      const payload = '"); import os; os.system("sh"); ("';
      const res = compileApiValue(payload, ctx);
      expect(res.code).toBe('"\\"); import os; os.system(\\"sh\\"); (\\""');
    });

    it('preserves special keyword strings as string literals', () => {
      const ctx = createBaseContext();
      expect(compileApiValue('True', ctx).code).toBe('"True"');
      expect(compileApiValue('False', ctx).code).toBe('"False"');
      expect(compileApiValue('None', ctx).code).toBe('"None"');
      expect(compileApiValue('null', ctx).code).toBe('"null"');
      expect(compileApiValue('undefined', ctx).code).toBe('"undefined"');
    });

    it('safely escapes special characters in $ref object names', () => {
      const ctx = createBaseContext({ references: new Set(['obj"; print(1); #']) });
      const res = compileApiValue({ $ref: 'obj"; print(1); #' }, ctx);
      expect(res.code).toBe('objects["obj\\"; print(1); #"]');
      expect(res.references).toEqual(['obj"; print(1); #']);
    });

    it('rejects dangerous expressions inside $expr via compileExpression', () => {
      const ctx = createBaseContext();
      expect(() => compileApiValue({ $expr: '__import__("os")' }, ctx)).toThrow();
      expect(() => compileApiValue({ $expr: 'eval("1+1")' }, ctx)).toThrow();
      expect(() => compileApiValue({ $expr: 'circle1.color' }, ctx)).toThrow();
    });
  });

  describe('illegal tags, extra keys, and shape violations', () => {
    const ctx = createBaseContext();

    it('rejects unknown $ tags', () => {
      expect(() => compileApiValue({ $unknown: 123 }, ctx)).toThrow(/未知/);
      expect(() => compileApiValue({ $eval: 'print(1)' }, ctx)).toThrow(/未知/);
      expect(() => compileApiValue({ $call: 'func()' }, ctx)).toThrow(/调用描述/);
    });

    it('rejects tagged objects with extra keys', () => {
      expect(() => compileApiValue({ $ref: 'circle1', extra: 1 }, ctx)).toThrow(/额外键/);
      expect(() => compileApiValue({ $constant: 'UP', $ref: 'circle1' }, ctx)).toThrow(/额外键/);
      expect(() => compileApiValue({ $expr: '1+1', tag: 'test' }, ctx)).toThrow(/额外键/);
      expect(() => compileApiValue({ $array: [1], name: 'arr' }, ctx)).toThrow(/额外键/);
    });

    it('rejects $lambda with extra or invalid fields', () => {
      expect(() =>
        compileApiValue({ $lambda: { params: ['t'], body: 1, extra: 2 } }, ctx),
      ).toThrow(/params 和 body/);
      expect(() =>
        compileApiValue({ $lambda: { params: ['t'] } }, ctx),
      ).toThrow(/params 和 body/);
      expect(() => compileApiValue({ $lambda: null }, ctx)).toThrow();
    });

    it('rejects $index with extra or invalid fields', () => {
      expect(() =>
        compileApiValue({ $index: { value: 1, index: 0, extra: 2 } }, ctx),
      ).toThrow(/value 和 index/);
      expect(() => compileApiValue({ $index: { value: 1 } }, ctx)).toThrow();
      expect(() => compileApiValue({ $index: null }, ctx)).toThrow();
    });

    it('rejects $slice with extra fields or invalid step', () => {
      expect(() =>
        compileApiValue({ $slice: { value: { $ref: 'circle1' }, extra: 1 } }, ctx),
      ).toThrow(/额外键/);
      expect(() =>
        compileApiValue({ $slice: { value: { $ref: 'circle1' }, step: 0 } }, ctx),
      ).toThrow(/步长不能为 0|step 不能为 0/);
    });

    it('rejects plain objects with prototype pollution or private keys', () => {
      expect(() => compileApiValue({ __proto__: { admin: true } }, ctx)).toThrow(/私有或原型污染/);
      expect(() => compileApiValue({ constructor: 'bad' }, ctx)).toThrow(/私有或原型污染/);
      expect(() => compileApiValue({ prototype: 'bad' }, ctx)).toThrow(/私有或原型污染/);
      expect(() => compileApiValue({ _private: 'val' }, ctx)).toThrow(/私有或原型污染/);
      expect(() => compileApiValue({ __secret: 123 }, ctx)).toThrow(/私有或原型污染/);
    });

    it('rejects unhashable or invalid keys in $dict', () => {
      expect(() => compileApiValue({ $dict: [[[1, 2], 'val']] }, ctx)).toThrow(/不可哈希/);
      expect(() => compileApiValue({ $dict: [[{ a: 1 }, 'val']] }, ctx)).toThrow(/不可哈希/);
      expect(() => compileApiValue({ $dict: [[{ $array: [1] }, 'val']] }, ctx)).toThrow(/不可哈希/);
      expect(() => compileApiValue({ $dict: [[{ $dict: [] }, 'val']] }, ctx)).toThrow(/不可哈希/);
      expect(() => compileApiValue({ $dict: [[3.14, 'val']] }, ctx)).toThrow(/整数/);
      expect(() => compileApiValue({ $dict: [['_secret', 'val']] }, ctx)).toThrow(/私有或原型污染/);
      expect(() => compileApiValue({ $dict: [['__proto__', 'val']] }, ctx)).toThrow(/私有或原型污染/);
      expect(() =>
        compileApiValue({ $dict: [[{ $tuple: [[1, 2]] }, 'val']] }, ctx),
      ).toThrow(/不可哈希/);
    });

    it('rejects malformed entries in $dict', () => {
      expect(() => compileApiValue({ $dict: ['not-an-entry'] }, ctx)).toThrow(/二元组/);
      expect(() => compileApiValue({ $dict: [[1, 2, 3]] }, ctx)).toThrow(/二元组/);
    });

    it('rejects invalid $complex inputs', () => {
      expect(() => compileApiValue({ $complex: [1] }, ctx)).toThrow(/包含两个数/);
      expect(() => compileApiValue({ $complex: [1, 2, 3] }, ctx)).toThrow(/包含两个数/);
      expect(() => compileApiValue({ $complex: [NaN, 1] }, ctx)).toThrow(/有限数/);
      expect(() => compileApiValue({ $complex: [1, Infinity] }, ctx)).toThrow(/有限数/);
      expect(() => compileApiValue({ $complex: ['1', '2'] }, ctx)).toThrow(/有限数/);
    });
  });

  describe('missing references, constants, and callables', () => {
    const ctx = createBaseContext();

    it('throws when $ref references nonexistent object', () => {
      expect(() => compileApiValue({ $ref: 'missingObj' }, ctx)).toThrow(/找不到引用的对象/);
    });

    it('throws when $constant references undefined constant', () => {
      expect(() => compileApiValue({ $constant: 'NON_EXISTENT' }, ctx)).toThrow(/未定义的常量/);
    });

    it('throws when $api references undefined callable', () => {
      expect(() => compileApiValue({ $api: 'NonExistentApi' }, ctx)).toThrow(/未知的可调用对象/);
    });
  });

  describe('lexical scoping, lambdas, and reserved words', () => {
    const ctx = createBaseContext();

    it('rejects lambda with more than 8 parameters', () => {
      const params = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9'];
      expect(() => compileApiValue({ $lambda: { params, body: 0 } }, ctx)).toThrow(/最多允许 8 个参数/);
    });

    it('rejects lambda with duplicate parameters', () => {
      expect(() => compileApiValue({ $lambda: { params: ['t', 't'], body: 0 } }, ctx)).toThrow(/重复/);
    });

    it('rejects lambda parameter starting with _ or containing invalid characters', () => {
      expect(() => compileApiValue({ $lambda: { params: ['_t'], body: 0 } }, ctx)).toThrow(/不能以 _ 开头/);
      expect(() => compileApiValue({ $lambda: { params: ['1t'], body: 0 } }, ctx)).toThrow(/ASCII 标识符/);
      expect(() => compileApiValue({ $lambda: { params: ['t-1'], body: 0 } }, ctx)).toThrow(/ASCII 标识符/);
      expect(() => compileApiValue({ $lambda: { params: ['t 1'], body: 0 } }, ctx)).toThrow(/ASCII 标识符/);
    });

    it('rejects lambda parameter matching Python keywords', () => {
      const keywords = ['def', 'class', 'import', 'return', 'for', 'while', 'None', 'True', 'lambda'];
      for (const kw of keywords) {
        expect(() => compileApiValue({ $lambda: { params: [kw], body: 0 } }, ctx)).toThrow(/Python 关键字/);
      }
    });

    it('rejects lambda parameter matching reserved identifiers', () => {
      const reserved = ['self', 'objects', 'np', 'scene', 'params', 'context'];
      for (const res of reserved) {
        expect(() => compileApiValue({ $lambda: { params: [res], body: 0 } }, ctx)).toThrow(/保留标识符/);
      }
    });

    it('rejects $local used outside of lambda scope', () => {
      expect(() => compileApiValue({ $local: 't' }, ctx)).toThrow(/未在当前 lambda 参数作用域中定义/);
    });

    it('rejects $local referring to parameter not in current lambda', () => {
      expect(() =>
        compileApiValue({ $lambda: { params: ['t'], body: { $local: 'other' } } }, ctx),
      ).toThrow(/未在当前 lambda 参数作用域中定义/);
    });

    it('lexical scoping does not leak parameters or mutate context.symbols', () => {
      const originalSymbols = { ...ctx.symbols };
      const res = compileApiValue(
        [
          { $lambda: { params: ['t'], body: { $expr: 'sin(t)' } } },
          { $expr: 'x' },
        ],
        ctx,
      );
      expect(res.code).toBe('[lambda t: np.sin(t), trackers["x"].get_value()]');
      expect(ctx.symbols).toEqual(originalSymbols);
      // 't' outside lambda must fail in $expr
      expect(() => compileApiValue({ $expr: 't' }, ctx)).toThrow(/未定义数学变量/);
    });

    it('supports nested lambdas accessing enclosing parameters', () => {
      const res = compileApiValue(
        {
          $lambda: {
            params: ['u'],
            body: {
              $lambda: {
                params: ['v'],
                body: [{ $local: 'u' }, { $local: 'v' }],
              },
            },
          },
        },
        ctx,
      );
      expect(res.code).toBe('lambda u: lambda v: [u, v]');
    });
  });

  describe('index and slice bounds and validation', () => {
    const ctx = createBaseContext();

    it('rejects integer index exceeding absolute 100000 limit', () => {
      expect(() =>
        compileApiValue({ $index: { value: { $ref: 'circle1' }, index: 100001 } }, ctx),
      ).toThrow(/100000/);
      expect(() =>
        compileApiValue({ $index: { value: { $ref: 'circle1' }, index: -100001 } }, ctx),
      ).toThrow(/100000/);
    });

    it('rejects non-integer, non-string, or private string index', () => {
      expect(() =>
        compileApiValue({ $index: { value: { $ref: 'circle1' }, index: 3.14 } }, ctx),
      ).toThrow(/有限整数或非私有字符串/);
      expect(() =>
        compileApiValue({ $index: { value: { $ref: 'circle1' }, index: '_secret' } }, ctx),
      ).toThrow(/非私有/);
      expect(() =>
        compileApiValue({ $index: { value: { $ref: 'circle1' }, index: '__class__' } }, ctx),
      ).toThrow(/非私有/);
    });

    it('rejects slice bounds exceeding 100000 or non-integer', () => {
      expect(() =>
        compileApiValue({ $slice: { value: { $ref: 'circle1' }, start: 100001 } }, ctx),
      ).toThrow(/100000/);
      expect(() =>
        compileApiValue({ $slice: { value: { $ref: 'circle1' }, stop: 100001 } }, ctx),
      ).toThrow(/100000/);
      expect(() =>
        compileApiValue({ $slice: { value: { $ref: 'circle1' }, step: 100001 } }, ctx),
      ).toThrow(/100000/);
      expect(() =>
        compileApiValue({ $slice: { value: { $ref: 'circle1' }, start: 1.5 } }, ctx),
      ).toThrow(/整数/);
    });
  });

  describe('resource limits', () => {
    const ctx = createBaseContext();

    it('rejects NaN, Infinity, -Infinity', () => {
      expect(() => compileApiValue(NaN, ctx)).toThrow(/NaN 或 Infinity/);
      expect(() => compileApiValue(Infinity, ctx)).toThrow(/NaN 或 Infinity/);
      expect(() => compileApiValue(-Infinity, ctx)).toThrow(/NaN 或 Infinity/);
      expect(() => compileApiValue([1, 2, NaN], ctx)).toThrow(/NaN 或 Infinity/);
    });

    it('enforces depth limit of 20 levels (depth 20 passes, depth 21 throws)', () => {
      // 20 levels of nesting: array inside array 19 times + primitive
      let current20: unknown = 'deep-safe';
      for (let i = 0; i < 19; i++) {
        current20 = [current20];
      }
      expect(() => compileApiValue(current20, ctx)).not.toThrow();

      // 21 levels of nesting: exceeds depth 20
      let current21: unknown = 'too-deep';
      for (let i = 0; i < 20; i++) {
        current21 = [current21];
      }
      expect(() => compileApiValue(current21, ctx)).toThrow(/嵌套深度超过上限/);
    });

    it('enforces total node count limit of 4000 nodes', () => {
      const safeNodes = new Array(3500).fill(1);
      expect(() => compileApiValue(safeNodes, ctx)).not.toThrow();

      const excessiveNodes = new Array(4001).fill(1);
      expect(() => compileApiValue(excessiveNodes, ctx)).toThrow(/节点总数超过上限/);
    });

    it('enforces string length limit of 20000 characters', () => {
      const okString = 'a'.repeat(20000);
      expect(() => compileApiValue(okString, ctx)).not.toThrow();

      const tooLongString = 'a'.repeat(20001);
      expect(() => compileApiValue(tooLongString, ctx)).toThrow(/字符串长度超过限制/);
    });
  });

  describe('requiresTrust propagation and references collection', () => {
    it('sets requiresTrust to false for all safe constructs', () => {
      const ctx = createBaseContext();
      const res = compileApiValue(
        {
          items: [1, 'text', { $ref: 'circle1' }, { $constant: 'UP' }, { $api: 'Create' }],
        },
        ctx,
      );
      expect(res.requiresTrust).toBe(false);
      expect(res.references).toEqual(['circle1']);
    });

    it('propagates requiresTrust from trusted constants and callables anywhere in the tree', () => {
      const ctx = createBaseContext();
      const resConst = compileApiValue([1, { $constant: 'UNSAFE_CONST' }], ctx);
      expect(resConst.requiresTrust).toBe(true);

      const resApi = compileApiValue({ tool: { $api: 'CustomTool' } }, ctx);
      expect(resApi.requiresTrust).toBe(true);

      const resNested = compileApiValue(
        {
          $lambda: {
            params: ['t'],
            body: [{ $api: 'CustomTool' }, { $local: 't' }],
          },
        },
        ctx,
      );
      expect(resNested.requiresTrust).toBe(true);
    });

    it('deduplicates references while preserving first occurrence order', () => {
      const ctx = createBaseContext();
      const res = compileApiValue(
        [
          { $ref: 'circle1' },
          { $ref: 'square2' },
          { $ref: 'circle1' },
          { $ref: 'text3' },
          { $ref: 'square2' },
        ],
        ctx,
      );
      expect(res.references).toEqual(['circle1', 'square2', 'text3']);
    });
  });

  describe('invalid context', () => {
    it('throws when context is missing required properties', () => {
      expect(() => compileApiValue(1, null as any)).toThrow(/无效的 ApiValueContext/);
      expect(() => compileApiValue(1, {} as any)).toThrow(/context.references/);
      expect(() =>
        compileApiValue(1, { references: new Set() } as any),
      ).toThrow(/context.constants/);
      expect(() =>
        compileApiValue(1, { references: new Set(), constants: {} } as any),
      ).toThrow(/context.callables/);
    });
  });
});
